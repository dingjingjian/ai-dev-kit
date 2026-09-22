# -*- coding: utf-8 -*-
"""渲染自检：移动端视口下跑一遍科技树 / 图鉴 / 详情，覆盖以下断言。

  1. 科技树 10 个时代分组齐全、72 个节点，数量与 data.js 一致
  2. SVG 连线数 = 前置关系数（每条前置一条 path + 一个箭头多边形）
  3. 起点节点（无前置）带「起点」标签；近未来节点带「前瞻」标签
  4. 页面无横向滚动（360/390px 宽下全部收在视口内）
  5. 点击节点：底部操作条出现、该节点高亮、无关节点变淡、相关连线点亮
  6. 「查看详情」进入 #/t/<id>，详情区块齐全、前置与后续可点跳转
  7. 详情页提示词 = 统一风格串 + 条目主体；页面不出现仓库路径
  8. 返回科技树后节点齐全；切到图鉴：10 个分组、72 张卡片、封面占位块正常
  9. 搜索能命中并高亮（按钮文案、命中数量）
 10. 无未捕获的 JS 运行时错误

用法：python _dev/shot_check.py
"""
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from parse_data import load  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent / "_shots"
OUT.mkdir(exist_ok=True)

ERAS, TECHS, STYLE = load()
N_ERA = len(ERAS)
N_TECH = len(TECHS)
N_EDGE = sum(len(t["roots"]) for t in TECHS)
N_ROOT = len([t for t in TECHS if not t["roots"]])
PER_ERA = [len([t for t in TECHS if t["era"] == e["key"]]) for e in ERAS]
FIRST_ERA_ZH = ERAS[0]["zh"]
ROOTS = [t["id"] for t in TECHS if not t["roots"]]
STYLE_HEAD = STYLE.split(",")[0]

# 背景音乐载荷长度：用来核对页面拿到的 base64 与磁盘上的一致
BGM_JS = ROOT / "assets" / "audio" / "bgm.js"
BGM_B64 = 0
if BGM_JS.is_file():
    _m = re.search(r'window\.TT_BGM="([A-Za-z0-9+/=]*)"', BGM_JS.read_text(encoding="utf-8"))
    if _m:
        BGM_B64 = len(_m.group(1))

failures = []
URL = (ROOT / "index.html").as_uri()


def check(cond, ok_msg, bad_msg):
    if cond:
        print("  ✓ " + ok_msg)
    else:
        failures.append(bad_msg)
        print("  ✗ " + bad_msg)


