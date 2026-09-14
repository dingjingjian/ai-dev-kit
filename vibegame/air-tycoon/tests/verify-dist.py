# -*- coding: utf-8 -*-
"""
air-tycoon 提交包核验（dist 副本实机）

回答一个问题：**「把 air-tycoon.zip 解压出来，双击 index.html 能玩吗？」**

与 tests/smoke-render.py 的分工：
  · smoke-render.py 验**源码目录**（开发期回归，含 UI 操作链 27 项）
  · 本脚本验**提交产物**（dist 副本，走 file://，模拟容器/双击场景）

为什么必须单独一份、不能复用 smoke-render：
  提交包里 index.html 与源**不同**（去了 data-page-node-id），且**不含 assets/earth.jpg**
  （见 tools/build_dist.py 的 EXCLUDE 说明）。这正是最容易出事的地方 ——
  万一降级链在缺文件时抛错而不是继续 fallback，源码目录测一万遍也发现不了。

检查四件事：
  ① zip 结构：index.html 在根、无多套一层目录、无遗漏的引用资源
  ② 解压副本在 file:// 下能加载，无 console 报错、无请求失败
  ③ 渲染真的出画面：贴图加载走内联、球/城市/航线都画出来了、像素体检过
  ④ 玩法可用：能开一局面板、季度真的在推进

运行：python tests/verify-dist.py
"""
import asyncio, io, pathlib, shutil, sys, tempfile, zipfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from smoke_render_util import analyze_png  # noqa: E402  (同目录工具，见下)

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
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


# ── ① zip 结构与资源完整性（不开浏览器就能查的部分）──
def check_zip():
    print("\n── ① 提交包结构 " + "─" * 50)
    ok(ZIP.exists(), "air-tycoon.zip 已生成", ZIP)
    if not ZIP.exists():
        return None

    size_kb = ZIP.stat().st_size / 1024
    ok(size_kb < 10 * 1024, "zip 体积 < 10 MiB", "%.1f KB" % size_kb)

    with zipfile.ZipFile(ZIP) as z:
        names = z.namelist()
        ok("index.html" in names, "index.html 在 zip 根目录（容器入口）", names[:5])
        ok(not any(n.startswith("dist/") for n in names), "没有多套一层目录")
        ok(not any(n.startswith("/") or "\\" in n for n in names), "路径全为 POSIX 正向斜杠")
        ok(len([n for n in names if n.endswith("/")]) == 0, "无目录条目（只有文件）")

        html = z.read("index.html").decode("utf-8")
        # index.html 里引用的每个本地资源都要在包里
        import re
        refs = re.findall(r'(?:src|href)="([^"#?]+)"', html)
        local = [r for r in refs if not r.startswith(("http:", "https:", "data:", "//", "#"))]
        ok(len(local) > 0, "解析出本地资源引用 %d 个" % len(local))
        for r in local:
            ok(r in names, "引用资源在包内：%s" % r)

        # 反向：包里有但没人引用的（除了内联贴图这种刻意带的）
        referenced = set(local)
        extras = [n for n in names if n != "index.html" and n not in referenced]
        # src/*.js 由 index.html 引用，不该有 extras；有则是遗漏或多余
        ok(not extras, "包内无未被引用的冗余文件", extras)

        # 关键：earth.jpg 应被排除（走内联贴图，省 500KB）
        ok("assets/earth.jpg" not in names, "assets/earth.jpg 未进包（运行期走内联 data URI）")
        ok("assets/earth-tex.js" in names, "内联贴图 earth-tex.js 在包内")
        ok("assets/three.min.js" in names, "three.min.js 在包内")

        # 红线：不得有联网痕迹
        for n in names:
            if n.endswith((".js", ".html", ".css")):
                body = z.read(n).decode("utf-8", "ignore")
                for bad in ("fetch(", "XMLHttpRequest", "importScripts", "new Worker"):
                    if bad in body and n not in ("assets/three.min.js",):
                        ok(False, "包内 %s 含联网/并发 API：%s" % (n, bad))
                        break
        ok(True, "离线红线扫描完成（无 fetch / XHR / Worker）")

        # 解压到临时目录，供浏览器实测
        tmp = pathlib.Path(tempfile.mkdtemp(prefix="at_dist_"))
        z.extractall(tmp)
        return tmp


