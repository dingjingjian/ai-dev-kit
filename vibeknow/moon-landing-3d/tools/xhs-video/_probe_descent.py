# -*- coding: utf-8 -*-
"""下降段专用探针：在整个 descent 过程中轮换若干距离，看哪一档平坦帧最少。

只测单帧不够 —— 上一版就是只在「刚进入 descent」那一刻测了 110 就定下来，
结果中段 106 帧照样是平的。这次把候选距离按短间隔轮换，覆盖整个过程。
"""
import pathlib, json, time
from playwright.sync_api import sync_playwright
from PIL import Image
import numpy as np

BASE = pathlib.Path(__file__).resolve().parent
ROOT = BASE.parents[1]
URL = (ROOT / "index.html").as_uri()

INIT = r"""
(() => {
  let _m3d = null;
  Object.defineProperty(window, 'M3D', {
    configurable: true,
    get() { return _m3d; },
    set(v) {
      _m3d = new Proxy(v, {
        set(t, p, val) {
          if (p === 'createMissionSystem') {
            const orig = val;
            t[p] = function () { const s = orig.apply(this, arguments); window.__MISSION = s; return s; };
          } else { t[p] = val; }
          return true;
        }
      });
    }
  });
  window.__frame = null;
  window.requestAnimationFrame = function (cb) { window.__frame = cb; return 0; };
})();
"""

WRAP = r"""
(PHASES) => {
  var ms = window.__MISSION;
  if (ms.__origDirect) { ms.__PH = PHASES; return; }
  ms.__origDirect = ms.directCamera;
  ms.__PH = PHASES;
  ms.__MAXD = 1e9;
  ms.directCamera = function (cam, dt) {
    ms.__origDirect.call(this, cam, dt);
    if (!ms.__PH[ms.state.phase]) return;
    if (cam.distance > ms.__MAXD) cam.distance = ms.__MAXD;
  };
}
"""

HIDE = ("#btn-show,#btn-explode,#btn-launch,#btn-var1,#btn-var2,#btn-ignite,#btn-warp,"
        "#btn-sound,#telemetry,#mission-tag,#phase-text,#countdown,#variant-bar,#desc-box,"
        "#seg-fade,#labels,.bottombar,.modes,.progress,#loader{display:none!important}")

CANDS = [45, 70, 110, 180, 320, 1080]
STEP_MS = 1000.0 / 30.0
HOLD = 6          # 每个距离先稳定这么多帧再测


def std_of(png):
    from io import BytesIO
    a = np.asarray(Image.open(BytesIO(png)).convert("L"), dtype=np.float32)
    e = np.abs(np.diff(a, axis=1))
    return float(a.std()), float((e > 18).mean() * 100), float(a.mean())


def main():
    rows = []
    with sync_playwright() as p:
        br = p.chromium.launch(channel="msedge", headless=True, args=[
            "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
            "--ignore-gpu-blocklist", "--enable-webgl", "--mute-audio"])
        pg = br.new_page(viewport={"width": 1080, "height": 1920}, device_scale_factor=1)
        pg.add_init_script(INIT)
        pg.goto(URL, wait_until="load", timeout=30000)
        pg.evaluate("() => { document.documentElement.style.zoom = String(1080/405); }")
        time.sleep(6)
        pg.add_style_tag(content=HIDE)
        pg.evaluate("() => document.getElementById('btn-launch').click()")
        time.sleep(0.4)
        pg.evaluate("() => document.getElementById('btn-ignite').click()")
        time.sleep(0.3)

        tms = 1000.0
        guard = 0
        inPhase = None
        cyc = 0
        while guard < 9000:
            guard += 1
            st = pg.evaluate("() => { var s=window.__MISSION.state;"
                             "return {phase:s.phase, landed:s.landed}; }")
            ph = st["phase"]
            if st["landed"]:
                break
            # 到 descent 之前全程快进；进入 descent 后按 1x 细走
            fast = ph not in ("descent", "approach")
            if fast:
                pg.evaluate("() => { var s=window.__MISSION.state; s.hold=true; s.holdT=2.5; }")
            else:
                pg.evaluate("() => { var s=window.__MISSION.state; s.hold=false; s.holdT=0; }")
                if inPhase is None:
                    inPhase = ph
                    pg.evaluate(WRAP, ["descent", "approach"])
                    print("== 进入 %s（drive %d）==" % (ph, guard))
            pg.evaluate("(t) => { if (window.__frame) window.__frame(t); }", tms)
            tms += STEP_MS
            if fast:
                continue

            # 在 descent/approach 内轮换距离
            md = CANDS[(cyc // HOLD) % len(CANDS)]
            pg.evaluate("(m) => { window.__MISSION.__MAXD = m; }", md)
            cyc += 1
            if cyc % HOLD != 1:
                continue
            s, edge, mean = std_of(pg.screenshot())
            rows.append((ph, md, s, edge, mean))
            print("  %-9s MAXD=%4d  std=%6.2f edge=%5.2f mean=%6.2f" % (ph, md, s, edge, mean))
        br.close()

    print("\n== 汇总：各距离在下降全程的表现 ==")
    import statistics
    for md in CANDS:
        vals = [r[2] for r in rows if r[1] == md]
        if not vals:
            continue
        flat = sum(1 for v in vals if v < 6)
        print("  MAXD=%4d  帧数%3d  平坦%3d (%3.0f%%)  std中位%6.2f  最低%6.2f"
              % (md, len(vals), flat, flat * 100.0 / len(vals),
                 statistics.median(vals), min(vals)))
    (BASE / "_camprobe_descent.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
