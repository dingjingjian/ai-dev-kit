# -*- coding: utf-8 -*-
"""
defcon 音频实测探针（临时校验用，不进提交包）
在真实 Chromium 里挂一个 AnalyserNode 到 master → destination 之间，实测各音效的输出峰值。
为什么需要它：audio.js 里写的 peak 是「单个节点的包络峰值」，经过压缩器、总线增益、
多层叠加之后，真正送到 destination 的电平是多少，光看代码算不出来。
「音效偏弱」是个量化问题，就得量化验证。

运行：python tools/audio-probe.py
"""
import asyncio, json, pathlib
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
URL = (ROOT / "index.html").as_uri()

HOOK = """
(() => {
  const RealAC = window.AudioContext;
  window.__probe = { peaks: [], an: null, ctx: null };
  function attach(ctx) {
    if (ctx.__hooked) return;
    ctx.__hooked = true;
    window.__probe.ctx = ctx;
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    window.__probe.an = an;
    const origConnect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (dest, ...rest) {
      const r = origConnect.call(this, dest, ...rest);
      try { if (dest === ctx.destination) origConnect.call(this, an); } catch (e) {}
      return r;
    };
  }
  const OrigAC = window.AudioContext;
  window.AudioContext = function (...a) { const c = new OrigAC(...a); attach(c); return c; };
  window.AudioContext.prototype = OrigAC.prototype;
  window.webkitAudioContext = window.AudioContext;
})();
"""

MEASURE = """
async (args) => {
  const { name, arg, ms } = args;
  const an = window.__probe.an;
  const buf = new Float32Array(an.fftSize);
  let peak = 0;
  const t0 = performance.now();
  window.DC.audio.play(name, arg);
  while (performance.now() - t0 < ms) {
    an.getFloatTimeDomainData(buf);
    for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > peak) peak = v; }
    await new Promise(r => setTimeout(r, 8));
  }
  return peak;
}
"""


async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(
            executable_path=EDGE,
            args=["--autoplay-policy=no-user-gesture-required", "--mute-audio"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await page.add_init_script(HOOK)
        await page.goto(URL)
        await page.wait_for_selector("#pickList .pick")
        await page.click("#pickList .pick:nth-child(4)")
        await page.wait_for_timeout(600)

        st = await page.evaluate("() => ({ state: window.__probe.ctx && window.__probe.ctx.state, av: window.DC.audio.available, en: window.DC.audio.enabled })")
        print("context:", st)
        if st["state"] != "running":
            print("!! AudioContext 未 running，测量结果无意义")

        cases = [
            ("defcon", 5, 700), ("defcon", 1, 700), ("launch", None, 900),
            ("intercept", None, 500), ("nuke", None, 1800), ("deny", None, 500),
            ("select", None, 400), ("cityLost", None, 900), ("end", 1, 2200), ("end", 3, 2200),
        ]
        print("\n%-12s %-6s %s" % ("音效", "参数", "实测峰值"))
        for name, arg, ms in cases:
            p = await page.evaluate(MEASURE, {"name": name, "arg": arg, "ms": ms})
            print("%-12s %-6s %.3f" % (name, str(arg), p))
            await page.wait_for_timeout(2200)

        # 密集触发：验证去抖不再是丢弃（连打 6 次拦截，间隔小于 MIN_GAP）
        dens = await page.evaluate("""async () => {
            const an = window.__probe.an, buf = new Float32Array(an.fftSize);
            let peak = 0; const t0 = performance.now();
            for (let i = 0; i < 6; i++) window.DC.audio.play('intercept');
            while (performance.now() - t0 < 600) {
              an.getFloatTimeDomainData(buf);
              for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > peak) peak = v; }
              await new Promise(r => setTimeout(r, 8));
            }
            return peak;
        }""")
        print("%-12s %-6s %.3f" % ("intercept×6", "密集", dens))
        await page.wait_for_timeout(2200)

        # 静默基线：确认没有残留的持续声（氛围层已移除）
        base = await page.evaluate("""async () => {
            const an = window.__probe.an, buf = new Float32Array(an.fftSize);
            let peak = 0; const t0 = performance.now();
            while (performance.now() - t0 < 800) {
              an.getFloatTimeDomainData(buf);
              for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > peak) peak = v; }
              await new Promise(r => setTimeout(r, 8));
            }
            return peak;
        }""")
        print("%-12s %-6s %.3f" % ("静默基线", "无音", base))

        print("\n错误:", errs if errs else "无")
        await b.close()


asyncio.run(main())
