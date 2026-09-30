# -*- coding: utf-8 -*-
"""world-food-3d · 视觉冒烟与盒模型审计
用途：无头 Edge 打开 index.html，跑「菜单页 → 菜系页签 → 菜品页 → 下一道 → 加单 →
     开始上菜 → 品鉴页 → 风味总结 → 返回菜单」全流程，收集 pageerror / console.error，
     并按手机与桌面两档宽度截图 + dump 盒模型。
重点核查：页签筛选是否真的切换（回归 2026-09-14 修复的 className/tagName bug）、
         菜单页横幅（.menu-hero）的比例与图片接线、菜品页固定操作条、品鉴页大图与底栏、
         总结页图谱、地球组件显隐与位置、横向是否溢出。
注：当前版本已无设置抽屉（#gear / #globeGear / .sheet），旧脚本里点它的步骤已删除。
运行：python tools/ui_shot.py
"""
import os, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "file:///" + os.path.join(ROOT, "index.html").replace("\\", "/")
OUT = os.path.join(ROOT, "tools")
os.makedirs(OUT, exist_ok=True)

LAUNCH = dict(
    channel="msedge", headless=True,
    args=["--use-gl=angle", "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader", "--allow-file-access-from-files"],
)

VIEWPORTS = [("phone", 390, 844), ("desktop", 1280, 820)]

AUDIT_JS = """() => {
  const out = [];
  const r = (e) => { const b = e.getBoundingClientRect();
    return {x:Math.round(b.x), y:Math.round(b.y), w:Math.round(b.width), h:Math.round(b.height),
            l:Math.round(b.left), r:Math.round(b.right), t:Math.round(b.top), b:Math.round(b.bottom)}; };
  const g = (sel) => { const e = document.querySelector(sel); return e ? r(e) : null; };
  const gd = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).display : null; };
  out.push({what:'viewport', w:innerWidth, h:innerHeight});
  out.push({what:'bodyClass', v:document.body.className});
  out.push({what:'docScrollW', v:document.documentElement.scrollWidth});
  const slot = document.getElementById('globeSlot');
  out.push({what:'globeSlot', box:r(slot), display:getComputedStyle(slot).display,
            css:{top:getComputedStyle(slot).top, right:getComputedStyle(slot).right}});
  for (const sel of ['.menu-hero','.hero-veil','.hero-txt','.tabs','.menu-col','.menu-list','.orderbar',
                     '.dish-bar','.dish-body','.dish-actions','.dthumb','.dname','.dsec','.dval',
                     '.sv-stage','.sv-img','.sv-name','.serve-bar','.globe-cap',
                     '.sum-body','.sum-bars','.sum-row','.sum-verdict','.sum-dish','.tag'])
    out.push({what:sel, box:g(sel), display:gd(sel)});
  out.push({what:'sumVerdict', v:(document.getElementById('sumVerdict')||{}).textContent||null});
  out.push({what:'sumSub', v:(document.querySelector('.sum-sub')||{}).textContent||null});
  // 口味图谱已从条图换成雷达图（内联 SVG），六维标签在 .radar .lab 里
  out.push({what:'sumBarLabels', v:[...document.querySelectorAll('#sumBars .radar .lab')].map(e=>e.textContent)});
  /* 菜单页横幅：自 y=0 起通栏铺满，页签须咬在其下沿（tabs.bottom == hero.bottom），
     横幅图为 cover 铺法，故不再校验固定比例 */
  out.push({what:'menuHero', v:(()=>{const e=document.querySelector('.menu-hero');
    if(!e)return null;const b=e.getBoundingClientRect(),t=document.querySelector('.tabs');
    return {w:Math.round(b.width), h:Math.round(b.height), y:Math.round(b.top),
            tabsBottom: t ? Math.round(t.getBoundingClientRect().bottom) : null,
            bg:getComputedStyle(e).backgroundImage.includes('banner-')};})()});
  const rows = [...document.querySelectorAll('#menuList .mrow')].slice(0,12).map(e => {
    const n=e.querySelector('.mname'), l=e.querySelector('.mlead'),
          m=e.querySelector('.mmeta'), a=e.querySelector('.madd'), t=e.querySelector('.mthumb');
    return {name:n.textContent, meta:m.textContent,
            thumb:r(t), nameRight:Math.round(n.getBoundingClientRect().right),
            leadW:Math.round(l.getBoundingClientRect().width),
            metaLeft:Math.round(m.getBoundingClientRect().left),
            metaRight:Math.round(m.getBoundingClientRect().right),
            addLeft:Math.round(a.getBoundingClientRect().left)};
  });
  out.push({what:'menuRows', n:document.querySelectorAll('#menuList .mrow').length, rows});
  const secs = [...document.querySelectorAll('#menuList .sec')].map(e=>e.textContent);
  out.push({what:'sections', secs});
  out.push({what:'dProg', v:(document.getElementById('dProg')||{}).textContent||null});
  out.push({what:'svProg', v:(document.getElementById('svProg')||{}).textContent||null});
  out.push({what:'svNext', v:(document.getElementById('svNext')||{}).textContent||null});
  out.push({what:'sumRows', n:document.querySelectorAll('#sumBars .sum-row').length});
  out.push({what:'sumDishes', n:document.querySelectorAll('#sumDishes .sum-dish').length});
  const ovf = [];
  document.querySelectorAll('body *').forEach(e => {
    const b = e.getBoundingClientRect();
    if (b.width > 0 && (b.right > innerWidth + 0.5 || b.left < -0.5))
      ovf.push((e.className && String(e.className)) || e.tagName);
  });
  out.push({what:'overflowX', items:[...new Set(ovf)].slice(0,14)});
  return out;
}"""

