# -*- coding: utf-8 -*-
"""
defcon 音效实测探针（临时校验用，不进提交包）
============================================================
为什么需要它：audio.js 里写的 peak 是「单个节点的包络峰值」，经过压缩器、总线增益、
多层叠加之后真正送到 destination 的电平，光看代码算不出来。
BGM 重做时已经吃过一次亏（音乐主体全落在手机放不出的 <500 Hz，等于把配乐静音），
音效必须用同一把尺子量一遍。

两个工况：
  ① 静默：每个音效单独响，量峰值 / RMS / 四频段能量分布 / 谱心 / 主导频点
  ② 共存：siren 段防空警报 BGM 在场，量音效在「自己该被听见的频段」上的信掩比 ——
     音效最响那一帧在该频段的功率，比 BGM 单独时同频段的平均功率高多少 dB。
     低于 ~6 dB 意味着被垫底盖住了。

运行：python tools/sfx-probe.py
"""
import asyncio, math, pathlib
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
URL = (ROOT / "index.html").as_uri()

HOOK = """
(() => {
  window.__probe = { an: null, an2: null, ctx: null };
  function attach(ctx) {
    if (ctx.__hooked) return;
    ctx.__hooked = true;
    window.__probe.ctx = ctx;
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    an.smoothingTimeConstant = 0;   // 要瞬时谱，不要时间平均
    /* 第二条支路：500 Hz 高通后再取时域波形。
     * 手机扬声器的低截止普遍在 500~800 Hz，低于它的能量物理上辐射不出来。
     * 全频波形只能说明「我们放了什么」，高通后的波形才是「手机上听得到什么」。
     * Q=0.707 二阶巴特沃斯，对 47 Hz 约衰减 40 dB，与典型手机扬声器量级相当。 */
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 500; hp.Q.value = 0.707;
    const an2 = ctx.createAnalyser();
    an2.fftSize = 2048;
    an2.smoothingTimeConstant = 0;
    hp.connect(an2);
    window.__probe.an = an;
    window.__probe.an2 = an2;
    const origConnect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (dest, ...rest) {
      const r = origConnect.call(this, dest, ...rest);
      try {
        if (dest === ctx.destination) { origConnect.call(this, an); origConnect.call(this, hp); }
      } catch (e) {}
      return r;
    };
  }
  const OrigAC = window.AudioContext;
  window.AudioContext = function (...a) { const c = new OrigAC(...a); attach(c); return c; };
  window.AudioContext.prototype = OrigAC.prototype;
  window.webkitAudioContext = window.AudioContext;
})();
"""

# 频段按「手机扬声器能不能放出来」切：
#   <200    物理上放不出，音量开大只有破音
#   200-500 边缘，靠机壳共振
#   500-2k  手机最有效的一段
#   >2k     明亮，但辐射效率低、易刺耳
BANDS = [(20, 200), (200, 500), (500, 2000), (2000, 8000)]