with sync_playwright() as p:
    # --allow-file-access-from-files：本自检直接用 file:// 打开 index.html，
    # 而「分享」要把页面里的原图经 Canvas 取成 data:uri —— 不放开这条，
    # file:// 下画布会被判为被污染、toDataURL 抛 SecurityError（容器里同源，不存在这一步）。
    browser = p.chromium.launch(args=["--allow-file-access-from-files"])
    # DPR 取 1：断言都用 CSS 像素，整页截图又高又长（DPR2 单张可达数 MB），没必要翻四倍
    page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)

    js_errors = []
    page.on("pageerror", lambda e: js_errors.append(str(e)))
    page.on("console", lambda m: js_errors.append(m.text)
            if m.type == "error" and "Failed to load resource" not in m.text else None)

    print("—— 顶部预留带（宿主按钮行）——")
    page.goto(URL)
    page.wait_for_selector(".node")

    BAND_PROBE = """() => {
      const tb = document.querySelector('.topband');
      const r = tb.getBoundingClientRect();
      const tt = document.querySelector('.topband h1');
      const h = tt.getBoundingClientRect();
      return {h: Math.round(r.height),
              size: Math.round(parseFloat(getComputedStyle(tt).fontSize)),
              text: tt.textContent,
              titleCY: Math.round(h.top + h.height / 2 - r.top),
              titleCX: Math.round(h.left + h.width / 2),
              boxCX: Math.round(r.left + r.width / 2),
              barTop: Math.round(document.querySelector('.topbar').getBoundingClientRect().top),
              topwrapH: Math.round(document.getElementById('topwrap').getBoundingClientRect().height)};
    }"""
    band = page.evaluate(BAND_PROBE)
    check(band["h"] == 50 and band["barTop"] == 50 and abs(band["titleCY"] - 25) <= 2
          and abs(band["titleCX"] - band["boxCX"]) <= 1,
          "无宿主：预留带 50px，标题在带内垂直居中（中线 %dpx）且水平居中，第二行紧接其下"
          % band["titleCY"],
          "顶部结构异常：%s" % band)
    check(band["size"] >= 20 and band["text"] == "人类科技树",
          "顶部标题 %dpx 衬线站得住（预留带内容区 50px）" % band["size"],
          "标题字号/文案异常：%s" % band)
    check(band["topwrapH"] == 90,
          "顶栏总高 %dpx（预留带 50 + 第二行 38 + 墨线 2）" % band["topwrapH"],
          "顶栏总高 = %s px，期望 90" % band["topwrapH"])

    page.evaluate("() => document.documentElement.style.setProperty('--safe-area-inset-top','44px')")
    page.wait_for_timeout(60)
    with_safe = page.evaluate(BAND_PROBE)
    check(with_safe["h"] == 94 and with_safe["titleCY"] == 69,
          "注入状态栏 44px：预留带 94px（= 50 + 44），标题居中在带子下半（中线 %dpx，与宿主按钮同一行）"
          % with_safe["titleCY"],
          "注入 44px 后异常：%s" % with_safe)

    page.evaluate("() => document.body.classList.add('in-app')")
    page.wait_for_timeout(60)
    in_app = page.evaluate(BAND_PROBE)
    check(in_app["h"] == 114 and in_app["titleCY"] == 79,
          "容器内嵌（body.in-app）：预留带 114px（= 70 + 44），标题居中在加高后的 70px 段里（中线 %dpx）"
          % in_app["titleCY"],
          "in-app 异常：%s" % in_app)

    page.evaluate("""() => {
      document.body.classList.remove('in-app');
      document.documentElement.style.removeProperty('--safe-area-inset-top');
    }""")
    page.wait_for_timeout(60)
    reset = page.evaluate(BAND_PROBE)
    check(reset["h"] == 50, "还原后预留带回到 50px", "还原后预留带 = %s px，期望 50" % reset["h"])

    # 窄屏（当年小屏机型宽度）：标题上移到预留带后，两段都不该再换行
    page.set_viewport_size({"width": 320, "height": 720})
    page.wait_for_timeout(520)          # 等视口变化触发的重绘防抖（220ms）走完
    narrow = page.evaluate("""() => {
      const b = document.querySelector('.topband');
      const h = document.querySelector('.topband h1');
      const bar = document.querySelector('.topbar');
      const d = document.documentElement;
      return {titleH: Math.round(h.getBoundingClientRect().height),
              titleW: Math.round(h.getBoundingClientRect().width),
              bandW: Math.round(b.getBoundingClientRect().width),
              barH: Math.round(bar.getBoundingClientRect().height),
              sw: d.scrollWidth, cw: d.clientWidth};
    }""")
    check(narrow["titleH"] <= 32 and narrow["barH"] == 38 and narrow["sw"] <= narrow["cw"] + 1,
          "320px 窄屏：标题仍单行（高 %dpx / 可用 %dpx）、第二行 %dpx 不换行、无横向滚动"
          % (narrow["titleH"], narrow["bandW"] - 144, narrow["barH"]),
          "窄屏异常：%s" % narrow)
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(520)

    print("—— 科技树视图 ——")
    page.screenshot(path=str(OUT / "tree.png"), full_page=True)

    # 首页导语：一段史诗式题引 + 一行统计，题引之后不再有说明段；标题不与顶栏那条带子重名
    lead = page.evaluate("""() => {
      const box = document.querySelector('.tree-intro');
      const q = box.querySelector('.lead');
      const cs = getComputedStyle(q);
      return {h2: box.querySelector('h2').textContent,
              q: q.textContent, paras: box.querySelectorAll('p').length,
              stats: box.querySelector('.tree-stats').textContent,
              band: document.getElementById('title').textContent,
              serif: cs.fontFamily.indexOf('Georgia') >= 0,
              size: Math.round(parseFloat(cs.fontSize)), rule: cs.borderLeftWidth};
    }""")
    check(lead["q"].startswith("「从水下第一个生命的萌芽开始")
          and "从早期文明的摇篮到浩瀚星宇。" in lead["q"]
          and lead["paras"] == 1
          and lead["h2"] != lead["band"] and lead["serif"] and lead["rule"] == "2px"
          and ("%d 项科技" % N_TECH) in lead["stats"],
          "首页导语：%d 字题引（衬线 %dpx + 左侧 %s 规线）+ 统计行，别无说明段；"
          "标题「%s」不与顶栏重名"
          % (len(lead["q"]), lead["size"], lead["rule"], lead["h2"]),
          "首页导语异常：%s" % lead)

    eras = page.locator(".era").count()
    nodes = page.locator(".node").count()
    check(eras == N_ERA and nodes == N_TECH,
          "时代 %d 个 / 节点 %d 个（与 data.js 一致）" % (eras, nodes),
          "时代 %d、节点 %d，期望 %d / %d" % (eras, nodes, N_ERA, N_TECH))

    per_era = page.evaluate("""() => {
      const out = [];
      document.querySelectorAll('.era').forEach(s => out.push(s.querySelectorAll('.node').length));
      return out;
    }""")
    check(per_era == PER_ERA,
          "每个时代的节点数 %s" % per_era,
          "每个时代节点数 = %s，期望 %s" % (per_era, PER_ERA))

    edges = page.evaluate("""() => {
      const svg = document.getElementById('edges');
      return {p: svg.querySelectorAll('path').length, a: svg.querySelectorAll('polygon').length};
    }""")
    check(edges["p"] == N_EDGE and edges["a"] == N_EDGE,
          "前置连线 %d 条（path + 箭头各一份）" % edges["p"],
          "连线 path %d / 箭头 %d，期望各 %d" % (edges["p"], edges["a"], N_EDGE))

    # 时代是左侧立柱而不是横幅：立柱要窄，且没有任何一条连线伸进立柱区
    rail = page.evaluate("""() => {
      const rails = Array.from(document.querySelectorAll('.era-rail')).map(e => e.getBoundingClientRect());
      let hit = 0;
      const paths = document.querySelectorAll('#edges path');
      paths.forEach(p => {
        const r = p.getBoundingClientRect();
        for (const b of rails) {
          if (r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top) { hit++; break; }
        }
      });
      return {rails: rails.length, railW: rails.length ? Math.round(rails[0].width) : 0,
              hit, paths: paths.length};
    }""")
    check(rail["rails"] == N_ERA and rail["railW"] <= 90 and rail["hit"] == 0,
          "时代立柱 %d 根、宽 %dpx，%d 条连线无一伸进立柱区" % (rail["rails"], rail["railW"], rail["paths"]),
          "立柱布局异常：%s（时代横幅可能又在挡线）" % rail)

    root_tags = page.locator(".node .n-tag.root").count()
    future_tags = page.locator(".era[data-era='future'] .node .n-tag.future").count()
    check(root_tags == N_ROOT and future_tags == PER_ERA[-1],
          "起点标签 %d 个、前瞻标签 %d 个" % (root_tags, future_tags),
          "起点标签 %d（期望 %d）、前瞻标签 %d（期望 %d）"
          % (root_tags, N_ROOT, future_tags, PER_ERA[-1]))

    over = page.evaluate("""() => {
      const d = document.documentElement;
      return {sw: d.scrollWidth, cw: d.clientWidth};
    }""")
    check(over["sw"] <= over["cw"] + 1,
          "无横向滚动（scrollWidth=%d ≤ clientWidth=%d）" % (over["sw"], over["cw"]),
          "存在横向滚动：scrollWidth=%d > clientWidth=%d" % (over["sw"], over["cw"]))

    print("—— 背景音乐 ——")
    page.wait_for_selector("html.has-bgm", timeout=15000)      # 首屏之后才解码，这里等它挂上
    page.wait_for_timeout(200)
    bgm = page.evaluate("""() => {
      const b = document.getElementById('bgmBtn');
      const cs = getComputedStyle(b);
      return {b64: (window.TT_BGM || '').length,
              shown: cs.display !== 'none',
              pressed: b.getAttribute('aria-pressed'),
              on: b.className.indexOf('on') >= 0,
              ctx: !!(window.AudioContext || window.webkitAudioContext)};
    }""")
    check(bgm["b64"] == BGM_B64 and bgm["b64"] > 0,
          "页面拿到的 base64 与磁盘一致（%d 字符 ≈ 解码后 %d KB）" % (bgm["b64"], bgm["b64"] * 3 // 4 // 1024),
          "载荷长度不一致：页面 %d / 磁盘 %d" % (bgm["b64"], BGM_B64))
    check(bgm["shown"] and bgm["pressed"] == "false" and not bgm["on"],
          "解码成功才亮出音乐开关，且未出声时显示为「静音」（不骗人）",
          "音乐开关初始态异常：%s" % bgm)

    page.click("#bgmBtn")
    page.wait_for_timeout(150)
    on = page.evaluate("""() => {
      const b = document.getElementById('bgmBtn');
      return {pressed: b.getAttribute('aria-pressed'), on: b.className.indexOf('on') >= 0,
              saved: (function(){ try { return localStorage.getItem('tt.bgm'); } catch (e) { return 'n/a'; } })()};
    }""")
    check(on["pressed"] == "true" and on["on"] and on["saved"] == "1",
          "点一下开始出声：按钮转成「响着」并记住偏好（tt.bgm=1）",
          "起播状态异常：%s" % on)

    page.click("#bgmBtn")
    page.wait_for_timeout(150)
    off = page.evaluate("""() => {
      const b = document.getElementById('bgmBtn');
      return {pressed: b.getAttribute('aria-pressed'),
              saved: (function(){ try { return localStorage.getItem('tt.bgm'); } catch (e) { return 'n/a'; } })()};
    }""")
    check(off["pressed"] == "false" and off["saved"] == "0",
          "再点一下静音并写进存档（tt.bgm=0），下次进来仍是静音",
          "静音状态异常：%s" % off)

    print("—— 搜索 ——")
    page.fill("#q", "蒸汽")
    page.wait_for_timeout(60)
    hits = page.locator(".node.hit").count()
    dimmed = page.locator(".node.dim").count()
    check(hits >= 1 and dimmed == N_TECH - hits,
          "搜索「蒸汽」命中 %d 项、其余 %d 项变淡" % (hits, dimmed),
          "搜索命中 %d 项、变淡 %d 项（期望 %d）" % (hits, dimmed, N_TECH - hits))
    page.screenshot(path=str(OUT / "tree-search.png"), full_page=True)
    page.click("#qClear")
    page.wait_for_timeout(60)
    check(page.locator(".node.dim").count() == 0, "清除搜索后节点全部恢复",
          "清除搜索后仍有变淡节点")

    print("—— 选中与脉络 ——")
    page.click('.node[data-id="steam-engine"]')
    page.wait_for_timeout(120)
    sel = page.evaluate("""() => {
      const bar = document.getElementById('selbar');
      const node = document.querySelector('.node[data-id="steam-engine"]');
      const far = document.querySelector('.node[data-id="language"]');
      return {
        barShown: bar.className.indexOf('show') >= 0,
        name: document.getElementById('selName').textContent,
        meta: document.getElementById('selMeta').textContent,
        isSel: node.className.indexOf('sel') >= 0,
        farDim: far.className.indexOf('dim') >= 0,
        hot: document.getElementById('edges').querySelectorAll('path.hot').length,
        lit: document.getElementById('edges').querySelectorAll('path[opacity="0.95"]').length
      };
    }""")
    check(sel["barShown"] and sel["isSel"] and sel["farDim"] and sel["hot"] > 0,
          "选中「%s」：操作条出现、节点高亮、无关节点变淡、%d 条连线点亮" % (sel["name"], sel["hot"]),
          "选中状态异常：%s" % sel)
    check("前置" in sel["meta"] and "后续" in sel["meta"],
          "操作条显示脉络统计（%s）" % sel["meta"], "操作条统计异常：%s" % sel["meta"])
    page.screenshot(path=str(OUT / "tree-selected.png"), full_page=True)

    print("—— 详情页 ——")
    page.click("#selGo")
    page.wait_for_selector(".detail .hero")
    check(page.url.endswith("#/t/steam-engine") and page.locator(".detail h2").inner_text() == "蒸汽机",
          "进入 #/t/steam-engine（标题：蒸汽机）",
          "路由或标题异常：%s / %s" % (page.url, page.locator(".detail h2").inner_text()))

    sub = page.locator("#subtitle").inner_text()
    check(sub == "蒸汽机" and sub != "详情",
          "详情页第二行写着当前条目名「%s」（不是干巴巴的「详情」）" % sub,
          "详情页副标题异常：%r" % sub)

    blocks = page.locator(".block").count()
    specs_n = page.locator(".spec").count()
    feats_n = page.locator(".feats li").count()
    check(blocks == 5 and specs_n == 4 and feats_n == 3,
          "5 个区块 / 4 项参数 / 3 条亮点",
          "区块 %d、参数 %d、亮点 %d，期望 5 / 4 / 3" % (blocks, specs_n, feats_n))

    pills = page.locator(".badge-row .cat-badge").inner_text()
    check("工业时代" in pills and "Ⅵ" in pills,
          "详情页时代徽标正确（%s）" % pills, "时代徽标异常：%s" % pills)

    rels = page.evaluate("""() => {
      const b = document.querySelectorAll('.block')[2];
      return {n: b.querySelectorAll('.rel').length, none: b.querySelectorAll('.rel.none').length,
              ids: Array.prototype.map.call(b.querySelectorAll('.rel[data-goto]'), e => e.getAttribute('data-goto'))};
    }""")
    check(rels["n"] >= 3 and rels["none"] == 0,
          "前置 / 后续共 %d 个可点跳转的条目 %s" % (rels["n"], rels["ids"]),
          "前置 / 后续区块异常：%s" % rels)

    prompt = page.locator(".prompt-box pre").inner_text()
    check(prompt.startswith(STYLE_HEAD) and "cast-iron stationary steam engine" in prompt,
          "提示词 = 统一风格串 + 条目主体（%d 字）" % len(prompt),
          "提示词拼接异常：%s" % prompt[:80])

    page.wait_for_timeout(300)
    hero = page.evaluate("""() => {
      const i = document.querySelector('.hero .shot-img');
      return {src: i ? (i.getAttribute('src') || '') : '',
              nw: i && i.naturalWidth ? i.naturalWidth : 0,
              hidden: i ? getComputedStyle(i).display === 'none' : true};
    }""")
    check(hero["nw"] > 0 and not hero["hidden"] and hero["src"].endswith("steam-engine.webp"),
          "详情页大图已加载（%s · 宽 %dpx）" % (hero["src"], hero["nw"]),
          "详情大图未加载：%s" % hero)

    share_off = page.evaluate("""() => ({
      has: document.documentElement.className.indexOf('has-share') >= 0,
      btn: document.querySelectorAll('.share').length})""")
    check(not share_off["has"] and share_off["btn"] == 0,
          "拿不到 postNote 时分享整块隐藏（能力检测而非 UA 判断）",
          "不该出现分享按钮：%s" % share_off)

    detail_text = page.evaluate("() => document.querySelector('.detail').innerText")
    check("assets/img" not in detail_text and ".webp" not in detail_text,
          "详情页不含仓库路径 / 文件名等开发信息",
          "详情页出现开发信息：%s" % detail_text[:120])
    page.screenshot(path=str(OUT / "detail.png"), full_page=True)

    print("—— 前置跳转 ——")
    target = rels["ids"][0]
    page.click('.rel[data-goto="%s"]' % target)
    page.wait_for_timeout(120)
    check(page.url.endswith("#/t/" + target),
          "点前置条目跳到 #/t/%s（%s）" % (target, page.locator(".detail h2").inner_text()),
          "前置跳转失败：%s" % page.url)

    print("—— 返回科技树 ——")
    page.click(".fab-back")
    page.wait_for_selector(".node")
    back = page.evaluate("""() => ({
      hash: location.hash,
      nodes: document.querySelectorAll('.node').length,
      paths: document.getElementById('edges').querySelectorAll('path').length
    })""")
    check(back["hash"] == "#/tree" and back["nodes"] == N_TECH and back["paths"] == N_EDGE,
          "返回科技树：%d 个节点、%d 条连线重新画好" % (back["nodes"], back["paths"]),
          "返回科技树后异常：%s" % back)

    print("—— 宽屏三列（断点 520px）——")
    page.set_viewport_size({"width": 600, "height": 844})
    page.wait_for_timeout(520)          # 视口变化后 220ms 防抖重绘
    wide = page.evaluate("""() => {
      const rows = {};
      document.querySelectorAll('.era[data-era="prehistoric"] .node').forEach(n => {
        const t = Math.round(n.getBoundingClientRect().top);
        rows[t] = (rows[t] || 0) + 1;
      });
      const counts = Object.keys(rows).map(k => rows[k]);
      const d = document.documentElement;
      return {nodes: document.querySelectorAll('.node').length,
              firstRow: Math.max.apply(null, counts),
              paths: document.getElementById('edges').querySelectorAll('path').length,
              sw: d.scrollWidth, cw: d.clientWidth};
    }""")
    check(wide["nodes"] == N_TECH and wide["firstRow"] == 3 and wide["paths"] == N_EDGE
          and wide["sw"] <= wide["cw"] + 1,
          "600px 视口：首行 %d 列、%d 个节点、%d 条连线、无横向滚动"
          % (wide["firstRow"], wide["nodes"], wide["paths"]),
          "宽屏三列异常：%s" % wide)
    page.screenshot(path=str(OUT / "tree-wide.png"), full_page=True)
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(520)

    print("—— 图鉴视图 ——")
    page.locator(".seg button", has_text="图鉴").first.click()
    page.wait_for_selector(".card")
    secs = page.locator(".section").count()
    cards = page.locator(".card").count()
    check(secs == N_ERA and cards == N_TECH,
          "图鉴：%d 个时代分组 / %d 张卡片" % (secs, cards),
          "图鉴分组 %d、卡片 %d，期望 %d / %d" % (secs, cards, N_ERA, N_TECH))

    ph = page.evaluate("""() => {
      const box = document.querySelector('.cat-cover .shot');
      const img = box.querySelector('img.shot-img');
      const nm = box.querySelector('.shot-ph .nm');
      return {name: nm ? nm.textContent : '', hidden: getComputedStyle(img).display === 'none',
              h: Math.round(box.getBoundingClientRect().height)};
    }""")
    check(ph["name"] == FIRST_ERA_ZH + " · 时代封面" and ph["h"] == 104,
          "时代封面占位块显示「%s」、高度 %dpx" % (ph["name"], ph["h"]),
          "封面占位块异常：%s" % ph)
    page.wait_for_timeout(400)          # 等 IntersectionObserver 就近加载完成
    imgs = page.evaluate("""() => {
      const all = Array.prototype.slice.call(document.querySelectorAll('.card .shot-img'));
      const started = all.filter(i => i.getAttribute('src'));
      return {total: all.length, started: started.length,
              loaded: started.filter(i => i.naturalWidth > 0).length,
              hidden: started.filter(i => getComputedStyle(i).display === 'none').length,
              first: started.length ? started[0].getAttribute('src') : '',
              firstW: started.length ? started[0].naturalWidth : 0};
    }""")
    check(imgs["firstW"] > 0 and imgs["hidden"] == 0,
          "首屏卡片配图已加载（%s · 宽 %dpx），占位块被实图盖住" % (imgs["first"], imgs["firstW"]),
          "配图未加载 / 占位块残留：%s" % imgs)
    check(imgs["loaded"] == imgs["started"] and imgs["started"] >= 4,
          "已开始加载的 %d 张配图全部成功（无 404、后缀匹配）" % imgs["started"],
          "有配图加载失败：%s" % imgs)
    page.screenshot(path=str(OUT / "list.png"), full_page=True)

    page.locator(".card").first.click()
    page.wait_for_selector(".detail .hero")
    check("#/t/" in page.url, "从图鉴卡片进入详情（%s）" % page.url, "图鉴卡片跳转失败：%s" % page.url)

    print("—— 分享到小红书（注入桥桩）——")
    sp = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
    # 注意：add_init_script 的字符串是「直接执行的脚本」，不要写成箭头函数（那只是个从不执行的表达式）
    sp.add_init_script("""
      window.__share = [];
      window.xhs = { miniTool: {
        writeTempFile: function (o) {
          window.__share.push({api: 'writeTempFile', head: String(o.data).slice(0, 22),
                               len: String(o.data).length});
          return Promise.resolve({filePath: '/tmp/tt-share.webp'});
        },
        postNote: function (o) {
          window.__share.push({api: 'postNote', title: o.title, content: o.content,
                               pageType: o.pageType, url: o.mediaInfo.image_resources[0].url});
          return Promise.resolve({errMsg: 'postNote:ok'});
        }
      }};
    """)
    sp.goto(URL + "#/t/steam-engine")
    sp.wait_for_selector("#shareBtn")
    sp.wait_for_function(
        "() => { const i = document.querySelector('.hero .shot-img'); return !!(i && i.naturalWidth > 0); }")
    sp.wait_for_timeout(150)
    ready = sp.evaluate("""() => { const b = document.getElementById('shareBtn');
      return {cls: b.className, dis: b.disabled, has: document.documentElement.className.indexOf('has-share') >= 0}; }""")
    check(ready["has"] and "off" not in ready["cls"] and not ready["dis"],
          "拿得到 postNote 时分享按钮出现，且原图到货后转为可用",
          "分享按钮状态异常：%s" % ready)

    sp.click("#shareBtn")
    sp.wait_for_timeout(500)
    rec = sp.evaluate("window.__share")
    sp.screenshot(path=str(OUT / "share.png"), full_page=False)
    ok_calls = (len(rec) == 2 and rec[0]["api"] == "writeTempFile" and rec[1]["api"] == "postNote")
    check(ok_calls and rec[0]["head"].startswith("data:image/"),
          "先 writeTempFile 落临时文件（%s…，%d 字符）再 postNote" % (rec[0]["head"] if rec else "?", rec[0]["len"] if rec else 0),
          "桥调用异常：%s" % rec)
    note = rec[1] if len(rec) > 1 else {}
    tech_intro = [t["intro"] for t in TECHS if t["id"] == "steam-engine"][0]
    check(note.get("title") == "人类科技树 · 蒸汽机" and len(note.get("title") or "") <= 20,
          "标题为科技名且 ≤20（%s）" % note.get("title"), "标题异常：%r" % note.get("title"))
    check(note.get("pageType") == "photo_publish" and note.get("url") == "/tmp/tt-share.webp",
          "pageType=photo_publish，媒体用 writeTempFile 返回的 filePath",
          "图文参数异常：%s" % note)
    body = note.get("content") or ""
    check(body.startswith(tech_intro) and "前置：" in body and "后续：" in body
          and "—— 人类科技树" in body and len(body) <= 1000,
          "正文是该科技介绍 + 时代年份 + 前置 / 后续（%d 字）" % len(body),
          "正文异常：%s" % body[:80])
    after = sp.evaluate("""() => { const b = document.getElementById('shareBtn'); return {dis: b.disabled}; }""")
    check(not after["dis"], "唤起后按钮恢复可点（busy 复位）", "按钮未复位：%s" % after)
    sp.close()

    check(not js_errors, "无 JS 运行时错误", "JS 报错：%s" % js_errors[:3])
    browser.close()

if failures:
    print("\n自检失败 %d 项：" % len(failures))
    for f in failures:
        print("  ✗", f)
    sys.exit(1)
print("\n自检全部通过 ✅  截图：%s" % OUT)
