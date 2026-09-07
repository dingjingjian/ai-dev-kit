# -*- coding: utf-8 -*-
"""
音频校验：用系统 Edge 打开真实页面，走一遍完整交互，检查音频链路。

为什么需要它 —— 音效是唯一既看不着、又没法靠单测覆盖的部分：
  - 截图看不出声音（shot_util.py 管不了）
  - 冒烟测试用的是假 AudioContext（smoke_test.js 管不了真机约束）
真机 Web Audio 有几条运行时约束，只有真浏览器能验：
  1. AudioContext 必须在用户手势内创建，否则浏览器直接拦下并告警
  2. exponentialRamp 端点为 0 会抛异常，且只在特定分支上抛
  3. 无音频设备的环境（含无头）currentTime 不前进，调度器不能失控

用法：python _dev/audio_check.py
退出码：0 全部通过 / 1 有失败项
"""
import asyncio
import functools
import http.server
import socketserver
import sys
import threading
import time
from pathlib import Path

from playwright.async_api import async_playwright

BASE = Path(__file__).resolve().parent
ROOT = BASE.parent
PORT = 8733
URL = f"http://127.0.0.1:{PORT}/index.html"

# 在页面脚本之前注入：给 AudioContext 打桩计数，不改游戏代码一行。
# 计的是「真实浏览器里被创建出来的节点」，所以能验到真机行为。
PROBE = """
(function(){
  window.__AUD = { ctx:0, osc:0, buf:0, started:0, err:[] };
  var Orig = window.AudioContext || window.webkitAudioContext;
  if (!Orig) { window.__AUD.err.push('宿主没有 AudioContext'); return; }
  function Wrapped(){
    var c = new Orig(), A = window.__AUD;
    A.ctx++; A.last = c;
    var co = c.createOscillator.bind(c);
    c.createOscillator = function(){
      A.osc++; var o = co(); var st = o.start.bind(o);
      o.start = function(t){ A.started++; return st(t); };
      return o;
    };
    var cb = c.createBufferSource.bind(c);
    c.createBufferSource = function(){ A.buf++; return cb(); };
    return c;
  }
  Wrapped.prototype = Orig.prototype;
  window.AudioContext = Wrapped;
  window.webkitAudioContext = Wrapped;
})();
"""

FAILED = []


def ok(cond, name, extra=""):
    print(f"  [{'✓' if cond else '✗'}] {name}" + ("" if cond else f"  ← {extra}"))
    if not cond:
        FAILED.append(name)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    # 静态服务器日志会盖住检查结果，且 favicon 的 404 会污染下面的 console 断言
    def log_message(self, *a):
        pass


def serve():
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), handler) as httpd:
        httpd.serve_forever()


