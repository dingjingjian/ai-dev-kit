# -*- coding: utf-8 -*-
"""world-food-3d Chrome 61 降级路径**行为验证**

背景与定位：
  本机没有 Chrome 61 / WebView 61 内核（只有 Edge 152+ 与 Playwright Chromium），
  因此**无法做真正的 Chrome 61 实测**。按 minitool 规范 css-compatibility.md §7，
  这种情况必须在交付说明中标记「Chrome 61 CSS 兼容性未实测」。

  「未实测」不等于「无法验证」。本脚本做的是**降级路径的行为验证**：
  在真浏览器里模拟 Chrome 61 的能力缺失，检查页面是否仍然可用。
  覆盖的是「降级逻辑本身写对了吗」，覆盖不了「Chrome 61 内核真实行为」——
  两者是不同的问题，报告里分别陈述，不混为一谈。

两个方向，缺一不可：
  A. **强制降级**：拿掉 WebGL、拿掉 flex-gap 增强层、阉掉 Chrome 61 之后的 API，
     走完「切洲 → 看菜 → 点单 → 上菜 → 品鉴 → 总结」全流程，页面必须仍可用。
  B. **对照增强**：能力齐备时确认走的是增强路径（证明检测没写反）。

运行：python tests/check_fallback.py
"""
import asyncio
import pathlib
import shutil
import sys
import tempfile
import zipfile

from playwright.async_api import async_playwright

# Windows 控制台默认 GBK，打不出 ✓/✗ 会直接抛 UnicodeEncodeError
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = pathlib.Path(__file__).resolve().parent.parent
ZIP = ROOT / "world-food-3d.zip"
DIST = ROOT / "dist"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
VW, VH = 390, 844

pass_n = fail_n = 0
failures = []


def ok(cond, name, detail=""):
    global pass_n, fail_n
    if cond:
        pass_n += 1
        print("  ✓ %s" % name)
    else:
        fail_n += 1
        failures.append(name + ("  → " + str(detail) if detail else ""))
        print("  ✗ %s  %s" % (name, detail))


# 在页面脚本执行前注入：模拟「旧内核 / 弱容器」没有这些能力
CHROME61_MISSING = """
(function () {
  // ① 拿不到 WebGL 上下文（容器摘掉了 GPU / 内核太老）
  var orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type) {
    if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
    return orig.apply(this, arguments);
  };
  // ② 不支持 Flex gap：拦掉内联检测脚本往 <html> 上打的增强标记
  var desc = Object.getOwnPropertyDescriptor(Element.prototype, 'className');
  Object.defineProperty(Element.prototype, 'className', {
    get: desc.get,
    set: function (v) {
      if (this === document.documentElement && typeof v === 'string') {
        v = v.replace(/\\bsupports-flex-gap\\b/g, '');
      }
      desc.set.call(this, v);
    }
  });
  // ③ Chrome 61 之后才有的 API，一并抹掉
  ['ResizeObserver', 'IntersectionObserver'].forEach(function (k) {
    try { delete window[k]; } catch (e) {}
  });
})();
"""


