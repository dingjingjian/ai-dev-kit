# -*- coding: utf-8 -*-
"""捕获 moon-landing-3d 真实画面，产出 8 章素材帧。

核心机制（来自 webgame-promo-video skill）：
  - 冻结游戏的 rAF 渲染循环（override requestAnimationFrame，只捕获回调、不自动调度）
  - 用合成时钟逐帧驱动 frame(now)，步长按「任务进度」自适应 ——
    慢速段（上升 / 着陆）细步密采，巡航段粗步快进。逐帧截图约 1.5s/帧，
    若全程用固定小步长，40s 实速的任务要 1200+ 帧 × 1.5s ≈ 30 分钟以上，
    而且采样点会全部堆在章节开头（这正是上一版的返工原因）。
  - 视口 1080x1920 + documentElement.zoom(2.667) => 布局 405 宽（手机版式），
    画布 backing 在加载时按 getBoundingClientRect 设为 1080x1816（真分辨率），
    截图即真 1080x1920。**绝不能派发 resize 事件** —— 那会让游戏 doResize()
    按 zoom 后的布局宽把 backing 重设成 405，截图再放大 2.67x 就糊掉。
  - 通过注入的 Proxy 暴露 mission.state，按相位控制长按加速倍率（warp）。
  - 隐藏游戏自带 HUD，素材只留 3D 画面，包装由合成舞台叠加。

分章策略：**相位驱动**。不按固定帧数截断，而是把每个相位段的驱动写进日志，
事后按相位把驱动区间映射到 8 个章节目录，取每章的代表帧。
"""
import sys, pathlib, time, json, traceback, datetime
from playwright.sync_api import sync_playwright

BASE = pathlib.Path(__file__).resolve().parent
ROOT = BASE.parents[1]                       # moon-landing-3d/
URL = (ROOT / "index.html").as_uri()
CLIPS = BASE / "clips"
OUT_LOG = BASE / "capture.log"

CHANNEL = "msedge"
ARGS = [
    "--use-gl=angle", "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist", "--enable-webgl",
    "--autoplay-policy=no-user-gesture-required", "--mute-audio",
]

STEP_MS = 1000.0 / 30.0                      # 基准步长（1/30 s）

CAND = BASE / "_cand"                        # 各章候选池（抽稀的输入）

# ---- 每章需要多少帧（与 _gen_timeline.py 产出的 timeline.js 严格对应）----
# 取「(srcFrom + dur) × 30 × 1.15」的余量口径 —— 素材必须够本镜播完，
# 不足就会静默退到末帧（画面看着正常其实已经不动了）。
TARGET = {
    "01-show": 230, "02-explode": 280, "03-launch1": 360, "04-transit": 400,
    "05-launch2": 230, "06-rendez": 290, "07-descent": 270, "08-land": 190,
}

# ---- 各相位的「采样步长倍数」：1 = 实速细采，越大越快进 ----
ASCENT_PHASES = {"ignition", "liftoff", "pitch", "maxQ", "towerSep", "boosterSep",
                 "stage1Sep", "sep", "stage2Ignition", "stage2Sep", "stage3Ignition",
                 "fairingSep", "sep2", "prelaunch"}
CRUISE_PHASES = {"parkOrbit", "tli", "transit", "loi", "lunarOrbit", "landerPark",
                 "burn1", "burn2", "burn3"}
RENDEZ_PHASES = {"rendezvous", "docking", "docked"}
DESCENT_PHASES = {"descent", "approach"}


# 勘察实测的相位真名（mission.js 里的 ASCENT/CRUISE 集合是旧命名，
# 实际跑出来是 prelaunch/ignition/burn1/sep/burn2/burn3/parkOrbit/tli/...）。
# 按真名划分，否则 burn1~burn3（上升段三次点火）会被误归进「地月转移」，
# 「第一次发射」就只剩 prelaunch/ignition/sep 三个相位，凑不出素材。
ASCENT_REAL = {"prelaunch", "ignition", "burn1", "sep", "burn2", "burn3", "parkOrbit"}
CRUISE_REAL = {"tli", "transit", "loi", "lunarOrbit", "landerPark"}


