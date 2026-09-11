# -*- coding: utf-8 -*-
"""
defcon BGM 实测探针（临时校验用，不进提交包）
三改后验证四件事，全部量化，不靠听：
  1. 三段 cue 是否真的按阶段切换 —— tension / siren / epilogue，终局按名次分胜负两版
  2. 各段电平 —— 必须明显低于音效峰值（核爆 0.86），否则会盖过发射 / 拦截 / 核爆
  3. 频段分布 —— 音乐主体应落在 200~600 Hz（手机扬声器有效段），
     而不是二改那样把能量堆在 1.1 kHz 摩尔斯与 4.2 kHz 击打上
  4. 警报可辨识 —— war 段在 400~600 Hz 应有明显峰值（A4 440 ↔ D5 587 的旋回）

运行：python tools/bgm-probe.py
"""
import asyncio, pathlib
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
URL = (ROOT / "index.html").as_uri()

HOOK = """
(() => {
  window.__probe = { an: null, ctx: null };
  function attach(ctx) {
    if (ctx.__hooked) return;
    ctx.__hooked = true;
    window.__probe.ctx = ctx;
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    window.__probe.an = an;
    /* 第二路：500 Hz 高通后再测 —— 手机扬声器的低截止频，这一路才是手机真正听到的 BGM。
     * 只看全频段会被低频瞬态带偏（低音与底鼓的峰值永远最大）。 */
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 500; hp.Q.value = 0.7;
    const anHp = ctx.createAnalyser();
    anHp.fftSize = 2048;
    hp.connect(anHp);
    window.__probe.anHp = anHp;
    const origConnect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (dest, ...rest) {
      const r = origConnect.call(this, dest, ...rest);
      try { if (dest === ctx.destination) { origConnect.call(this, an); origConnect.call(this, hp); } } catch (e) {}
      return r;
    };
  }
  const OrigAC = window.AudioContext;
  window.AudioContext = function (...a) { const c = new OrigAC(...a); attach(c); return c; };
  window.AudioContext.prototype = OrigAC.prototype;
  window.webkitAudioContext = window.AudioContext;
})();
"""

# 量一段时间窗内的峰值 / RMS / 频段能量 / 主导频点
MEASURE = """
async (ms) => {
  const an = window.__probe.an, anHp = window.__probe.anHp, ctx = window.__probe.ctx;
  const buf = new Float32Array(an.fftSize), bufHp = new Float32Array(anHp.fftSize);
  const freq = new Float32Array(an.frequencyBinCount);
  const binHz = ctx.sampleRate / an.fftSize;
  let peak = 0, sqSum = 0, frames = 0;
  let peakHp = 0, rmsHpSum = 0;
  const acc = new Float64Array(an.frequencyBinCount);   // 多帧累计频谱，比单帧更能代表整体
  let accFrames = 0;
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    an.getFloatTimeDomainData(buf);
    anHp.getFloatTimeDomainData(bufHp);
    let sq = 0, sqHp = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i]; sq += v * v; if (Math.abs(v) > peak) peak = Math.abs(v);
      const h = bufHp[i]; sqHp += h * h; if (Math.abs(h) > peakHp) peakHp = Math.abs(h);
    }
    const rms = Math.sqrt(sq / buf.length);
    rmsHpSum += Math.sqrt(sqHp / bufHp.length);
    sqSum += rms; frames++;
    an.getFloatFrequencyData(freq);
    for (let i = 1; i < freq.length; i++) acc[i] += Math.pow(10, freq[i] / 10);
    accFrames++;
    await new Promise(r => setTimeout(r, 8));
  }
  const bands = { '<200': [20, 200], '200-500': [200, 500], '500-2k': [500, 2000], '>2k': [2000, 12000] };
  const sum = {}; for (const k in bands) sum[k] = 0;
  let tot = 0;
  let domHz = 0, domP = 0;
  for (let i = 1; i < acc.length; i++) {
    const f = i * binHz; if (f > 12000) break;
    const p = acc[i] / (accFrames || 1);
    if (p > domP) { domP = p; domHz = f; }
    for (const k in bands) if (f >= bands[k][0] && f < bands[k][1]) { sum[k] += p; tot += p; }
  }
  const pct = {}; for (const k in bands) pct[k] = tot ? sum[k] / tot : 0;
  /* 400~600 Hz 占比：警报旋回（A4 440 ↔ D5 587）就在这一段，
   * 单列出来是为了在 war 段能直接判「警报在场」而不是靠人耳。 */
  let sirenBand = 0;
  for (let i = 1; i < acc.length; i++) {
    const f = i * binHz;
    if (f >= 400 && f < 600) sirenBand += acc[i] / (accFrames || 1);
  }
  return {
    peak, rms: frames ? sqSum / frames : 0, peakHp, rmsHp: frames ? rmsHpSum / frames : 0,
    bands: pct, domHz, sirenShare: tot ? sirenBand / tot : 0
  };
}
"""

MUTE_SFX = "() => { window.__realPlay = window.DC.audio.play; window.DC.audio.play = function(){ return false; }; }"
UNMUTE_SFX = "() => { if (window.__realPlay) window.DC.audio.play = window.__realPlay; }"

