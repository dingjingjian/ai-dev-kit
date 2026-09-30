# -*- coding: utf-8 -*-
"""一次性核查：七个主题的横幅区是否真的画出了东西、彼此是否真的换色。

逐页签截取 .menu-hero 区域，算平均色与像素标准差：
  - 标准差 > 3    ⇒ 确实有纹理/渐变的层次（不是一块死色）
  - 各洲平均色互不相同 ⇒ 主题真的切换了
  - 六张未生成的横幅只应触发 404，兜底的两层（主题渐变 + 木纹）仍须画出来

运行：python tests/verify_hero_bg.py
"""
import io
import os
from playwright.sync_api import sync_playwright
from PIL import Image, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "file:///" + os.path.join(ROOT, "index.html").replace("\\", "/")

with sync_playwright() as p:
    br = p.chromium.launch(channel="msedge", headless=True,
                           args=["--use-gl=angle", "--use-angle=swiftshader",
                                 "--enable-unsafe-swiftshader", "--allow-file-access-from-files"])
    pg = br.new_page(viewport={"width": 390, "height": 844})
    pg.goto(URL)
    pg.wait_for_timeout(1600)
    print("%-8s %-22s %-8s %s" % ("key", "mean RGB", "stddev", "判定"))
    seen = {}
    for key in ["all", "asia", "europe", "africa", "nam", "sam", "oce"]:
        pg.click('#tabs button[data-c="%s"]' % key)
        pg.wait_for_timeout(300)
        box = pg.evaluate("()=>{const b=document.querySelector('.menu-hero').getBoundingClientRect();"
                          "return {x:b.x,y:b.y,width:b.width,height:b.height};}")
        png = pg.screenshot(clip=box)
        im = Image.open(io.BytesIO(png)).convert("RGB")
        st = ImageStat.Stat(im)
        mean = tuple(int(v) for v in st.mean)
        sd = sum(st.stddev) / 3
        seen[key] = mean
        print("%-8s %-22s %-8.2f %s" % (key, mean, sd,
                                        "有层次" if sd > 3 else "疑为纯色块"))
    dup = [k for k in seen if list(seen.values()).count(seen[k]) > 1]
    print("平均色重复的主题：%s" % (dup if dup else "无 —— 七套各自成立"))
    br.close()