def chapter_of(phase, segment, landed):
    if landed:
        return "08-land"
    if phase in DESCENT_PHASES:
        return "07-descent"
    if phase in RENDEZ_PHASES:
        return "06-rendez"
    # transition 的 segment 仍是 1，但它是两次发射之间的过场，属第二发
    if phase == "transition":
        return "05-launch2"
    if segment == 1:
        if phase in ASCENT_REAL:
            return "03-launch1"
        if phase in CRUISE_REAL:
            return "04-transit"
        return "03-launch1"
    # 第二发：上升仍属「第二次发射」，其后的奔月段并入「环月交会」
    if phase in ASCENT_REAL or phase == "transition":
        return "05-launch2"
    if phase in CRUISE_REAL:
        return "06-rendez"
    return "05-launch2"


# ---- 每章倍速（由 --survey 实测反推，不要凭感觉调）----
# 勘察实测（旧 warp 下）各章驱动帧：03=213 04=86 05=153 06=140 07=301
# 而各章需要的素材帧是 360/400/230/290/270 —— 04 章差 4.7 倍。
# 「差」不能靠加密采样补：同一章内相邻驱动帧画面几乎一样，
# 采得再密也只是把几乎相同的帧多存几份，抽稀后依旧凑不满时长。
# 唯一正解是**降倍速把章节拉长**，驱动帧数 ≈ 需要的素材帧数。
# 倍速档位只有 [1,3,10,25,60] 五档（WARP_TIERS），所以是取整而非精算。
WARP_BY_PHASE = {
    ("prelaunch", 1): 10,      # 发射前塔架镜头，留 91 帧即可，不必拖长
    ("ignition", 1): 3, ("sep", 1): 3,
    ("burn1", 1): 3, ("burn2", 1): 3, ("burn3", 1): 3, ("parkOrbit", 1): 3,
    ("tli", 1): 3, ("transit", 1): 1, ("loi", 1): 3, ("lunarOrbit", 1): 3,
    ("transition", 1): 3,
    ("ignition", 2): 3, ("sep", 2): 3,
    ("burn1", 2): 3, ("burn2", 2): 3, ("burn3", 2): 3, ("parkOrbit", 2): 3,
    ("tli", 2): 3, ("transit", 2): 3, ("loi", 2): 3, ("lunarOrbit", 2): 3,
    ("rendezvous", 2): 1, ("docking", 2): 1, ("docked", 2): 1,
    ("descent", 2): 3, ("approach", 2): 3,
    ("landed", 2): 1,
}
WARP_FALLBACK = {"03-launch1": 3, "04-transit": 3, "05-launch2": 3,
                 "06-rendez": 1, "07-descent": 3, "08-land": 1}


def warp_for(phase, segment, landed):
    if landed:
        return 1
    w = WARP_BY_PHASE.get((phase, segment))
    if w:
        return w
    return WARP_FALLBACK.get(chapter_of(phase, segment, landed), 3)


def holdT_for(warp):
    # WARP_TIER_AT = [0, 1.0, 2.5, 4.5] -> 3x / 10x / 25x / 60x
    if warp <= 1:
        return None
    if warp <= 3:
        return 0.5     # 3x
    if warp <= 10:
        return 1.0     # 10x
    if warp <= 25:
        return 2.5     # 25x
    return 4.5         # 60x


# 各相位段的采样密度：慢速段细采（每 3 帧截一张），巡航段粗采（每 12 帧截一张）
DENSITY = {}
for _p in ASCENT_PHASES:
    DENSITY[_p] = 3
for _p in DESCENT_PHASES:
    DENSITY[_p] = 3
for _p in RENDEZ_PHASES:
    DENSITY[_p] = 5
for _p in CRUISE_PHASES:
    DENSITY[_p] = 12

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

