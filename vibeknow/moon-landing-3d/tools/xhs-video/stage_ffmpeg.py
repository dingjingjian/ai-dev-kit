# -*- coding: utf-8 -*-
"""合成：逐帧截图 → PNG 序列 → ffmpeg 出静音 mp4。

用法：
  python stage_ffmpeg.py --probe        只渲抽检帧，秒级看版式
  python stage_ffmpeg.py --sheet        渲抽检帧 + 拼九宫格（改文案后必跑）
  python stage_ffmpeg.py                全量渲染 + 编码
  python stage_ffmpeg.py --encode-only  渲完了只重编（换码率时用）

两条硬防护（来自 webgame-promo-video skill）：
  1. 可续渲 —— 已存在的帧直接跳过，长片崩了重跑同一条命令即可接上；
  2. **续渲必须绑定源码指纹** —— 否则改了 render_frame.js/timeline.js 后重跑，
     会「发现帧齐全 → 跳过渲染直接编码」，产出是上一版内容，
     而时长/帧数/分辨率/码率全都正常，只看产物永远发现不了。
"""
import sys, pathlib, socket, subprocess, threading, http.server, socketserver, json, time, hashlib
from _tl import load
from _frames import CURRENT_FRAMES
from PIL import Image

BASE = pathlib.Path(__file__).resolve().parent
ROOT = BASE
FRAMES = BASE / CURRENT_FRAMES
SRC_FILES = ("timeline.js", "render_frame.js", "stage.html")

ARGS = [
    "--use-gl=angle", "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl",
    "--autoplay-policy=no-user-gesture-required", "--mute-audio",
]


def log(msg):
    print(msg, flush=True)
    with open(str(BASE / "stage.log"), "a", encoding="utf-8") as f:
        f.write(msg + "\n")


def src_fingerprint():
    h = hashlib.sha1()
    for name in SRC_FILES:
        p = BASE / name
        h.update(name.encode())
        h.update(p.read_bytes() if p.exists() else b"<missing>")
    return h.hexdigest()[:16]


def pick_port(start=8796, tries=20):
    """端口占用会让整个流程渲出别人的片子 —— 必须探测空闲端口。"""
    for i in range(tries):
        p = start + i
        with socket.socket() as s:
            s.settimeout(0.4)
            if s.connect_ex(("127.0.0.1", p)) != 0:
                return p
    raise RuntimeError("端口全被占用")


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass          # 别让 HTTP 请求日志淹掉真错误

    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(BASE), **k)


def serve(port):
    socketserver.ThreadingTCPServer.daemon_threads = True       # 必须多线程
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", port), Handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd


