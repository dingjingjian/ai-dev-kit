# -*- coding: utf-8 -*-
"""
air-tycoon 夜面灯火增益标定探针

回答一个问题：`NIGHT_GAIN` 该取多少。

只靠「看着亮不亮」定不出这个值，因为它同时在调三件互相拉扯的事：
  ① 城市核要够亮（玩家要看得见东亚那片灯火）；
  ② 弥散辉光要够薄（辉光糊在标记上，就是「看不清」的来源）；
  ③ 峰值不能截断（bloom 链路的 rtScene 是线性 8-bit，> 1 一律变纯白，
     色相信息在标记那几个像素上被直接抹掉）。

做法：在**同一机位**（东亚灯火面）固定软膝，逐档扫 `setNightGain`，
每档拍一张，与「灯火全关」那张配对，量三件事：
  · dInner         灯火把夜面提亮了多少          → 城市核够不够亮
  · litFrac        被灯火照亮的球面像素占比       → 辉光糊多大一片
  · 对比度/彩度保留 标记相对关灯帧还剩多少        → 标记还读不读得出来
  · hotFrac        亮度 > 0.97 的像素占比         → 有没有截断成纯白斑

判读 `NIGHT_GAIN` 的拐点：核心亮度（dInner）随 gain 增长很快饱和，
而辉光占比（litFrac）还在线性涨 —— 拐点之后再加增益，只是把雾加厚。

用法（需 Python + playwright + PIL；Windows 下用仓库约定的 venv）：
    python tools/probe-night-gain.py
"""
import asyncio
import importlib.util
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

# 复用的度量函数（sphere_lum / light_delta / info_layer_ab）都在实机冒烟里，
# 不在这里抄第二份 —— 抄一份就会与探针口径漂移，读数也就不可比了。
# ⚠ smoke-render.py 自己 import 同目录的 smoke_render_util，所以必须先把这个
#   目录塞进 sys.path，否则 importlib 加载时会 ModuleNotFoundError。
sys.path.insert(0, str(ROOT / "tests"))
_spec = importlib.util.spec_from_file_location(
    "air_tycoon_smoke", ROOT / "tests" / "smoke-render.py")
S = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(S)

# 扫这些档。1.9 是改动前的旧值，留着作图上的参照点。
GAINS = [0.0, 0.6, 1.0, 1.4, 1.6, 1.9, 2.4, 3.0]

# 灯火密集的夜面（中国东部 + 朝鲜半岛 + 日本）。反日点在澳洲中部荒漠，
# 那里开灯关灯只差 0.002，拿它标定等于没标。
LIGHTS = {"lat": 32.0, "lon": 122.0}


def _ratio(d, k_on, k_off):
    off = d.get(k_off) or 0
    return (d.get(k_on) or 0) / off if off else float("nan")


async def main():
    from playwright.async_api import async_playwright

    S.SHOT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            executable_path=EDGE,
            args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        ctx = await browser.new_context(viewport={"width": S.VW, "height": S.VH},
                                       device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        errs = []
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errs.append("PAGEERROR: " + str(e)))
        try:
            await page.goto((ROOT / "index.html").as_uri(), wait_until="load")
            await page.wait_for_timeout(1200)
            await page.click("#uSelectList .al-card")
            await page.click("#uSelGo")
            # 等相机推近停稳（radius 12→7.4）+ 夜景贴图解码上屏；
            # 相机没停稳时球径不符 sphere_lum 的 R_px 口径，读数会被算错。
            await page.wait_for_timeout(3600)

            async def clear_modal():
                got = await page.evaluate("""() => {
                    const m = document.getElementById('uModal');
                    if (!m || !m.classList.contains('show')) return false;
                    const o = document.querySelector('#uModalBody [data-act]');
                    if (o) o.click();
                    return true;
                }""")
                if got:
                    await page.wait_for_timeout(700)
                return got

            async def shoot(fname):
                await clear_modal()
                p = S.SHOT / fname
                await page.screenshot(path=str(p))
                return p

            await page.evaluate("ll => window.AT.render.flyTo(ll.lat, ll.lon)", LIGHTS)
            await page.wait_for_timeout(1800)
            arrived = await page.evaluate("""ll => {
                const R = window.AT.render;
                const v = window.AT.geo.ll2v(ll.lat, ll.lon, 1);
                let d = R.camTarget.theta - Math.atan2(v.x, v.z);
                while (d > Math.PI) d -= Math.PI * 2;
                while (d < -Math.PI) d += Math.PI * 2;
                return Math.abs(d) < 0.02;
            }""", LIGHTS)
            if not arrived:
                raise SystemExit("相机没能飞到灯火观察点 —— 读数无效，先查 flyTo")

            plan = await page.evaluate("() => window.AT.render.nightPlan")
            base_gain = plan["gain"]

            # 先拍「灯火全关」，它是所有档位共用的配对基准，也是挑样本的依据
            await page.evaluate("v => window.AT.render.setNightGain(v)", 0)
            await page.wait_for_timeout(600)
            off_png = await shoot("probe-gain-off.png")

            print("nightPlan = %s" % plan)
            print("观察点 32.0N/122.0E（东亚灯火面），配对基准 = 灯火全关\n")
            hdr = "%-6s %-9s %-9s %-9s %-9s %-8s" % (
                "gain", "dInner", "dWarm", "对比度保留", "彩度保留", "纯白斑%")
            print(hdr)
            print("-" * len(hdr))

            rows = []
            for g in GAINS:
                await page.evaluate("v => window.AT.render.setNightGain(v)", g)
                await page.wait_for_timeout(600)
                on_png = await shoot("probe-gain-%s.png" % str(g).replace(".", "p"))
                ld = S.light_delta(on_png, off_png)
                ia = S.info_layer_ab(on_png, off_png)
                row = {
                    "gain": g,
                    "dInner": ld.get("dInner"),
                    "dWarm": ld.get("dWarm"),
                    "litFrac": ld.get("litFrac"),
                    "contra": _ratio(ia, "contraOn", "contraOff"),
                    "chroma": _ratio(ia, "chromaOn", "chromaOff"),
                    "hotFrac": ia.get("hotFrac"),
                    "nInfo": ia.get("nInfo"),
                }
                rows.append(row)
                print("%-6s %-9.4f %-9.4f %-9.3f %-9.3f %-8.3f" % (
                    g, row["dInner"] or 0, row["dWarm"] or 0,
                    row["contra"] or 0, row["chroma"] or 0, (row["hotFrac"] or 0) * 100))

            print("\n灯火铺开的面积（litFrac，越小=辉光越薄）与核心亮度一起看：")
            for r in rows:
                print("  gain %-4s  dInner %-8.4f litFrac %.4f" % (
                    r["gain"], r["dInner"] or 0, r["litFrac"] or 0))

            # 复位，别把探针的中间状态留在页面上（下次跑别的探针会读到脏值）
            await page.evaluate("v => window.AT.render.setNightGain(v)", base_gain)
            print("\n已把 gain 复位为 %s（nightPlan 原值）" % base_gain)
            if errs:
                print("⚠ 页面报错 %d 条：%s" % (len(errs), errs[:3]))
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