# 图片接线审计：菜单行缩略图走的是「图」还是「色卡」、纹理是否真的落到元素上、
# 灯笼是否加载、以及本次会话有没有 0 字节（未真正加载）的资源。
IMG_JS = """() => {
  const r = {};
  const has = (s, needle) => { const e = document.querySelector(s);
    return e ? getComputedStyle(e).backgroundImage.includes(needle) : null; };
  const thumbs = [...document.querySelectorAll('#menuList .mthumb')];
  r.thumbTotal = thumbs.length;
  r.thumbWithImg = thumbs.filter(e => getComputedStyle(e).backgroundImage.includes('url(')).length;
  r.thumbFromColor = thumbs.filter(e => !getComputedStyle(e).backgroundImage.includes('url(')).length;
  r.dishThumbHasImg = has('#dThumb', '.webp');
  r.texHeroWood = has('.menu-hero', 'wood-sign'); // 期望 true：横幅的兜底纹理层
  r.texMenuHero = has('.menu-hero', 'banner-');   // 期望 true：大洲横幅（key 随页签变）
  r.texMenuList = has('.menu-list', 'paper');     // 期望 null：纸面已去纹理
  r.texDishBody = has('.dish-body', 'paper');     // 期望 null
  const mlc = getComputedStyle(document.querySelector('.menu-list'));
  r.menuBg = mlc.backgroundImage.replace(/url\\("[^"]*"\\)/g, 'url(..)');
  const ob = document.querySelector('.orderbar');
  r.texOrderBar = ob ? getComputedStyle(ob, '::before').backgroundImage.includes('wood-desk') : null;
  const byExt = {}, zero = [];
  performance.getEntriesByType('resource').forEach(e => {
    const m = e.name.match(/\\.(webp|png|jpg|jpeg|js|css)$/i);
    const k = m ? m[1].toLowerCase() : 'other';
    byExt[k] = (byExt[k] || 0) + 1;
    if (!e.decodedBodySize) zero.push(e.name.split('/').pop());
  });
  r.resByExt = byExt;
  r.zeroSize = zero.slice(0, 8);
  return r;
}"""


def show(d):
    return {i["what"]: i for i in d}


