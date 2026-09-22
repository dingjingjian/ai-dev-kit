# 无头冒烟：走通 阵营选择 → 凯旋门 → 检阅 → 军团志，外加自选军团分支。
# 用法：python tools/smoke_test.py
# 判据：全程无 JS 异常 / console.error；五页 DOM 关键点逐一落到预期。
import os, sys, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / 'index.html').as_uri()

errors, warns = [], []
fails = []
checks = 0


def check(cond, msg):
    global checks
    checks += 1
    if cond:
        print('ok   ' + msg)
    else:
        print('FAIL ' + msg)
        fails.append(msg)


with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', args=[
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--autoplay-policy=no-user-gesture-required', '--mute-audio',
    ])
    page = browser.new_page(viewport={'width': 420, 'height': 860})
    page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    page.on('console', lambda m: (errors.append('console.error: ' + m.text)
                                  if m.type == 'error' else None))

    def mode():
        """body 上还会挂 img-missing / gate-video-on 之类的状态类，
        只取第一个 token（由 className 整体赋值写入的 mode-*）来判定当前页。"""
        return ((page.get_attribute('body', 'class') or '').split() or [''])[0]

    def wait_page(cls, timeout=14000):
        """轮询等 body 切到指定页面。凯旋门时长由视频实际时长决定（钳在 3.2–9.0s），
        写死 wait_for_timeout 会在视频更长/更短时误判，所以一律轮询。"""
        waited = 0
        while waited < timeout:
            if mode() == cls:
                return True
            page.wait_for_timeout(200)
            waited += 200
        return False

    page.goto(URL)
    page.wait_for_timeout(1600)

    # 1. 启动与阵营页
    check(page.locator('#loader.hide').count() == 1, '加载遮罩已淡出')
    body_cls = page.get_attribute('body', 'class')
    check(mode() == 'mode-factions', '初始停在阵营选择页：' + str(body_cls))
    n_cards = page.locator('#routeList .route-card').count()
    check(n_cards == 9, '阵营卡 9 张（8 阵营 + 自选），实际 ' + str(n_cards))
    check('罗马军团图鉴' in page.inner_text('.park-ttl'), 'hero 标题已渲染')
    # 首页 hero 轮播：八大军团横幅各一层（纯 CSS 交叉淡化，无 JS 定时器）
    n_shots = page.locator('.park-shots .park-shot').count()
    check(n_shots == 8, '首页 hero 轮播 8 层（八大军团横幅），实际 ' + str(n_shots))
    shot_bg = page.evaluate(
        "getComputedStyle(document.querySelectorAll('.park-shot')[0]).backgroundImage")
    check('faction-rome' in shot_bg, '首层轮播吃罗马阵营横幅：' + shot_bg[:64])
    globe_shown = page.evaluate("getComputedStyle(document.getElementById('globeSlot')).display")
    check(globe_shown == 'none', '阵营页不显示地球（只在检阅页显示）')

    # 2. 点阵营 → 凯旋门
    page.locator('#routeList .route-card').nth(0).click()
    page.wait_for_timeout(400)
    check(mode() == 'mode-gate', '进入凯旋门页')
    check('即将检阅' in page.inner_text('#gateRouteName'), '凯旋门页已写入阵营名')
    # 过渡视频层：元素要在（视频素材落位即用，缺失时退回单帧图），且必须静音（BGM 走音频链路）
    gate_vid = page.evaluate("() => { var v = document.getElementById('gateVideo'); return !!v && v.muted; }")
    check(gate_vid, '过渡视频元素存在且静音')
    gate_cls = page.get_attribute('body', 'class') or ''
    check('gate-video-on' not in gate_cls, '无视频素材时保持在图片兜底模式')
    # 图片兜底只一帧（原先的「两帧交叉淡化」已改成单帧缓推）
    check(page.locator('.page-gate .gate-shot').count() == 1, '凯旋门页图片兜底为单帧')
    push = page.evaluate(
        "getComputedStyle(document.querySelector('.page-gate .gate-shot')).animationName")
    check(push == 'shotPush', '单帧缓推动画已挂上：' + str(push))

    # 3. 等凯旋门走完 → 检阅页
    check(wait_page('mode-review'), '凯旋门结束自动进检阅页')
    check(page.get_attribute('body', 'data-faction') == 'rome', '检阅页挂上阵营主题 rome')
    name1 = page.inner_text('#tourName')
    check(name1 == '轻装投枪兵', '第一队是「轻装投枪兵」，实际 ' + name1)
    crumb = page.inner_text('#tourCrumb')
    check('罗马' in crumb and '第 1 / 6 队' in crumb, '面包屑：' + crumb)
    # 地球槽的题注：兵种名 + 经纬度（app.js 的 capName / capCoord）
    cap = page.inner_text('#capName')
    check(cap == '轻装投枪兵', '地球题注写明当前兵种：' + cap)
    coord = page.inner_text('#capCoord').strip()
    check(coord != '', '地球题注写出经纬度：' + coord)
    loc = page.inner_text('#tourLoc')
    check(loc == '意大利 · 坎帕尼亚', '征召地：' + loc)
    data = page.inner_text('#tourData')
    check('编制' in data and '120' in data, '编制人数已写入：' + data[:24] + '…')
    check(page.locator('#tourTraits .tour-trait').count() == 3, '三条特征已渲染')
    globe_shown = page.evaluate("getComputedStyle(document.getElementById('globeSlot')).display")
    check(globe_shown == 'block', '检阅页显示地球')
    check(page.locator('#tcPrev').is_disabled(), '第一队时「上一队」禁用')
    # 缺图回退色卡：背景应是渐变而非 url()
    bg = page.evaluate("document.getElementById('tourImg').style.background || document.getElementById('tourImg').style.backgroundImage")
    check('url(' not in bg, '兵种图缺失时回退色卡（无图不炸）')

    # 4. 逐队前进到军团志
    steps = 0
    while mode() == 'mode-review' and steps < 10:
        page.locator('#tcNext').click()
        page.wait_for_timeout(180)
        steps += 1
    check(mode() == 'mode-summary', '末队点「军团志」进总结页（点了 %d 次）' % steps)
    check(page.inner_text('#sumCount') == '6', '军团志计 6 个兵种')
    check(page.inner_text('#sumKind') != '0', '军团志统计兵种类型：' + page.inner_text('#sumKind'))
    check(page.locator('#sumBars svg.radar').count() == 1, '六维战力雷达图已画出')
    check(page.locator('#sumDishes .sum-dish').count() == 6, '兵种档案 6 行')
    brief = page.inner_text('#sumBrief')
    check('编制合计' in brief, '检阅简报：' + brief[:40] + '…')

    # 5. 返回 + 自选军团分支
    page.locator('#scBack').click()
    page.wait_for_timeout(300)
    check(mode() == 'mode-factions', '返回阵营选择页')
    page.locator('#routeList .route-card').nth(8).click()
    page.wait_for_timeout(300)
    check(mode() == 'mode-builder', '进入自选军团页')
    n_pool = page.locator('#bdPool .bd-item').count()
    check(n_pool == 48, '兵种名录 48 条，实际 ' + str(n_pool))
    n_group = page.locator('#bdPool .bd-era-group').count()
    check(n_group == 7, '名录按 7 类分组，实际 ' + str(n_group))
    check(page.locator('#bdStart').is_disabled(), '未选兵种时「开始检阅」禁用')
    page.locator('#bdPool .bd-item').nth(0).click()
    page.locator('#bdPool .bd-item').nth(5).click()
    page.wait_for_timeout(200)
    check(page.locator('#bdPicked .bd-chip').count() == 2, '已选 2 队')
    check(not page.locator('#bdStart').is_disabled(), '有编制后可开始检阅')
    page.locator('#bdStart').click()
    page.wait_for_timeout(400)
    check(mode() == 'mode-gate', '自选军团走凯旋门流程')
    check(wait_page('mode-review'), '自选军团进入检阅')
    check(page.get_attribute('body', 'data-faction') == 'custom', '自选军团挂 custom 主题')
    check(page.inner_text('#tourCrumb').endswith('第 1 / 2 队'), '自选军团只检阅 2 队')

    # 6. 背景音乐（base64 藏在 assets/audio/bgm.js，运行时 atob → Web Audio 解码）
    # 开关能翻转即说明整条链路通了：注入 → 解码 → 起播。若解码失败，
    # aria-pressed 会一直停在 false，切换检查就会红。
    bgm_len = page.evaluate("(window.RTW3D_BGM||'').length")
    check(bgm_len > 100000, 'BGM 已注入（base64 长度 %d）' % bgm_len)
    p0 = page.get_attribute('#bgmBtn', 'aria-pressed')
    page.locator('#bgmBtn').click()
    page.wait_for_timeout(1200)
    p1 = page.get_attribute('#bgmBtn', 'aria-pressed')
    check(p0 != p1, 'BGM 开关可切换（aria-pressed %s → %s）' % (p0, p1))

    # 7. 无 JS 异常
    # 素材（兵种图 / 场景图 / bgm.js）此时尚未生成，404 属预期 —— 页面必须照常跑，
    # 所以把「资源 404」与「真实 JS 异常」分开统计：前者只登记，后者才判失败。
    missing = [e for e in errors if 'Failed to load resource' in e]
    real = [e for e in errors if 'Failed to load resource' not in e and 'favicon' not in e.lower()]
    check(not real, '全程无 JS 异常' + ('' if not real else '：' + ' | '.join(real[:3])))
    print('note 素材未生成，资源 404 共 %d 条（页面已按缺图契约照常跑完）' % len(missing))

    browser.close()

print('\n共 %d 项，%s' % (checks, '✅ 全部通过' if not fails else '❌ %d 项未通过' % len(fails)))
sys.exit(1 if fails else 0)
