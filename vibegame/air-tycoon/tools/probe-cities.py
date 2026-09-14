# -*- coding: utf-8 -*-
"""
air-tycoon 城市定位探针
把 24 座城的 3D 坐标投到屏幕，输出屏幕坐标 + 是否可见 + 是否落在陆地上（用 landmask 判）。

为什么需要：光点位置错了有两种可能 ——
  ① 经纬度 → 3D 的换算出错（坐标真正偏了）
  ② 换算没错，但贴图的经度朝向与 ll2v 的约定差 180°（画面对了、球上错了）
这两者的症状一样（「人在海上」），但修法完全不同。
本探针把 ll2v 的输出**反推回经纬度**并与输入比对，能一眼区分：
  若反推一致 → 换算无误，问题在贴图朝向；
  若反推不一致 → 换算本身有 bug。
"""
import asyncio, pathlib, sys, json
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            executable_path=EDGE,
            args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        ctx = await browser.new_context(viewport={"width": 390, "height": 844},
                                        device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        await page.goto((ROOT / "index.html").as_uri(), wait_until="load")
        await page.wait_for_timeout(3500)

        out = await page.evaluate("""() => {
            const AT = window.AT, R = AT.render, G = AT.geo, THREE = window.THREE;
            const st = AT.game.state;
            const cam = R.camera;
            const cv = document.getElementById('stage');
            const rect = cv.getBoundingClientRect();
            const rows = [];
            // 复刻 render.js 的投影片段
            const pv = new THREE.Vector3();
            for (const c of st.cities) {
                const v = G.ll2v(c.lat, c.lon, 1.6 * 1.012);
                // 可见性：与视线方向点积
                const cd = cam.position.clone().normalize();
                const pn = new THREE.Vector3(v.x, v.y, v.z).normalize();
                const facing = pn.dot(cd);
                pv.set(v.x, v.y, v.z).project(cam);
                const sx = (pv.x * 0.5 + 0.5) * rect.width;
                const sy = (-pv.y * 0.5 + 0.5) * rect.height;
                // 反推经纬（验证 ll2v 自洽）
                const r = Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z);
                const theta = Math.acos(v.y / r);
                let phi = Math.atan2(v.z, -v.x);
                if (phi < 0) phi += Math.PI * 2;
                const lonBack = (phi / (Math.PI * 2)) * 360 - 180;
                const latBack = 90 - theta * 180 / Math.PI;
                rows.push({
                    id: c.id, name: c.name, lat: c.lat, lon: c.lon,
                    latBack: +latBack.toFixed(2), lonBack: +lonBack.toFixed(2),
                    onLand: AT.land.isLand(c.lat, c.lon),
                    facing: +facing.toFixed(3),
                    sx: Math.round(sx), sy: Math.round(sy),
                    onScreen: sx > -40 && sx < rect.width + 40 && sy > -40 && sy < rect.height + 40,
                    isHome: !!c.isHome, level: c.level, dev: +c.dev.toFixed(1)
                });
            }
            return { w: rect.width, h: rect.height,
                     camPos: [+cam.position.x.toFixed(3), +cam.position.y.toFixed(3), +cam.position.z.toFixed(3)],
                     rows: rows };
        }""")

        print("=" * 76)
        print("城市定位探针  画布 %.0f×%.0f  相机 [%s]" % (out["w"], out["h"], ", ".join(map(str, out["camPos"]))))
        print("=" * 76)
        print("%-4s %-9s %8s %8s %8s %8s  %-5s %-6s %6s %6s %s" % (
            "id", "name", "lat", "lon", "latBack", "lonBack", "陆地", "朝向", "sx", "sy", "屏内"))
        bad_uv = 0
        offscreen = 0
        for r in out["rows"]:
            duv = abs(r["latBack"] - r["lat"]) > 0.5 or abs(r["lonBack"] - r["lon"]) > 0.5
            if duv:
                bad_uv += 1
            if not r["onScreen"]:
                offscreen += 1
            flag = ""
            if duv:
                flag += " ⚠UV"
            if not r["onLand"]:
                flag += " ⚠海上"
            if r["isHome"]:
                flag += " ★基地"
            print("%-4s %-9s %8.2f %8.2f %8.2f %8.2f  %-5s %6.3f %6d %6d %-4s%s" % (
                r["id"], r["name"], r["lat"], r["lon"], r["latBack"], r["lonBack"],
                "是" if r["onLand"] else "否", r["facing"], r["sx"], r["sy"],
                "是" if r["onScreen"] else "否", flag))

        n = len(out["rows"])
        print("-" * 76)
        print("UV 反推不一致: %d / %d" % (bad_uv, n))
        print("屏幕外: %d / %d" % (offscreen, n))
        sea = sum(1 for r in out["rows"] if not r["onLand"])
        print("经度落在海上（landmask 判定）: %d / %d" % (sea, n))
        print()
        if bad_uv == 0 and sea == 0:
            print("结论：坐标换算与陆地判定都正确 → 若画面仍偏，问题在贴图朝向或相机")
        elif bad_uv > 0:
            print("结论：ll2v 反推与输入不一致 → geo 层换算有 bug")
        else:
            print("结论：部分城市 landmask 判定为海 → 检查城市经纬度或掩膜精度")
        await browser.close()
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
