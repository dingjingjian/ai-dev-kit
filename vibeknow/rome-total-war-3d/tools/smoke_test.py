# 无头冒烟：走通 阵营选择 → 过渡页（即将检阅）→ 检阅 → 军团志，外加自选军团分支。
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
        """body 上还会挂 img-missing 之类的状态类，
        只取第一个 token（由 className 整体赋值写入的 mode-*）来判定当前页。"""
        return ((page.get_attribute('body', 'class') or '').split() or [''])[0]

    def wait_page(cls, timeout=14000):
        """轮询等 body 切到指定页面。过渡页固定 7.1s，但加载与动画都可能拖后，
        写死 wait_for_timeout 会误判，所以一律轮询。"""
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
    check(page.evaluate("!document.getElementById('globeSlot')"), '3D 地球组件已移除（无 #globeSlot）')

    # 2. 点阵营 → 过渡页（即将检阅）
    page.locator('#routeList .route-card').nth(0).click()
    page.wait_for_timeout(400)
    check(mode() == 'mode-gate', '进入过渡页')
    # 过渡页写的是「选中的这个阵营」，不是 app 的名字（罗马那一档才配 SPQR）
    check(page.inner_text('#gateTitle') == '罗马', '过渡页标题＝阵营名：' + page.inner_text('#gateTitle'))
    check('SPQR' in page.inner_text('#gateSubtitle'), '罗马档保留 SPQR 副标题')
    check('队' in page.inner_text('#gateRouteName'), '过渡页写明队数：' + page.inner_text('#gateRouteName'))
    # 视频设定已下线：页面里不该再有 video 元素
    check(page.evaluate("!document.querySelector('.page-gate video')"), '过渡页已无 video 元素（视频设定下线）')
    # ⑨ 按阵营取图：--gate-art 要指向该阵营的专属图 + 该阵营横幅（两层兜底），
    # 且不能是全局的 gate-front（否则就不是「每阵营一张不同的图」）
    gate_art = page.evaluate(
        "getComputedStyle(document.querySelector('.gate-stage')).getPropertyValue('--gate-art')")
    check('gate-rome.webp' in gate_art, '⑨ 过渡画面按阵营取图（罗马）：' + gate_art[:80])
    check('faction-rome.webp' in gate_art, '⑨ 第一层兜底是该阵营横幅：' + gate_art[:80])
    # 画面只一帧（原先的「两帧交叉淡化」与视频层都已取消）
    check(page.locator('.page-gate .gate-shot').count() == 1, '过渡页主画面为单帧')
    push = page.evaluate(
        "getComputedStyle(document.querySelector('.page-gate .gate-shot')).animationName")
    check(push == 'shotPush', '单帧缓推动画已挂上：' + str(push))

    # 3. 等过渡页走完 → 检阅页
    check(wait_page('mode-review'), '过渡页结束自动进检阅页')
    check(page.get_attribute('body', 'data-faction') == 'rome', '检阅页挂上阵营主题 rome')
    name1 = page.inner_text('#tourName')
    check(name1 == '轻装投枪兵', '第一队是「轻装投枪兵」，实际 ' + name1)
    crumb = page.inner_text('#tourCrumb')
    check('罗马' in crumb and '第 1 / 6 队' in crumb, '面包屑：' + crumb)
    # 装备拆解：轻装投枪兵 4 件（无甲 / 兽皮头兜 / 小圆盾 / 轻标枪），空槽不渲染
    n_gear = page.locator('#gearCol .gear-i').count()
    check(n_gear == 4, '装备拆解渲染 4 件（空槽不占位），实际 ' + str(n_gear))
    g1 = page.inner_text('#gearCol .gear-i:first-child .gear-nm')
    check(g1 == '兽皮头兜', '装备按槽位顺序（头部在前）：' + g1)
    check('装备拆解' in page.inner_text('#gearCol .gear-ttl'), '拆解有标题与件数')
    # 空槽不渲染：轻装投枪兵没有坐骑，列表里不该出现「坐骑」
    check('坐骑' not in page.inner_text('#gearCol'), '空槽未渲染（无坐骑行）')
    loc = page.inner_text('#tourLoc')
    check(loc == '意大利 · 坎帕尼亚', '征召地：' + loc)
    data = page.inner_text('#tourData')
    check('编制' in data and '120' in data, '编制人数已写入：' + data[:24] + '…')
    check(page.locator('#tourTraits .tour-trait').count() == 3, '三条特征已渲染')
    check(page.locator('.tour-row .tour-frame').count() == 1, '兵种图与拆解同排（.tour-row）')
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
    check(mode() == 'mode-gate', '自选军团走过渡页流程')
    # 换阵营后标题必须跟着换：自选军团不是罗马，不能顶着「罗马军团图鉴 / SPQR」
    check(page.inner_text('#gateTitle') == '自选军团', '自选军团档标题＝自选军团：' + page.inner_text('#gateTitle'))
    check('SPQR' not in page.inner_text('#gateSubtitle'), '非罗马档不出现 SPQR：' + page.inner_text('#gateSubtitle'))
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
