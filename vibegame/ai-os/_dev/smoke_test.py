# -*- coding: utf-8 -*-
"""ai-os v1 无头自检（playwright）。

断言导航栈 / 安全区变量 / 顶部净空 / Chrome61 基线扫描，并输出回归截图到 _dev/_shots/。
运行：PYTHONUTF8=1 <python> smoke_test.py
"""
import io
import math
import os
import re
import sys
import time

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
SHOTS = os.path.join(HERE, "_shots")
# 仓库根 TRACKS.md：应用商店的数据真源（build.py 解析后注入 main.js）
TRACKS_MD = os.path.normpath(os.path.join(HERE, "..", "..", "..", "TRACKS.md"))


def find_chrome():
    """定位本机 playwright chromium；找不到则回退到 playwright 自带。"""
    import glob
    cands = [
        os.environ.get("CHROME_EXE"),
        r"C:\Users\dingj\AppData\Local\ms-playwright\chromium-1243\chrome-win64\chrome.exe",
        r"C:\Users\ASUS\AppData\Local\ms-playwright\chromium-1243\chrome-win64\chrome.exe",
    ]
    for c in cands:
        if c and os.path.exists(c):
            return c
    hits = glob.glob(os.path.expanduser(
        r"~\\AppData\\Local\\ms-playwright\\chromium-*\\chrome-win64\\chrome.exe"))
    return hits[0] if hits else None


CHROME = find_chrome()

FAIL = []

# 月相：与产品同一套常量近似（平均朔望月 + 2000-01-06 18:14 UTC 朔），但由测试独立复算一遍，
# 用来对拍「月相 / 照亮比例」读数 —— UI 与算术任何一处漂移都会被这条断言抓住。
WX_SYNODIC = 29.530588853
WX_REF_NEW = 947182440000


def wx_phase_at(ms):
    """返回 (月相名, 照亮百分比)。"""
    age = ((ms - WX_REF_NEW) / 86400000.0) % WX_SYNODIC
    deg = age / WX_SYNODIC * 360.0
    if deg < 8 or deg > 352:
        name = "新月"
    elif deg < 82:
        name = "蛾眉月"
    elif deg < 98:
        name = "上弦月"
    elif deg < 172:
        name = "盈凸月"
    elif deg < 188:
        name = "满月"
    elif deg < 262:
        name = "亏凸月"
    elif deg < 278:
        name = "下弦月"
    else:
        name = "残月"
    lit = round((1 - math.cos(math.radians(deg))) / 2 * 100)
    return name, lit


