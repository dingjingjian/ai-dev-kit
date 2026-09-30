# -*- coding: utf-8 -*-
"""world-food-3d · 设置抽屉有效性探针
用途：量化设置抽屉里每个开关「到底有没有改变画面」——不靠读 DOM 的 class，
     而是对 #globeSlot 元素截图后算相邻两图的灰度平均绝对差（MAD）。
     同时按页面模式（菜单 / 菜品 / 品鉴 / 总结）记录地球组件是否可见。
结论用于定位「设置按钮与抽屉好像完全没有作用」的真实范围。
运行：python tests/probe_settings.py
"""
import os, io
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "file:///" + os.path.join(ROOT, "index.html").replace("\\", "/")
OUT = os.path.join(ROOT, "dist", "probe_settings")
os.makedirs(OUT, exist_ok=True)

LAUNCH = dict(channel="msedge", headless=True,
              args=["--use-gl=angle", "--use-angle=swiftshader",
                    "--enable-unsafe-swiftshader", "--allow-file-access-from-files"])


def mad(p1, p2):
    a = Image.open(p1).convert("L")
    b = Image.open(p2).convert("L")
    if a.size != b.size:
        return None, a.size, b.size
    pa, pb = a.load(), b.load()
    w, h = a.size
    s = 0
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            s += abs(pa[x, y] - pb[x, y])
    n = len(range(0, h, 2)) * len(range(0, w, 2))
    return s / n, a.size, b.size


def cmp2(p1, p2):
    if not p1 or not p2:
        return "未测（地球不可见）"
    d, s1, s2 = mad(p1, p2)
    if d is None:
        return f"尺寸不符 {s1}/{s2}"
    return round(d, 2)


def shot(pg, tag):
    el = pg.locator("#globeSlot")
    box = pg.evaluate("""() => { const e=document.getElementById('globeSlot');
        const b=e.getBoundingClientRect();
        return {d:getComputedStyle(e).display, w:Math.round(b.width), h:Math.round(b.height)}; }""")
    if box["d"] == "none" or box["w"] < 8 or box["h"] < 8:
        return None
    p = os.path.join(OUT, tag + ".png")
    el.screenshot(path=p)
    return p


