# 无头冒烟：走通 阵营选择 → 过渡页（即将检阅）→ 检阅 → 军团志，外加自选军团分支。
# 用法：python tools/smoke_test.py
# 判据：全程无 JS 异常 / console.error；五页 DOM 关键点逐一落到预期。
import os, sys, pathlib, time
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
    reqs = []    # 页面请求过的 URL：用来判「兵种图取哪一套」「有没有碰已退役的图」
    req_at = {}  # URL -> 第一次被请求的时刻：判「过渡画面是预热来的，还是进页才当场下载」

    def on_req(r):
        reqs.append(r.url)
        req_at.setdefault(r.url, time.time())

    page.on('request', on_req)

    def mode():
        """body 上还有可能挂别的状态类，
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
    # hero 副标题走英文：中文那行「ROMA · 兵种志」中英混排，夹在拉丁字母里很突兀
    sub = page.inner_text('.park-sub')
    check('LEGION CODEX' in sub and '兵种志' not in sub, 'hero 副标题为英文：' + sub)
    # 首页 hero 轮播：八大军团横幅各一层（纯 CSS 交叉淡化，无 JS 定时器）
    n_shots = page.locator('.park-shots .park-shot').count()
    check(n_shots == 8, '首页 hero 轮播 8 层（八大军团横幅），实际 ' + str(n_shots))
    shot_bg = page.evaluate(
        "getComputedStyle(document.querySelectorAll('.park-shot')[0]).backgroundImage")
    check('faction-rome' in shot_bg, '首层轮播吃罗马阵营横幅：' + shot_bg[:64])
    check(page.evaluate("!document.getElementById('globeSlot')"), '3D 地球组件已移除（无 #globeSlot）')

    # 2. 点阵营 → 过渡页（即将检阅）
    t_pick = time.time()
    page.locator('#routeList .route-card').nth(0).click()
    page.wait_for_timeout(400)
    check(mode() == 'mode-gate', '进入过渡页')
    # 过渡页写的是「选中的这个阵营」，不是 app 的名字（罗马那一档才配 SPQR）
    check(page.inner_text('#gateTitle') == '罗马', '过渡页标题＝阵营名：' + page.inner_text('#gateTitle'))
    check('SPQR' in page.inner_text('#gateSubtitle'), '罗马档保留 SPQR 副标题')
    check('队' in page.inner_text('#gateRouteName'), '过渡页写明队数：' + page.inner_text('#gateRouteName'))
    # 视频设定已下线：页面里不该再有 video 元素
    check(page.evaluate("!document.querySelector('.page-gate video')"), '过渡页已无 video 元素（视频设定下线）')
    # ⑨ 按阵营取图：--gate-art 要指向该阵营的专属图 + 该阵营横幅（两层，就这两层）
    gate_art = page.evaluate(
        "getComputedStyle(document.querySelector('.gate-stage')).getPropertyValue('--gate-art')")
    check('gate-rome.webp' in gate_art, '⑨ 过渡画面按阵营取图（罗马）：' + gate_art[:80])
    check('faction-rome.webp' in gate_art, '⑨ 第一层兜底是该阵营横幅：' + gate_art[:80])
    # 而这张图必须**在点阵营之前**就已经请求过（启动期预热 warmGateArt + 就绪才进页）。
    # 否则进页那一刻才开始下载，画面链下一层的阵营横幅会先顶上来 ——
    # 也就是「先显示别的图，再切到过渡图」那一下闪。
    gate_url = next((u for u in reqs if u.endswith('/assets/tex/gate-rome.webp')), None)
    check(gate_url is not None and req_at.get(gate_url, 1e9) < t_pick,
          '⑨ 过渡画面在进页前已预热（进页不会先闪一张横幅）')
    # 通用凯旋门 ③⑤⑥ 已整组退役：既不能出现在页面里，也不能被请求
    # （它们是「上下信箱边露出原来大门」的来源 —— 图里还画着一台现代相机）
    check('gate-front' not in gate_art and '/tex/gate.webp' not in gate_art,
          '画面链里没有退役的通用凯旋门：' + gate_art[:80])
    check(not any('/tex/gate-front' in u or u.endswith('/tex/gate.webp') for u in reqs),
          '过渡页不再请求退役的通用凯旋门图')
    # 画面只一帧（原先的「两帧交叉淡化」与视频层都已取消）
    check(page.locator('.page-gate .gate-shot').count() == 1, '过渡页主画面为单帧')
    push = page.evaluate(
        "getComputedStyle(document.querySelector('.page-gate .gate-shot')).animationName")
    check(push == 'shotPush', '单帧缓推动画已挂上：' + str(push))
    # 画面铺满：cover 而非 contain —— 否则竖屏下 16:9 的图会缩成中间一条、上下留横边
    shot_size = page.evaluate(
        "getComputedStyle(document.querySelector('.page-gate .gate-shot')).backgroundSize")
    # 画面链是多层（⑨ + 阵营横幅），backgroundSize 会按层返回「cover, cover」
    check(shot_size.split(',')[0].strip() == 'cover',
          '过渡页画面 cover 铺满整屏（不留上下横边）：' + shot_size)

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
    # 注意：#gearCol 的第一个子元素是 .gear-ttl（标题），所以这里不能用 :first-child
    g1 = page.locator('#gearCol .gear-i').first.locator('.gear-nm').inner_text()
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
    # 兵种图（2026-09-22 定稿）：只有写实一套，罗马也一样。判据不走 DOM 的时序
    # （图可能还没回来），直接看页面请求了哪些 URL。
    check(any(u.endswith('/assets/units/velites.webp') for u in reqs),
          '罗马首队（轻装投枪兵）取写实那套')
    check(not any('/units/card/' in u for u in reqs), '不再请求已退役的兵牌图')
    check(page.locator('#tourStyle').count() == 0, '「写实 / 兵牌」切换开关已删除')
    check('素材未生成' not in page.inner_text('body'), '详情页不再出现「素材未生成」提示')
    # 画像总得有个底：有图给图、缺图给色卡，绝不留空框
    img_style = page.evaluate("document.getElementById('tourImg').getAttribute('style') || ''")
    check(bool(img_style), '兵种图画框已上背景（有图给图 / 缺图给色卡）')

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
    # 雷达图的数据层取 --f-accent*，靠的正是这一页**仍挂着阵营主题**（回阵营页时才摘）。
    # 摘掉的话它就退回 :root 的默认值，于是不管刚检阅的是哪一支军团，图都是罗马红。
    check(page.get_attribute('body', 'data-faction') == 'rome',
          '军团志保留阵营主题（雷达图取当前阵营色，不是写死的帝国红）')
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
    # 名录一次渲染 48 条，48 张写实图此刻都已进入探测队列
    check(any(u.endswith('/assets/units/phalanx.webp') for u in reqs),
          '非罗马兵种（马其顿方阵兵）也走写实那套')
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
    # 换了阵营，雷达图必须跟着换色：罗马档是红（#d0433a），自选军团是金（#c9a93e）。
    # 判据取**页面上真画出来的颜色**，不认 CSS 里写了什么。
    steps2 = 0
    while mode() == 'mode-review' and steps2 < 5:
        page.locator('#tcNext').click()
        page.wait_for_timeout(180)
        steps2 += 1
    face_custom = page.evaluate(
        "getComputedStyle(document.querySelector('#sumBars .radar .face')).fill")
    check(mode() == 'mode-summary' and face_custom.replace(' ', '') == 'rgb(201,169,62)',
          '换阵营后雷达图配色跟着换（custom 金 ' + face_custom + '）')

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
    # 素材可能有个别缺位（缺图一律回退，页面必须照常跑），所以把「资源 404」与
    # 「真实 JS 异常」分开统计：前者只登记并点名，后者才判失败。
    missing = [e for e in errors if 'Failed to load resource' in e and 'favicon' not in e.lower()]
    real = [e for e in errors if 'Failed to load resource' not in e and 'favicon' not in e.lower()]
    check(not real, '全程无 JS 异常' + ('' if not real else '：' + ' | '.join(real[:3])))
    check(not missing, '全程无资源 404（素材齐备）' + ('' if not missing else '：共 %d 条' % len(missing)))

    browser.close()

print('\n共 %d 项，%s' % (checks, '✅ 全部通过' if not fails else '❌ %d 项未通过' % len(fails)))
sys.exit(1 if fails else 0)