def tracks_items():
    """独立复算仓库根 TRACKS.md 里的项目清单（与 build.py 各写一遍解析）。

    用于跟「应用商店」注入的数据、以及上屏的 DOM 两两对拍：产品侧解析一旦漂移
    （漏分类 / 漏项目 / 把 .skill 技能当应用 / 顺序错位 / 文本被转义改样），
    这条断言就会抓住。返回 [{"tag", "name", "items":[(名称, 目录, 定位, 状态)]}]。
    """
    head = re.compile(r"^##\s*#([a-z]+)[\s\u3000]*(.+?)\s*[（(]\d+[）)]\s*$")
    groups, cur = [], None
    with io.open(TRACKS_MD, encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            m = head.match(line)
            if m:
                cur = {"tag": m.group(1), "name": m.group(2).strip(), "items": []}
                groups.append(cur)
                continue
            if cur is None or not line.startswith("|"):
                continue
            cells = [c.strip() for c in line.strip("|").split("|")]
            if len(cells) < 4:
                continue
            name, path = cells[0], cells[1].strip("`")
            if not path.endswith("/") or path.startswith(".skill/"):
                continue
            cur["items"].append((name, path, cells[2], cells[3]))
    return [g for g in groups if g["items"]]


def store_state_of(status):
    """独立复算 _dev/build.py 的 store_state()：TRACKS 物料状态原文 -> (商店标签, 语气色)。

    商店卡片只上屏这个短标签（原文是文档口径，不上屏），故折算规则一旦漂移
    （例如原文没改、标签却变了），对拍就会失败。
    """
    if any(k in status for k in ("已发布", "完整", "可玩", "已打包")):
        return "已上架", "ok"
    if "自用" in status:
        return "内部自用", "dim"
    if any(k in status for k in ("待", "未", "缺")):
        return "开发中", "warn"
    return "已收录", "dim"


def store_tagline_of(desc):
    """独立复算 _dev/build.py 的 store_tagline()：TRACKS 定位 -> 商店副标题。

    规则：砍掉第一个「（」或「：」之后的部分（技术括注 / 定义式展开），其余留给
    卡片的一行省略号。目的是让商店副标题不带实现细节与上游路径。
    """
    cut = len(desc)
    for sep in ("（", "："):
        i = desc.find(sep)
        if i > 0 and i < cut:
            cut = i
    return desc[:cut].strip()


def check(name, cond, extra=""):
    if cond:
        print("  ok  " + name)
    else:
        print("  FAIL " + name + (" | " + extra if extra else ""))
        FAIL.append(name)


def wait_home(pg, timeout=8000):
    """等开机动画结束（#bootScreen 被移除）再断言主屏，不用固定 sleep 抢跑。"""
    pg.wait_for_selector("#bootScreen", state="detached", timeout=timeout)
    pg.wait_for_timeout(250)


def fake_container(build_version=9462004, launch="sync", seed_wmask=None):
    """注入假容器 window.xhs（能力清单 §3.6 版本判断 / §3.7 Storage）。

    launch: 'sync' 同步带 launchOptions / 'async' 只给异步 getLaunchOptions / 'none' 两者都没有。
    缓存只落在 localStorage.__fake_xhs_store，调用日志记到 window.__xhsCalls，
    供「容器通道是否生效 / 版本门槛 / 降级通道→容器迁移」断言使用。
    """
    lo = ("{ miniToolEnv: { buildVersion: %d } }" % build_version) if launch == "sync" else "null"
    has_async = "true" if launch == "async" else "false"
    seed = ""
    if seed_wmask is not None:
        seed = ("try { localStorage.setItem('aios_wmask', '%s'); } catch (e) {}" % seed_wmask)
    return """
(function () {
  var BK = '__fake_xhs_store';
  var calls = window.__xhsCalls = [];
  var storage = {};
  try { storage = JSON.parse(localStorage.getItem(BK) || '{}') || {}; } catch (e) { storage = {}; }
  function persist() { try { localStorage.setItem(BK, JSON.stringify(storage)); } catch (e) {} }
  var BV = %d;
  window.__fakeXhsStorage = storage;
  // 只在首次加载播种：复现「降级通道已有数据、容器里没有」的升级迁移场景
  if (localStorage.getItem(BK) === null) { %s }
  var api = {
    setStorage: function (o) {
      calls.push('setStorage:' + o.key);
      storage[o.key] = o.data; persist();
      if (o.success) { o.success({ errMsg: 'setStorage:ok' }); }
    },
    getStorage: function (o) {
      calls.push('getStorage:' + o.key);
      if (Object.prototype.hasOwnProperty.call(storage, o.key)) {
        o.success({ errMsg: 'getStorage:ok', data: storage[o.key] });
      } else { o.fail({ errMsg: 'getStorage:fail' }); }
    },
    getStorageInfo: function (o) {
      calls.push('getStorageInfo');
      if (o.success) {
        o.success({ errMsg: 'getStorageInfo:ok', keys: Object.keys(storage),
                    currentSize: 2, limitSize: 10240 });
      }
    }
  };
  var HAS_ASYNC = %s;
  if (HAS_ASYNC) {
    api.getLaunchOptions = function () { return Promise.resolve({ miniToolEnv: { buildVersion: BV } }); };
  }
  window.xhs = { launchOptions: %s, miniTool: api };
})();
""" % (build_version, seed, has_async, lo)


BANNED_JS = ["?.", "??", ".flat(", "replaceAll(", "fromEntries", "matchAll",
             "trimStart", "trimEnd", "||=", "&&=", "??=", "at(", "structuredClone"]
# 'at(' 易误报（如 charAt(），单独用词边界
BANNED_JS_RE = [r"\bat\(", r"\?\.", r"\?\?", r"\.flat\(", r"replaceAll\(",
                r"Object\.fromEntries", r"\|\|=", r"&&=", r"\?\?="]
BANNED_CSS = ["aspect-ratio", ":has(", "inset:", "clamp(", "dvh", "svh",
              "container-type", "@layer", "color-mix(", "oklch("]


def scan_baseline():
    with io.open(os.path.join(ROOT, "main.js"), encoding="utf-8") as f:
        js = f.read()
    with io.open(os.path.join(ROOT, "index.html"), encoding="utf-8") as f:
        html = f.read()
    for pat in BANNED_JS_RE:
        check("js 基线: 无 " + pat, re.search(pat, js) is None)
    for tok in ["aspect-ratio", ":has(", "inset:", "clamp(", "dvh", "svh", "@layer", "color-mix("]:
        check("css 基线: 无 " + tok, tok not in html)
    # flex gap 不得作为唯一实现：只允许 grid-gap（排除 --top-gap 等变量名）
    bad = re.search(r"(?<![-\w])gap\s*:", html)
    check("css 基线: flex 间距不用 gap（仅 grid-gap）", bad is None, str(bad))
    # backdrop-filter 必须落在 @supports 增强块内
    for m in re.finditer(r"backdrop-filter", html):
        seg = html[max(0, m.start() - 200):m.start()]
        check("css 基线: backdrop-filter 在 @supports 内", "@supports" in seg)
        break


def main():
    os.makedirs(SHOTS, exist_ok=True)
    scan_baseline()
    url = "file:///" + os.path.join(ROOT, "index.html").replace("\\", "/")

    with sync_playwright() as p:
        # --allow-file-access-from-files：本用例以 file:// 直开页面，而 WebGL 会把跨源图片判为
        # 「不可上传纹理」——不给这个开关，月面贴图在 file:// 下必然加载失败（容器里走 https，
        # 同源不受影响）。加了它，file:// 与容器两条路的贴图行为才一致，断言才有意义。
        launch_args = ["--allow-file-access-from-files"]
        b = (p.chromium.launch(executable_path=CHROME, args=launch_args) if CHROME
             else p.chromium.launch(args=launch_args))

        def new_page(init_script=None):
            """独立上下文（存储互不串味），可预注入容器环境。"""
            c = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                              is_mobile=True, has_touch=True)
            page = c.new_page()
            if init_script:
                page.add_init_script(init_script)
            return page

        ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                            is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        errors = []
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(url)
        # 开机启动屏约 1.8s + 淡出 .42s；等其移除后再断言主屏
        wait_home(pg)

        check("无 console/page 错误", len(errors) == 0, "; ".join(errors[:3]))
        topgap = pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--top-gap').trim()")
        check("顶部预留 --top-gap=50px", topgap == "50px", topgap)
        t = pg.inner_text("#sbTime")
        check("状态栏时钟格式", re.match(r"^\d{2}:\d{2}$", t) is not None, t)
        box = pg.evaluate("(function(){var t=document.getElementById('sbTime').getBoundingClientRect();"
                          "var s=document.querySelector('.sb-signal').getBoundingClientRect();"
                          "var w=window.innerWidth;return [t.left,t.right,s.left,s.right,w];})()")
        check("状态栏真机布局：时间居左、图标居右", box[1] < box[2] and box[0] < box[4] * 0.35
              and box[3] > box[4] * 0.65, str(box))
        # 无宿主（纯浏览器 / 模拟器未注入）时自绘状态栏必须可见——真机观感靠它
        check("无宿主时自绘状态栏可见", pg.evaluate(
            "getComputedStyle(document.querySelector('.statusbar')).visibility") == "visible")
        # 预留带高度必须有普通值兜底：--safe-top 是链式 calc(var() env())，
        # 任一段失效会让 height 整条 computed-value 失效并回退 auto（≈24px，内容顶到最上面）
        check("无宿主时预留带 = 50px（普通值兜底生效）", pg.evaluate(
            "Math.round(document.querySelector('.statusbar').getBoundingClientRect().height)") == 50)
        # 顶部预留带内左右净空无按钮
        n_btn_top = pg.evaluate("document.querySelectorAll('.statusbar button, .phead button').length")
        check("顶部带/页头无按钮", n_btn_top == 0, str(n_btn_top))
        # 主屏 7 图标 + Dock 4
        check("主屏 7 图标", pg.evaluate("document.querySelectorAll('.home-grid .app-tile').length") == 7)
        check("Dock 4 图标且无标签", pg.evaluate("document.querySelectorAll('.dock .app-tile').length") == 4
              and pg.evaluate("document.querySelectorAll('.dock .app-name').length") == 0)
        # 容器视口比纯浏览器矮，主屏剩余空间被吃满时只剩这条外边距，必须留够
        check("Dock 与金刚键栏之间留白 ≥24px", pg.evaluate(
            "Math.round(parseFloat(getComputedStyle(document.querySelector('.dock')).marginBottom))") >= 24)
        # 底部安全区（容器注入 / 真机 Home Indicator）不得挤压金刚键：栏高必须 = 52px + 安全区。
        # 回归：旧写法 height:52px + padding-bottom:safe，在 border-box 下把内容盒压成 52-safe，
        # 48px 的键居中后向上溢出到栏顶之上、上方毫无空间 —— 纯浏览器 --safe-bottom=0 时看不出，
        # 一进容器（注入安全区）就露馅。
        pg.evaluate("document.documentElement.style.setProperty('--safe-area-inset-bottom','34px')")
        pg.wait_for_timeout(200)
        safe = pg.evaluate(
            "(function(){var n=document.querySelector('.sysnav').getBoundingClientRect();"
            "var k=document.querySelector('.syskey').getBoundingClientRect();"
            "return [Math.round(n.height),Math.round(k.top-n.top),Math.round(n.bottom-k.bottom)];})()")
        check("底部安全区不挤压金刚键（栏高 52+34，键上方有空间）",
              safe[0] == 86 and safe[1] >= 2 and safe[2] >= 34, str(safe))
        pg.evaluate("document.documentElement.style.setProperty('--safe-area-inset-bottom','0px')")
        pg.wait_for_timeout(150)
        # 质感 pass
        check("壁纸含颗粒层", "data:image/svg" in pg.evaluate(
            "getComputedStyle(document.body).backgroundImage"))
        check("图标顶部高光+内影+同色投影", pg.evaluate(
            "(function(){var s=getComputedStyle(document.querySelector('.home-grid .app-icon'));"
            "return s.backgroundImage.indexOf('radial-gradient')===0 && s.boxShadow.indexOf('inset')>=0;})()"))
        check("组件卡含内高光与发丝描边", pg.evaluate(
            "(function(){var s=getComputedStyle(document.querySelector('.widget'));"
            "return s.boxShadow.indexOf('inset')>=0;})()"))
        # 小组件
        check("时钟组件与状态栏同步", pg.evaluate(
            "document.querySelector('#wClock .w-clock-time').textContent") == t)
        check("时钟组件含日期与星期", pg.evaluate(
            "document.querySelector('#wClock .w-clock-sub').textContent").index("月") > 0
              and pg.evaluate("document.querySelector('#wClock .w-clock-sub').textContent").index("星期") > 0)
        check("模拟表盘指针已旋转", pg.evaluate(
            "document.querySelector('#wClock .w-mh').style.transform").index("rotate(") == 0)
        check("天气组件为一眼假设定", "月球" in pg.evaluate("document.querySelector('.w-city').textContent")
              and pg.evaluate("document.querySelector('.w-temp').textContent") == "-173°")
        check("天气组件带免责来源", "AI 编的" in pg.evaluate("document.querySelector('.w-src').textContent"))
        check("钱包组件默认打码", pg.evaluate(
            "document.querySelector('.w-bal').textContent") == "￥ -****")
        pg.click(".w-wallet")
        pg.wait_for_timeout(200)
        check("钱包点按显示余额", pg.evaluate(
            "document.querySelector('.w-bal').textContent") == "￥ -99,999")
        pg.reload()
        wait_home(pg)
        check("显示状态持久化", pg.evaluate(
            "document.querySelector('.w-bal').textContent") == "￥ -99,999")
        # 系统音效（DESIGN.md §4.11）：reload 后是干净会话 —— 还没发生任何手势，
        # 此时不得建 AudioContext（自动播放策略会拦住它，控制台还会留一条 warning）
        sfx0 = pg.evaluate("AIOS.soundStats()")
        check("音效词表齐备（系统语义命名，不是按页面命名）",
              all(n in pg.evaluate("AIOS.soundNames()")
                  for n in ["tap", "nav", "back", "open", "key", "eq", "ok", "wrong", "deny",
                            "win", "lose", "boom", "flip", "flag", "alarm", "over", "shot",
                            "sent", "msg", "call", "connect", "hangup"]))
        check("首个手势前不建 AudioContext（避开自动播放策略告警）",
              sfx0["ctx"] == "none" and sfx0["armed"] is False, str(sfx0))
        pg.click(".w-wallet")
        pg.wait_for_timeout(200)
        check("钱包再点恢复打码", pg.evaluate(
            "document.querySelector('.w-bal').textContent") == "￥ -****")
        sfx1 = pg.evaluate("AIOS.soundStats()")
        check("点击即发声（手势后建上下文，通用点击音计入）",
              sfx1["armed"] is True and sfx1["ctx"] != "none"
              and sfx1["plays"].get("tap", 0) >= 1, str(sfx1))
        pg.click("#wClock")
        pg.wait_for_timeout(300)
        check("时钟组件打开闹钟", pg.evaluate(
            "document.querySelector('.view:not(.hidden) .phead h1').textContent") == "闹钟")
        pg.click("#keyBack")
        pg.wait_for_timeout(300)
        pg.screenshot(path=os.path.join(SHOTS, "v2-home.png"))

        # 月球天气（§4.9）：主屏天气小组件是唯一入口；Three.js 渲染 —— 月相按当前时间算、且不自转。
        # 观测状态走 AIOS.weatherState() 快照（与 AIOS.storeBackend 同类只读接缝）；
        # 画面是否真的变了用元素截图字节比对，不依赖任何 2D getImageData。
        CELLS_JS = ("[document.querySelector('.view:not(.hidden) [data-f=phase]').textContent,"
                    "document.querySelector('.view:not(.hidden) [data-f=lit]').textContent,"
                    "document.querySelector('.view:not(.hidden) [data-f=age]').textContent,"
                    "document.querySelector('.view:not(.hidden) [data-f=sight]').textContent]")
        STAGE = ".view:not(.hidden) .wx-stage"
        pg.click("#wWeather")
        pg.wait_for_timeout(1200)
        check("天气小组件打开月球天气", pg.evaluate(
            "document.querySelector('.view:not(.hidden) .phead h1').textContent") == "月球天气")
        check("观测台单画布（Three.js 一个 canvas 承担星空+月球）", pg.evaluate(
            "document.querySelectorAll('.view:not(.hidden) .wx-stage canvas').length") == 1)
        ws = pg.evaluate("AIOS.weatherState()")
        check("WebGL 起得来（data-gl=ok）", ws is not None and ws["gl"] is True, str(ws))
        check("月面贴图来自 ./assets/moon.jpg（data-tex=ok）",
              ws is not None and ws["tex"] == "ok", str(ws))
        check("index.html 用本地 three.min.js（无 CDN）", pg.evaluate(
            "!!document.querySelector('script[src=\"./assets/three.min.js\"]')"))
        # 只保留天气：分段切换 / 月相滑块 / 显示设置 / 科普块全部不再存在
        check("只留天气（无分段·无滑块·无设置开关·无科普块）", pg.evaluate(
            "document.querySelectorAll('.view:not(.hidden) .wx-tabs, .view:not(.hidden) .wx-range,"
            " .view:not(.hidden) .switch, .view:not(.hidden) .wx-narr').length") == 0)
        check("天气读数与主屏组件同源", pg.evaluate(
            "document.querySelector('.view:not(.hidden) .wx-hero .h-temp').textContent") == "-173°"
              and "AI 编的" in pg.evaluate(
            "document.querySelector('.view:not(.hidden) .wx-src').textContent"))
        check("天气读数 12 格", pg.evaluate(
            "document.querySelectorAll('.view:not(.hidden) .wx-grid .wx-item').length") == 12)
        # 月相按当前时间推算：读数与测试独立复算的结果对拍（月相名精确相等，照亮比例 ±1%）
        exp_name, exp_lit = wx_phase_at(int(time.time() * 1000))
        cells = pg.evaluate(CELLS_JS)
        check("月相按当前时间推算（真机时钟对拍）",
              cells[0] == exp_name and abs(int(cells[1].rstrip("%")) - exp_lit) <= 1,
              "%s/%s vs 期望 %s/%d%%" % (cells[0], cells[1], exp_name, exp_lit))
        check("月龄与观测建议已回填", cells[2].endswith("天") and len(cells[3]) >= 4, str(cells))
        # 不自转：静置 900ms，相机与月球姿态快照一字不变，观测台画面字节也完全一致
        shot0 = pg.locator(STAGE).screenshot()
        pg.wait_for_timeout(900)
        shot1 = pg.locator(STAGE).screenshot()
        ws1 = pg.evaluate("AIOS.weatherState()")
        check("取消自转：姿态与画面都不动",
              shot0 == shot1 and (ws1["theta"], ws1["phi"], ws1["radius"], ws1["spin"]) ==
              (ws["theta"], ws["phi"], ws["radius"], ws["spin"]), str(ws1))
        pg.screenshot(path=os.path.join(SHOTS, "v2-weather.png"))
        # 拖动：相机 theta/phi 跟着改，画面字节也变；松手后立刻停住
        box = pg.locator(STAGE).bounding_box()
        pg.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        pg.mouse.down()
        pg.mouse.move(box["x"] + box["width"] / 2 + 70, box["y"] + box["height"] / 2, steps=6)
        pg.mouse.up()
        pg.wait_for_timeout(500)
        ws2 = pg.evaluate("AIOS.weatherState()")
        check("拖动旋转（相机 theta 变化、画面随之改变）",
              abs(ws2["theta"] - ws1["theta"]) > 0.05
              and pg.locator(STAGE).screenshot() != shot1, "%s -> %s" % (ws1["theta"], ws2["theta"]))
        pg.wait_for_timeout(700)
        check("拖动后同样不自转（松手即停）",
              pg.evaluate("AIOS.weatherState()")["theta"] == ws2["theta"])
        pg.click("#keyBack")
        pg.wait_for_timeout(300)
        check("返回回主屏且天气不占图标网格", pg.evaluate(
            "!document.querySelector('.home').classList.contains('hidden')")
              and pg.evaluate("document.querySelectorAll('.home-grid .app-tile').length") == 7
              and pg.evaluate("document.querySelectorAll('.dock .app-tile').length") == 4)

        # 月相由时间决定：注入固定时钟，分别验证「满月」与「蛾眉月」的读数、姿态与缩放
        for tag, age_days in (("满月", 14.765), ("蛾眉月", 5.9)):
            fixed = int(WX_REF_NEW + age_days * 86400000)
            exp_name, exp_lit = wx_phase_at(fixed)
            p7 = new_page("Date.now = function () { return %d; };" % fixed)
            p7.goto(url)
            wait_home(p7)
            p7.click("#wWeather")
            p7.wait_for_timeout(1200)
            cells = p7.evaluate(CELLS_JS)
            wsx = p7.evaluate("AIOS.weatherState()")
            check("固定时钟（%s）月相读数" % tag,
                  cells[0] == exp_name and abs(int(cells[1].rstrip("%")) - exp_lit) <= 1,
                  "%s/%s vs 期望 %s/%d%%" % (cells[0], cells[1], exp_name, exp_lit))
            check("固定时钟（%s）WebGL 与贴图就绪" % tag,
                  wsx is not None and wsx["gl"] is True and wsx["tex"] == "ok", str(wsx))
            if tag == "满月":
                # 满月：光从相机方向照来 —— 盘面最亮；滚轮拉近后相机半径应显著变小
                r1 = wsx["radius"]
                c = p7.locator(STAGE).bounding_box()
                p7.mouse.move(c["x"] + c["width"] / 2, c["y"] + c["height"] / 2)
                for _ in range(4):
                    p7.mouse.wheel(0, -300)
                p7.wait_for_timeout(400)
                r2 = p7.evaluate("AIOS.weatherState()")["radius"]
                check("滚轮拉近（相机半径变小）", r2 < r1 * 0.85, "%s -> %s" % (r1, r2))
                p7.screenshot(path=os.path.join(SHOTS, "v2-weather-full.png"))
            else:
                # 蛾眉月：日照角 ~72°，与满月画面对比应明显不同（晨昏线真的按相位摆过去了）
                shot_crescent = p7.locator(STAGE).screenshot()
                p7.screenshot(path=os.path.join(SHOTS, "v2-weather-crescent.png"))
                full = new_page("Date.now = function () { return %d; };"
                                % int(WX_REF_NEW + 14.765 * 86400000))
                full.goto(url)
                wait_home(full)
                full.click("#wWeather")
                full.wait_for_timeout(1200)
                check("蛾眉月与满月的观测台画面不同（光照按相位走）",
                      full.locator(STAGE).screenshot() != shot_crescent)
                full.close()
            p7.close()

        # 打开计算器 → v1 玩法：键盘输入 → = 出结果 → 判对错
        pg.locator('[aria-label="计算器"]').first.click()
        pg.wait_for_timeout(400)
        check("打开计算器视图", pg.evaluate(
            "!!document.querySelector('.view:not(.hidden) .phead h1') && "
            "document.querySelector('.view:not(.hidden) .phead h1').textContent") == "计算器")
        check("计算器键盘 17 键", pg.evaluate("document.querySelectorAll('.keypad .key').length") == 17)
        # 计算器是固定页（真机计算器观感）：内容区无滚动条，不可「翻页」
        fit = pg.evaluate("(function(){var b=document.querySelector('.view:not(.hidden) .pbody');"
                          "return [b.scrollHeight, b.clientHeight, getComputedStyle(b).overflowY];})()")
        check("计算器内容区不可滚动", fit[2] == "hidden" and fit[0] <= fit[1] + 1, str(fit))
        for k in ["7", "+", "8"]:
            pg.locator(".keypad .key", has_text=k).first.click()
        pg.wait_for_timeout(150)
        check("输入回显", pg.evaluate("document.querySelector('.calc-expr').textContent") == "7+8")
        foot_idle = pg.evaluate(
            "document.querySelector('.view:not(.hidden) .pfoot').getBoundingClientRect().height")
        pg.locator(".keypad .key", has_text="=").first.click()
        pg.wait_for_timeout(250)
        check("出结果后进入判定（键盘原位隐藏、露出对/错）", pg.evaluate(
            "getComputedStyle(document.querySelector('.keypad')).visibility") == "hidden"
              and not pg.evaluate("document.querySelector('.judge-row').classList.contains('hidden-row')"))
        foot_judge = pg.evaluate(
            "document.querySelector('.view:not(.hidden) .pfoot').getBoundingClientRect().height")
        check("判定阶段页脚不塌陷（按 = 前后不跳动）", abs(foot_judge - foot_idle) <= 1,
              "%.1f -> %.1f" % (foot_idle, foot_judge))
        geo = pg.evaluate(
            "(function(){var v=document.querySelector('.view:not(.hidden)');"
            "var j=v.querySelector('.judge-row').getBoundingClientRect();"
            "var k=v.querySelector('.keypad').getBoundingClientRect();"
            "return [Math.round(j.left), Math.round(j.right), Math.round(k.left), Math.round(k.right),"
            "Math.round(document.body.getBoundingClientRect().width)];})()")
        check("判定按钮与键盘左右对齐、不贴屏边",
              geo[0] == geo[2] and geo[1] == geo[3] and geo[0] > 0 and geo[1] < geo[4], str(geo))
        ask = pg.evaluate(
            "(function(){var f=document.querySelector('.view:not(.hidden) .calc-feedback');"
            "var s=getComputedStyle(f);return [f.className, s.fontSize, s.fontWeight, s.color];})()")
        check("判定提示醒目（ask 态 15px / 700 / accent 紫）",
              "ask" in ask[0] and ask[1] == "15px" and ask[2] in ("700", "bold")
              and ask[3] == "rgb(108, 76, 241)", str(ask))
        score_before = int(pg.evaluate(
            "document.querySelectorAll('.gstats [data-f=\"score\"]')[0].textContent"))
        pg.click(".view:not(.hidden) .judge-ok")
        pg.wait_for_timeout(250)
        check("判定一轮后轮次=1", pg.evaluate(
            "document.querySelectorAll('.gstats [data-f=\"rounds\"]')[0].textContent") == "1")
        score_after = int(pg.evaluate(
            "document.querySelectorAll('.gstats [data-f=\"score\"]')[0].textContent"))
        check("判定后分数按规则变化", score_after - score_before in (10, 15) or score_after == 0,
              "%d -> %d" % (score_before, score_after))
        sj = pg.evaluate("AIOS.soundStats()")["plays"]
        check("判定出声（ok / wrong 计入，判定音不叠通用点击音）",
              sj.get("ok", 0) + sj.get("wrong", 0) >= 1, str(sj))
        pg.wait_for_timeout(1800)
        check("判定后回到键盘", pg.evaluate(
            "getComputedStyle(document.querySelector('.keypad')).visibility") == "visible")
        check("判定后提示复位为引导态", pg.evaluate(
            "document.querySelector('.view:not(.hidden) .calc-feedback').className") == "calc-feedback")
        pg.screenshot(path=os.path.join(SHOTS, "v2-calc.png"))
        # Error 态（除零）：再输入应整体清空、从干净状态重新开始，不必手动按 C
        for k in ["5", "÷", "0"]:
            pg.locator(".keypad .key", has_text=k).first.click()
        pg.locator(".keypad .key", has_text="=").first.click()
        pg.wait_for_timeout(200)
        check("除零进 Error 态", pg.evaluate(
            "document.querySelector('.calc-shown').textContent") == "Error")
        check("Error 态提示为错误文案（no 态）", pg.evaluate(
            "document.querySelector('.view:not(.hidden) .calc-feedback').className") == "calc-feedback no")
        pg.locator(".keypad .key", has_text="7").first.click()
        pg.wait_for_timeout(150)
        err = pg.evaluate(
            "(function(){var v=document.querySelector('.view:not(.hidden)');"
            "return [v.querySelector('.calc-expr').textContent, v.querySelector('.calc-shown').textContent,"
            "v.querySelector('.calc-display').style.borderColor];})()")
        check("Error 后再输入：清空重来（表达式=7）", err[0] == "7" and err[1] == "7", str(err))
        check("Error 后再输入：错误描边复位", err[2] == "", str(err))
        pg.locator(".keypad .key", has_text="C").first.click()
        pg.wait_for_timeout(150)
        # 净高不足的小屏（容器/小屏机）：靠键盘行高压缩消化，仍不滚动、键盘仍贴底在屏内
        pg.set_viewport_size({"width": 360, "height": 640})
        pg.wait_for_timeout(300)
        small = pg.evaluate(
            "(function(){var v=document.querySelector('.view:not(.hidden)');"
            "var b=v.querySelector('.pbody');var kp=v.querySelector('.keypad');"
            "return [b.scrollHeight<=b.clientHeight+1, Math.round(kp.getBoundingClientRect().bottom),"
            "window.innerHeight, Math.round(kp.querySelector('.key').getBoundingClientRect().height),"
            "v.scrollHeight<=v.clientHeight+1];})()")
        check("小屏 360x640 不滚动且键盘贴底在屏内",
              small[0] and small[1] <= small[2] and small[3] >= 34 and small[4], str(small))
        pg.screenshot(path=os.path.join(SHOTS, "v2-calc-small.png"))
        # 极矮净高（横屏 / 被压扁的容器）：键盘行高有下限，装不下时整页可纵向滚动，「=」必须滚得到。
        # 回归：行高被压到 0 而行距仍在 —— 网格内容溢出页脚、「=」被推出屏外且页面不可滚动，
        # 玩家看得见上面 4 行键位，却既看不到也按不到「=」。
        pg.set_viewport_size({"width": 360, "height": 430})
        pg.wait_for_timeout(300)
        tiny = pg.evaluate(
            "(function(){var v=document.querySelector('.view:not(.hidden)');"
            "var ks=v.querySelectorAll('.keypad .key');var eq=ks[ks.length-1];"
            "var before=eq.getBoundingClientRect();"
            "v.scrollTop=v.scrollHeight;"
            "var after=eq.getBoundingClientRect();var vb=v.getBoundingClientRect();"
            "var r=[getComputedStyle(v).overflowY, Math.round(before.bottom), Math.round(after.bottom),"
            "Math.round(vb.bottom), Math.round(after.height), Math.round(after.left), Math.round(vb.left)];"
            "v.scrollTop=0;return r;})()")
        check("极矮净高 360x430：整页可滚动到「=」（行高下限 + 不贴屏边）",
              tiny[0] == "auto" and tiny[1] > tiny[3] and tiny[2] <= tiny[3] + 1
              and tiny[4] >= 24 and tiny[5] > tiny[6], str(tiny))
        pg.screenshot(path=os.path.join(SHOTS, "v2-calc-tiny.png"))
        pg.set_viewport_size({"width": 390, "height": 844})
        pg.wait_for_timeout(300)
        pg.click("#keyBack")
        pg.wait_for_timeout(300)
        check("返回键回主屏", pg.evaluate("!document.querySelector('.home').classList.contains('hidden')"))

        # 闹钟：v1 玩法——目标对齐 :00/:30，窗口外响铃禁用
        pg.locator('[aria-label="闹钟"]').first.click()
        pg.wait_for_timeout(400)
        tgt = pg.evaluate("document.querySelector('.alarm-display [data-f=\"target\"]').textContent")
        check("目标时间对齐 30 秒刻度", tgt.endswith(":00") or tgt.endswith(":30"), tgt)
        check("倒计时 mm:ss 格式", re.match(r"^\d{2}:\d{2}$", pg.evaluate(
            "document.querySelector('.alarm-cd').textContent")) is not None)
        pg.screenshot(path=os.path.join(SHOTS, "v2-alarm.png"))
        # 死锁回归：若目标在打开时就已过期（倒计时 00:00、按钮禁用），须在 ~100ms 内自动判晚，
        # 不能一直停在「禁用 + 可见 + 无再来一次」——那样玩家永远按不动（曾在无头环境复现卡死 40s）
        stall = 0
        for _ in range(20):
            st = pg.evaluate(
                "(function(){var v=document.querySelector('.view:not(.hidden)');"
                "var r=v.querySelector('.ring-btn');var rt=v.querySelector('.pfoot .alarm-retry');"
                "return [r.disabled, r.style.display, rt.style.display,"
                "v.querySelector('.alarm-cd').textContent];})()")
            stall = stall + 1 if (st[0] and st[1] != "none" and st[2] == "none"
                                  and st[3] == "00:00") else 0
            if stall >= 3:
                break
            pg.wait_for_timeout(100)
        check("响铃目标过期不致卡死（禁用+可见+无结算不得持续 ≥300ms）", stall < 3, str(st))
        # 等到响铃窗口内按一次。窗口仅 ±500ms，必须用 wait_for_function 高频轮询（rAF）才不漏；
        # 选择器一律限定在可见视图内（否则会命中计算器里同样叫 judge-btn 的「对/错」）。
        # 两个终止态：响铃按钮可用（进窗口）或按钮消失（错过窗口已自动判晚 → 重排下一刻度）。
        rang = False
        RING = ".view:not(.hidden) .ring-btn"
        RETRY = ".view:not(.hidden) .pfoot .alarm-retry"
        for _ in range(3):
            try:
                pg.wait_for_function(
                    "(function(){var r=document.querySelector('.view:not(.hidden) .ring-btn');"
                    "return !r.disabled || r.style.display === 'none';})()", timeout=40000)
            except Exception:
                break
            if pg.evaluate("document.querySelector('.view:not(.hidden) .ring-btn').style.display") == "none":
                pg.click(RETRY)  # 自动判晚 → 「再来一次」重排下一刻度
                pg.wait_for_timeout(400)
                continue
            pg.click(RING)
            rang = True
            break
        check("响铃窗口内可按并按下", rang)
        pg.wait_for_timeout(300)
        check("按后记一次尝试", int(pg.evaluate(
            "document.querySelectorAll('.gstats [data-f=\"tries\"]')[0].textContent")) >= 1)
        check("按后出现再来一次", pg.evaluate(
            "document.querySelectorAll('.view:not(.hidden) .pfoot .alarm-retry')[0].textContent") == "再来一次")
        pg.click("#keyBack")
        pg.wait_for_timeout(300)

        # 日历：v1 配置——中等 5 行 35 格 8 雷，首点安全，标旗模式
        pg.locator('[aria-label="日历"]').first.click()
        pg.wait_for_timeout(400)
        check("默认中等 35 格", pg.evaluate("document.querySelectorAll('.ms-cell').length") == 35)
        check("默认剩余雷 8", pg.evaluate(
            "document.querySelectorAll('.ms-meta [data-f=\"mines\"]')[0].textContent") == "8")
        check("未开局格子带日期数字", pg.evaluate(
            "document.querySelector('.ms-cell .dnum').textContent") == "1")
        pg.locator(".ms-cell").first.click()
        pg.wait_for_timeout(300)
        check("首点安全且揭开", pg.evaluate(
            "document.querySelectorAll('.ms-cell.rev').length") >= 1)
        pg.click(".flag-mini")
        pg.wait_for_timeout(200)
        idx = pg.evaluate("(function(){var c=document.querySelectorAll('.ms-cell');"
                          "for(var i=0;i<c.length;i++){if(!c[i].classList.contains('rev'))return i;}"
                          "return -1;})()")
        pg.locator(".ms-cell").nth(idx).click()
        pg.wait_for_timeout(200)
        check("标旗模式可插旗", pg.evaluate("document.querySelectorAll('.ms-cell.flag').length") == 1)
        check("插旗后剩余雷 7", pg.evaluate(
            "document.querySelectorAll('.ms-meta [data-f=\"mines\"]')[0].textContent") == "7")
        pg.screenshot(path=os.path.join(SHOTS, "v2-cal.png"))
        # 难度按钮一律限定在可见视图内（应用视图常驻 viewRoot，不加限定会命中其它页的同类控件）
        pg.locator(".view:not(.hidden) .diff-btn").nth(2).click()
        pg.wait_for_timeout(300)
        check("困难 42 格 12 雷", pg.evaluate("document.querySelectorAll('.ms-cell').length") == 42
              and pg.evaluate("document.querySelectorAll('.ms-meta [data-f=\"mines\"]')[0].textContent") == "12")
        pg.locator(".view:not(.hidden) .diff-btn").nth(0).click()
        pg.wait_for_timeout(300)
        check("简单 5 雷", pg.evaluate(
            "document.querySelectorAll('.ms-meta [data-f=\"mines\"]')[0].textContent") == "5")
        # 日历整屏摆下、不上下翻页：矮屏时棋盘按可用高度等比缩窄（格子仍为正方形、
        # 星期表头同宽对齐），宽屏回到自然尺寸。（回归：曾直接溢出 91px 可上下滚动）
        CAL_JS = ("(function(){var v=document.querySelector('.view:not(.hidden)');"
                  "var b=v.querySelector('.pbody');var g=v.querySelector('.ms-grid');"
                  "var wk=v.querySelector('.ms-week');var card=v.querySelector('.ms-card');"
                  "var cs=v.querySelectorAll('.ms-cell');var last=cs[cs.length-1].getBoundingClientRect();"
                  "var bb=b.getBoundingClientRect();var c=cs[0].getBoundingClientRect();"
                  "var st=getComputedStyle(card);"
                  "var inner=card.clientWidth-parseFloat(st.paddingLeft)-parseFloat(st.paddingRight);"
                  "var meta=v.querySelector('.ms-meta');var mb=meta.getBoundingClientRect();"
                  "var cb=card.getBoundingClientRect();var bs=getComputedStyle(b);"
                  "var above=cb.top-mb.bottom-parseFloat(getComputedStyle(meta).marginBottom);"
                  "var below=bb.bottom-parseFloat(bs.paddingBottom)-cb.bottom;"
                  "return [b.scrollHeight-b.clientHeight, Math.round(last.bottom-bb.bottom),"
                  "Math.round(g.getBoundingClientRect().width), Math.round(wk.getBoundingClientRect().width),"
                  "Math.round(inner), Math.round(c.width), Math.round(c.height),"
                  "Math.round(above), Math.round(below)];})()")
        pg.set_viewport_size({"width": 360, "height": 640})
        pg.wait_for_timeout(300)
        pg.locator(".view:not(.hidden) .diff-btn").nth(2).click()  # 困难 6 行最吃高度
        pg.wait_for_timeout(300)
        cal = pg.evaluate(CAL_JS)
        check("矮屏日历整屏摆下（无滚动、末行不被截、棋盘等比缩窄且表头同宽）",
              cal[0] == 0 and cal[1] <= 1 and cal[2] < cal[4] and cal[2] == cal[3]
              and abs(cal[5] - cal[6]) <= 1 and cal[5] >= 14, str(cal))
        pg.set_viewport_size({"width": 390, "height": 844})
        pg.wait_for_timeout(300)
        pg.locator(".view:not(.hidden) .diff-btn").nth(1).click()
        pg.wait_for_timeout(300)
        cal2 = pg.evaluate(CAL_JS)
        check("宽屏日历回到自然尺寸（不缩放、无滚动）",
              cal2[0] == 0 and cal2[2] == cal2[4] and cal2[1] <= 1, str(cal2))
        check("棋盘卡在剩余空间垂直居中（上下留白相等，无中段空洞）",
              abs(cal2[7] - cal2[8]) <= 2, str(cal2))
        pg.click("#keyBack")
        pg.wait_for_timeout(300)

        # 助手：聊天问答（问候→出题→作答）
        pg.locator('[aria-label="助手"]').first.click()
        pg.wait_for_timeout(5400)
        check("助手出题出选项", pg.evaluate("document.querySelectorAll('.view:not(.hidden) .opt').length") == 4)
        check("助手聊天气泡", pg.evaluate("document.querySelectorAll('.view:not(.hidden) .bub').length") >= 2)
        pg.locator(".view:not(.hidden) .opt").first.click()
        pg.wait_for_timeout(400)
        check("助手作答记轮次", pg.evaluate(
            "document.querySelectorAll('.view:not(.hidden) .gstats [data-f=\"rounds\"]')[0].textContent") == "1")
        check("助手有玩家气泡", pg.evaluate("!!document.querySelector('.view:not(.hidden) .bub.me')"))
        # 内容溢出时（用矮视口强制），选项上屏会加高页脚、压矮内容区，聊天必须重新贴底
        # （回归：滚动位置曾在「选项出现前」设定，导致最新一条被截掉整个页脚增量）
        pg.set_viewport_size({"width": 390, "height": 480})
        pg.wait_for_selector(".view:not(.hidden) .opt", timeout=15000)
        pg.wait_for_timeout(500)
        stick = pg.evaluate(
            "(function(){var v=document.querySelector('.view:not(.hidden)');var b=v.querySelector('.pbody');"
            "var bs=v.querySelectorAll('.bub');var last=bs[bs.length-1];"
            "return [b.scrollHeight-b.scrollTop-b.clientHeight,"
            "Math.round(last.getBoundingClientRect().bottom-b.getBoundingClientRect().bottom),"
            "b.scrollHeight-b.clientHeight];})()")
        check("选项上屏后对话仍自动贴底（最新一条不被截）",
              stick[2] > 0 and stick[0] <= 1 and stick[1] <= 1, str(stick))
        pg.set_viewport_size({"width": 390, "height": 844})
        pg.wait_for_timeout(300)
        pg.screenshot(path=os.path.join(SHOTS, "v2-assistant.png"))
        pg.click("#keyBack")
        pg.wait_for_timeout(300)

        # 日程：选难度→记忆→回忆→结算四相（记忆列表上卡面、阶段内容居中、结算动作等分满宽）
        SCHED_CENTER = ("(function(){var v=document.querySelector('.view:not(.hidden)');"
                        "var st=v.querySelector('.sched-stage'),blk=v.querySelector('.sched-block');"
                        "var sb=st.getBoundingClientRect(),xb=blk.getBoundingClientRect();"
                        "return [Math.round(xb.top-sb.top),Math.round(sb.bottom-xb.bottom)];})()")
        pg.locator('[aria-label="日程"]').first.click()
        pg.wait_for_timeout(400)
        check("日程三档难度", pg.evaluate(
            "document.querySelectorAll('.view:not(.hidden) .ms-foot .diff-btn').length") == 3)
        # 难度选择复用日历的三段等分满宽控件（DESIGN §4.4 控件语言，非散在左侧的小胶囊）
        check("难度为等分满宽三段控件且默认中等选中", pg.evaluate(
            "(function(){var a=document.querySelectorAll('.view:not(.hidden) .ms-foot .diff-btn');"
            "if(a.length!==3)return false;"
            "var w=Math.round(a[0].getBoundingClientRect().width);"
            "var eq=Math.abs(w-Math.round(a[1].getBoundingClientRect().width))<=1&&"
            "Math.abs(w-Math.round(a[2].getBoundingClientRect().width))<=1;"
            "return eq&&getComputedStyle(a[0].parentNode).display==='grid'&&a[1].classList.contains('sel');})()"))
        sel = pg.evaluate(SCHED_CENTER)
        check("选难度相在剩余空间垂直居中（无中段空洞）", abs(sel[0] - sel[1]) <= 2, str(sel))
        pg.locator(".view:not(.hidden) .ms-foot .diff-btn").first.click()
        pg.wait_for_timeout(400)
        check("简单记忆 3 条", pg.evaluate("document.querySelectorAll('.view:not(.hidden) .sitem').length") == 3)
        check("记忆列表收进卡面（不再是裸文字）", pg.evaluate(
            "document.querySelectorAll('.view:not(.hidden) .sched-list .sitem').length") == 3)
        memo = pg.evaluate(SCHED_CENTER)
        check("记忆相垂直居中", abs(memo[0] - memo[1]) <= 2, str(memo))
        pg.screenshot(path=os.path.join(SHOTS, "v2-schedule.png"))
        # 等倒计时结束 → 回忆相
        pg.wait_for_selector(".view:not(.hidden) .opt", timeout=15000)
        pg.wait_for_timeout(200)
        check("回忆相四选一且居中", pg.evaluate(
            "document.querySelectorAll('.view:not(.hidden) .opt').length") == 4
              and abs(pg.evaluate(SCHED_CENTER)[0] - pg.evaluate(SCHED_CENTER)[1]) <= 2)
        # 答完 3 题 → 结算相：动作等分满宽两枚
        for _ in range(3):
            pg.locator(".view:not(.hidden) .opt").first.click()
            pg.wait_for_timeout(250)
        fin = pg.evaluate(
            "(function(){var v=document.querySelector('.view:not(.hidden)');"
            "var a=v.querySelectorAll('.act-grid .act-btn');var b=v.querySelector('.pbody');"
            "if(a.length!==2)return [a.length];"
            "var r0=a[0].getBoundingClientRect(),r1=a[1].getBoundingClientRect();"
            "var bb=b.getBoundingClientRect();"
            "var bs=getComputedStyle(b);"
            "return [a.length,Math.round(r0.width),Math.round(r1.width),"
            "Math.round(r1.right),Math.round(bb.right-parseFloat(bs.paddingRight)),"
            "Math.round(r0.height)];})()")
        check("结算动作等分满宽贴底（主 CTA + 次级卡面）",
              fin[0] == 2 and abs(fin[1] - fin[2]) <= 1 and fin[3] == fin[4] and fin[5] >= 46, str(fin))
        pg.click("#keyBack")
        pg.wait_for_timeout(300)

        # 电话：拨号→拨打→挂断
        pg.locator('[aria-label="电话"]').first.click()
        pg.wait_for_timeout(400)
        for k in ["1", "3", "8"]:
            pg.locator(".view:not(.hidden) .dkey", has_text=k).first.click()
        check("拨号回显格式化", pg.evaluate(
            "document.querySelector('.dial-display').textContent") == "138")
        pg.click(".view:not(.hidden) .call-btn")
        pg.wait_for_timeout(300)
        check("进入拨打状态", "正在拨打" in pg.evaluate("document.querySelector('.dial-status').textContent"))
        pg.click(".view:not(.hidden) .call-btn")
        pg.wait_for_timeout(300)
        check("挂断回到拨号盘", pg.evaluate("document.querySelector('.dial-status').textContent") == "")
        pg.screenshot(path=os.path.join(SHOTS, "v2-phone.png"))
        pg.click("#keyBack")
        pg.wait_for_timeout(300)

        # 短信：收件箱→聊天→发送→AI 敷衍回复
        pg.locator('[aria-label="短信"]').first.click()
        pg.wait_for_timeout(400)
        check("短信种子 5 会话", pg.evaluate("document.querySelectorAll('.view:not(.hidden) .conv-row').length") == 5)
        check("智能分类横幅", "不重要" in pg.evaluate("document.querySelector('.sms-banner').textContent"))
        pg.locator(".view:not(.hidden) .conv-row").first.click()
        pg.wait_for_timeout(300)
        pg.fill(".sms-input", "在吗")
        pg.click(".sms-send")
        pg.wait_for_timeout(400)
        check("发出后有我气泡", pg.evaluate("!!document.querySelector('.view:not(.hidden) .bub.me')"))
        pg.wait_for_timeout(2200)
        check("AI 敷衍回复到达", pg.evaluate(
            "document.querySelectorAll('.view:not(.hidden) .bub').length") >= 2)
        pg.screenshot(path=os.path.join(SHOTS, "v2-sms.png"))
        pg.click("#keyBack")
        pg.wait_for_timeout(300)

        # 相机：美食素材取景（`vibeknow/world-food-3d` 借材，每 3s 随机换、不与上一张重复）
        #        + 拍完即换（无预览/重拍/保存）+ 温控（连拍升温 / 过热封锁 / 静置散热）
        CAM_SRC = ("(function(){var s=document.querySelector('.view:not(.hidden) .cam-shot');"
                   "return s ? (s.getAttribute('src')||'') : '';})()")
        CAM_TEMP = ("(function(){var h=document.querySelector('.view:not(.hidden) .cam-hud');"
                    "return h ? parseFloat(h.textContent.replace(/[^0-9.]/g,'')) : NaN;})()")
        CAM_HUD = "document.querySelector('.view:not(.hidden) .cam-hud')"
        pg.locator('[aria-label="相机"]').first.click()
        pg.wait_for_timeout(700)
        shot1 = pg.evaluate(CAM_SRC)
        check("取景为包内美食素材（./assets/cam/food-*.webp）",
              re.match(r"^\./assets/cam/food-[\w.-]+\.webp$", shot1 or "") is not None, shot1)
        check("素材已解码上屏（naturalWidth>0）", pg.evaluate(
            "(function(){var s=document.querySelector('.view:not(.hidden) .cam-shot');"
            "return !!s && s.naturalWidth > 0 && s.naturalHeight > 0;})()"))
        # 取景图铺满取景框（cover 裁切），不能只占一角
        check("取景图铺满取景框", pg.evaluate(
            "(function(){var s=document.querySelector('.view:not(.hidden) .cam-shot');"
            "var v=document.querySelector('.view:not(.hidden) .cam-view');if(!s||!v)return false;"
            "var a=s.getBoundingClientRect(),b=v.getBoundingClientRect();"
            "return Math.abs(a.width-b.width)<=1&&Math.abs(a.height-b.height)<=1;})()"))
        check("无预览/重拍/保存控件（拍完不逗留）", pg.evaluate(
            "document.querySelectorAll('.view:not(.hidden) .cam-top-btn').length") == 0)
        t0 = pg.evaluate(CAM_TEMP)
        check("初始镜头温度≈基准 36℃", 34.5 <= t0 <= 37.5, str(t0))
        pg.screenshot(path=os.path.join(SHOTS, "v2-camera.png"))
        pg.wait_for_timeout(3400)
        shot2 = pg.evaluate(CAM_SRC)
        check("每 3s 换一张且不与上一张重复",
              shot2 != "" and shot2 != shot1, "%s -> %s" % (shot1, shot2))
        # 拍完立刻换下一张（不再定格预览）
        pg.click(".cam-shutter")
        pg.wait_for_timeout(150)
        shot3 = pg.evaluate(CAM_SRC)
        check("快门即拍即换（无定格预览）", shot3 != shot2, "%s -> %s" % (shot2, shot3))
        check("快门出声（shot 计入）",
              pg.evaluate("AIOS.soundStats()")["plays"].get("shot", 0) >= 1)
        # 连拍升温：3 张后温度明显高于基准，但还没进过热态。
        # 「连拍」必须用程序化 click 连击，不能一枚枚 pg.click：后者的可交互性检查
        # 每枚要几十到几百毫秒，慢机上 8 枚点完要十几秒 —— 温度按 0.5℃/s 实时回落，
        # 净升温被冷却吃掉，压根到不了 45℃ 封锁线（曾复现：8 连拍后仍 44.6℃）。
        def burst(n):
            for _ in range(n):
                pg.evaluate("document.querySelector('.view:not(.hidden) .cam-shutter').click()")
        burst(3)
        t1 = pg.evaluate(CAM_TEMP)
        check("连拍升温（3 张后高于基准 +3℃）", t1 > t0 + 3, "%s -> %s" % (t0, t1))
        check("未过热时 HUD 不显示过热文案", pg.evaluate(
            "(function(){var h=" + CAM_HUD + ";return h.textContent.indexOf('过热')<0 "
            "&& h.className.indexOf('hot')<0;})()"), str(t1))
        # 继续连拍 → 过热：HUD 转红 + 文案变化
        burst(8)
        t2 = pg.evaluate(CAM_TEMP)
        check("连拍至过热（HUD 转红 + 过热文案）", pg.evaluate(
            "(function(){var h=" + CAM_HUD + ";return h.textContent.indexOf('过热')>=0 "
            "&& h.className.indexOf('hot')>=0;})()"), str(t2))
        check("过热时快门转灰（封锁外观）", pg.evaluate(
            "document.querySelector('.view:not(.hidden) .cam-shutter').className.indexOf('blocked')>=0"))
        pg.screenshot(path=os.path.join(SHOTS, "v2-camera-hot.png"))
        # 过热封锁：再按不升温、且有徽标提示
        t3 = pg.evaluate(CAM_TEMP)
        pg.click(".cam-shutter")
        pg.wait_for_timeout(150)
        t4 = pg.evaluate(CAM_TEMP)
        check("过热时快门封禁（不再升温）", t4 <= t3 + 0.2, "%s -> %s" % (t3, t4))
        check("封禁时给出徽标提示", "凉" in pg.evaluate(
            "document.querySelector('.view:not(.hidden) .cam-badge').textContent"))
        # 静置散热：温度回落，凉下来后快门恢复
        pg.wait_for_timeout(4000)
        t5 = pg.evaluate(CAM_TEMP)
        check("静置散热（温度回落）", t5 < t2 - 1, "%s -> %s" % (t2, t5))
        pg.click(".cam-shutter")
        pg.wait_for_timeout(150)
        t6 = pg.evaluate(CAM_TEMP)
        check("降温后快门恢复可用（升温即拍成）", t6 > t5 + 0.5, "%s -> %s" % (t5, t6))
        pg.click("#keyBack")
        pg.wait_for_timeout(300)

        # 统计：雷达+记录+重置弹窗
        pg.locator('[aria-label="统计"]').first.click()
        pg.wait_for_timeout(500)
        check("统计画布存在", pg.evaluate(
            "document.querySelector('.view:not(.hidden) canvas') !== null"))
        check("综合评分为数字", pg.evaluate(
            "document.querySelector('.score-big').textContent").isdigit())
        check("五条游戏记录", pg.evaluate("document.querySelectorAll('.view:not(.hidden) .rec-row').length") == 5)
        pg.locator(".view:not(.hidden) .rec-reset").first.click()
        pg.wait_for_timeout(200)
        check("重置确认弹窗", "确认重置" in pg.evaluate("document.querySelector('.modal h3').textContent"))
        pg.screenshot(path=os.path.join(SHOTS, "v2-stats.png"))
        pg.locator(".modal-cancel").click()
        pg.wait_for_timeout(200)
        pg.click("#keyBack")
        pg.wait_for_timeout(300)

        # 应用商店（§4.12）：介绍 ai-dev-kit 已开发的小工具，清单在构建期由仓库根 TRACKS.md 派生。
        # 期望值在这里独立复算一遍（测试自带一份解析），再与注入数据、上屏 DOM 三方对拍。
        exp = tracks_items()
        exp_total = sum(len(g["items"]) for g in exp)
        check("TRACKS.md 可解析（四大分类 / 有项目）", len(exp) == 4 and exp_total > 0,
              "%d 类 / %d 项" % (len(exp), exp_total))
        pg.locator('[aria-label="应用商店"]').first.click()
        pg.wait_for_timeout(400)
        st = pg.evaluate("AIOS.storeGroups()")
        check("商店分类数与 TRACKS.md 一致", len(st) == len(exp), str(len(st)))
        check("商店项目数与 TRACKS.md 独立复算一致",
              sum(len(g["items"]) for g in st) == exp_total,
              "%d vs %d" % (sum(len(g["items"]) for g in st), exp_total))
        check("商店分类名与顺序同 TRACKS.md",
              [g["name"] for g in st] == [g["name"] for g in exp])
        check("商店逐项对应 TRACKS.md（分类 + 名称 + 目录 + 定位 + 状态全量续存）",
              [(g["tag"], i["name"], i["dir"], i["desc"], i["status"])
               for g in st for i in g["items"]]
              == [(g["tag"], n, d, c, s) for g in exp for n, d, c, s in g["items"]])
        # 上架状态标签是商城口径：由 TRACKS 原文折叠而来，测试独立复算同一套规则
        check("商店上架标签与 TRACKS 原文折算一致（独立复算）",
              [(i["label"], i["tone"]) for g in st for i in g["items"]]
              == [store_state_of(s) for g in exp for n, d, c, s in g["items"]])
        # 副标题同样由定位原文折出（砍技术括注），与独立复算对拍
        check("商店副标题与 TRACKS 定位折算一致（独立复算）",
              [i["tag"] for g in st for i in g["items"]]
              == [store_tagline_of(c) for g in exp for n, d, c, s in g["items"]])
        check("商店不含 .skill（技能不是应用）",
              not any(i["dir"].startswith(".skill/") for g in st for i in g["items"]))
        vis_card = "document.querySelectorAll('.view:not(.hidden) .store-sec:not(.hidden) .store-card')"
        check("商店卡片数 = 项目数", pg.evaluate(vis_card + ".length") == exp_total)
        check("商店分组数 = 分类数", pg.evaluate(
            "document.querySelectorAll('.view:not(.hidden) .store-sec').length") == len(exp))
        check("商店店头显示收录总数",
              pg.evaluate("document.querySelector('.store-hero-v').textContent") == str(exp_total))
        check("分类筛选格数 = 分类数 + 1（全部）", pg.evaluate(
            "document.querySelectorAll('.view:not(.hidden) .store-tab').length") == len(exp) + 1
              and pg.evaluate(
                  "getComputedStyle(document.querySelector('.view:not(.hidden) .store-tabs'))"
                  ".gridTemplateColumns.split(' ').filter(function(x){return x!=='';}).length"
              ) == len(exp) + 1)
        check("商店按分类显示了分组标题",
              [t for t in pg.evaluate(
                  "Array.prototype.map.call(document.querySelectorAll('.view:not(.hidden) .store-sec-t'),"
                  "function(n){return n.textContent;})")] == [g["name"] for g in exp])
        # 商店语言：只给「上架标签」，不摆目录路径与物料状态原文（那是文档口径）
        check("商店不显示项目路径（目录不上屏）", pg.evaluate(
            "(function(){var t=document.querySelector('.view:not(.hidden) .store-list').textContent;"
            "return ['vibetool/','vibegame/','vibeart/','vibeknow/','.skill/'].every(function(p){"
            "return t.indexOf(p)<0;});})()"))
        check("商店不显示物料状态原文（只给折算后的上架标签）", pg.evaluate(
            "(function(){var t=document.querySelector('.view:not(.hidden) .store-list').textContent;"
            "return ['八层验证','zip + ','headless','已发布','自用 · '].every(function(p){"
            "return t.indexOf(p)<0;});})()"))
        chip_n = pg.evaluate("document.querySelectorAll('.view:not(.hidden) .store-card .store-chip').length")
        self_n = pg.evaluate(
            "document.querySelectorAll('.view:not(.hidden) .store-card .store-chip.self').length")
        check("每张卡片都有上架标签（本机那行另加一枚）",
              chip_n == exp_total + self_n and self_n == 1, "%d 枚 / 本机标记 %d" % (chip_n, self_n))
        check("卡片上屏的确实是折算后的上架标签",
              pg.evaluate("document.querySelector('.view:not(.hidden) .store-card .store-chip')"
                          ".textContent") == store_state_of(exp[0]["items"][0][3])[0])
        want_tones = sorted(set(store_state_of(s)[1] for g in exp for n, d, c, s in g["items"]))
        got_tones = sorted(set(pg.evaluate(
            "Array.prototype.map.call(document.querySelectorAll("
            "'.view:not(.hidden) .store-card .store-chip'),"
            "function(n){return n.className.replace('store-chip','').replace('self','').trim();})"
            ".filter(function(x){return x!=='';})")))
        check("上架标签语气色只用 ok / warn / 中性三档", got_tones == want_tones,
              "%s vs %s" % (got_tones, want_tones))
        # 招牌图标：货架色板按序轮转，同分类内相邻卡片不得同色（纯文字的单调感就出在这）
        check("同分类相邻卡片招牌图标不同色（货架色板轮转）", pg.evaluate(
            "(function(){var s=document.querySelector('.view:not(.hidden) .store-sec');"
            "var m=s.querySelectorAll('.store-mini'),i,p='';"
            "for(i=0;i<m.length;i++){var b=getComputedStyle(m[i]).backgroundImage;"
            "if(b===p){return false;}p=b;}return m.length>1;})()"))
        # 本机（ai-os 自己）也在清单里：按商店的说法标「已安装」（你正用着它）
        check("本机在商店清单里并标「已安装」", pg.evaluate(
            "(function(){var cs=document.querySelectorAll('.store-card'),i;"
            "for(i=0;i<cs.length;i++){if(cs[i].querySelector('.store-name').textContent==='人工智能 OS'){"
            "var c=cs[i].querySelector('.store-chip.self');return !!c && c.textContent==='已安装';}}"
            "return false;})()"))
        # 分类筛选：点「互动游戏」只剩该分类，卡片数 = 该分类项目数
        game_n = len([g for g in exp if g["tag"] == "vibegame"][0]["items"])
        pg.locator('.view:not(.hidden) .store-tab[data-cat="vibegame"]').click()
        pg.wait_for_timeout(250)
        check("分类筛选只留该分类且计数正确", pg.evaluate(
            "document.querySelectorAll('.view:not(.hidden) .store-sec:not(.hidden)').length") == 1
              and pg.evaluate(vis_card + ".length") == game_n)
        # 卡片副标题是商店口径的短句（不是索引里的定位长句），且恒定单行省略号
        check("卡片副标题上屏的是折算后的短句、单行省略",
              pg.evaluate("document.querySelector('.view:not(.hidden) .store-card .store-desc')"
                          ".textContent") == store_tagline_of(exp[0]["items"][0][2])
              and pg.evaluate(
                  "(function(){var d=document.querySelector("
                  "'.view:not(.hidden) .store-card .store-desc');var s=getComputedStyle(d);"
                  "return s.whiteSpace==='nowrap' && s.textOverflow==='ellipsis';})()"))
        pg.screenshot(path=os.path.join(SHOTS, "v2-store.png"))
        # 回到「全部」应恢复所有分组
        pg.locator('.view:not(.hidden) .store-tab[data-cat="all"]').click()
        pg.wait_for_timeout(250)
        check("切回全部恢复所有分组", pg.evaluate(
            "document.querySelectorAll('.view:not(.hidden) .store-sec:not(.hidden)').length") == len(exp)
              and pg.evaluate(vis_card + ".length") == exp_total)
        check("商店页无 console/page 错误", len(errors) == 0, "; ".join(errors[:3]))
        pg.click("#keyBack")
        pg.wait_for_timeout(300)

        # 设置：壁纸与深色
        pg.locator('[aria-label="设置"]').first.click()
        pg.wait_for_timeout(400)
        pg.click('.wall-swatch[data-wall="dark-mesh"]')
        pg.wait_for_timeout(300)
        check("切深色壁纸联动 mode=dark", pg.evaluate(
            "document.body.getAttribute('data-wall')") == "dark-mesh"
              and pg.evaluate("document.body.getAttribute('data-mode')") == "dark")
        check("深色开关上屏即反映当前状态",
              pg.evaluate("document.getElementById('swDark').classList.contains('on')"))
        pg.screenshot(path=os.path.join(SHOTS, "v2-settings-dark.png"))
        pg.click('.wall-swatch[data-wall="light-mesh"]')
        pg.wait_for_timeout(300)
        check("切回浅色", pg.evaluate("document.body.getAttribute('data-mode')") == "light")
        pg.screenshot(path=os.path.join(SHOTS, "v2-settings.png"))

        # 设置页文案：卡片逐行读出来对拍（改名 / 合并行一旦回退，这里会立刻红）
        def card_rows(title):
            return pg.evaluate(
                "(function(){var cs=document.querySelectorAll('.view:not(.hidden) .card'),i;"
                "for(i=0;i<cs.length;i++){var t=cs[i].querySelector('.card-title');"
                "if(t && t.textContent==='%s'){var o={},r=cs[i].querySelectorAll('.row');"
                "for(var j=0;j<r.length;j++){o[r[j].querySelector('.lbl').textContent]="
                "r[j].querySelector('.val').textContent;}return o;}}return {};})()" % title)
        sound_rows = pg.evaluate(
            "(function(){var cs=document.querySelectorAll('.view:not(.hidden) .card'),i;"
            "for(i=0;i<cs.length;i++){var t=cs[i].querySelector('.card-title');"
            "if(t && t.textContent==='声音与触感'){return Array.prototype.map.call("
            "cs[i].querySelectorAll('.row .lbl'),function(n){return n.textContent;});}}"
            "return null;})()")
        check("「声音与触感」合并为「声音」「触感」两行（原系统音效行并入声音行）",
              sound_rows == ["声音", "触感"], str(sound_rows))
        check("「声音」行即音效开关（开关就在这一行里）", pg.evaluate(
            "(function(){var s=document.getElementById('swSound');"
            "return !!s && s.closest('.row').querySelector('.lbl').textContent==='声音';})()"))
        about = card_rows("关于本机")
        check("关于本机：设备名称 = FakePhone 18 NoDuo",
              about.get("设备名称") == "FakePhone 18 NoDuo", str(about))
        check("关于本机：系统版本 = 人工智能 OS v2.0",
              about.get("系统版本") == "人工智能 OS v2.0", str(about.get("系统版本")))
        check("关于本机：型号 = AI引擎", about.get("型号") == "AI引擎", str(about.get("型号")))
        check("关于本机：末行是「存储方式」且不再叫「本地缓存」",
              "存储方式" in about and "本地缓存" not in about, str(list(about)))
        check("关于本机：存储方式只写通道名，不缀「降级」",
              about.get("存储方式") == "localStorage", str(about.get("存储方式")))

        # 系统音效可整体静音：开关落盘 aios_sound，静音后全系统不再发声，且跨会话保持
        check("音效开关上屏即反映当前状态（缺省开）",
              pg.evaluate("document.getElementById('swSound').classList.contains('on')"))
        pg.click("#swSound")
        pg.wait_for_timeout(200)
        check("音效开关可静音且落盘",
              pg.evaluate("AIOS.soundEnabled()") is False
              and pg.evaluate("localStorage.getItem('aios_sound')") == "0"
              and not pg.evaluate(
                  "document.getElementById('swSound').classList.contains('on')"))
        plays0 = pg.evaluate("AIOS.soundStats()")["plays"]["total"]
        pg.click('.wall-swatch[data-wall="light-mesh"]')
        pg.wait_for_timeout(200)
        check("静音后点击不再发声（触发计数不涨）",
              pg.evaluate("AIOS.soundStats()")["plays"]["total"] == plays0)
        pg.reload()
        wait_home(pg)
        pg.locator('[aria-label="设置"]').first.click()
        pg.wait_for_timeout(400)
        check("静音状态跨会话保持（开关仍为关）",
              pg.evaluate("AIOS.soundEnabled()") is False
              and not pg.evaluate(
                  "document.getElementById('swSound').classList.contains('on')"))
        pg.click("#swSound")            # 恢复默认开，后续用例按「默认开」跑
        pg.wait_for_timeout(200)
        check("重新开启音效并落盘",
              pg.evaluate("AIOS.soundEnabled()") is True
              and pg.evaluate("localStorage.getItem('aios_sound')") == "1")
        pg.click("#keyBack")
        pg.wait_for_timeout(200)

        # 重置会话（最近任务不持久化，reload 即空栈），保证后续计数确定
        pg.reload()
        wait_home(pg)

        # 多任务：开两个应用（中间回主屏）→ 轮播两张卡
        pg.click("#keyHome")
        pg.wait_for_timeout(200)
        pg.locator('[aria-label="助手"]').first.click()
        pg.wait_for_timeout(300)
        pg.click("#keyHome")
        pg.wait_for_timeout(200)
        pg.locator('[aria-label="闹钟"]').first.click()
        pg.wait_for_timeout(300)
        pg.click("#keyRecents")
        pg.wait_for_timeout(300)
        check("多任务两张卡（主页键不清空）", pg.evaluate("document.querySelectorAll('.rc-card').length") == 2)
        pg.screenshot(path=os.path.join(SHOTS, "v2-recents.png"))
        pg.click(".rc-card")  # 栈顶=闹钟
        pg.wait_for_timeout(300)
        check("点卡恢复栈顶应用", pg.evaluate(
            "document.querySelector('.view:not(.hidden) .phead h1').textContent") == "闹钟")
        # 轮播内关闭当前卡 → 切到次新应用并收起遮罩
        pg.click("#keyRecents")
        pg.wait_for_timeout(200)
        pg.click(".rc-close")
        pg.wait_for_timeout(300)
        check("关闭当前卡切到次新应用", pg.evaluate(
            "document.querySelector('.view:not(.hidden) .phead h1').textContent") == "助手"
              and pg.evaluate("document.querySelector('.recents').classList.contains('hidden')"))
        pg.click("#keyRecents")
        pg.wait_for_timeout(200)
        check("剩一张卡", pg.evaluate("document.querySelectorAll('.rc-card').length") == 1)
        pg.click(".rc-close")
        pg.wait_for_timeout(300)
        check("关掉最后一张回主屏", pg.evaluate(
            "!document.querySelector('.home').classList.contains('hidden')"))
        pg.click("#keyRecents")
        pg.wait_for_timeout(200)
        check("清空后多任务空态", "暂无最近应用" in pg.inner_text(".recents"))
        # 空态下点遮罩也必须能关闭（回归：关闭判据原为白名单 target，只认 recentsEl /
        # .recents-track；空态里撑满遮罩的 .rc-empty 不在名单内，点哪儿都关不掉）
        pg.click(".rc-empty")
        pg.wait_for_timeout(200)
        check("空态下点遮罩可关闭", pg.evaluate(
            "document.querySelector('.recents').classList.contains('hidden')"))
        pg.click("#keyRecents")
        pg.wait_for_timeout(200)
        pg.click("#keyBack")
        pg.wait_for_timeout(200)
        check("空态下返回关闭遮罩", pg.evaluate("document.querySelector('.recents').classList.contains('hidden')"))
        # 返回键逐层出栈：闹钟 → 助手 → 主屏
        pg.locator('[aria-label="助手"]').first.click()
        pg.wait_for_timeout(200)
        pg.click("#keyHome")
        pg.wait_for_timeout(200)
        pg.locator('[aria-label="闹钟"]').first.click()
        pg.wait_for_timeout(200)
        pg.click("#keyBack")
        pg.wait_for_timeout(200)
        check("返回出栈到上一层应用", pg.evaluate(
            "document.querySelector('.view:not(.hidden) .phead h1').textContent") == "助手")
        pg.click("#keyBack")
        pg.wait_for_timeout(200)
        check("返回出栈到主屏", pg.evaluate(
            "!document.querySelector('.home').classList.contains('hidden')"))

        # in-app 布局必须与纯浏览器直开一致：宿主按钮只在顶部导航行，内容区 / Dock 不得内缩
        # （回归：曾把 48/92 净空套到所有贴边栏 —— 半行组件被拆成两行、Dock 图标被挤扁、
        #  应用页左右各留大片空白，与 index.html 直开时明显不一致）
        pg.goto(url + "?inapp=1")
        wait_home(pg)
        check("in-app 左右净空为 0（内容区不额外内缩）", pg.evaluate(
            "getComputedStyle(document.body).getPropertyValue('--safe-l').trim()") == "0px"
              and pg.evaluate(
            "getComputedStyle(document.body).getPropertyValue('--safe-r').trim()") == "0px")
        check("in-app Dock 仍贴边 14px、图标同主屏 62px", pg.evaluate(
            "Math.round(parseFloat(getComputedStyle(document.querySelector('.dock')).marginLeft))") == 14
              and pg.evaluate(
            "Math.round(document.querySelector('.dock .app-icon').getBoundingClientRect().width)") == 62)
        check("in-app 半行组件仍并排（天气/钱包不拆两行）", pg.evaluate(
            "getComputedStyle(document.querySelector('.w-row')).display") == "flex")
        pg.locator('[aria-label="计算器"]').first.click()
        pg.wait_for_timeout(400)
        check("in-app 应用页左右不内缩（pbody 左右各 16px）", pg.evaluate(
            "(function(){var s=getComputedStyle(document.querySelector('.view:not(.hidden) .pbody'));"
            "return [Math.round(parseFloat(s.paddingLeft)),Math.round(parseFloat(s.paddingRight))];})()")
              == [16, 16])
        pg.click("#keyBack")
        pg.wait_for_timeout(300)
        check("无容器时退回 localStorage 降级通道", pg.evaluate("AIOS.storeBackend()") == "local")
        check("降级通道按 aios_ 前缀落盘",
              pg.evaluate("localStorage.getItem('aios_wmask')") is not None)
        check("关于本机「存储方式」只报通道名（容器不可用 = localStorage，不标「降级」）",
              pg.evaluate("AIOS.storeSummary()") == "localStorage")
        pg.screenshot(path=os.path.join(SHOTS, "v2-inapp.png"))

        # ---------- 存储：容器 Storage JS API 优先（§3.6 版本判断 / §3.7 Storage） ----------
        # 种子取 "0"（存档为「已显示」）而非默认的 "1"：默认值改成打码后，只有与默认相反
        # 的存档值才能证明「迁移过来的值真被读到」，否则用例会退化成恒真。
        p2 = new_page(fake_container(seed_wmask="0"))
        p2.goto(url)
        wait_home(p2)
        check("注入容器后走容器 Storage 通道", p2.evaluate("AIOS.storeBackend()") == "xhs")
        check("容器环境识别为 in-app", p2.evaluate("document.body.classList.contains('in-app')"))
        # 宿主已自带真实状态栏与顶部导航条：自绘状态栏必须隐藏，否则屏幕叠出「两层状态栏」
        check("in-app 隐藏自绘状态栏（不叠两层状态栏）", p2.evaluate(
            "getComputedStyle(document.querySelector('.statusbar')).visibility") == "hidden")
        # 隐藏用 visibility（非 display）；且 in-app 要把带子加高到 70px —— 宿主顶栏压在带内，
        # 必须让顶栏之下仍有明显留白（50px 时几乎被顶栏占满，看起来"顶部没留白"）
        check("in-app 预留带 ≥70px（宿主顶栏之下仍有留白）", p2.evaluate(
            "Math.round(document.querySelector('.statusbar').getBoundingClientRect().height)") >= 70)
        check("启动水合读取全部键（含音效开关 aios_sound）", p2.evaluate(
            "window.__xhsCalls.filter(function(c){return c.indexOf('getStorage:')===0;}).length") == 7)
        check("降级通道既有数据迁移进容器",
              p2.evaluate("window.__fakeXhsStorage['aios_wmask']") == "0"
              and p2.evaluate("window.__xhsCalls.indexOf('setStorage:aios_wmask')") >= 0)
        check("迁移后的值被读取（钱包按存档显示余额，非默认打码）",
              p2.evaluate("document.querySelector('.w-bal').textContent") == "￥ -99,999")
        check("容器用量来自 getStorageInfo", "KB" in p2.evaluate("AIOS.storeSummary()"))
        check("主题也写入容器", p2.evaluate("window.__fakeXhsStorage['aios_wall']") == "light-mesh")
        p2.click(".w-wallet")
        p2.wait_for_timeout(300)
        check("写操作双通道落盘",
              p2.evaluate("window.__fakeXhsStorage['aios_wmask']") == "1"
              and p2.evaluate("localStorage.getItem('aios_wmask')") == "1")
        p2.close()

        # 版本门槛：buildVersion 末 3 位是编译序号，不得参与比较
        p3 = new_page(fake_container(build_version=9460001))   # 客户端 9.46.0，边界命中
        p3.goto(url)
        wait_home(p3)
        check("客户端 9.46.0 边界值走容器通道", p3.evaluate("AIOS.storeBackend()") == "xhs")
        p3.close()

        p4 = new_page(fake_container(build_version=9459001))   # 客户端 9.45.9，低于门槛
        p4.goto(url)
        wait_home(p4)
        check("客户端 9.45.9 不启用容器 Storage", p4.evaluate("AIOS.storeBackend()") == "local"
              and "setStorage:" not in p4.evaluate("window.__xhsCalls.join(',')"))
        p4.close()

        # 版本号来源：同步 launchOptions 缺失时回退异步 getLaunchOptions（§3.6）
        p5 = new_page(fake_container(build_version=9465000, launch="async"))
        p5.goto(url)
        wait_home(p5)
        check("launchOptions 缺失时异步取版本仍走容器通道", p5.evaluate("AIOS.storeBackend()") == "xhs")
        p5.close()

        p6 = new_page(fake_container(launch="none"))
        p6.goto(url)
        wait_home(p6)
        check("版本号两条路都取不到按不支持处理", p6.evaluate("AIOS.storeBackend()") == "local")
        p6.close()

        # 环境无 Web Audio：音效整层静音降级 —— 不抛错、不阻塞交互（交互照常、计数照记）
        p8 = new_page("delete window.AudioContext; delete window.webkitAudioContext;")
        errs8 = []
        p8.on("pageerror", lambda e: errs8.append(str(e)))
        p8.goto(url)
        wait_home(p8)
        p8.locator('[aria-label="计算器"]').first.click()
        p8.wait_for_timeout(300)
        p8.click("#keyBack")
        p8.wait_for_timeout(200)
        st8 = p8.evaluate("AIOS.soundStats()")
        check("无 Web Audio 时静音降级（dead，无运行期报错）",
              st8["dead"] is True and st8["plays"]["total"] >= 1 and len(errs8) == 0, str(st8))
        check("无 Web Audio 时交互照常（返回键回主屏）",
              p8.evaluate("!document.querySelector('.home').classList.contains('hidden')"))
        p8.close()

        b.close()

    print("")
    if FAIL:
        print("FAILED:", len(FAIL))
        for f in FAIL:
            print(" -", f)
        sys.exit(1)
    print("ALL PASS")


if __name__ == "__main__":
    main()