MEASURE = """
async (args) => {
  const BANDS = [[20, 200], [200, 500], [500, 2000], [2000, 8000]];
  const { name, arg, ms, band } = args;
  const an = window.__probe.an, an2 = window.__probe.an2, ctx = window.__probe.ctx;
  const N = an.frequencyBinCount;
  const buf = new Float32Array(an.fftSize);
  const buf2 = new Float32Array(an2.fftSize);
  const freq = new Float32Array(N);
  const binHz = ctx.sampleRate / an.fftSize;

  let peak = 0, bestRms = -1, best = null, nAcc = 0;
  let hpPeak = 0, hpRms = 0;                  // 500 Hz 高通后 = 手机外放真正拿到的部分
  let sqAcc = 0, hpSq = 0, frames = 0;
  const acc = new Float64Array(N);            // 每帧功率累加 → 平均底噪

  const t0 = performance.now();
  if (name && name !== 'BASELINE') window.DC.audio.play(name, arg);
  while (performance.now() - t0 < ms) {
    an.getFloatTimeDomainData(buf);
    let sq = 0;
    for (let i = 0; i < buf.length; i++) { const v = buf[i]; sq += v * v; if (Math.abs(v) > peak) peak = Math.abs(v); }
    const rms = Math.sqrt(sq / buf.length);
    an2.getFloatTimeDomainData(buf2);
    let sq2 = 0;
    for (let i = 0; i < buf2.length; i++) { const v = buf2[i]; sq2 += v * v; if (Math.abs(v) > hpPeak) hpPeak = Math.abs(v); }
    const r2 = Math.sqrt(sq2 / buf2.length);
    sqAcc += sq / buf.length; hpSq += sq2 / buf2.length; frames++;
    if (r2 > hpRms) hpRms = r2;
    an.getFloatFrequencyData(freq);
    for (let i = 1; i < N; i++) acc[i] += Math.pow(10, freq[i] / 10);
    nAcc++;
    if (rms > bestRms) { bestRms = rms; best = Array.from(freq); }
    await new Promise(r => setTimeout(r, 8));
  }
  /* 两个支路都用「逐帧 RMS 的均方根」，同一批帧、同一口径 —— 相减才是这支路的真实损失。
   * 若各取「最大帧」，两支路的最大值落在不同帧上，实测会出现 +1 dB 这种不可能的结果。 */
  const hpAvg = Math.sqrt(hpSq / Math.max(1, frames));
  const avgRms = Math.sqrt(sqAcc / Math.max(1, frames));

  // 功率求和统一返回绝对 dB（10*log10(sum of linear power)），三次调用之间可直接相减
  const psum = (arr, a, b) => {
    let s = 0;
    for (let i = 1; i < N; i++) { const f = i * binHz; if (f >= a && f < b) s += Math.pow(10, arr[i] / 10); }
    return s;
  };
  const avgArr = Array.from(acc, v => nAcc ? v / nAcc : 0);
  const out = { peak: peak, rms: bestRms, avgRms: avgRms,
                hpPeak: hpPeak, hpRms: hpRms, hpAvg: hpAvg,
                bands: [], cent: 0, dom: 0 };
  const tot = psum(best, 20, 8000) || 1;
  let cn = 0, cd = 0, dm = -1e9, dmf = 0;
  for (let i = 1; i < N; i++) {
    const f = i * binHz; if (f > 8000) break;
    const p = Math.pow(10, best[i] / 10);
    cn += f * p; cd += p;
    if (best[i] > dm) { dm = best[i]; dmf = f; }
  }
  out.cent = cd ? cn / cd : 0;
  out.dom = dmf;
  for (const seg of BANDS) out.bands.push(10 * Math.log10(Math.max(1e-15, psum(best, seg[0], seg[1]) / tot)));
  out.sig = band;   // 占位，实际判定用高通支路，不再用频谱绝对值
  return out;
}
"""

# 音效 + 它「应该被听见」的频段（信掩比按这一段算）
CASES = [
    ("defcon", 5, 700, (200, 2000)),
    ("defcon", 1, 700, (200, 2000)),
    ("launch", None, 900, (500, 2000)),
    ("intercept", None, 500, (1000, 3000)),
    ("nuke", None, 1800, (200, 2000)),
    ("deny", None, 500, (200, 2000)),
    ("pick", None, 500, (500, 2000)),
    ("select", None, 400, (800, 2500)),
    ("tap", None, 400, (500, 2500)),
    ("cityLost", None, 900, (200, 2000)),
    ("end", 1, 2200, (100, 1000)),
    ("end", 3, 2200, (100, 1000)),
]


async def measure(page, name, arg, ms, band=(200, 2000)):
    return await page.evaluate(MEASURE, {"name": name, "arg": arg, "ms": ms, "band": list(band)})


def band_txt(r):
    lin = [10 ** (v / 10) for v in r["bands"]]
    tot = sum(lin) or 1
    return " / ".join("%2.0f%%" % (100 * v / tot) for v in lin)