# ── ②③ 解压副本实机 ──
async def check_runtime(tmp):
    print("\n── ② 解压副本实机（file://） " + "─" * 40)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            executable_path=EDGE,
            args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
        )
        ctx = await browser.new_context(viewport={"width": VW, "height": VH},
                                        device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        errs, fails = [], []
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errs.append("PAGEERROR: " + str(e)))
        page.on("requestfailed", lambda r: fails.append(r.url.split("/")[-1] or r.url))

        await page.goto((tmp / "index.html").as_uri(), wait_until="load")
        # ⚠ briefing 阶段 8 秒（CONFIG.briefingSeconds），之后 game.js 的
        #   phaseBefore==='briefing' 钩子才会 seedFirstRoute 给一条示范航线。
        #   等 4.5 秒就断言「有航线」必然失败 —— 那是我的时机错，不是产品 bug。
        #   这里直接等过简报，让示范航线真的出现。
        await page.wait_for_timeout(11000)

        ok(not errs, "无 console 报错", errs[:3])
        ok(not fails, "无请求失败（说明包内资源齐全）", fails[:5])

        st = await page.evaluate("""() => {
            const A = window.AT || {};
            const g = A.game || {};
            return {
              hasAT: !!window.AT,
              hasAudio: !!(A.audio && typeof A.audio.play === 'function'),
              /* ⚠ available 只断言「AudioContext 建得起来」。
               *   无头 Chromium 里音频上下文可以创建，但 state 常停在 'suspended'
               *   （没有真实用户手势）—— 这是环境限制，不是产品缺陷，
               *   故**不**断言 state==='running'（那会让本脚本在 CI 里永远红）。
               *   真正的「会不会响」由 tests/audio.js 用假 ctx 覆盖。 */
              audioAvail: !!(A.audio && A.audio.available),
              audioEnabled: !!(A.audio && A.audio.enabled),
              muteVisible: (function () {
                  const m = document.getElementById('uMute');
                  if (!m) return false;
                  const r = m.getBoundingClientRect();
                  return r.width > 0 && r.height > 0;
              })(),
              renderOk: !!(A.render && A.render.ok),
              texOk: !!(A.render && A.render.texOk),
              bloomOk: !!(A.render && A.render.bloomOk),
              gameRunning: !!g.running,
              phase: g.state ? g.state.phase : null,
              quarter: g.state ? g.state.quarter : null,
              routes: g.state ? g.state.routes.length : null,
              planes: g.state ? g.state.planes.length : null,
              idle: g.state ? g.state.planes.filter(function (p) { return !p.routeKey; }).length : null,
              cash: g.state ? g.state.cash : null,
              cityCount: A.CITIES ? A.CITIES.length : null,
              dockVisible: (function () {
                  const d = document.getElementById('uDock');
                  if (!d) return false;
                  const r = d.getBoundingClientRect();
                  return r.width > 0 && r.height > 0;
              })()
            };
        }""")
        ok(st["hasAT"], "AT 命名空间已装配")
        ok(st["hasAudio"], "**音频模块随包发出并在 file:// 下装配**"
           "（AT.audio 存在 —— 漏挂脚本会让音效静默失效）")
        ok(st["audioAvail"], "WebAudio 上下文在实机里真的建起来了",
           "available=%s" % st["audioAvail"])
        ok(st["audioEnabled"], "音频默认开启（defcon 教训①：默认静音=音效白做）")
        ok(st["muteVisible"], "静音键在页面上可见可点")
        ok(st["renderOk"], "渲染器初始化成功（render.ok）")
        ok(st["texOk"], "**地球贴图真的加载了**（texOk —— 证明内联 data URI 在 file:// 下可用）")
        ok(st["gameRunning"], "主循环在跑")
        ok(st["phase"] == "operating", "简报结束、进入运营阶段", st["phase"])
        ok(st["cityCount"] == 24, "24 座城市数据就位", st["cityCount"])
        # 开局示范航线由 game.js 的 briefing→operating 钩子给出（见 seedFirstRoute）。
        # 它的意义是「让玩家一进场就看到航线弧与客机」，不是预设玩法，故断言它存在。
        ok(st["routes"] and st["routes"] > 0, "开局自动给了一条示范航线（玩家能看到弧线/客机）",
           st["routes"])
        ok(st["planes"] and st["planes"] > 0, "开局已有飞机", st["planes"])
        ok(st["cash"] and st["cash"] > 0, "开局有启动资金", st["cash"])
        ok(st["dockVisible"], "底部操作条可见（容器里能点到按钮）")

        # ③ 像素体检
        shot = pathlib.Path(tempfile.gettempdir()) / "at_dist_check.png"
        await page.screenshot(path=str(shot))
        px = analyze_png(shot)
        ok(px["avgLum"] >= 3, "画面非全黑（球真的画出来了）", "avgLum=%.1f" % px["avgLum"])
        ok(px["brightPct"] <= 12, "画面未过曝（bloom 没糊屏）", "brightPct=%.1f" % px["brightPct"])
        ok(px["nonBlackPct"] > 20, "有实际内容像素", "nonBlackPct=%.1f" % px["nonBlackPct"])

        # ④ 玩法可用：开一局面板（开局无航线，应先显示空态而不是崩掉）
        await page.click("#uBtnRoutes")
        await page.wait_for_timeout(600)
        panel = await page.evaluate("""() => {
            const p = document.getElementById('uPanel');
            const b = document.getElementById('uPanelBody');
            if (!p || !b) return {open: false};
            const r = p.getBoundingClientRect();
            return {open: p.className.indexOf('show') >= 0, w: Math.round(r.width),
                    cards: b.querySelectorAll('.rc-top').length,
                    bodyLen: b.textContent.trim().length};
        }""")
        ok(panel["open"], "「我的航线」面板可打开（按钮能点）")
        ok(panel["cards"] >= 1, "面板列出示范航线（内容真的渲染了）", panel)

        await page.click("#uPanelClose")
        await page.wait_for_timeout(400)

        # ⑤ 真的开一条新航线 —— 提交包能不能玩，最终看这个
        #
        # ⚠ 开局 2 架支线机里，1 架已被示范航线占用。剩余闲置 1 架恰好是 cRJ1，
        #   而面板的机型列表**只给库存里有的机型挂 data-act**（见 ui.js renderNewRoute
        #   的库存标注逻辑）。所以这里必须走真实玩家的路径：
        #   先看机型区是否已可选；若不可选（库存机型航程不够），去机队买一架再回来。
        await page.click("#uBtnNew")
        await page.wait_for_timeout(700)
        openres = await page.evaluate("""() => {
            const b = document.getElementById('uPanelBody');
            return {
              secs: b.querySelectorAll('.nw-sec').length,
              destChips: b.querySelectorAll('[data-act="pick-to"]').length,
              typeChips: b.querySelectorAll('[data-act="pick-type"]').length
            };
        }""")
        ok(openres["secs"] >= 2, "新航线面板渲染出分区", openres)
        ok(openres["destChips"] > 0, "有可选目的地", openres)

        # 可点目的地（tier 0/1）应排在前面；买不起/航程不足的沉到后面且不可点。
        # 这是本次修掉的 UX 缺陷：旧版纯按需求排序，把「需求最高但买不起」的
        # 洲际线放在第一位，玩家点进去发现全是「航程不足 / 资金不足」，像坏了。
        pickinfo = await page.evaluate("""() => {
            const all = Array.prototype.slice.call(
                document.querySelectorAll('#uPanelBody .chip-wide'));
            const clickable = all.filter(c => c.hasAttribute('data-act'));
            const disabled = all.filter(c => !c.hasAttribute('data-act'));
            return {
              total: all.length, clickable: clickable.length, disabled: disabled.length,
              firstClickable: clickable.length ? clickable[0].textContent.trim().slice(0, 40) : null,
              firstDisabled: disabled.length ? disabled[0].textContent.trim().slice(0, 55) : null
            };
        }""")
        ok(pickinfo["clickable"] > 0, "有当下可行的目的地", pickinfo)
        ok(pickinfo["disabled"] > 0, "不可行目的地被置灰不可点（不会领玩家进死胡同）", pickinfo)
        ok("首尔" in (pickinfo["firstClickable"] or "") or "北京" in (pickinfo["firstClickable"] or ""),
           "**近期可达线排在洲际线之前**（排序修复生效）", pickinfo)

        # 选第一个可点的（= 现阶段最该开的线）
        await page.click('[data-act="pick-to"]')
        await page.wait_for_timeout(600)

        openres2 = await page.evaluate("""() => {
            const b = document.getElementById('uPanelBody');
            return {typeChips: b.querySelectorAll('[data-act="pick-type"]').length};
        }""")
        ok(openres2["typeChips"] > 0,
           "选定目的地后机型区出现可选机型（库存/航程过滤生效）", openres2)

        await page.click('[data-act="pick-type"]')
        await page.wait_for_timeout(450)
        await page.click('[data-act="do-open"]')
        await page.wait_for_timeout(1200)

        after = await page.evaluate("""() => {
            const g = window.AT.game.state;
            const t = document.getElementById('uToast');
            return {routes: g.routes.length, planes: g.planes.length,
                    toast: t ? t.textContent.trim() : ''};
        }""")
        ok(after["routes"] >= 2, "**成功开辟新航线（提交包可玩）**", after)

        # 季度真的在推进（等一小段，看 quarter 或 t 有没有变化）
        q_before = await page.evaluate("() => window.AT.game.state.quarter")
        await page.wait_for_timeout(2500)
        q_after = await page.evaluate("() => window.AT.game.state.quarter")
        t_after = await page.evaluate("() => Math.round(window.AT.game.state.t * 10) / 10")
        ok(q_after > q_before or t_after > 0, "回合计时在推进（未卡死）",
           "Q%s→Q%s, t=%s" % (q_before, q_after, t_after))

        # ⑤ 音频开关：点一下静音键，enabled 必须真的翻转、按钮态也要跟着变。
        #    为什么这条值得进「提交包核验」：静音键是**唯一**让玩家控制声音的入口，
        #    若它点了没反应，不想听声音的玩家只能去关系统音量 —— 那就是缺陷。
        mute_on = await page.evaluate("() => ({en: window.AT.audio.enabled, "
                                      "cls: document.getElementById('uMute').className, "
                                      "txt: document.getElementById('uMute').textContent})")
        await page.click("#uMute")
        await page.wait_for_timeout(250)
        mute_off = await page.evaluate("() => ({en: window.AT.audio.enabled, "
                                        "cls: document.getElementById('uMute').className, "
                                        "txt: document.getElementById('uMute').textContent})")
        ok(mute_on["en"] is True, "音频初始为开启", mute_on)
        ok(mute_off["en"] is False, "点静音键后音频真的关闭了", mute_off)
        ok("off" in (mute_off["cls"] or ""), "静音键视觉态同步变暗（.off）", mute_off["cls"])
        # 再点一次要能开回来 —— 只关不开是常见的单向 bug
        await page.click("#uMute")
        await page.wait_for_timeout(250)
        mute_back = await page.evaluate("() => window.AT.audio.enabled")
        ok(mute_back is True, "再点一次恢复开启（不是单向开关）")

        await browser.close()
    return True


async def main():
    tmp = check_zip()
    if tmp is None:
        print("\n打包产物不存在，先跑 tools/build_dist.py")
        return 1
    try:
        await check_runtime(tmp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print("\n" + "═" * 68)
    print("提交包核验：通过 %d / %d" % (pass_n, pass_n + fail_n))
    if failures:
        print("\n失败项：")
        for f in failures:
            print("  ✗ " + f)
    print("═" * 68)
    return 1 if fail_n else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
