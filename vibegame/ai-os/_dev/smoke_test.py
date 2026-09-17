# -*- coding: utf-8 -*-
"""ai-os v1 无头自检（playwright）。

断言导航栈 / 安全区变量 / 顶部净空 / Chrome61 基线扫描，并输出回归截图到 _dev/_shots/。
运行：PYTHONUTF8=1 <python> smoke_test.py
"""
import io
import os
import re
import sys

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
SHOTS = os.path.join(HERE, "_shots")


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


def check(name, cond, extra=""):
    if cond:
        print("  ok  " + name)
    else:
        print("  FAIL " + name + (" | " + extra if extra else ""))
        FAIL.append(name)


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

    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME) if CHROME else p.chromium.launch()
        ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                            is_mobile=True, has_touch=True)
        pg = ctx.new_page()
        errors = []
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto("file:///" + os.path.join(ROOT, "index.html").replace("\\", "/"))
        pg.wait_for_timeout(1200)

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
        # 顶部预留带内左右净空无按钮
        n_btn_top = pg.evaluate("document.querySelectorAll('.statusbar button, .phead button').length")
        check("顶部带/页头无按钮", n_btn_top == 0, str(n_btn_top))
        # 主屏 6 图标 + Dock 4
        check("主屏 6 图标", pg.evaluate("document.querySelectorAll('.home-grid .app-tile').length") == 6)
        check("Dock 4 图标且无标签", pg.evaluate("document.querySelectorAll('.dock .app-tile').length") == 4
              and pg.evaluate("document.querySelectorAll('.dock .app-name').length") == 0)
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
        check("钱包组件假余额", pg.evaluate(
            "document.querySelector('.w-bal').textContent") == "￥ -99,999")
        pg.click(".w-wallet")
        pg.wait_for_timeout(200)
        check("钱包点按打码", pg.evaluate(
            "document.querySelector('.w-bal').textContent") == "￥ -****")
        pg.reload()
        pg.wait_for_timeout(900)
        check("打码状态持久化", pg.evaluate(
            "document.querySelector('.w-bal').textContent") == "￥ -****")
        pg.click(".w-wallet")
        pg.wait_for_timeout(200)
        check("钱包再点还原", pg.evaluate(
            "document.querySelector('.w-bal').textContent") == "￥ -99,999")
        pg.click("#wClock")
        pg.wait_for_timeout(300)
        check("时钟组件打开闹钟", pg.evaluate(
            "document.querySelector('.view:not(.hidden) .phead h1').textContent") == "闹钟")
        pg.click("#keyBack")
        pg.wait_for_timeout(300)
        pg.screenshot(path=os.path.join(SHOTS, "v2-home.png"))

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
            "window.innerHeight, Math.round(kp.querySelector('.key').getBoundingClientRect().height)];})()")
        check("小屏 360x640 不滚动且键盘贴底在屏内",
              small[0] and small[1] <= small[2] and small[3] >= 34, str(small))
        pg.screenshot(path=os.path.join(SHOTS, "v2-calc-small.png"))
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
        pg.locator(".diff-btn").nth(2).click()
        pg.wait_for_timeout(300)
        check("困难 42 格 12 雷", pg.evaluate("document.querySelectorAll('.ms-cell').length") == 42
              and pg.evaluate("document.querySelectorAll('.ms-meta [data-f=\"mines\"]')[0].textContent") == "12")
        pg.locator(".diff-btn").nth(0).click()
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
        check("日程三档难度", pg.evaluate("document.querySelectorAll('.view:not(.hidden) .sdiff').length") == 3)
        check("难度卡为「左标签 + 右取值」行式", pg.evaluate(
            "(function(){var b=document.querySelector('.view:not(.hidden) .sdiff');"
            "return getComputedStyle(b).display==='flex' &&"
            " b.querySelector('span').getBoundingClientRect().left>b.querySelector('b').getBoundingClientRect().right;})()"))
        sel = pg.evaluate(SCHED_CENTER)
        check("选难度相在剩余空间垂直居中（无中段空洞）", abs(sel[0] - sel[1]) <= 2, str(sel))
        pg.locator(".view:not(.hidden) .sdiff").first.click()
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
            "var a=v.querySelectorAll('.sched-act .act-btn');var b=v.querySelector('.pbody');"
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

        # 相机：模拟取景→快门→预览→保存
        pg.locator('[aria-label="相机"]').first.click()
        pg.wait_for_timeout(400)
        check("取景元素≥3", pg.evaluate("document.querySelectorAll('.view:not(.hidden) .cam-el').length") >= 3)
        check("镜头温度 HUD", "镜头温度" in pg.evaluate("document.querySelector('.cam-hud').textContent"))
        pg.click(".cam-shutter")
        pg.wait_for_timeout(700)
        check("快门后进预览", pg.evaluate(
            "document.querySelector('.cam-top-btn').style.display") != "none")
        pg.click(".cam-top-btn.save")
        pg.wait_for_timeout(300)
        check("保存反馈", "已保存" in pg.evaluate("document.querySelector('.cam-top-btn.save').textContent"))
        pg.screenshot(path=os.path.join(SHOTS, "v2-camera.png"))
        pg.wait_for_timeout(1600)
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

        # 设置：壁纸与深色
        pg.locator('[aria-label="设置"]').first.click()
        pg.wait_for_timeout(400)
        pg.click('.wall-swatch[data-wall="dark-mesh"]')
        pg.wait_for_timeout(300)
        check("切深色壁纸联动 mode=dark", pg.evaluate(
            "document.body.getAttribute('data-wall')") == "dark-mesh"
              and pg.evaluate("document.body.getAttribute('data-mode')") == "dark")
        pg.screenshot(path=os.path.join(SHOTS, "v2-settings-dark.png"))
        pg.click('.wall-swatch[data-wall="light-mesh"]')
        pg.wait_for_timeout(300)
        check("切回浅色", pg.evaluate("document.body.getAttribute('data-mode')") == "light")
        pg.screenshot(path=os.path.join(SHOTS, "v2-settings.png"))

        # 重置会话（最近任务不持久化，reload 即空栈），保证后续计数确定
        pg.reload()
        pg.wait_for_timeout(900)

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

        # in-app 净空
        pg.goto("file:///" + os.path.join(ROOT, "index.html").replace("\\", "/") + "?inapp=1")
        pg.wait_for_timeout(800)
        check("in-app 注入左右净空", pg.evaluate(
            "getComputedStyle(document.body).getPropertyValue('--safe-l').trim()") == "48px")
        pg.screenshot(path=os.path.join(SHOTS, "v2-inapp.png"))

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
