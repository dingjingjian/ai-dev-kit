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
        for k in ["7", "+", "8"]:
            pg.locator(".keypad .key", has_text=k).first.click()
        pg.wait_for_timeout(150)
        check("输入回显", pg.evaluate("document.querySelector('.calc-expr').textContent") == "7+8")
        pg.locator(".keypad .key", has_text="=").first.click()
        pg.wait_for_timeout(250)
        check("出结果后进入判定（键盘隐藏）", pg.evaluate(
            "document.querySelector('.keypad').classList.contains('hidden-row')"))
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
            "!document.querySelector('.keypad').classList.contains('hidden-row')"))
        pg.screenshot(path=os.path.join(SHOTS, "v2-calc.png"))
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
        # 等到响铃窗口内按一次（若窗口先错过被自动判晚，则按「再来一次」重排，最多等 40s）
        rang = False
        for _ in range(80):
            st = pg.evaluate("(function(){var r=document.querySelector('.ring-btn');"
                             "return [r.disabled, r.style.display];})()")
            if st[1] == "none":  # 已出结果（自动判晚），重开一轮
                pg.click(".view:not(.hidden) .pfoot .judge-btn")
                pg.wait_for_timeout(400)
                continue
            if not st[0]:
                pg.click(".ring-btn")
                rang = True
                break
            pg.wait_for_timeout(400)
        check("响铃窗口内可按并按下", rang)
        pg.wait_for_timeout(300)
        check("按后记一次尝试", int(pg.evaluate(
            "document.querySelectorAll('.gstats [data-f=\"tries\"]')[0].textContent")) >= 1)
        check("按后出现再来一次", pg.evaluate(
            "document.querySelectorAll('.view:not(.hidden) .pfoot .judge-btn')[0].textContent") == "再来一次")
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
        pg.screenshot(path=os.path.join(SHOTS, "v2-assistant.png"))
        pg.click("#keyBack")
        pg.wait_for_timeout(300)

        # 日程：选难度→记忆列表
        pg.locator('[aria-label="日程"]').first.click()
        pg.wait_for_timeout(400)
        check("日程三档难度", pg.evaluate("document.querySelectorAll('.view:not(.hidden) .sdiff').length") == 3)
        pg.locator(".view:not(.hidden) .sdiff").first.click()
        pg.wait_for_timeout(400)
        check("简单记忆 3 条", pg.evaluate("document.querySelectorAll('.view:not(.hidden) .sitem').length") == 3)
        pg.screenshot(path=os.path.join(SHOTS, "v2-schedule.png"))
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