# ---- 取景修正：给「镜头拉得太开」的相位加距离上限 ----
# 由 _probe_cam.py 实测标定（见那里的注释：为什么必须量、为什么不用改应用源码）。
# mission.js 里 parkOrbit/tli 距离 5200、transit 是整个地月系统尺度，
# 而飞行器本体只有几十单位 —— 不夹的话这几段就是纯黑空场。
# 数值是量出来的，不是猜的（前景占比对距离极其敏感，差一档就从有变无）：
#     parkOrbit  40->5.8%   80->0%        transit  80->9.7%   140->0%
#     tli       140->16.3% 340->1.8%      rendez.  140->10.8% 340->0.6%
#     descent   110->8.0%  原镜头->1.1%
# 一律取「实测有值」的那一档，不在两档之间插值 —— 这条曲线很陡，
# 插值出来的数很可能正好落在断崖的错误一侧。
# 反向证据：approach 拉近反而变差（60->3.7%，原镜头->8.3%），
# landed 各档无差别（都是 12.2%）—— 这两处**不干预**。
CAM_MAXD = {"parkOrbit": 40, "tli": 140, "transit": 80,
            "rendezvous": 140, "docked": 140, "descent": 110}

WRAP_CAM_JS = r"""
(CFG) => {
  var ms = window.__MISSION;
  if (ms.__origDirect) { ms.__MAXD = CFG; return; }
  ms.__MAXD = CFG;
  ms.__origDirect = ms.directCamera;
  ms.directCamera = function (cam, dt) {
    ms.__origDirect.call(this, cam, dt);
    var st = this.state;
    var md = ms.__MAXD[st.phase];
    if (!md) return;
    // transit 原本把目标锁在「地月连线中点」，只压距离等于对着虚空拉近 ——
    // 必须同时把目标点改回飞行器本体。
    if (st.phase === 'transit') {
      var nx = Math.sin(st.tiltVis), ny = Math.cos(st.tiltVis);
      cam.targetX = st.x + nx * st.focus * st.scale;
      cam.targetY = st.y + ny * st.focus * st.scale;
    }
    if (cam.distance > md) cam.distance = md;
  };
}
"""

HIDE_HUD = """
#btn-show,#btn-explode,#btn-launch,#btn-var1,#btn-var2,#btn-ignite,#btn-warp,
#btn-sound,#telemetry,#mission-tag,#phase-text,#countdown,#variant-bar,#desc-box,
#seg-fade,#labels,.bottombar,.modes,.progress,#loader{display:none!important}
"""


def log(msg):
    with open(str(OUT_LOG), "a", encoding="utf-8") as f:
        f.write(msg + "\n")


def save_shot(path, data):
    """带重试地落盘。

    实测：连续写 200+ 帧后偶发 PermissionError（Errno 13），
    与画质无关（此时 canvas backing 仍是正确的 1080），
    是外部进程（OneDrive 同步 / Defender 实时扫描）短暂占用文件所致。
    压测同目录写 400 个小文件完全正常，说明不是目录权限或配额问题。
    所以正确做法是重试，而不是改路径或降画质。
    """
    import time as _t
    last = None
    for k in range(6):
        try:
            path.write_bytes(data)
            return True
        except PermissionError as e:
            last = e
            _t.sleep(0.4 * (k + 1))
    raise last


def shot(page):
    """截图带超时重试。

    实测在落月相位出现过单次 Page.screenshot 卡过 30s 默认超时
    （调用日志停在 'fonts loaded' 之后），是一次性卡顿，重试即可过去；
    不是页面坏了，也不是画质问题 —— 此时 canvas backing 仍是正确的 1080。
    """
    from playwright.sync_api import TimeoutError as PWTimeout
    last = None
    for k in range(3):
        try:
            return page.screenshot(timeout=60000)
        except PWTimeout as e:
            last = e
            log("  截图超时，重试 %d/3" % (k + 1))
    raise last


