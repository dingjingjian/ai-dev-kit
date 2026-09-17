# -*- coding: utf-8 -*-
"""取景探针：把 mission.directCamera 包一层，测不同「距离上限」下的主体占比。

为什么必须量：
  mission.js 里 parkOrbit/tli 的镜头距离是 5200、transit 是整个地月系统尺度，
  而飞行器本体只有几十单位 —— 画面当然是黑的（深空本来就是黑的）。
  「拉近主体」不能凭感觉给个数：近到某个程度地球会占满整幅、远一点主体又只剩几个像素。
  这里对同一个相位试若干距离上限，直接量「亮像素占比」和包围盒，挑出可读的那一档。

为什么可以直接改 camera 而不用改应用源码：
  mission 对象把 directCamera 作为方法导出（mission.js:1353），
  而 app.js 每帧通过同一个对象引用调用它 —— 在录制侧包一层即可，
  app.js / mission.js 一行都不用动，默认行为也不受影响。
"""
import pathlib, json, sys, time
from playwright.sync_api import sync_playwright
from PIL import Image
import numpy as np

BASE = pathlib.Path(__file__).resolve().parent
ROOT = BASE.parents[1]
URL = (ROOT / "index.html").as_uri()
OUT = BASE / "_camprobe"

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
            t[p] = function () {
              const sys = orig.apply(this, arguments);
              window.__MISSION = sys;
              return sys;
            };
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

# 只对「镜头拉得太开」的相位做干预；上升段/环月跟拍/着陆段本来就是贴身镜头，别动
WRAP_JS = r"""
(CFG) => {
  var ms = window.__MISSION;
  var WIDE = {}, PHASES = CFG.phases, MAXD = CFG.maxd;
  for (var i = 0; i < PHASES.length; i++) WIDE[PHASES[i]] = 1;
  if (!ms.__origDirect) {
    ms.__origDirect = ms.directCamera;
    ms.directCamera = function (cam, dt) {
      ms.__origDirect.call(this, cam, dt);
      var st = this.state;
      if (!WIDE[st.phase]) return;
      // transit 原本把目标锁在地月连线中点 —— 光压距离只会变成「对着虚空拉近」，
      // 必须同时把目标点改回飞行器本体。
      var nx = Math.sin(st.tiltVis), ny = Math.cos(st.tiltVis);
      cam.targetX = st.x + nx * st.focus * st.scale;
      cam.targetY = st.y + ny * st.focus * st.scale;
      if (cam.distance > ms.__MAXD) cam.distance = ms.__MAXD;
    };
  }
  ms.__MAXD = MAXD;
}
"""

HIDE_HUD = """
#btn-show,#btn-explode,#btn-launch,#btn-var1,#btn-var2,#btn-ignite,#btn-warp,
#btn-sound,#telemetry,#mission-tag,#phase-text,#countdown,#variant-bar,#desc-box,
#seg-fade,#labels,.bottombar,.modes,.progress,#loader{display:none!important}
"""

TARGETS = ["descent", "approach", "landed"]
# 1080 = 不夹，用来和原镜头做对照；只有明显优于「不夹」才值得动这块镜头
CANDS = [60, 110, 180, 300, 1080]
STEP_MS = 1000.0 / 30.0


def measure(png_bytes):
    from io import BytesIO
    a = np.asarray(Image.open(BytesIO(png_bytes)).convert("L"), dtype=np.float32)
    m = a > 25
    frac = float(m.mean() * 100)
    box = (0.0, 0.0)
    if m.any():
        ys, xs = np.where(m)
        box = ((xs.max() - xs.min() + 1) / a.shape[1] * 100,
               (ys.max() - ys.min() + 1) / a.shape[0] * 100)
    return frac, box, float(a.mean())


def main():
    OUT.mkdir(exist_ok=True)
    results = {}
    with sync_playwright() as p:
        br = p.chromium.launch(channel="msedge", headless=True, args=[
            "--use-gl=angle", "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
            "--enable-webgl", "--mute-audio"])
        pg = br.new_page(viewport={"width": 1080, "height": 1920}, device_scale_factor=1)
        pg.add_init_script(INIT)
        pg.goto(URL, wait_until="load", timeout=30000)
        pg.evaluate("() => { document.documentElement.style.zoom = String(1080/405); }")
        time.sleep(6)
        pg.add_style_tag(content=HIDE_HUD)
        pg.evaluate("() => document.getElementById('btn-launch').click()")
        time.sleep(0.4)
        pg.evaluate("() => document.getElementById('btn-ignite').click()")
        time.sleep(0.3)

        tms = 1000.0
        seen = []
        guard = 0
        pending = list(TARGETS)
        while pending and guard < 8000:
            guard += 1
            st = pg.evaluate("() => { var s=window.__MISSION.state;"
                             "return {phase:s.phase, warp:s.warp}; }")
            ph = st["phase"]
            if ph in ASC:
                w = 10
            elif ph in CRU:
                w = 12
            elif ph in ("transition",):
                w = 3
            elif ph in ("rendezvous", "docking", "docked"):
                w = 4
            else:
                w = 3
            ht = {10: 1.0, 12: 1.0, 3: 0.5, 4: 1.0}.get(w)
            if ht is None:
                pg.evaluate("() => { var s=window.__MISSION.state; s.hold=false; s.holdT=0; }")
            else:
                pg.evaluate("(h) => { var s=window.__MISSION.state; s.hold=true; s.holdT=h; }", ht)
            pg.evaluate("(t) => { if (window.__frame) window.__frame(t); }", tms)
            tms += STEP_MS

            if ph in pending:
                pending.remove(ph)
                seen.append(ph)
                print("== 到达相位 %s（drive %d），开始量各距离 ==" % (ph, guard))
                rows = []
                for md in CANDS:
                    pg.evaluate(WRAP_JS, {"phases": TARGETS, "maxd": md})
                    # 让相机在被夹住的距离上稳定几帧
                    for _ in range(12):
                        pg.evaluate("() => { var s=window.__MISSION.state; s.hold=false; s.holdT=0; }")
                        pg.evaluate("(t) => { if (window.__frame) window.__frame(t); }", tms)
                        tms += STEP_MS
                    frac, box, mean = measure(pg.screenshot())
                    rows.append((md, frac, box, mean))
                    print("  MAXD=%4d  前景%6.2f%%  bbox %5.1f%%x%5.1f%%  均值%5.1f"
                          % (md, frac, box[0], box[1], mean))
                results[ph] = rows
                # 恢复原始镜头，接着往下个相位推进
                pg.evaluate("() => { var ms=window.__MISSION;"
                            "if (ms.__origDirect) { ms.directCamera = ms.__origDirect; "
                            "ms.__origDirect = null; } ms.__MAXD = 1e9; }")
        br.close()

    (OUT / ("camprobe_%s.json" % "_".join(TARGETS))).write_text(
        json.dumps({k: [[r[0], r[1], r[2][0], r[2][1], r[3]] for r in v]
                    for k, v in results.items()}, ensure_ascii=False, indent=1),
        encoding="utf-8")
    print("saved camprobe.json")


ASC = {"prelaunch", "ignition", "burn1", "sep", "sep2", "burn2", "burn3", "parkOrbit"}
CRU = {"tli", "transit", "loi", "lunarOrbit", "landerPark"}

if __name__ == "__main__":
    main()
