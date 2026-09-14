# -*- coding: utf-8 -*-
"""
air-tycoon Chrome 61 降级路径**行为验证**

背景与定位：
  本机没有 Chrome 61 / WebView 61 内核（只有 Edge 152+ 与 Playwright Chromium），
  因此**无法做真正的 Chrome 61 实测**。按 minitool 规范 css-compatibility.md §7
  的要求，这种情况必须在交付说明中标记「Chrome 61 CSS 兼容性未实测」。

  但「未实测」不等于「无法验证」。本脚本做的是**降级路径的行为验证**：
  在真浏览器里模拟 Chrome 61 的能力缺失，检查页面是否仍然可用。
  这能覆盖「降级逻辑本身写对了吗」，覆盖不了「Chrome 61 内核真实行为」——
  两者是不同的问题，报告里分别陈述，不混为一谈。

验证手法（两个方向，缺一不可）：
  A. **强制降级**：去掉 .supports-flex-gap、去掉内联贴图、阉割现代 API，
     看页面是否仍能渲染与交互（证明「降级路径真的被实现且能跑通」）。
  B. **对照增强**：保留能力时确认走的是增强路径（证明检测本身没写反）。

运行：python tests/check-fallback.py
"""
import asyncio, pathlib, re, sys, tempfile, zipfile

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
ZIP = ROOT / "air-tycoon.zip"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
VW, VH = 390, 844

pass_n, fail_n = 0, 0
failures = []


def ok(cond, name, detail=""):
    global pass_n, fail_n
    if cond:
        pass_n += 1
        print("  ✓ %s" % name)
    else:
        fail_n += 1
        failures.append(name + ("  → " + str(detail) if detail else ""))
        print("  ✗ %s  %s" % (name, detail))


# Chrome 61 之后才有的 API —— 用它模拟「旧内核没有这些能力」的场景
CHROME61_MISSING = """
// 模拟 Chrome 61 缺失的 Web API（在页面脚本执行前注入）
(['ResizeObserver'].forEach(function (k) { try { delete window[k]; } catch (e) {} }));
// CSS.supports 在 61 已存在，但 gap 支持要显式屏蔽掉，验证检测不被误导
// ⚠ 音频：把 AudioContext 一并抹掉，验证「没有 WebAudio 的旧内核/容器」
//   仍然能玩 —— audio.js 的 ensure() 必须优雅降级而不是抛异常。
//   （Chrome 61 其实有 webkitAudioContext，但容器 WebView 常把它摘掉，
//    故这条测的是更严苛的情况。）
try { delete window.AudioContext; } catch (e) {}
try { delete window.webkitAudioContext; } catch (e) {}
"""