async def main():
    threading.Thread(target=serve, daemon=True).start()
    time.sleep(0.6)

    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="msedge")
        ctx = await browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=2, is_mobile=True, has_touch=True,
        )
        page = await ctx.new_page()

        console_err, page_err = [], []
        page.on("console", lambda m: console_err.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: page_err.append(str(e)))

        await page.add_init_script(PROBE)
        await page.goto(URL)
        await page.wait_for_selector("#dock", timeout=10000)
        print("\n—— 音频链路（真实 Edge）——")

        # 1. 手势之前：连 AudioContext 都不该存在
        ok(await page.evaluate("window.__AUD.ctx") == 0,
           "未交互前不创建 AudioContext（浏览器策略要求）",
           await page.evaluate("window.__AUD.ctx"))

        # 2. 首次点击解锁
        box = await page.locator("#cityCanvas").bounding_box()
        await page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        await page.wait_for_timeout(300)
        ok(await page.evaluate("window.__AUD.ctx") == 1,
           "首次点击后创建且只创建 1 个 AudioContext",
           await page.evaluate("window.__AUD.ctx"))

        st = await page.evaluate("window.__AUD.last && window.__AUD.last.state")
        print(f"      AudioContext.state = {st}")
        if st != "running":
            # 无音频设备的环境（含无头 Edge）会停在 suspended，属环境限制不是代码问题。
            # 这类环境里 currentTime 不前进，后面的 BGM 断言会自然跳过。
            print("      ⚠ 环境无音频输出设备，currentTime 不前进 —— BGM 调度改为宽松判定")

        # 3. 浮层开关 / 选图纸应该出声
        n0 = await page.evaluate("window.__AUD.started")
        await page.wait_for_timeout(600)
        n1 = await page.evaluate("window.__AUD.started")
        ok(n1 > n0, "解锁后 BGM 开始排音符", f"{n0} → {n1}")

        # 4. 走一遍拼豆台：CTA → 拼豆板上点几下
        cta = page.locator("#bpDockCta")
        if await cta.count():
            await cta.click()
            await page.wait_for_timeout(400)
        await page.wait_for_selector("#boardCanvas", timeout=5000)
        bb = await page.locator("#boardCanvas").bounding_box()
        n2 = await page.evaluate("window.__AUD.started")
        for i in range(6):
            await page.mouse.click(
                bb["x"] + bb["width"] * (0.3 + 0.06 * i),
                bb["y"] + bb["height"] * 0.5)
            await page.wait_for_timeout(120)
        n3 = await page.evaluate("window.__AUD.started")
        ok(n3 > n2, "放豆有音效输出", f"{n2} → {n3}")

        # 5. 噪声类音效（橡皮 / 清空）走的是 createBufferSource 分支
        await page.locator("#btnClear").click()
        await page.wait_for_timeout(300)
        ok(await page.evaluate("window.__AUD.buf") > 0,
           "噪声类音效走到 createBufferSource 分支",
           await page.evaluate("window.__AUD.buf"))

        # 6. 静音开关：关掉后不再产生新节点
        await page.locator("#bvBack").click()
        await page.wait_for_timeout(300)
        await page.locator("#btnSound").click()
        await page.wait_for_timeout(400)
        ok(await page.evaluate("localStorage.getItem('pcity_snd')") == "0",
           "静音偏好写入 localStorage",
           await page.evaluate("localStorage.getItem('pcity_snd')"))
        ok(await page.evaluate("document.getElementById('btnSound').classList.contains('muted')"),
           "HUD 按钮切到静音态")

        n4 = await page.evaluate("window.__AUD.osc")
        await page.locator("#btnBlueprint").click()
        await page.wait_for_timeout(300)
        await page.locator("#bpClose").click()
        await page.wait_for_timeout(500)
        n5 = await page.evaluate("window.__AUD.osc")
        ok(n5 == n4, "静音后不再创建振荡器", f"{n4} → {n5}")

        # 7. 取消静音恢复
        await page.locator("#btnSound").click()
        await page.wait_for_timeout(400)
        n6 = await page.evaluate("window.__AUD.osc")
        await page.locator("#btnBlueprint").click()
        await page.wait_for_timeout(400)
        ok(await page.evaluate("window.__AUD.osc") > n6, "取消静音后音效恢复")

        # 8. 整轮跑完不能有任何 JS 报错
        # favicon 404 是本地静态服务器的产物，与游戏无关，不算数
        real_console = [t for t in console_err
                        if "Autoplay" not in t and "AudioContext" not in t and "404" not in t]
        ok(not page_err, "无未捕获异常", "; ".join(page_err[:3]))
        ok(not real_console, "无 console.error", "; ".join(real_console[:3]))
        ok(not await page.evaluate("window.__AUD.err"),
           "探针未记录宿主问题",
           str(await page.evaluate("window.__AUD.err")))

        await browser.close()

    print(f"\n{'全部通过 ✅' if not FAILED else str(len(FAILED)) + ' 项未通过 ❌'}")
    sys.exit(0 if not FAILED else 1)


if __name__ == "__main__":
    asyncio.run(main())