def keep(r):
    """手机保留 = 20·log10(500 Hz 高通支路 RMS / 全频 RMS)，单位 dB，同窗口同口径。
    这是本探针的主判据：手机扬声器辐射不出 500 Hz 以下，全频电平说明不了外放效果。
    用 RMS 而不是峰值 —— 高通会把方波的基频抽掉，剩下的谐波吉布斯过冲，
    峰值能虚高到全频的 195%（cityLost 实测），那是波形形状的假象，不是更响。"""
    return "%+.0f dB" % (20 * math.log10(max(1e-6, r["hpAvg"]) / max(1e-6, r["avgRms"])))


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

        st = await page.evaluate("() => ({ st: window.__probe.ctx && window.__probe.ctx.state, sr: window.__probe.ctx && window.__probe.ctx.sampleRate })")
        print("context:", st)
        if st["st"] != "running":
            print("!! AudioContext 未 running，测量结果无意义")

        # ── ① 共存工况：siren 段防空警报 BGM 在场（先跑，此时还是真实阶段）──
        # 不走 bgm.start()：bgmStart 在 playing 时直接返回 false，切不过去。
        # 直接改 phase 让主循环的 setScene 走真实的换段路径（含交叉淡入淡出）。
        await page.evaluate("""() => {
            window.DC.game.state.phase = 'war';
            window.DC.game.state.defcon = 3;
        }""")
        await page.wait_for_timeout(7000)          # 等换段淡入走完（XFADE 0.45 + 1.30 s）
        cue = await page.evaluate("() => window.DC.audio.bgm.cue")
        print("\n【① 共存工况】BGM cue = %s（战争段防空警报在场）" % cue)
        if cue != "siren":
            print("!! 未切到 siren 段，共存数据不可用")

        base = await measure(page, "BASELINE", None, 2000, (200, 2000))
        print("BGM 单独：全频峰值 %.3f  RMS %.4f   手机保留 %s"
              % (base["peak"], base["rms"], keep(base)))
        print("\n%-11s %-6s %-9s %-9s %-10s %-11s"
              % ("音效", "参数", "混合全频峰", "混合手机峰", "峰值凸出", "手机信掩比"))
        print("  峰值凸出 = 20·log10(混合全频峰值 / BGM RMS)　手机信掩比 = 20·log10(混合手机RMS / BGM 手机RMS)")
        for name, arg, ms, band in CASES:
            r = await measure(page, name, arg, ms, band)
            crest = 20 * math.log10(r["peak"] / base["rms"])
            hpsnr = 20 * math.log10(max(1e-6, r["hpAvg"]) / max(1e-6, base["hpAvg"]))
            print("%-11s %-6s %-9.3f %-9.3f %-10s %-11s %s"
                  % (name, str(arg), r["peak"], r["hpPeak"], "%+.1f dB" % crest,
                     "%+.1f dB" % hpsnr, "!! 会被警报盖住" if hpsnr < 3 else ""))
            await page.wait_for_timeout(1500)

        # ── ①-b 让路（duck）：核爆爆发时 BGM 应该退开，核爆的尾巴走完再回来 ──
        # 量「手机高通支路」而不是全频：核爆在 500 Hz 以上几乎没有能量（手机冲击 0.02 量级），
        # 所以这一支路上的电平变化基本只反映 BGM —— 正好用来量让路深度。
        duck = await page.evaluate("""async () => {
            const an2 = window.__probe.an2;
            const buf = new Float32Array(an2.fftSize);
            const frame = () => {
              an2.getFloatTimeDomainData(buf);
              let s = 0;
              for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
              return Math.sqrt(s / buf.length);
            };
            let before = 0, nb = 0, during = 0, nd = 0, dmin = 1, tBack = null;
            let t = performance.now();
            while (performance.now() - t < 600) { before += frame(); nb++; await new Promise(r => setTimeout(r, 8)); }
            before /= Math.max(1, nb);
            window.DC.audio.play('nuke');
            const t0 = performance.now();
            while (performance.now() - t0 < 1600) {
              const el = performance.now() - t0;
              if (el <= 400) { during += frame(); nd++; }
              const d = window.DC.audio.duck;
              if (d < dmin) dmin = d;
              if (tBack === null && el > 300 && d > 0.995) tBack = el;
              await new Promise(r => setTimeout(r, 8));
            }
            during /= Math.max(1, nd);
            return { before: before, during: during, dmin: dmin, tBack: tBack };
        }""")
        duck_drop = 20 * math.log10(max(1e-6, duck["during"]) / max(1e-6, duck["before"]))
        print("\n【①-b 让路实测】战争段 BGM 在场，触发一次 nuke")
        print("  警报手机段 RMS  让路前 %.4f → 让路中 %.4f（%s）"
              % (duck["before"], duck["during"], "%+.1f dB" % duck_drop))
        print("  duck 增益最低 %.2f（目标 0.45）  回到 1 用时 %s"
              % (duck["dmin"], ("%.0f ms" % duck["tBack"]) if duck["tBack"] else "未回到"))

        await page.evaluate("() => window.DC.audio.bgm.stop()")
        await page.wait_for_timeout(2500)

        # ── ③ 齐射叠加：最坏情况是否削波 ──────────────────────────
        # 战争期一秒内可能有：核爆 + 己方城市被毁 + 两颗拦截 + 发射同时落地。
        # 压缩器就是为这一幕准备的，量一下它到底兜没兜住（|x| ≥ 0.99 即削波）。
        burst = await page.evaluate("""async () => {
            const an = window.__probe.an, an2 = window.__probe.an2;
            const buf = new Float32Array(an.fftSize), buf2 = new Float32Array(an2.fftSize);
            let peak = 0, hpPeak = 0, clip = 0, frames = 0, rmsAcc = 0;
            window.DC.audio.play('launch');
            window.DC.audio.play('intercept'); window.DC.audio.play('intercept');
            window.DC.audio.play('nuke');      window.DC.audio.play('cityLost');
            const t0 = performance.now();
            while (performance.now() - t0 < 1400) {
              an.getFloatTimeDomainData(buf);
              let sq = 0;
              for (let i = 0; i < buf.length; i++) {
                const v = Math.abs(buf[i]); if (v > peak) peak = v;
                if (v >= 0.99) clip++;
                sq += buf[i] * buf[i];
              }
              an2.getFloatTimeDomainData(buf2);
              for (let i = 0; i < buf2.length; i++) { const v = Math.abs(buf2[i]); if (v > hpPeak) hpPeak = v; }
              rmsAcc += Math.sqrt(sq / buf.length); frames++;
              await new Promise(r => setTimeout(r, 8));
            }
            return { peak: peak, hpPeak: hpPeak, clip: clip, rms: rmsAcc / Math.max(1, frames) };
        }""")
        print("\n【② 齐射叠加】launch + intercept×2 + nuke + cityLost 同时落地")
        print("全频峰值 %.3f（%.2f dBFS）  手机峰值 %.3f  削波采样 %d  平均RMS %.4f"
              % (burst["peak"], 20 * math.log10(max(1e-6, burst["peak"])),
                 burst["hpPeak"], burst["clip"], burst["rms"]))

        # ── ③ 单音工况：必须先把 BGM 关干净，否则短音的最响帧会被 BGM 抢走 ──
        # 这个坑很隐蔽：tap 这类轻音的峰值低于简报段 BGM 的峰值，探针会挑到 BGM 的帧，
        # 于是「主导频点」显示成 BGM 的 47 Hz 低音、「手机保留」也跟着失真。
        # setScene 被主循环每帧调用，会立刻把 BGM 拉回来 —— 隔离音效要 stub setScene + bgm.stop()
        # （注意 setEnabled(false) 会连音效一起关，不能用它来隔离）。
        await page.evaluate("""() => {
            window.DC.audio.setScene = function () {};
            window.DC.audio.bgm.stop();
        }""")
        await page.wait_for_timeout(2000)          # 等淡出走完（BGM_FADE_OUT 1.2 s）
        resid = await measure(page, "BASELINE", None, 900)
        print("\n【③ 单音工况】BGM 已停，残留底噪峰值 %.3f（应接近 0）" % resid["peak"])
        print("四频段占比列 = <200 / 200-500 / 500-2k / 2k-8k")
        print("「手机保留」= 500 Hz 高通支路 RMS − 全频 RMS，越负表示手机外放损失越大（0 dB = 全在 500 Hz 以上）")
        print("「手机冲击」= 高通支路最大帧 RMS，绝对量。核爆这类瞬态看它 —— 整段平均会低估一次短促的爆发")
        print("%-11s %-6s %-8s %-8s %-22s %-9s %-9s %-9s %s"
              % ("音效", "参数", "全频峰值", "RMS", "四频段占比", "手机保留", "手机冲击", "谱心", "主导频点"))
        for name, arg, ms, band in CASES:
            r = await measure(page, name, arg, ms, band)
            print("%-11s %-6s %-8.3f %-8.4f %-22s %-9s %-9.3f %-9.0f %.0f Hz"
                  % (name, str(arg), r["peak"], r["rms"], band_txt(r), keep(r),
                     r["hpRms"], r["cent"], r["dom"]))
            await page.wait_for_timeout(1800)

        print("\n错误:", errs if errs else "无")
        await b.close()


asyncio.run(main())