def main():
    errors, report, failed = [], {}, []
    with sync_playwright() as P:
        b = P.chromium.launch(**LAUNCH)
        for name, w, h in VIEWPORTS:
            ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2)
            pg = ctx.new_page()
            pg.on("pageerror", lambda e, n=name: errors.append((n, "pageerror", str(e))))
            pg.on("console", lambda m, n=name: errors.append((n, m.type, m.text))
                  if m.type == "error" else None)
            pg.on("requestfailed", lambda rq, n=name: failed.append(
                (n, rq.url.split("/")[-1], str(rq.failure))))
            pg.goto(URL, wait_until="load")
            pg.wait_for_timeout(2400)
            pg.screenshot(path=os.path.join(OUT, f"r_{name}_1menu.png"))
            report[name + ":menu"] = pg.evaluate(AUDIT_JS)
            report[name + ":img"] = pg.evaluate(IMG_JS)

            # 页签筛选（回归：2026-09-14 修复的失效 bug）
            pg.click('.tabs button[data-c="asia"]'); pg.wait_for_timeout(500)
            pg.screenshot(path=os.path.join(OUT, f"r_{name}_2tab.png"))
            report[name + ":tab"] = pg.evaluate(AUDIT_JS)

            pg.click("#menuList .mrow"); pg.wait_for_timeout(1500)
            pg.screenshot(path=os.path.join(OUT, f"r_{name}_3dish.png"))
            report[name + ":dish"] = pg.evaluate(AUDIT_JS)

            pg.click("#dNext"); pg.wait_for_timeout(1200)
            pg.screenshot(path=os.path.join(OUT, f"r_{name}_4next.png"))

            # 注：当前版本已无设置抽屉，旧脚本在此点 #globeGear / #sClose 的步骤已删除
            pg.click("#backBtn"); pg.wait_for_timeout(700)
            pg.click("#menuList .mrow .madd"); pg.wait_for_timeout(400)
            pg.click("#menuList .mrow:nth-child(3) .madd"); pg.wait_for_timeout(400)
            pg.screenshot(path=os.path.join(OUT, f"r_{name}_5order.png"))
            report[name + ":order"] = pg.evaluate(AUDIT_JS)

            # 上菜流程：开始上菜 → 品鉴页 → 风味总结页
            pg.click("#orderBtn"); pg.wait_for_timeout(1400)
            pg.screenshot(path=os.path.join(OUT, f"r_{name}_7serve.png"))
            report[name + ":serve"] = pg.evaluate(AUDIT_JS)
            # 品鉴页大图只有进了品鉴页才会被赋值，必须在这时量（在菜单页量恒为「色卡」）
            report[name + ":serveimg"] = pg.evaluate("""() => { const e = document.getElementById('svImg');
              const cs = getComputedStyle(e);
              return { has: cs.backgroundImage.includes('.webp'), size: cs.backgroundSize }; }""")
            pg.click("#svNext"); pg.wait_for_timeout(1200)
            pg.click("#svNext"); pg.wait_for_timeout(1200)
            pg.screenshot(path=os.path.join(OUT, f"r_{name}_8sum.png"))
            report[name + ":sum"] = pg.evaluate(AUDIT_JS)
            pg.click("#sumBack"); pg.wait_for_timeout(700)
            report[name + ":back"] = pg.evaluate(AUDIT_JS)
            ctx.close()
        b.close()

    print(json.dumps(report, ensure_ascii=False, indent=1))

    print("\n==== 关键核查 ====")
    for key in ("phone:menu", "desktop:menu", "phone:dish", "desktop:dish",
                "phone:serve", "desktop:serve", "phone:sum", "desktop:sum"):
        d = show(report[key])
        print(f"[{key}] body={d['bodyClass']['v']:10s} docScrollW={d['docScrollW']['v']} "
              f"viewport={d['viewport']['w']} globeSlot={d['globeSlot']['display']:6s} "
              f"{d['globeSlot']['box']['w']}x{d['globeSlot']['box']['h']}@({d['globeSlot']['box']['l']},{d['globeSlot']['box']['t']})")
        if 'sections' in d:
            print(f"          sections={d['sections']['secs']}  行数={d['menuRows']['n']}")
            mr = [x["metaRight"] for x in d["menuRows"]["rows"]]
            print(f"          「产地」右端缘集合={sorted(set(mr))}")
        print(f"          横向溢出={d['overflowX']['items']}")

    print("\n==== 页签筛选回归（asia 应只剩亚洲 10 行）====")
    for name, _, _ in VIEWPORTS:
        m, t = show(report[name + ":menu"]), show(report[name + ":tab"])
        print(f"[{name}] 全部={m['sections']['secs']} 行 {m['menuRows']['n']}"
              f"  →  亚洲页签={t['sections']['secs']} 行 {t['menuRows']['n']}")

    print("\n==== 固定操作条 / 品鉴 / 总结 ====")
    for name, _, _ in VIEWPORTS:
        d = show(report[name + ":dish"])
        s, u = show(report[name + ":serve"]), show(report[name + ":sum"])
        da = d['.dish-actions']['box'] or {}
        daok = bool(da)
        print(f"[{name}] dish-actions display={d['.dish-actions']['display']}"
              + (f" box={da['w']}x{da['h']}@y{da['t']}  底距={d['viewport']['h'] - da['b']}" if daok else " 无盒模型"))
        si = s['.sv-img']['box'] or {}
        sim = report[name + ":serveimg"]
        print(f"          品鉴 sv-img={si.get('w')}x{si.get('h')} svProg={s['svProg']['v']}"
              f"  serve-bar={s['.serve-bar']['display']} svNext={s['svNext']['v']}"
              f"  大图接线={'有图' if sim['has'] else '色卡'}")
        print(f"          总结 菜品行={u['sumDishes']['n']} 六维标签={u['sumBarLabels']['v']}"
              f"　定评=「{u['sumVerdict']['v']}」")
        print(f"          总结 覆盖={u['sumSub']['v']}")
        mh = show(report[name + ":menu"])['menuHero']['v']   # 横幅在菜单页量，子页该元素为 display:none
        print(f"          菜单页横幅 hero={mh['w']}x{mh['h']}@y{mh['y']} "
              f"页签下沿={mh['tabsBottom']}（应等于 hero 下沿 {mh['y'] + mh['h']}）"
              f"横幅图接上={mh['bg']}")

    print("\n==== 图片接线 ====")
    for name, _, _ in VIEWPORTS:
        m = report[name + ":img"]
        print(f"[{name}] 菜单缩略图 {m['thumbTotal']} 格：走图 {m['thumbWithImg']} / 走色卡 {m['thumbFromColor']}"
              f"　菜品页大图={'有图' if m['dishThumbHasImg'] else '色卡'}")
        print(f"          纹理 横幅木纹兜底={m['texHeroWood']}(期望True) 菜单页横幅={m['texMenuHero']}(期望True)"
              f" 菜单列表={m['texMenuList']}(期望None) 菜品页={m['texDishBody']}(期望None)"
              f" 点单栏={m['texOrderBar']}")
        # 注：file:// 下 performance.getEntriesByType('resource') 不报本地资源，
        #     故 resByExt / zeroSize 恒空，不能用来判「图片有没有加载」——
        #     图是否真的接上，看上面的走图格数与 tests/verify_menu_bg.py 的像素比对。
        print(f"          资源统计（file:// 下不可用）{m['resByExt']}")
    print(f"\n请求失败：{failed or '无'}")

    print("\n---- pageerror / console.error ----")
    seen = set()
    for n, t, m in errors:
        k = (t, m[:120])
        if k in seen:
            continue
        seen.add(k)
        print(f"[{n}] {t}: {m[:280]}")
    print(f"(共 {len(errors)} 条，去重 {len(seen)} 条)")
    print("OK" if not [e for e in errors if e[1] == "pageerror"] else "FAIL")


main()