async def degraded_run(browser, url):
    """A. 强制降级：能力全无时，全流程必须仍然可用。"""
    print("\n── A. 强制降级后仍可用（模拟 Chrome 61 能力缺失） " + "─" * 18)
    ctx = await browser.new_context(viewport={"width": VW, "height": VH},
                                    device_scale_factor=2, is_mobile=True, has_touch=True)
    page = await ctx.new_page()
    errs = []
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errs.append("PAGEERROR: " + str(e)))
    await page.add_init_script(CHROME61_MISSING)
    await page.goto(url, wait_until="load")
    await page.wait_for_timeout(2200)

    base = await page.evaluate("""() => {
      const rows = document.querySelectorAll('#menuList .mrow');
      const hero = document.querySelector('.menu-hero');
      const down = document.getElementById('globeDown');
      const bar = document.querySelector('.orderbar');
      const cs = hero ? getComputedStyle(hero) : null;
      return {
        gapClass: document.documentElement.className.indexOf('supports-flex-gap') >= 0,
        downShown: down ? down.className.indexOf('show') >= 0 : false,
        loaderHidden: document.getElementById('loader').className.indexOf('hide') >= 0,
        rows: rows.length,
        heroH: hero ? Math.round(hero.getBoundingClientRect().height) : 0,
        barH: bar ? Math.round(bar.getBoundingClientRect().height) : 0,
        theme: document.body.getAttribute('data-ctn')
      };
    }""")
    ok(not base["gapClass"], "增强层已屏蔽（supports-flex-gap 未启用）→ 走 margin 基线")
    ok(base["downShown"], "无 WebGL 时地球槽内亮出降级层（不再是全屏遮罩）")
    ok(base["loaderHidden"], "无 WebGL 时加载遮罩照常退场（页面没被卡住）")
    ok(base["rows"] == 36, "菜单 36 道菜全部渲染", base["rows"])
    ok(base["heroH"] > 40, "横幅高度基线生效（--hero-h 没因 clamp 失效而归零）", base["heroH"])
    ok(base["barH"] > 30, "底部点单栏有高度", base["barH"])
    ok(base["theme"] == "all", "默认主题为 all", base["theme"])

    # 切大洲页签
    await page.click('#tabs button[data-c="asia"]')
    await page.wait_for_timeout(400)
    tab = await page.evaluate("""() => ({
      theme: document.body.getAttribute('data-ctn'),
      rows: document.querySelectorAll('#menuList .mrow').length,
      secs: document.querySelectorAll('#menuList .sec').length
    })""")
    ok(tab["theme"] == "asia", "切到亚洲页签后主题换装", tab["theme"])
    ok(0 < tab["rows"] < 36, "亚洲分节后只列出本洲菜品", tab["rows"])

    # 进菜品页
    await page.click('#menuList .mrow')
    await page.wait_for_timeout(700)
    dish = await page.evaluate("""() => {
      const bar = document.querySelector('.dish-actions');
      const btns = bar ? bar.querySelectorAll('button') : [];
      const rects = Array.prototype.map.call(btns, b => {
        const r = b.getBoundingClientRect();
        return {x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height)};
      });
      let overlapped = false;
      for (let i = 0; i < rects.length; i++)
        for (let j = 0; j < rects.length; j++)
          if (i !== j && rects[i].x === rects[j].x && rects[i].w === rects[j].w) overlapped = true;
      return {
        mode: document.body.className,
        name: (document.getElementById('dName') || {}).textContent || '',
        intro: (document.getElementById('dIntro') || {}).textContent || '',
        cap: (document.getElementById('capCoord') || {}).textContent || '',
        rects: rects, overlapped: overlapped
      };
    }""")
    ok("mode-dish" in dish["mode"], "进入菜品页", dish["mode"])
    ok(len(dish["name"]) > 0, "菜名已填充", dish["name"])
    ok(len(dish["intro"]) > 10, "菜品介绍已填充", dish["intro"][:20])
    ok(len(dish["cap"]) > 0, "地球槽的经纬度仍可读（降级层没盖住 .globe-cap）", dish["cap"])
    ok(all(r["w"] > 0 and r["h"] > 0 for r in dish["rects"]),
       "底栏三枚按钮都有实际尺寸（margin 基线布局生效）", dish["rects"])
    ok(not dish["overlapped"], "底栏按钮未重叠（margin 间距生效）", dish["rects"])

    # 加入点单（先量一次宽度，点完再量 —— 两态字数不同，宽度不能跟着缩）
    w0 = await page.evaluate(
        "() => Math.round(document.getElementById('dAdd').getBoundingClientRect().width)")
    await page.click('#dAdd')
    await page.wait_for_timeout(300)
    order = await page.evaluate("""() => {
      const a = document.getElementById('dAdd');
      return {
        txt: a ? a.textContent : '',
        cls: a ? a.className : '',
        w: a ? Math.round(a.getBoundingClientRect().width) : 0,
        hasInfo: !!document.querySelector('.dish-actions .oinfo')
      };
    }""")
    ok(abs(order["w"] - w0) <= 1,
       "点「加入点单」后按钮宽度不变（两态同宽，底栏不抖）", (w0, order["w"]))
    ok(not order["hasInfo"], "菜品页底栏不再挂状态信息列（窄屏让位给按钮）")
    ok("已点" in order["txt"],
       "是否已点仍读得到 —— 由「加入点单」按钮自身的 ✓ 态表达", order["txt"])
    ok("on" in order["cls"].split(" "), "已点态带 .on 样式（朱红实心）", order["cls"])

    # 回菜单 → 开始上菜 → 品鉴 → 总结
    await page.click('#backBtn')
    await page.wait_for_timeout(400)
    await page.click('#orderBtn')
    await page.wait_for_timeout(700)
    serve = await page.evaluate("""() => ({
      mode: document.body.className,
      name: (document.getElementById('svName') || {}).textContent || '',
      prog: (document.getElementById('svProg') || {}).textContent || ''
    })""")
    ok("mode-serve" in serve["mode"], "进入品鉴页", serve["mode"])
    ok(len(serve["name"]) > 0, "品鉴页菜名已填充", serve["name"])

    await page.click('#svNext')
    await page.wait_for_timeout(700)
    summ = await page.evaluate("""() => ({
      mode: document.body.className,
      radar: !!document.querySelector('#sumBars svg.radar'),
      polys: document.querySelectorAll('#sumBars polygon.face').length,
      kcal: ((document.getElementById('sumKcal') || {}).textContent || '').length,
      dishes: document.querySelectorAll('#sumDishes .sum-dish').length
    })""")
    ok("mode-sum" in summ["mode"], "走到风味总结页", summ["mode"])
    ok(summ["radar"] and summ["polys"] > 0, "六维口味雷达图渲染（内联 SVG）", summ)
    ok(summ["kcal"] > 20, "热量合计已生成", summ["kcal"])
    ok(summ["dishes"] >= 1, "菜品回顾有行", summ["dishes"])

    await page.click('#sumBack')
    await page.wait_for_timeout(500)
    back = await page.evaluate("() => document.body.className")
    ok("mode-menu" in back, "从总结页返回菜单", back)

    ok(not errs, "降级状态下全流程无 console 报错 / 未捕获异常", errs[:3])
    await ctx.close()