def score_pool(cd, pool):
    """批量打分并缓存。5700 帧现算一次要 7 分半，缓存后重选只要几秒。"""
    cache = cd / "_scores.json"
    if "--rescore" not in sys.argv and cache.exists():
        try:
            d = json.loads(cache.read_text(encoding="utf-8"))
            if len(d.get("items", [])) == len(pool):
                return [(x[1], x[2]) for x in d["items"]]
        except Exception:
            pass
    import numpy as np
    from PIL import Image
    items = []
    for p in pool:
        a = np.asarray(Image.open(str(p)).convert("L"), dtype=np.float32)
        std = round(float(a.std()), 3)
        edge = round(float((np.abs(np.diff(a, axis=1)) > 18).mean() * 100), 3)
        items.append([p.name, std, edge])
    cache.write_text(json.dumps({"items": items}, ensure_ascii=False), encoding="utf-8")
    return [(x[1], x[2]) for x in items]


def select_informative(cd, pool, want):
    """先排除没画面的帧，再在剩下的帧里按时序均匀抽。

    为什么有两道规则：
      ①绝对门槛 —— 实测平坦帧是「整块连续区间」（某相位从头到尾没东西），
        只有绝对门槛能把这种区间整个剔掉；纯按排名取前 N 是剔不干净的，
        因为坏帧重的时候连前 N 里也全是坏帧。
      ②均匀稀释 —— 保留时序覆盖，让镜头从头到尾都在讲同一件事。
    不够时按得分从高到低补齐，并把缺口如实打进日志，不悄悄降级。
    """
    if len(pool) <= want or "--uniform" in sys.argv:
        return list(range(len(pool)))
    sc = score_pool(cd, pool)
    info = [i for i, (s, e) in enumerate(sc) if s >= 6.0 or e >= 0.6]
    if len(info) >= want:
        sel = sorted({info[round(k * (len(info) - 1) / (want - 1))] for k in range(want)})
        return sel
    rest = sorted((i for i in range(len(pool)) if i not in set(info)),
                  key=lambda i: -(sc[i][0] + 2.0 * sc[i][1]))
    sel = sorted(set(info + rest[:want - len(info)]))
    log("  !! %s 有画面帧只有 %d < 需要 %d，缺口 %d 帧按最优补"
        % (cd.name, len(info), want, want - len(info)))
    return sel


def emit_all():
    """候选池 → 各章素材帧（按 TARGET 选帧）。

    不依赖浏览器，可以单独跑：素材采集和抽稀落成本来就是两件事。
    上一次跑到第 5500 帧时截图超时崩掉，因为抽稀被焊在采集流程尾部，
    已经采好的 6 章候选池白白没用上 —— 必须能事后单独重跑这一步。
    """
    for chap in ["03-launch1", "04-transit", "05-launch2", "06-rendez",
                 "07-descent", "08-land"]:
        cd = CAND / chap
        pool = sorted(cd.glob("s*.jpg")) if cd.exists() else []
        n = len(pool)
        if n == 0:
            log("!! %s 候选为空" % chap); continue
        want = TARGET[chap]
        d = CLIPS / chap; d.mkdir(parents=True, exist_ok=True)
        sel = select_informative(cd, pool, want)
        for j, si in enumerate(sel):
            save_shot(d / ("f%05d.jpg" % j), pool[si].read_bytes())
        (d / "meta.json").write_text(json.dumps(
            {"n": len(sel), "fps": 30, "w": 1080, "h": 1920, "pool": n}),
            encoding="utf-8")
        log("captured %s: %d frames (target %d, pool %d)" % (chap, len(sel), want, n))


def archive_clips():
    """把上一轮录的帧整体移走（改名，不删除）。整目录一次 rename，
    不触发批量 unlink 的安全拦截。
    候选池也要一起清 —— 否则上一轮的候选帧会混进这一轮的抽稀池，
    抽出来的「均匀帧」实际跨越两次运行、画面接不上。"""
    import datetime
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    for name in ("clips", "_cand"):
        d = BASE / name
        if d.exists() and any(d.iterdir()):
            dest = BASE / ("%s_old_%s" % (name, ts))
            d.replace(dest)
            log("archived old %s -> %s" % (name, dest.name))


