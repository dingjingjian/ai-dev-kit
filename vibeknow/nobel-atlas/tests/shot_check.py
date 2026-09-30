# -*- coding: utf-8 -*-
"""渲染自检：核对开场视角 / 夜面城市灯光 / 清单顶部留白，并出图到 dist/_shots/。

  1. 开场视角固定在中国上空 —— 把页面里的时钟钉在 05:00 UTC（此刻直射点 105°E，中国在白天），
     开场那一屏能直接看清陆地形状与标记，`home-day-globe.png` 里应是中国 / 印度 / 日本 / 澳洲；
  2. 夜面城市灯光 —— 真实时间再跑一遍（北京时间下午之后，中国这一面就是夜面），
     `home-night*.png` 与开关切换前后的两张图对着看，夜面上应多出一层暖色灯簇；
  3. 清单顶部留白与设置抽屉一致（安全区 + --top-gap），这条是硬断言。

机关时间只钉 `Date`、不钉 `performance.now()`：后者一冻，主循环里的动态分辨率
（帧率低就降 DPR）就停了，出图虽然更锐，但和真机上的行为不一样。

用法：python tests/shot_check.py
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent / "_shots"
OUT.mkdir(exist_ok=True)
URL = (ROOT / "index.html").as_uri()

# 太阳直射 105°E（= 中国所在经度）对应的 UTC 时刻：15°×(20−UTC) = 105 → UTC = 5
FIXED_CLOCK = """
  var R = Date, F = R.parse('2026-09-30T05:00:00Z');
  window.Date = class extends R {
    constructor(){ if(arguments.length === 0){ super(F); } else { super(...arguments); } }
    static now(){ return F; }
  };
"""

failures = []


def check(cond, ok, bad):
    print(("  ✓ " + ok) if cond else ("  ✗ " + bad))
    if not cond:
        failures.append(bad)


def grab(page, name, crop_globe=False):
    path = OUT / (name + ".png")
    page.screenshot(path=str(path))
    if crop_globe:
        from PIL import Image
        im = Image.open(path)
        w, h = im.size
        cx, cy, r = w // 2, int(h * 0.5), int(w * 0.30)
        im.crop((cx - r, cy - r, cx + r, cy + r)).resize((r * 2, r * 2)).save(OUT / (name + "-globe.png"))


with sync_playwright() as p:
    browser = p.chromium.launch(args=["--allow-file-access-from-files"])

    print("—— A. 开场视角（时间钉在直射 105°E，中国在白天） ——")
    a = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    a.add_init_script(FIXED_CLOCK)
    a.goto(URL)
    a.wait_for_timeout(3500)
    grab(a, "home-day")
    grab(a, "home-day", True)
    info = a.evaluate("() => document.getElementById('nowInfo').innerText")
    print("  此刻：%s" % info.replace("\n", " / "))
    a.close()

    print("—— B. 真实时间（中国这一面是夜面）与城市灯光 ——")
    b = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    errs = []
    b.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    b.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    b.goto(URL)
    b.wait_for_timeout(3500)
    grab(b, "home-night")
    grab(b, "home-night", True)

    b.click("#gear")
    b.wait_for_timeout(400)
    grab(b, "sheet")
    on = b.evaluate("() => document.getElementById('swNight').classList.contains('on')")
    check(on, "「城市灯光」开关默认打开", "城市灯光未默认打开")
    b.click("#swNight")
    b.wait_for_timeout(500)
    b.click("#sClose")
    b.wait_for_timeout(500)
    grab(b, "home-night-off")
    grab(b, "home-night-off", True)

    print("—— C. 清单顶部留白 ——")
    b.click("#listBtn")
    b.wait_for_timeout(600)
    grab(b, "list")
    pads = b.evaluate("""() => {
      const lb = getComputedStyle(document.querySelector('.listbar')).paddingTop;
      const sheet = getComputedStyle(document.getElementById('sheet')).paddingTop;
      return {list: lb, sheet: sheet,
              titleY: Math.round(document.querySelector('.listtitle').getBoundingClientRect().top),
              closeY: Math.round(document.getElementById('lClose').getBoundingClientRect().top),
              barY: Math.round(document.querySelector('.listbar').getBoundingClientRect().top)};
    }""")
    check(pads["list"] == pads["sheet"],
          "清单顶部留白 %s = 设置抽屉 %s（标题距顶 %dpx、关闭按钮 %dpx）"
          % (pads["list"], pads["sheet"], pads["titleY"], pads["closeY"]),
          "清单顶部留白 %s ≠ 设置抽屉 %s" % (pads["list"], pads["sheet"]))

    check(not [e for e in errs if "Failed to load resource" not in e],
          "无 JS 运行时错误", "JS 报错：%s" % errs[:3])
    b.close()
    browser.close()

if failures:
    print("\n失败 %d 项：" % len(failures))
    for f in failures:
        print("  ✗", f)
    sys.exit(1)
print("\n截图目录：%s" % OUT)