def probe(pg, name, log):
    def note(k, v):
        line = f"[{name}] {k}: {v}"
        log.append(line)
        print(line, flush=True)

    slot = pg.evaluate("""() => { const e=document.getElementById('globeSlot');
        return {display:getComputedStyle(e).display, w:Math.round(e.getBoundingClientRect().width),
                h:Math.round(e.getBoundingClientRect().height)}; }""")
    note("地球组件", slot)

    base = shot(pg, f"{name}_0base")
    if base is None:
        note("地球不可见", "该模式下开关无任何可见效果（像素测量跳过）")
    # 入口优先级：顶栏齿轮（菜单页有）→ 地球内嵌齿轮（子页顶栏被隐藏时的入口）
    entry = None
    for sel, label in (("#gear", "顶栏齿轮"), ("#globeGear", "地球内嵌齿轮")):
        if pg.locator(sel).is_visible():
            entry = sel
            note("设置入口", label + " 可用")
            break
    if not entry:
        note("设置入口", "两个入口都不可达 —— 抽屉无法打开")
        return
    pg.click(entry)
    pg.wait_for_timeout(500)
    note("抽屉 class", pg.evaluate("document.getElementById('sheet').className"))
    note("遮罩 class", pg.evaluate("document.getElementById('scrim').className"))
    note("抽屉盒", pg.evaluate("""() => { const b=document.getElementById('sheet').getBoundingClientRect();
        return {x:Math.round(b.x),w:Math.round(b.width),h:Math.round(b.height)}; }"""))
    note("本店统计", pg.evaluate("document.getElementById('stat').textContent"))

    # 开关是否改变 .on 状态（JS 是否真的跑到）
    for sid in ("swPlay", "swStars", "swClouds"):
        pg.click("#" + sid)
        pg.wait_for_timeout(120)
        note(f"{sid} 点击后 class", pg.evaluate(f"document.getElementById('{sid}').className"))
        pg.click("#" + sid)          # 复原
        pg.wait_for_timeout(120)

    # 注意：抽屉 300px 宽 + 遮罩半透明覆盖，会盖住地球并压掉细微位移。
    # 所有像素测量都必须在「关掉抽屉」的状态下做，否则会把真实的转动测成 0.1。
    def close_drawer():
        if pg.evaluate("document.getElementById('sheet').classList.contains('show')"):
            pg.click("#sClose"); pg.wait_for_timeout(400)

    def open_drawer():
        if not pg.evaluate("document.getElementById('sheet').classList.contains('show')"):
            pg.click(entry); pg.wait_for_timeout(350)

    # 夜色星点：关 → 比像素
    pg.click("#swStars"); close_drawer(); pg.wait_for_timeout(600)
    off = shot(pg, f"{name}_1stars_off")
    note("关星点 相对基准 MAD", cmp2(base, off))
    open_drawer(); pg.click("#swStars"); close_drawer(); pg.wait_for_timeout(400)

    # 缓慢转动：开 → 两帧差；关 → 两帧差（窗口 4s，正弦慢段速度只有峰值三成）
    p1 = shot(pg, f"{name}_3play_on_a"); pg.wait_for_timeout(4000)
    p2 = shot(pg, f"{name}_3play_on_b")
    d_on = cmp2(p1, p2)
    open_drawer(); pg.click("#swPlay"); close_drawer(); pg.wait_for_timeout(1800)   # 关，等缓动收敛
    p3 = shot(pg, f"{name}_4play_off_a"); pg.wait_for_timeout(4000)
    p4 = shot(pg, f"{name}_4play_off_b")
    d_off = cmp2(p3, p4)
    note("转动开 4s 两帧 MAD", d_on)
    note("转动关 4s 两帧 MAD", d_off)

    # 云层：关 → 比像素
    open_drawer(); pg.click("#swClouds"); close_drawer(); pg.wait_for_timeout(900)
    c1 = shot(pg, f"{name}_2clouds_off")
    note("关云层 相对当前基准 MAD", cmp2(p2, c1))
    open_drawer(); pg.click("#swClouds"); pg.click("#swPlay"); pg.wait_for_timeout(300)

    # 重置视角 / 定位到本菜
    b1 = shot(pg, f"{name}_5focus_a")
    open_drawer(); pg.click("#bReset"); close_drawer(); pg.wait_for_timeout(1600)
    b2 = shot(pg, f"{name}_5focus_reset")
    note("重置视角 MAD", cmp2(b1, b2))
    open_drawer(); pg.click("#bFocus"); close_drawer(); pg.wait_for_timeout(1600)
    b3 = shot(pg, f"{name}_6refocus")
    note("定位到本菜 MAD", cmp2(b2, b3))

    open_drawer(); pg.click("#sClose"); pg.wait_for_timeout(400)
    note("关闭后 抽屉 class", pg.evaluate("document.getElementById('sheet').className"))


def main():
    log = []
    errs = []
    with sync_playwright() as P:
        b = P.chromium.launch(**LAUNCH)
        # 桌面端：地球常驻，开关理应可见
        ctx = b.new_context(viewport={"width": 1280, "height": 820}, device_scale_factor=1)
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(URL, wait_until="load"); pg.wait_for_timeout(2200)
        probe(pg, "desktop_menu", log)
        ctx.close()

        # 移动端：菜单页地球不可见 —— 此时开关改的是看不见的东西
        ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=1)
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(URL, wait_until="load"); pg.wait_for_timeout(2200)
        log.append("[phone] 各页面 地球组件 display：")
        for act, mode in (("menu", "菜单"), ("dish", "菜品"), ("serve", "品鉴"), ("sum", "总结")):
            if act == "dish":
                pg.click("#menuList .mrow"); pg.wait_for_timeout(900)
            elif act == "serve":
                pg.click("#backBtn"); pg.wait_for_timeout(500)
                pg.click("#menuList .mrow .madd"); pg.wait_for_timeout(300)
                pg.click("#orderBtn"); pg.wait_for_timeout(900)
            elif act == "sum":
                pg.click("#svNext"); pg.wait_for_timeout(900)
            d = pg.evaluate("""() => { const e=document.getElementById('globeSlot');
                const t=document.querySelector('.top');
                return getComputedStyle(e).display + ' / 顶栏=' + getComputedStyle(t).display
                  + ' / 齿轮可点=' + (getComputedStyle(t).display!=='none'); }""")
            log.append(f"    {mode}页 mode-{act}：地球={d}")
        # 移动端菜单页开抽屉（此处地球不可见）
        pg.click("#sumBack"); pg.wait_for_timeout(600)
        probe(pg, "phone_menu", log)
        # 进入菜品页（移动端只有这里能看见地球条带）
        pg.click("#menuList .mrow"); pg.wait_for_timeout(1400)
        probe(pg, "phone_dish", log)
        ctx.close()
        b.close()

    print("\n".join(log))
    print("\n---- pageerror ----")
    print(errs or "无")


main()