async def run(pw, tmp):
    browser = await pw.chromium.launch(
        executable_path=EDGE,
        args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
    )
    url = (tmp / "index.html").as_uri()
    out = {}

    # ── A. 强制降级：页面仍必须可用 ──
    print("\n── A. 强制降级后仍可用（模拟 Chrome 61 能力缺失） " + "─" * 20)
    ctx = await browser.new_context(viewport={"width": VW, "height": VH},
                                    device_scale_factor=2, is_mobile=True, has_touch=True)
    page = await ctx.new_page()
    errs = []
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errs.append("PAGEERROR: " + str(e)))

    await page.add_init_script(CHROME61_MISSING)
    # 关键：强制移除 flex-gap 增强，验证基线层（margin 版）单独可用
    await page.add_init_script("""
        // 页面脚本会给 <html> 加 supports-flex-gap；这里拦掉，模拟不支持的内核
        document.addEventListener('DOMContentLoaded', function () {
            var h = document.documentElement;
            h.className = h.className.replace(/\\bsupports-flex-gap\\b/g, '').trim();
        });
        // 更早一步：把 flexGap 检测结果改成 false，让 enhancer 永不启用
        var _origAppendChild = Element.prototype.appendChild;
        Element.prototype.appendChild = function (n) {
            if (n && n.scrollHeight !== undefined && n.style && n.style.display === 'flex') {
                return n;   // 丢弃检测用的临时 flex 容器 → scrollHeight 测不到
            }
            return _origAppendChild.apply(this, arguments);
        };
    """)
    await page.goto(url, wait_until="load")
    await page.wait_for_timeout(4500)

    out["degraded"] = await page.evaluate("""() => {
        const A = window.AT || {};
        const dock = document.getElementById('uDock');
        const dr = dock ? dock.getBoundingClientRect() : null;
        const btns = dock ? dock.querySelectorAll('button') : [];
        // 三个按钮是否都真的可见可点（降级后 margin 版布局不能把它们叠在一起）
        const rects = Array.prototype.map.call(btns, function (b) {
            const r = b.getBoundingClientRect();
            return {w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left)};
        });
        const overlapped = rects.some(function (r, i) {
            return rects.some(function (s, j) { return i !== j && r.x === s.x && r.w === s.w; });
        });
        return {
          flexGapClass: document.documentElement.className.indexOf('supports-flex-gap') >= 0,
          renderOk: !!(A.render && A.render.ok),
          texOk: !!(A.render && A.render.texOk),
          gameRunning: !!(A.game && A.game.running),
          dockH: dr ? Math.round(dr.height) : 0,
          btnRects: rects,
          overlapped: overlapped,
          /* 无 WebAudio 时音频模块必须存在但自报不可用，且绝不能抛异常 */
          hasAudio: !!(A.audio && typeof A.audio.play === 'function'),
          audioAvail: !!(A.audio && A.audio.available),
          audioPlayRet: (function () {
              try { return A.audio.play('click'); } catch (e) { return 'THREW:' + e.message; }
          })(),
          muteVisible: (function () {
              const m = document.getElementById('uMute');
              if (!m) return false;
              const r = m.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
          })()
        };
    }""")

    d = out["degraded"]
    ok(not d["flexGapClass"], "增强层已成功屏蔽（supports-flex-gap 未启用）→ 走基线 margin 版")
    ok(not errs, "降级状态下无 console 报错", errs[:3])
    ok(d["renderOk"], "降级状态下渲染器仍初始化成功")
    ok(d["texOk"], "降级状态下贴图仍加载（内联 data URI 路径）")
    ok(d["gameRunning"], "降级状态下主循环仍在跑")
    ok(d["dockH"] > 0, "降级状态下底部操作条仍占位（有高度）", d["dockH"])
    ok(all(r["w"] > 0 and r["h"] > 0 for r in d["btnRects"]),
       "降级状态下三个按钮都有实际尺寸（margin 基线布局生效）", d["btnRects"])
    ok(not d["overlapped"], "降级状态下按钮未重叠（margin 间距生效）", d["btnRects"])

    # 音频：无 WebAudio 的旧内核上必须「静默失败」而不是崩
    ok(d["hasAudio"], "降级状态下音频模块仍装配（不是 undefined）", d)
    ok(not d["audioAvail"], "无 WebAudio 时 available 自报 false（诚实的能力检测）", d["audioAvail"])
    ok(d["audioPlayRet"] is False,
       "无 WebAudio 时 play() 返回 false 而不是抛异常", d["audioPlayRet"])
    ok(d["muteVisible"], "无 WebAudio 时静音键仍占位（布局不塌）")
    ok(not [e for e in errs if "audio" in e.lower() or "audio" in str(e).lower()],
       "音频降级过程没有产生音频相关报错", errs[:3])

    # 降级状态下能否真的操作：开面板
    await page.click("#uBtnNew")
    await page.wait_for_timeout(700)
    panel = await page.evaluate("""() => {
        const p = document.getElementById('uPanel');
        const b = document.getElementById('uPanelBody');
        const r = p ? p.getBoundingClientRect() : null;
        return {open: p && p.className.indexOf('show') >= 0,
                w: r ? Math.round(r.width) : 0,
                secs: b ? b.querySelectorAll('.nw-sec').length : 0};
    }""")
    ok(panel["open"] and panel["w"] > 0, "降级状态下新航线面板可打开且有宽度", panel)
    ok(panel["secs"] >= 2, "降级状态下面板内容完整渲染", panel)

    await ctx.close()

    # ── B. 对照：能力齐备时走增强路径 ──
    print("\n── B. 对照：能力齐备时启用增强层 " + "─" * 30)
    ctx2 = await browser.new_context(viewport={"width": VW, "height": VH},
                                     device_scale_factor=2, is_mobile=True, has_touch=True)
    page2 = await ctx2.new_page()
    await page2.goto(url, wait_until="load")
    await page2.wait_for_timeout(3500)

    out["enhanced"] = await page2.evaluate("""() => {
        return {
          flexGapClass: document.documentElement.className.indexOf('supports-flex-gap') >= 0,
          compat: !!(window.AT && window.AT.compat),
          swapOk: !!(window.AT && window.AT.compat && window.AT.compat.flexGap)
        };
    }""")
    e = out["enhanced"]
    ok(e["compat"], "AT.compat 已装配（检测层就位）")
    ok(e["swapOk"], "本机内核确实支持 Flex gap（检测结果为真）")
    ok(e["flexGapClass"], "支持时启用了 .supports-flex-gap（增强路径生效）")

    await ctx2.close()
    await browser.close()
    return out


async def main():
    if not ZIP.exists():
        print("先跑 tools/build_dist.py 生成 zip")
        return 1
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="at_fb_"))
    with zipfile.ZipFile(ZIP) as z:
        z.extractall(tmp)
    try:
        async with async_playwright() as pw:
            await run(pw, tmp)
    finally:
        import shutil
        shutil.rmtree(tmp, ignore_errors=True)

    print("\n" + "═" * 68)
    print("降级路径行为验证：通过 %d / %d" % (pass_n, pass_n + fail_n))
    if failures:
        print("\n失败项：")
        for f in failures:
            print("  ✗ " + f)
    print("\n⚠ 本机无 Chrome 61 / WebView 61 内核，**Chrome 61 内核行为未实测**。")
    print("  以上验证的是「降级逻辑写对了」，不等价于「Chrome 61 上真能跑」。")
    print("  交付说明中须保留此标记（见 minitool css-compatibility.md §7）。")
    print("═" * 68)
    return 1 if fail_n else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