STATE = ("() => ({ phase: window.DC.game.state.phase, defcon: window.DC.game.state.defcon, "
         "cue: window.DC.audio.bgm.cue, variant: window.DC.audio.bgm.variant, "
         "playing: window.DC.audio.bgm.playing, bpm: Math.round(window.DC.audio.bgm.bpm) })")


def report(tag, info, r, extra=""):
    print("\n[%s]  phase=%s  DEFCON %s  cue=%s  variant=%s  bpm %s  playing=%s"
          % (tag, info["phase"], info["defcon"], info["cue"], info["variant"], info["bpm"], info["playing"]))
    print("  全频 峰值 %.3f  平均RMS %.4f     手机(>500Hz) 峰值 %.3f  平均RMS %.4f"
          % (r["peak"], r["rms"], r["peakHp"], r["rmsHp"]))
    print("  平均频段 " + "  ".join("%s %2.0f%%" % (k, v * 100) for k, v in r["bands"].items())
          + "    主导频点 %d Hz" % r["domHz"])
    if extra:
        print("  " + extra)


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
        await page.wait_for_timeout(300)

        st = await page.evaluate("() => ({ state: window.__probe.ctx.state })")
        if st["state"] != "running":
            print("!! AudioContext 未 running，测量结果无意义")
        else:
            print("AudioContext running ✓")

        await page.evaluate(MUTE_SFX)      # 隔离 BGM，先量独奏

        # ① 危机段 DEFCON 5：等淡入 2 s + 至少四小节
        await page.wait_for_timeout(9000)
        report("① 危机段 DEFCON 5", await page.evaluate(STATE), await page.evaluate(MEASURE, 5000))

        # ② 危机段 DEFCON 2：把危机值压到 2，BGM 应提速、加厚
        await page.evaluate("() => { window.DC.game.state.defcon = 2; }")
        await page.wait_for_timeout(6000)
        report("② 危机段 DEFCON 2", await page.evaluate(STATE), await page.evaluate(MEASURE, 5000),
               "（对比 ①：bpm 应升到 ~92，频段分布应更宽）")

        # ③ 核战：开战，BGM 应换成防空警报
        await page.evaluate("() => window.DC.game.maxCrisis()")
        await page.wait_for_timeout(3000)
        info = await page.evaluate(STATE)
        r = await page.evaluate(MEASURE, 11000)     # 覆盖一轮「鸣 12 拍 + 停 4 拍」
        report("③ 热核战争 · 防空警报", info, r)
        print("  → cue %s  警报频段(400~600Hz)占比 %.1f%%  %s"
              % (info["cue"], r["sirenShare"] * 100,
                 "OK 警报在场" if info["cue"] == "siren" and r["sirenShare"] > 0.06 else "!! 警报偏弱"))

        # ④ 终局：把战局推完，再看终局曲
        fin = await page.evaluate("""() => {
          const s = window.DC.game.state; let n = 0;
          while (s.phase !== 'over' && n < 20000) { window.DC.sim.tick(s, 0.1); n++; }
          if (s.phase !== 'over') { s.ranking = window.DC.sim.ranking(s); s.phase = 'over'; }
          return { phase: s.phase, ticks: n };
        }""")
        await page.wait_for_timeout(4000)
        info = await page.evaluate(STATE)
        report("④ 终局（当前名次 %s）" % info["variant"], info, await page.evaluate(MEASURE, 6000),
               "推进 %s tick" % fin["ticks"])

        # ⑤ 终局·夺冠版：把玩家换成排名第一的阵营，BGM 应切到 variant 1
        await page.evaluate("""() => {
          const s = window.DC.game.state;
          s.playerFaction = s.ranking[0].code;
        }""")
        await page.wait_for_timeout(3000)
        info = await page.evaluate(STATE)
        report("⑤ 终局 · 夺冠版", info, await page.evaluate(MEASURE, 5000),
               "cue %s  variant %s  %s" % (info["cue"], info["variant"],
                                           "OK 已切夺冠版" if info["variant"] == 1 else "!! 未切"))

        # ⑥ BGM + 音效叠加：会不会削波（这是 BGM 电平的硬约束）
        await page.evaluate(UNMUTE_SFX)
        await page.evaluate("() => window.DC.audio.play('nuke')")
        r2 = await page.evaluate(MEASURE, 1800)
        print("\n[⑥ BGM + 核爆]  峰值 %.3f  %s" % (r2["peak"], "!! 削波" if r2["peak"] >= 0.99 else "未削波"))
        await page.wait_for_timeout(1200)
        await page.evaluate("""() => { for (let i=0;i<3;i++) setTimeout(()=>window.DC.audio.play('defcon', 2), i*180); }""")
        r3 = await page.evaluate(MEASURE, 1600)
        print("[BGM + 告警×3] 峰值 %.3f  %s" % (r3["peak"], "!! 削波" if r3["peak"] >= 0.99 else "未削波"))

        # ⑦ 关声音：BGM 应立即停
        await page.evaluate("() => window.DC.audio.setEnabled(false)")
        await page.wait_for_timeout(400)
        print("\n[⑦ 关声音] bgm.playing=%s  （应 False）" % await page.evaluate("() => window.DC.audio.bgm.playing"))

        print("\n页面错误:", errs if errs else "无")
        await b.close()


asyncio.run(main())