async def enhanced_run(browser, url):
    """B. 对照：能力齐备时走增强路径。"""
    print("\n── B. 对照：能力齐备时启用增强层 " + "─" * 28)
    ctx = await browser.new_context(viewport={"width": VW, "height": VH},
                                    device_scale_factor=2, is_mobile=True, has_touch=True)
    page = await ctx.new_page()
    errs = []
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errs.append("PAGEERROR: " + str(e)))
    await page.goto(url, wait_until="load")
    await page.wait_for_timeout(2500)
    e = await page.evaluate("""() => {
      const down = document.getElementById('globeDown');
      const cv = document.getElementById('stage');
      return {
        gapClass: document.documentElement.className.indexOf('supports-flex-gap') >= 0,
        downShown: down ? down.className.indexOf('show') >= 0 : false,
        canvasW: cv ? Math.round(cv.getBoundingClientRect().width) : 0,
        rows: document.querySelectorAll('#menuList .mrow').length
      };
    }""")
    ok(e["gapClass"], "本机内核支持 Flex gap → 检测结果为真 → .supports-flex-gap 已启用")
    ok(not e["downShown"], "WebGL 可用时不挂降级层")
    ok(e["rows"] == 36, "增强路径下菜单同样完整", e["rows"])
    ok(not errs, "增强路径下无报错", errs[:3])

    # 地球只在菜品页：进去看一眼画布有没有被真正初始化
    await page.click('#menuList .mrow')
    await page.wait_for_timeout(900)
    g = await page.evaluate("""() => {
      const cv = document.getElementById('stage');
      const r = cv ? cv.getBoundingClientRect() : null;
      return {w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0,
              cap: (document.getElementById('capCoord') || {}).textContent || ''};
    }""")
    ok(g["w"] > 0 and g["h"] > 0, "菜品页里地球画布已铺开", g)
    ok(len(g["cap"]) > 0, "经纬度标注已写入", g["cap"])
    await ctx.close()


async def main():
    src = None
    if ZIP.exists():
        src, is_zip = ZIP, True
    elif DIST.exists():
        src, is_zip = DIST, False
    else:
        print("先跑 tools/build_zip.py 生成 dist/ 与 zip")
        return 1

    tmp = pathlib.Path(tempfile.mkdtemp(prefix="wf3d_fb_"))
    if is_zip:
        with zipfile.ZipFile(src) as z:
            z.extractall(tmp)
    else:
        shutil.copytree(src, tmp, dirs_exist_ok=True)
    url = (tmp / "index.html").as_uri()

    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(
                executable_path=EDGE,
                args=["--use-gl=angle", "--use-angle=swiftshader",
                      "--enable-unsafe-swiftshader", "--allow-file-access-from-files"])
            try:
                await degraded_run(browser, url)
                await enhanced_run(browser, url)
            finally:
                await browser.close()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print("\n" + "=" * 68)
    print("降级路径行为验证：通过 %d / %d" % (pass_n, pass_n + fail_n))
    if failures:
        print("\n失败项：")
        for f in failures:
            print("  ✗ " + f)
    print("\n⚠ 本机无 Chrome 61 / WebView 61 内核，**Chrome 61 内核行为未实测**。")
    print("  以上验证的是「降级逻辑写对了」，不等价于「Chrome 61 上真能跑」。")
    print("  交付说明中须保留此标记（见 minitool css-compatibility.md §7）。")
    print("=" * 68)
    return 1 if fail_n else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