def ffmpeg():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def main():
    (BASE / "stage.log").write_text("", encoding="utf-8")
    probe = "--probe" in sys.argv
    sheet = "--sheet" in sys.argv
    encode_only = "--encode-only" in sys.argv
    check_fp = not (probe or sheet)          # 抽检路径不校验、也不留指纹

    tl = load()
    fps = tl["FPS"]
    total = int(round(tl["DURATION"] * fps))
    fp = src_fingerprint()
    log("source fingerprint: %s" % fp)
    log("DURATION %.2fs  total %d frames" % (tl["DURATION"], total))

    if encode_only:
        return encode(total, fp)

    # ---- 续渲守卫：帧已存在且源码指纹不符 ⇒ 硬失败 ----
    mark = FRAMES / "_src.sha1"
    if check_fp:
        existing = list(FRAMES.glob("f*.png")) if FRAMES.exists() else []
        if existing:
            old = mark.read_text(encoding="utf-8").strip() if mark.exists() else "(无)"
            if old != fp:
                log("!! 拒绝续渲：源码已变更（%s -> %s）" % (old, fp))
                log("   换一个帧目录名（_frames.CURRENT_FRAMES）后重跑")
                return 1
        FRAMES.mkdir(parents=True, exist_ok=True)
        mark.write_text(fp, encoding="utf-8")

    # ---- 素材体检：srcFrom + dur 不能越过素材长度 ----
    counts = {c["clip"]: len(list((BASE / "clips" / c["clip"]).glob("f*.jpg")))
              for c in tl["CLIPS"]}
    ok_mat = True
    for c in tl["CLIPS"]:
        need = int(round((c["srcFrom"] + c["dur"]) * tl["SRCFPS"]))
        have = counts.get(c["clip"], 0)
        good = need < have
        ok_mat = ok_mat and good
        log("material %s %-12s need<=%4d  have=%4d" % ("OK  " if good else "OVER", c["clip"], need, have))
    if not ok_mat:
        log("!! 素材 OVER，取帧会静默退到末帧（画面看着正常其实已不动）。先补采素材。")
        return 1

    port = pick_port()
    httpd = serve(port)
    url = "http://127.0.0.1:%d/stage.html" % port
    log("serving %s on port %d" % (BASE, port))

    frame_count = {c["clip"]: counts[c["clip"]] for c in tl["CLIPS"]}
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True, args=ARGS)
        page = browser.new_page(viewport={"width": tl["W"], "height": tl["H"]},
                                device_scale_factor=1)
        errs = []
        page.on("pageerror", lambda e: errs.append("pageerror:" + str(e)[:200]))
        page.goto(url, wait_until="load", timeout=30000)
        page.evaluate("(fc) => { window.FRAME_COUNT = fc; }", frame_count)
        # 内容自检：判据要用本项目特有的标识，端口撞车时页面照样能跑
        okp = page.evaluate("() => window.FRAME_COUNT && FRAME_COUNT['01-show'] > 0 "
                            "&& typeof renderFrame === 'function'")
        if not okp:
            log("!! 加载到的不是本项目 stage/timeline（多半端口被占）")
            browser.close(); httpd.shutdown(); return 1

        def shoot(n):
            t = n / fps
            page.evaluate("(t) => window.renderFrame(t)", t)
            page.wait_for_timeout(0)          # 让 <img> 解码落地再截
            return page.screenshot()

        if probe or sheet:
            picks = [int(total * f) for f in (0.06, 0.2, 0.34, 0.48, 0.62, 0.76, 0.9, 0.97)]
            picks = [min(max(x, 0), total - 1) for x in picks]
            d = BASE / "_probe"; d.mkdir(exist_ok=True)
            thumbs = []
            for n in picks:
                (d / ("p%05d.png" % n)).write_bytes(shoot(n))
            log("probe frames: %s" % picks)
            if sheet:
                make_sheet(picks, d, tl)
            browser.close(); httpd.shutdown(); return 0

        FRAMES.mkdir(parents=True, exist_ok=True)
        n0 = 0
        for n in range(n0, total):
            out = FRAMES / ("f%05d.png" % n)
            if out.exists() and out.stat().st_size > 0:
                continue                      # 断点续渲
            out.write_bytes(shoot(n))
            if n % 60 == 0:
                log("rendered %d/%d" % (n, total))
        log("errors: %s" % str(errs[:6]))
        browser.close()
    httpd.shutdown()

    # ---- 编码前查缺口：缺一帧 ffmpeg 会静默把后面整体前移 ----
    have = sorted(int(p.stem[1:]) for p in FRAMES.glob("f*.png"))
    gaps = [n for n in range(have[0], have[-1] + 1) if n not in set(have)] if have else []
    if gaps:
        log("!! 缺 %d 帧（如 %s），重跑渲染补齐再编码" % (len(gaps), gaps[:5]))
        return 1
    return encode(total, fp, tl)


def make_sheet(picks, d, tl):
    TW, TH = 216, 384
    cols = 4
    rows = (len(picks) + cols - 1) // cols
    sh = Image.new("RGB", (TW * cols, TH * rows), (18, 18, 22))
    for i, n in enumerate(picks):
        im = Image.open(d / ("p%05d.png" % n)).convert("RGB").resize((TW, TH))
        sh.paste(im, ((i % cols) * TW, (i // cols) * TH))
    sh.save(BASE / "sheet.png")
    log("sheet -> sheet.png")


def encode(total, fp, tl=None):
    tl = tl or load()
    fps = tl["FPS"]
    out = BASE / "out.mp4"
    # 静音片：用户要自己配乐，必须一条音轨都没有 —— 静音音轨也会占位、
    # 干扰后期对齐，不能用「反正没声音」搪塞过去。
    cmd = [ffmpeg(), "-y", "-framerate", str(fps),
           "-i", str(FRAMES / "f%05d.png"),
           "-frames:v", str(total),
           "-an",
           "-c:v", "libx264", "-crf", "19", "-preset", "slow",
           "-pix_fmt", "yuv420p", "-movflags", "+faststart",
           str(out)]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        log("!! ffmpeg 失败: %s" % (r.stderr or "")[-800:])
        return 1
    log("encoded -> %s (fp %s)" % (out.name, fp))
    return 0


if __name__ == "__main__":
    sys.exit(main())