def main():
    OUT_LOG.write_text("", encoding="utf-8")
    # --survey：只驱动时钟、不截图，把每个相位实际消耗多少驱动帧测出来。
    # 必须先测：巡航段开 12x 加速后，整段可能只有几十个驱动帧，
    # 而 04-transit 一镜就要 400 帧素材 —— 采样步长再密也凑不出来。
    # 拿这个数才能反推「每章该用多大 warp / 多密 stride」。
    survey = "--survey" in sys.argv
    emit_only = "--emit-only" in sys.argv
    land_only = "--land-only" in sys.argv
    keep_cand = "--keep-cand" in sys.argv
    only = set()
    if "--only" in sys.argv:
        i = sys.argv.index("--only")
        if i + 1 < len(sys.argv):
            only = {x for x in sys.argv[i + 1].split(",") if x}

    if emit_only:                       # 只做抽稀落盘，不碰浏览器
        emit_all()
        log("DONE (emit-only)")
        return
    # 补采 / 勘察都不归档：候选池是上一次跑出来的成果，归档就全没了
    if not (survey or land_only):
        archive_clips()
    # 位置参数才是 mode，--survey 之类的开关不能被当成 mode
    _pos = [a for a in sys.argv[1:] if not a.startswith("--")]
    mode = _pos[0] if _pos else "all"

    if land_only:
        # 上一轮崩在落月刚开始，池里留了 56 帧「半截」。不能直接续：
        # 新的一轮也是从刚落月开始拍，两段接起来相机角度会回跳。
        # 整体移走重拍（一次 rename，不触发批量删除拦截）。
        stale = CAND / "08-land"
        if stale.exists() and any(stale.iterdir()):
            dest = BASE / ("08-land_stale_%s"
                           % datetime.datetime.now().strftime("%Y%m%d_%H%M%S"))
            stale.replace(dest)
            log("archived stale 08-land -> %s" % dest.name)

    with sync_playwright() as p:
        browser = p.chromium.launch(channel=CHANNEL, headless=True, args=ARGS)
        page = browser.new_page(viewport={"width": 1080, "height": 1920}, device_scale_factor=1)
        errs = []
        page.on("pageerror", lambda e: errs.append("pageerror:" + str(e)[:200]))
        page.on("console", lambda m: errs.append("console:" + m.text[:200]) if m.type == "error" else None)

        page.add_init_script(INIT)
        page.goto(URL, wait_until="load", timeout=30000)
        page.evaluate("() => { document.documentElement.style.zoom = String(1080/405); }")
        time.sleep(6)

        ok = page.evaluate("() => typeof window.__frame === 'function' && !!window.__MISSION && !!window.__MISSION.state")
        log("hooks ready: %s" % ok)
        if not ok:
            log("!! 钩子未就位，终止"); browser.close(); return

        if "--no-cam" in sys.argv:
            log("camera: 不干预（原镜头）")
        else:
            page.evaluate(WRAP_CAM_JS, CAM_MAXD)
            log("camera: 已套距离上限 %s" % json.dumps(CAM_MAXD, sort_keys=True))

        page.add_style_tag(content=HIDE_HUD)
        time.sleep(1.2)

        info = page.evaluate("""() => { var c=document.getElementById('stage');
            return {cw:c.clientWidth, ch:c.clientHeight, bw:c.width, bh:c.height}; }""")
        log("canvas: %s" % json.dumps(info))
        if info["bw"] < 1000:
            log("!! 画布 backing 只有 %d 宽（应 >=1080），截图会糊，终止" % info["bw"])
            browser.close(); return

        # ---------------- 静态章：展示 / 拆解 ----------------
        def cap_static(chap, nframes, nudge):
            d = CLIPS / chap; d.mkdir(parents=True, exist_ok=True)
            page.evaluate("() => { var s=window.__MISSION.state; s.hold=false; s.holdT=0; }")
            tms = 1000.0
            for i in range(nframes):
                page.evaluate("() => { if (M3D.setOrbitNudge) M3D.setOrbitNudge(%s); }" % nudge)
                page.evaluate("(t) => { if (window.__frame) window.__frame(t); }", tms)
                tms += STEP_MS
                save_shot(d / ("f%05d.jpg" % i), shot(page))
                if i % 50 == 0:
                    log("  %s %d/%d" % (chap, i, nframes))
            (d / "meta.json").write_text(json.dumps(
                {"n": nframes, "fps": 30, "w": 1080, "h": 1920}), encoding="utf-8")
            log("captured %s: %d frames" % (chap, nframes))

        def safe(label, fn):
            """单章隔离：一章炸了不连坐后面已拍好的素材。"""
            try:
                fn()
            except Exception:
                log("!! %s 失败" % label)
                with open(str(OUT_LOG), "a", encoding="utf-8") as f:
                    traceback.print_exc(file=f)

        if mode in ("all", "show") and not (survey or land_only):
            page.evaluate("() => document.getElementById('btn-show').click()")
            time.sleep(0.4)
            safe("01-show", lambda: cap_static("01-show", TARGET["01-show"], 0.0015))

        if mode in ("all", "explode") and not (survey or land_only):
            page.evaluate("() => document.getElementById('btn-explode').click()")
            time.sleep(0.4)
            safe("02-explode", lambda: cap_static("02-explode", TARGET["02-explode"], 0.0012))

        if mode not in ("all", "launch"):
            log("errors: %s" % str(errs[:6])); log("DONE"); browser.close(); return

        # ---------------- 登月章：相位驱动采样 ----------------
        page.evaluate("() => document.getElementById('btn-launch').click()")
        time.sleep(0.4)
        page.evaluate("() => document.getElementById('btn-ignite').click()")
        time.sleep(0.3)

        # ---- 相位驱动采样 ----
        # 说明：采样阶段只记「哪一刻属于哪一章」（samples），截图放在采样结束后统一做。
        # 因为合成时钟是确定性的（frame(now) 纯依赖传入时刻与内部状态累积），
        # 但状态累积不可倒带 —— 所以要截图必须在采样当刻做，不能事后 rewind。
        # 因此这里改为：采样当刻就截图，落进该章的「候选池」；
        # 采样全部结束后，从候选池按章均匀挑 TARGET 帧改名落盘（见 group_and_emit）。

        # 全局步长 SAMPLE_N：每驱动 SAMPLE_N 个 1/30 s 帧截一张。
        # 上升段推进极慢（TIME_SCALE=6，入轨要约 1500~1800 个驱动帧），
        # 若每帧都截，光一次上升就要 40 分钟且采样点全堆在章节开头。
        # 步长统一为 1（每个驱动帧都采）：倍速已按章调到「驱动帧 ≈ 需要的素材帧」，
        # 再跳采只会让相邻输出帧之间隔得更大，画面更跳。
        # 素材富余的章由抽稀环节按 TARGET 均匀稀释，那是时间压缩，不是丢帧。
        STRIDE = {
            "03-launch1": 1, "04-transit": 1, "05-launch2": 1,
            "06-rendez": 1, "07-descent": 1, "08-land": 1,
        }
        seg_log = []                   # 相位段轨迹（写 segments.json 备查）
        drive_by_chap = {}             # 勘察用：每章实际驱动帧数
        tms = 1000.0
        drive_n = 0
        landed_n = 0
        samp_i = 0
        last_key = None
        cur = None
        while True:
            st = page.evaluate("""() => { var s=window.__MISSION.state;
                return {phase:s.phase, segment:s.segment, landed:s.landed}; }""")
            chap = chapter_of(st["phase"], st["segment"], st["landed"])
            warp = warp_for(st["phase"], st["segment"], st["landed"])
            key = (st["phase"], st["segment"], st["landed"])
            if key != last_key:
                if cur:
                    cur["i1"] = samp_i
                    cur["drive"] = drive_n - cur["d0"]
                    seg_log.append(cur)
                cur = {"chap": chap, "phase": st["phase"], "segment": st["segment"],
                       "i0": samp_i, "i1": samp_i, "warp": warp, "d0": drive_n}
                log("phase=%-12s seg=%s landed=%-5s -> chap=%-11s warp=%s"
                    % (st["phase"], st["segment"], st["landed"], chap, warp))
                last_key = key
            if chap:
                drive_by_chap[chap] = drive_by_chap.get(chap, 0) + 1

            ht = holdT_for(warp)
            if ht is None:
                page.evaluate("() => { var s=window.__MISSION.state; s.hold=false; s.holdT=0; }")
            else:
                page.evaluate("(ht) => { var s=window.__MISSION.state; s.hold=true; s.holdT=ht; }", ht)

            nudge = 0.0015 if st["landed"] else 0.0
            page.evaluate("() => { if (M3D.setOrbitNudge) M3D.setOrbitNudge(%s); }" % nudge)
            page.evaluate("(t) => { if (window.__frame) window.__frame(t); }", tms)
            tms += STEP_MS
            drive_n += 1

            # 采样当刻就截图，落进该章候选池 —— 合成时钟的状态不可倒带，
            # 事后无法「回到」某一刻重拍，所以候选帧必须现场取。
            stride = STRIDE.get(chap, 10)
            # land-only：落月前不截图，快速把时钟推到落月再从那里补采
            skip_shot = survey or (land_only and not st["landed"])
            if chap and drive_n % stride == 0 and not skip_shot:
                cd = CAND / chap
                cd.mkdir(parents=True, exist_ok=True)
                save_shot(cd / ("s%05d.jpg" % samp_i), shot(page))
                if samp_i % 100 == 0:
                    log("  sample %d (drive %d)" % (samp_i, drive_n))
                samp_i += 1

            if st["landed"]:
                landed_n += 1
            # 停止：已落月且落月章候选够了
            cand_land = len(list((CAND / "08-land").glob("s*.jpg"))) if (CAND / "08-land").exists() else 0
            if st["landed"] and (cand_land >= TARGET["08-land"] or (survey and landed_n > 3000)):
                if cur:
                    cur["i1"] = samp_i; cur["drive"] = drive_n - cur["d0"]
                    seg_log.append(cur); cur = None
                log("stop: landed, cand_land=%d" % cand_land)
                break
            if drive_n > 60000:
                log("!! 安全上限触发，终止")
                if cur:
                    cur["i1"] = samp_i; cur["drive"] = drive_n - cur["d0"]
                    seg_log.append(cur); cur = None
                break

        (BASE / "segments.json").write_text(json.dumps(seg_log, ensure_ascii=False, indent=1),
                                            encoding="utf-8")

        if survey:
            log("=== SURVEY: 每章驱动帧数 (drive_n=%d) ===" % drive_n)
            for chap in ["03-launch1", "04-transit", "05-launch2", "06-rendez",
                         "07-descent", "08-land"]:
                n = drive_by_chap.get(chap, 0)
                want = TARGET[chap]
                stride = STRIDE.get(chap, 10)
                log("  %-12s drive=%5d  stride=%2d => samples=%4d  target=%3d  %s"
                    % (chap, n, stride, n // stride, want,
                       "OK" if n // stride >= want else "SHORT"))
            log("errors: %s" % str(errs[:6]))
            log("DONE")
            browser.close(); return

        emit_all()

        log("samples total=%d segs=%d" % (samp_i, len(seg_log)))

        log("errors: %s" % str(errs[:6]))
        log("DONE")
        browser.close()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log("EXCEPTION")
        with open(str(OUT_LOG), "a", encoding="utf-8") as f:
            traceback.print_exc(file=f)
