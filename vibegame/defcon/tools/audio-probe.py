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
  const an = window.__probe.an, ctx = window.__probe.ctx;
  const buf = new Float32Array(an.fftSize);
  const freq = new Float32Array(an.frequencyBinCount);
  const binHz = ctx.sampleRate / an.fftSize;
  let peak = 0, best = null, bestRms = -1;
  const t0 = performance.now();
  window.DC.audio.play(name, arg);
  while (performance.now() - t0 < ms) {
    an.getFloatTimeDomainData(buf);
    let sq = 0;
    for (let i = 0; i < buf.length; i++) { const v = buf[i]; sq += v * v; if (Math.abs(v) > peak) peak = Math.abs(v); }
    const rms = Math.sqrt(sq / buf.length);
    if (rms > bestRms) {                    // 取能量最大的那一帧做频谱，才有代表性
      bestRms = rms;
      an.getFloatFrequencyData(freq);
      best = Array.from(freq);
    }
    await new Promise(r => setTimeout(r, 8));
  }
  // 分频段能量占比 + 谱心：低频轰鸣与高频鞭炮的客观分界
  const bands = { lo: [20, 200], mid: [200, 2000], hi: [2000, 8000] };
  const sum = {}, cent = { num: 0, den: 0 };
  for (const k in bands) sum[k] = 0;
  if (best) {
    for (let i = 1; i < best.length; i++) {
      const f = i * binHz;
      if (f > 12000) break;
      const p = Math.pow(10, best[i] / 10);
      for (const k in bands) if (f >= bands[k][0] && f < bands[k][1]) sum[k] += p;
      cent.num += f * p; cent.den += p;
    }
  }
  const tot = sum.lo + sum.mid + sum.hi || 1;
  return { peak: peak, lo: sum.lo / tot, mid: sum.mid / tot, hi: sum.hi / tot,
           cent: cent.den ? cent.num / cent.den : 0 };
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
            ("tap", None, 400), ("pick", None, 500),
        ]
        print("\n%-12s %-6s %-9s %-19s %s" % ("音效", "参数", "实测峰值", "低/中/高频能量", "谱心"))
        for name, arg, ms in cases:
            r = await page.evaluate(MEASURE, {"name": name, "arg": arg, "ms": ms})
            print("%-12s %-6s %-9.3f %2.0f%% /%2.0f%% /%2.0f%%      %5.0f Hz"
                  % (name, str(arg), r["peak"], r["lo"] * 100, r["mid"] * 100, r["hi"] * 100, r["cent"]))
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
