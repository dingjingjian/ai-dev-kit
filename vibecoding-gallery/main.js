'use strict';

/* ===================== 菜单 ===================== */

var TRACKS = {
  all:     { tag: '#vibecoding大赛', label: '全部' },
  game:    { tag: '#vibegame',       label: '游戏' },
  tool:    { tag: '#vibetool',       label: '工具' },
  guofeng: { tag: '#国风vibecoding', label: '国风' },
  liked:   { tag: '',                label: '已赞' }
};

/* ===================== 数据（截图版权归原作者） ===================== */

var WORKS = [
  {
    id: 'fireworks', title: '我的户外烟花秀', author: '哲学咖啡师', track: 'tool',
    cover: '01-zhexue-kafeishi-fireworks.jpg',
    noteId: '6aaeafa10000000028035c68',
    link: 'https://www.xiaohongshu.com/discovery/item/6aaeafa10000000028035c68?source=webshare&xhsshare=pc_web&xsec_token=ABASlAyw-oFk4DQ1E09kO4pGBCPEdt7uDgxP3uotmSgyI=&xsec_source=pc_share',
    intro: '虚拟夜景下放烟花的互动工具：六座城市背景任选，还能沿轮廓抠出你站过的江边、窗边、天台，铺进夜空再按下开关。',
    highlights: [
      '六座城市 + 自定义照片背景，「贴地对齐」或「铺满整片天」两种贴合模式',
      '沿轮廓手绘一圈即可抠出猫、人像等主体，强情感化个人化体验',
      '实体感「按下」打火器开关作为核心触发，仪式感交互动线清晰'
    ],
    tech: 'h5 · 推测 Canvas/WebGL 夜景渲染'
  },
  {
    id: 'pocket-museum', title: '掌上博物馆', author: '哲学咖啡师', track: 'tool',
    cover: '02-zhexue-kafeishi-pocket-museum.jpg',
    noteId: '6aa680510000000027017115',
    link: 'https://www.xiaohongshu.com/discovery/item/6aa680510000000027017115?source=webshare&xhsshare=pc_web&xsec_token=ABsDDQqKSCJ6ra2Jw8P6hzv0mMskfKsXFV1i5aJ8DZnx0=&xsec_source=pc_share',
    intro: '把博物馆展品缩小到手机里的 3D 展品浏览器：首件展品 T-72B3 坦克可 360° 旋转放大看细节，按「第 N 件展品」持续连载。',
    highlights: [
      '360° 旋转 / 缩放 / 自转开关 / 复位 / 展签，移动端 3D 手势操作完整',
      '编号部件导览点选聚焦对应结构，「看得懂」的教育价值设计',
      '「第 N 件展品」连载 + 评论区征集选题，CC BY 4.0 授权标注规范'
    ],
    tech: 'h5 · 推测 WebGL/Three.js'
  },
  {
    id: 'suxiu', title: '丝丝入扣 · TI同款苏绣', author: '猫哥（@TeamMooLab）', track: 'guofeng',
    cover: '03-maoge-suxiu.jpg',
    noteId: '6a8823880000000035026757',
    link: 'https://www.xiaohongshu.com/discovery/item/6a8823880000000035026757?source=webshare&xhsshare=pc_web&xsec_token=ABjwmmtNGBw4T3KfDz7nGZAdLZOToZMB5YDH5zguCBhvc=&xsec_source=pc_share',
    intro: '把照片转成苏绣针迹的国风小工具：飞针动画逐针「绣」出来，针法密度与丝线配色可调，复现 DOTA2 TI 苏绣主题视觉。',
    highlights: [
      '苏绣/缎绣两种针法、密度针数可调，按针迹逐针绘制而非贴滤镜',
      '飞针动画把「绣的过程」做成可观赏的核心体验',
      '完成后显示「绣成 · 3807 针 · 7 色 · 留白 2%」参数化结果反馈'
    ],
    tech: 'h5 · GLM 5.3 生成 · 推测 Canvas'
  },
  {
    id: 'speed-drift', title: '极速漂移 SPEED DRIFT', author: '词元AI编程', track: 'game',
    cover: '04-ciyuan-ai-speed-drift.jpg',
    noteId: '6a9e4a79000000001001cfbb',
    link: 'https://www.xiaohongshu.com/discovery/item/6a9e4a79000000001001cfbb?source=webshare&xhsshare=pc_web&xsec_token=ABjfgcEzSWOdluSkNocbyo4N5eb-Z6sM-xpWT2ujwxPXQ=&xsec_source=pc_share',
    intro: '手机免下载直接玩的 3D 漂移赛车：拖动旋转车身选车、双指缩放进入赛道，主打「过弯拉手刹那一下」的漂移手感与解压体验。',
    highlights: [
      '拖动旋转车身选车、双指缩放入场，把 3D 观察做成交互的一部分',
      '单点极致押注漂移手感：「过弯拉手刹那一下，太解压了」',
      '竖屏金色大字标题 + 竖排按钮，低多边形赛道兼顾移动端性能'
    ],
    tech: 'h5 · AI 编写 · 推测 Three.js'
  },
  {
    id: 'doraemon-house', title: '哆啦A梦的家 · 串门探险记', author: 'CarryTzz', track: 'game',
    cover: '05-carrytzz-doraemon-house.jpg',
    noteId: '6aa27919000000000b001536',
    link: 'https://www.xiaohongshu.com/discovery/item/6aa27919000000000b001536?source=webshare&xhsshare=pc_web&xsec_token=ABFiDNjaWzftGW-0uFR5xOMtUdaeLQD8xbmnKrVjV8n8M=&xsec_source=pc_share',
    intro: '进大雄家自由探索的 3D 寻宝游戏：翻抽屉、开柜门、戴竹蜻蜓飞高处、用穿墙圈进藏宝室，一共 50 件秘密道具等你找齐。',
    highlights: [
      '50 件道具 = 34 件自由寻找 + 16 件能力解锁小冒险，收集分层清晰',
      '「看见 ≠ 拿到」道具解谜链：缩小、放大、修复，道具互为钥匙',
      '地面搜索 + 竹蜻蜓飞高 + 穿墙进暗室，三层空间纵深探索感立体'
    ],
    tech: 'h5 · 推测 Three.js 3D 场景'
  },
  {
    id: 'fly', title: '中国人能飞 🪽', author: '倪的AI笔记📝', track: 'game',
    cover: '06-nide-ai-fly.jpg',
    noteId: '6a8ec88d0000000028004e1d',
    link: 'https://www.xiaohongshu.com/discovery/item/6a8ec88d0000000028004e1d?source=webshare&xhsshare=pc_web&xsec_token=ABH92no4SUJ9uKAhFMk4qJj1-QeYASJDmF8mY6A5x-wFg=&xsec_source=pc_share',
    intro: '竖屏像素风自动飞升攀高游戏：角色自己往上飞，你只负责左右控制踩平台借力，看谁飞得更高。',
    highlights: [
      '底部左右双触区设计，竖屏单手即可玩，操作门槛极低',
      '纵向自动飞升 + 横向微操，把玩法压缩到「一个维度」的决策',
      '高度 / 最高 / 区域名三件套 HUD，攀比欲直接拉满'
    ],
    tech: 'h5 · 像素风 · 推测 Canvas 2D'
  },
  {
    id: 'jump-ball', title: '跳吧小球', author: 'Way的AI创造社', track: 'game',
    cover: '07-way-ai-jump-ball.jpg',
    noteId: '6aa56fe8000000002502e51a',
    link: 'https://www.xiaohongshu.com/discovery/item/6aa56fe8000000002502e51a?source=webshare&xhsshare=pc_web&xsec_token=ABiV9qFHzzYiVTv08KCbyCv4O-Y9usH1NQ_saM593eE3k=&xsec_source=pc_share',
    intro: '弹跳小球闯关 + 星标货币皮肤商店 + 成就系统，博主自述玩家破 38 万，是参赛作品里体量最大的长线运营案例。',
    highlights: [
      '星标货币皮肤商店：仓鼠、卡皮巴拉等 9+ 款软萌小球分档定价',
      '以「新皮肤上线」为由头发更新笔记召回老玩家，长线运营节奏',
      '「玩家破 38 万」真实数据做信任背书'
    ],
    tech: 'h5 · 3D 卡通 · 推测 Three.js'
  },
  {
    id: 'mini-flight', title: '迷你飞行 · Q版模拟飞行', author: '哈哈要去哪里', track: 'game',
    cover: '08-haha-mini-flight.jpg',
    noteId: '6aabb29e000000002a004eaf',
    link: 'https://www.xiaohongshu.com/discovery/item/6aabb29e000000002a004eaf?source=webshare&xhsshare=pc_web&xsec_token=ABPb7oRjzFejpo01O9T4uVvFJdc8GnR1x9g2I6U4XLODM=&xsec_source=pc_share',
    intro: 'Q 版 3D 模拟飞行：点击起飞、在开放天空游览，螺旋桨机、特技机、喷气机、客机多机型阵容，宣传图是海报级构图。',
    highlights: [
      '4+ 架 Q 版机型（螺旋桨/特技/喷气/客机），机身带注册号与涂装',
      '把专业模拟飞行简化为「点击起飞」的 Q 版体验，保留机场塔台场景',
      '海报级宣传图：标题字效 + 四机编队 + slogan，制作规格拉满'
    ],
    tech: 'h5 · Q 版 3D · 推测 Three.js'
  },
  {
    id: 'parking', title: '科目二挑战赛', author: '左手', track: 'game',
    cover: '09-zuoshou-keer-parking.jpg',
    noteId: '6a964de100000000270080fe',
    link: 'https://www.xiaohongshu.com/discovery/item/6a964de100000000270080fe?source=webshare&xhsshare=pc_web&xsec_token=ABZs6wR8HZcFeuHtJqDOYFblF1dS7pzmheZDs_FUikkR0=&xsec_source=pc_share',
    intro: '把科目二驾驶考做成关卡制停车解谜：3D 俯视停车场里把车开出库，按用时 / 擦撞 / 挪车三维结算星级，「一把进」你来试试？',
    highlights: [
      '用时 / 擦撞 / 挪车三项指标并列结算 + 星级，维度透明可优化',
      '科目二题库即关卡清单：直出、倒库、侧方、坡道……天然关卡库',
      '灰暗色环境车 + 高饱和玩家车，视觉焦点管理清晰'
    ],
    tech: 'h5 · 3D 俯视 · 推测 Three.js'
  },
  {
    id: 'excavator-pig', title: '挖掘机抓猪', author: '星空下的人', track: 'game',
    cover: '10-xingkong-excavator-pig.jpg',
    noteId: '6aad360500000000270160bf',
    link: 'https://www.xiaohongshu.com/discovery/item/6aad360500000000270160bf?source=webshare&xhsshare=pc_web&xsec_token=ABETpofYcFUKQ_zp2e1gqaLGkaDxFcGDsHWH7uRjo6Al4=&xsec_source=pc_share',
    intro: '把「广西洪水挖掘机抓猪」全网热梗做成 3D 操作游戏：左手控制底盘追猪、右手控制机械臂抓，抓到送回围栏。',
    highlights: [
      '热梗题材自带流量与搜索词，选题眼光毒辣',
      '女玩家吐槽 → 听劝连夜改第三人称视角，迭代复盘写成连续剧',
      '左手追猪右手瞄准 + 按键教学，帮非传统玩家跨过上手坎'
    ],
    tech: 'h5 · 低多边形 3D · 推测 Three.js'
  },
  {
    id: 'next-blue-dot', title: '下一个蓝点', author: '豆米AI', track: 'game',
    cover: '11-doumi-next-blue-dot.jpg',
    noteId: '6aaa7aa30000000026031dba',
    link: 'https://www.xiaohongshu.com/discovery/item/6aaa7aa30000000026031dba?source=webshare&xhsshare=pc_web&xsec_token=AB9XjDaMmirGGm8W5Dc5rH1GkqfszYQJ_EplEG_4WQfGg=&xsec_source=pc_share',
    intro: '点、按住、滑三个手势飞向宇宙边缘：尺度尺从米一路跳到百万光年，结局是一颗真实存在的宜居系外行星。整包约 100KB。',
    highlights: [
      '三手势贯穿六阶段玩法，操作集合极小、玩法密度极高',
      '时间膨胀「不参与玩法，纯粹因为它是真的」——真实即内容',
      '零图片零音频，61 张天体卡全部参数化实时绘制，极端轻量化'
    ],
    tech: 'h5 · 纯参数化绘制 · 约 100KB'
  },
  {
    id: 'bianzhong', title: '三十秒学会用编钟弹《晴天》', author: '机器旁白', track: 'guofeng',
    cover: '12-jiqi-bianzhong-qingtian.jpg',
    noteId: '6a969de6000000002800208c',
    link: 'https://www.xiaohongshu.com/discovery/item/6a969de6000000002800208c?source=webshare&xhsshare=pc_web&xsec_token=AB1omuMyMDrRAcOZGilD3vqXlNQfLL5gdHiOwFivPxaSw=&xsec_source=pc_share',
    intro: '国乐编钟数字化：曾侯乙编钟式三层钟架还原「一钟双音」，轻触钟面听一声金石，三十秒学会用编钟弹奏《晴天》。',
    highlights: [
      '钮钟/甬钟/镈钟三层形制 + 每钟双音位标注，考据感直接成为卖点',
      '「三十秒之内教会你」把学习成本写进标题，转化路径极短',
      '敲击发光涟漪 + 「此刻钟音」状态栏，每次点击视听双重回应'
    ],
    tech: 'h5 · 音乐工具'
  },
  {
    id: 'relic-viewer', title: '文物放大镜 · 掌上赏珍', author: '木渡川', track: 'guofeng',
    cover: '13-muduchuan-relic-viewer.jpg',
    noteId: '6aa226ad0000000011031465',
    link: 'https://www.xiaohongshu.com/discovery/item/6aa226ad0000000011031465?source=webshare&xhsshare=pc_web&xsec_token=ABFiDNjaWzftGW-0uFR5xOMt_W-xOGTmZvHKhvK6HOdds=&xsec_source=pc_share',
    intro: '宣纸底色 + 展签版式的 3D 文物交互：揭顶观乐看内部乐师、细节导览分步聚焦、生成文物图鉴，覆盖完整观展动线的全流程教程。',
    highlights: [
      '界面即展陈设计：宣纸底、竖排书法标题、中英双馆名，版式语言统一',
      '六个功能覆盖「看全貌 → 看内部 → 看细节 → 留纪念」完整动线',
      '「春秋｜青铜器｜高 17 厘米」文物档案字段直接落版，科普严谨感拉满'
    ],
    tech: 'h5 · 教程 / webapp'
  },
  {
    id: 'squeeze-toy', title: '捏捏乐', author: '阿毛的脑洞', track: 'game',
    cover: '14-amao-squeeze-toy.jpg',
    noteId: '6aa36e010000000026017522',
    link: 'https://www.xiaohongshu.com/discovery/item/6aa36e010000000026017522?source=webshare&xhsshare=pc_web&xsec_token=ABcTHjdkq5QNPXfFz4D5TzMsSOIjq2rFkuUGpO2Oi98f8=&xsec_source=pc_share',
    intro: '把线下流行的慢回弹「捏捏乐」搬进手机：饭团、牛角包、小猪、布丁，摸鱼时捏一捏很解压，目前八种捏捏持续上新。',
    highlights: [
      '实物拟物数字化，题材自带解压认知，零学习成本',
      '「摸鱼时捏一捏」明确的碎片时间场景定位',
      '八种捏捏 SKU 化更新 + 评论区征集下一款模型'
    ],
    tech: 'h5 · 小红书小工具'
  },
  {
    id: 'moon-letter', title: '月下寄笺局 · 月亮信', author: '闲话AI | 造物日记', track: 'guofeng',
    cover: '15-xianhua-moon-letter.jpg',
    noteId: '6a9c2c180000000026018fe2',
    link: 'https://www.xiaohongshu.com/discovery/item/6a9c2c180000000026018fe2?source=webshare&xhsshare=pc_web&xsec_token=ABgyjiKnSj8-cKE2Iozok0qDqjOG9u-i57Z-4uXb7E3wo=&xsec_source=pc_share',
    intro: '「当面太浓烈，微信怕唐突」——中秋把没来得及说的话寄给月亮：一封可截图转发的月亮信，情绪场景工具。',
    highlights: [
      '自有品牌「月下寄笺局」，机构拟人 + 克莱因蓝版画风格，美术克制',
      '精准戳中中式情感表达的克制痛点，把工具定位成「安全出口」',
      '寄信天然产出可截图转发的个人化结果，UGC 自传播'
    ],
    tech: 'h5 · 互动工具'
  },
  {
    id: 'bala-bala', title: 'bala bala · 解压球球', author: 'Mingo 🥕', track: 'tool',
    cover: '16-mingo-bala-bala.jpg',
    noteId: '6aae76ec0000000029019a9b',
    link: 'https://www.xiaohongshu.com/discovery/item/6aae76ec0000000029019a9b?source=webshare&xhsshare=pc_web&xsec_token=ABdAl8pX503j3i3ttrJOJ4N7GEJLepe3-I3lEmRKEbSGQ=&xsec_source=pc_share',
    intro: '戳一戳、按一按、扒拉扒拉的解压球球：可上传照片定制专属球（老板球警告），粉圈密码解锁专享彩蛋，还有桌面时钟陪伴形态。',
    highlights: [
      '戳 / 按 / 扒拉三种触觉动词对应三种反馈，纯触觉解压',
      '「上传老板照片狠狠旋转它」——UGC 玩法自带梗传播力',
      '粉圈密码解锁「专享同担五球」，圈内圈外两层身份设计'
    ],
    tech: 'h5 · 互动工具'
  },
  {
    id: 'piece-of-moonlight', title: 'Piece of Moonlight · 月相互动音乐', author: '生姜醋饭', track: 'guofeng',
    cover: '17-piece-of-moonlight.jpg',
    noteId: '6a9e7f0e0000000028035dd9',
    link: 'https://www.xiaohongshu.com/discovery/item/6a9e7f0e0000000028035dd9?source=webshare&xhsshare=pc_web&xsec_token=ABRPKZVc37eJxffwd4-y1n57h5JKGNT8u0ZTmFUsA1tTs=&xsec_source=pc_share',
    intro: '把月亮 15 种圆缺映射成 C3–C5 音高的互动音乐工具：选一个月相就成为五线谱上的一枚音符，短按半拍、长按更长的音，播放时月亮反色亮起、乐谱跟随旋律前移。',
    highlights: [
      '自然意象承载抽象音乐概念：月相圆缺 ↔ 音高高低，把乐理门槛降到「选月亮」',
      '交互闭环清晰：选意象 → 实时落谱 → 播放高亮联动，视听强绑定',
      '7 种合成音色 + 4 种主题色 + 月相谱卡可保存分享，成品能带走'
    ],
    tech: 'h5 · 互动音乐工具 · 推测 Web Audio'
  },
  /* ===== 以下为本人（人工智能Ding🥕）的作品：mine=true 会打「我的」角标 ===== */
  {
    id: 'defcon', title: '核战危机 DEFCON', author: '人工智能Ding🥕', track: 'game',
    cover: '18-defcon.jpg',
    noteId: '6aa53b220000000011036fb1',
    link: 'https://www.xiaohongshu.com/discovery/item/6aa53b220000000011036fb1?source=webshare&xhsshare=pc_web&xsec_token=ABiV9qFHzzYiVTv08KCbyCv5hz5qYL-CrtVSjn7-d1dX8=&xsec_source=pc_share',
    intro: '3D 球面核战策略：危机博弈推高 DEFCON 等级，核弹有限、死得少的赢——一场没有赢家的博弈，愿世界和平。',
    highlights: [
      '最用心的作品：把冷战核威慑做成可玩的球面策略，每一次升级都在赌对方的克制',
      '核弹数量有限、胜负按伤亡结算——比的是「谁死得更少」，不是「谁打得更多」',
      '立意反战：「没有赢家、愿世界和平」不是装饰文案，而是这套机制推出来的结论'
    ],
    tech: 'h5 · 3D 球面策略 · 复用 vibeknow/earth-3d 球面引擎',
    mine: true
  },
  {
    id: 'earth-3d', title: '口袋地球', author: '人工智能Ding🥕', track: 'tool',
    cover: '19-earth-3d.jpg',
    noteId: '6a9cd74300000000290186bf',
    link: 'https://www.xiaohongshu.com/discovery/item/6a9cd74300000000290186bf?source=webshare&xhsshare=pc_web&xsec_token=AB5XVOySMnaRoqvFrY33XFy4oSfyUGfiu3UEZw2Js9CUk=&xsec_source=pc_share',
    intro: '把地球装进口袋：3D 地球科普，昼夜交替、四季成因、月相变化、地球内部结构，近 5000 人玩过。',
    highlights: [
      '最受用户欢迎：近 5000 人玩过，是这轮参赛人气最高的作品',
      '把抽象的天文地理做成能转、能看的直观演示：昼夜 / 四季 / 月相 / 内部圈层',
      '框架复用度最高：寰宇小馆、恐龙地球、帆船图鉴等后续作品都由它派生'
    ],
    tech: 'h5 · Three.js 3D 地球',
    mine: true
  },
  {
    id: 'jurassic-park', title: '恐龙地球（侏罗纪公园）', author: '人工智能Ding🥕', track: 'tool',
    cover: '20-jurassic-park.jpg',
    noteId: '6aaa7730000000002802eff1',
    link: 'https://www.xiaohongshu.com/discovery/item/6aaa7730000000002802eff1?source=webshare&xhsshare=pc_web&xsec_token=ABOhlrW8243-oy4otWhFmVyDvZKrdMkFvwvnhZiFLrKp8=&xsec_source=pc_share',
    intro: '手机沉浸式逛侏罗纪公园：坐巡逻车探访史前恐龙，30 只恐龙 / 4 条主题路线，行进途中在地球上标注化石发现地。',
    highlights: [
      '最受欢迎笔记：第一人称巡逻车视角逛公园，沉浸感就是传播点',
      '30 只恐龙 + 4 条主题路线（可自选），内容量撑得起反复游玩',
      '行进中把化石发现地标注到地球上，让「游览」和「科普坐标」绑在一起'
    ],
    tech: 'h5 · Three.js · 复用 world-food-3d 框架',
    mine: true
  }
];

/* 原笔记正文摘录：来源 reference/<目录>/README.md 的「笔记原文摘录」，
   仅用于详情页「原笔记摘录」展示，版权归各位原作者所有。
   注意：内容为精选片段，非原文全文；含 # 话题标签，保留原貌。 */
var NOTES = {
  'fireworks': '小工具【我的户外烟花秀】新功能上线了。\n点右上角「换背景」。把你站过的江边、窗边、天台，铺进夜空。贴地对齐地平线，或铺满整片天。六座城也在：北京、上海、广州、重庆、香港、澳门。嫌亮，就切暗夜。\n点左下角「选照片」。沿轮廓轻轻画一圈，裁出那只猫、那张笑。也可以整张用。\n然后按中间那只开关。\n欢迎搜索关注留言互动，解锁有趣好玩小工具。@户外薯\n#哲学咖啡师 #小红书外人节 #vibe外人节 #赛博户外 #小红书小工具',
  'pocket-museum': '如果坦克可以放进口袋里，会是什么感觉？\n掌上博物馆 · 第01件展品。今天把一辆 T-72 坦克"搬"进了小红书小工具 #掌上博物馆。\n这次不是看一张坦克照片，而是可以直接在手机里：🔄 360°旋转 🔍 放大观察细节 👀 从不同角度查看车体结构 📱 像在博物馆里绕着展品慢慢看。\n我一直觉得，很多博物馆里的展品，如果展品数字化，会有更多人可以获得知识。\n所以想做一个小实验：如果把博物馆里的展品缩小到手机里，会怎么样？\n🏛️ 第一件：T-72 坦克。下一件展品继续更新。大家想看什么展品，在评论区留言。\n#哲学咖啡师 #掌上博物馆 #军事模型 #T72 #3D博物馆 #数字博物馆 #小红书小工具 #小红书vibecoding大赛 #vibetool',
  'suxiu': 'TI同款苏绣国风小工具。TI没了西恩俱乐部后，那就剩下纯粹的享受了。今年TI的主题是苏绣，尝试用小工具复现了一下。全程使用 GLM 5.3 #GLM5 #智谱zcode（请给我发一份周额度重置吧）。初步复现成功，当然我测试了一下，优化空间还很大。anyway 希望大家玩的开心 😊 我也算完成个任务 @科技薯。\n#国风vibecoding #小红书小工具 #手作 #苏绣',
  'speed-drift': '什么？小红书也能玩3D赛车游戏了！AI 写的漂移赛车，手机免下载直接飙🏎️过弯拉手刹那一下，太解压了！\n#小红书vibecoding大赛 #vibecoding #VibeCoding #小红书小工具 #REDSkill #KimiK3 #国风vibecoding #vibegame #赛车游戏 @科技薯 @数码薯 #赛车模拟器',
  'doraemon-house': '大雄，你家墙后面怎么还有宝藏。\n我给这次串门定的目标很克制：进大雄家看看，找一件道具就走。然后——抽屉拉开了，柜门推开了。地上看完还不够，戴上竹蜻蜓往高处飞。最后掏出穿墙圈，连墙后面的藏宝室都进去逛了一圈😂。\n最让我上头的是，有些宝贝明明看见了，还得想办法拿到：挡路的积木要缩小，米粒大的铅笔要放大，坏盒子得先用包袱巾修好。找着找着，还铺起美食桌布，照着小纸条准备甜点，换回一片记忆面包。\n一共 50 件秘密道具。34 件在家里自由寻找，另外 16 件藏在 8 种能力对应的小冒险里。\n「最后再开一个抽屉。」——这是我今天最不可信的一句话。\n如果让你进大雄家，第一件最想找到什么？我先惦记上任意门了🚪\n#小红书vibecoding大赛 #哆啦A梦 #童年回忆 #小红书小工具 #寻宝游戏 #3D小游戏',
  'fly': '中国人能飞🪽。点击屏幕下方开始飞！看谁飞的更高哈哈哈哈哈哈哈哈哈我又有新作了。\n#中国人能飞 #小红书vibecoding大赛 #vibegame #AI编程 #个人开发者 #我要飞得更高 快来一起玩啊 @adhd生活实验 @Shule 舒乐熊的喵 @一个人从零开始做游戏',
  'jump-ball': '《跳吧小球》新皮肤来啦！玩家破 38 万！三只新小球上线，新增成就系统！赶紧回来看看吧。\n#小红书小工具 #vibecoding #我在小红书做游戏 #小红书vibecoding大赛 #vibegame #跳吧小球 #国风vibecoding #小红书小游戏',
  'mini-flight': 'Q版模拟飞行小工具。点击下方小工具直接起飞。\n#小红书小工具 #小红书vibecoding大赛 #vibegame #小游戏 #模拟飞行 #飞机',
  'parking': '出库 3星。出库「第 1 关 · 直出」通关。用时 00:33，擦撞 0 次，挪车 4 次。过道窄到怀疑人生，方向盘打死也就那样。你来试试？\n科目二挑战赛 #一把进 #停车技术 #小工具 #停车 #科目二 #vibecoding',
  'excavator-pig': '女玩家说挖掘机老掉河里，抓不到猪怎么办？我把火遍全网的广西洪水挖掘机抓猪做成游戏啦。然后昨天一个女玩家吐槽：「你这挖掘机怎么操作怎么刹车啊，我的挖掘机直接掉河里了😭一头猪都抓不到」。我很震惊，一定要她抓到猪猪。后来我发现有很多女孩子们和女士们不太懂挖掘机，然后她看了我的按键说明，自己打开右上角的视角切换功能，开第三人称视角连抓两头大白猪。听劝！我连夜把游戏默认视角改成了第三人称（半俯视视野）。今天我自己用竖屏实测了一下，真的巨爽！视野瞬间拉大，挖掘机、机械臂、奔跑的猪、动物庄园，一目了然！左手追猪，右手瞄准，抓住后送回围栏，一气呵成！评论区告诉我，你们更喜欢第一人称还是第三人称？👇\n#小红书vibecoding大赛 #vibegame #小红书小工具 #AI游戏 #广西洪水挖掘机抓猪 #VibeCoding #抓猪游戏 #抓猪挑战',
  'next-blue-dot': '通关条件不是飞得最远，是找到一颗有海的星球。《下一个蓝点》，从家门口的草地飞到宇宙的边缘。\n一局 60–90 秒，只有点、按住、滑三个手势：\n① 拼飞船，配平重心，刷个漆\n② 按住蓄能，松手落进绿区\n③ 滑着躲飞鸟、客机、雷暴、流星\n④ 按住靠近木星，松手，被引力甩出去（真·引力弹弓）\n⑤ 星图二选一：补给站、遗迹、黑洞、伽马暴\n⑥ 沿宇宙网的金色丝线往外飘\n六个阶段六种玩法，手势还是那三个，一次都没多。\n尺子从「米」起跳，一路跳到百万光年。过卡门线时屏幕上只有一句：「从这里开始，天空不再是天空。」\n整包一百来 KB，零图片零音频，61 张天体卡也是参数现画的。\n越接近光速，返航时地球流逝的年数越多。它不参与玩法，纯粹因为它是真的，就想放进去。\n结局那颗星叫 TOI-700 d，101.4 光年外，宜居指数 0.93。它真的在那儿。',
  'bianzhong': '三十秒之内教会你弹周杰伦的《晴天》！花两天时间做出来的编钟演奏，用它直接弹奏一曲周杰伦的《晴天》！就在笔记最下方，你也来试试吧～\n#vibecoding #小红书小工具 #小红书vibecoding大赛 #周杰伦 #晴天 #vibemusic',
  'relic-viewer': '「文物放大镜·掌上赏珍」这类 3D 数字交互项目的流程逻辑其实都大同小异，跟着视频拆解的步骤操作，带你跑通这类型项目的全流程。\n技术其实已经不难了，未来重要的是想法和创意，以及审美 sense。\n不用纠结工具，任意一款编程工具使用得当都可以做出效果不错的创意内容，但好的作品需要小步迭代、慢慢打磨，不要急于求成。\n赶紧做起来，一起探索尝试更多历史人文数字可视化交互的有趣创意！',
  'squeeze-toy': '在小红书上随时可以捏的电子宠物！摸鱼时捏一捏很解压！\n目前做了八种捏捏，宝子们有想做的模型可以聊聊哦\n#捏捏乐 #小游戏 #解压小游戏 #摸鱼神器 #vibegame #小红书vibecoding大赛',
  'moon-letter': '中秋，把没来得及说的话寄给月亮。\n有些话，当面说太浓烈，发微信又怕唐突。于是，借着今晚的月色，悄悄寄出去。\n点笔记下方的「用一用」，寄一封你的月亮信。\n#国风vibecoding #小红书vibecoding大赛 #中秋 #vibecoding #中秋赏月 #中秋节文案 #月亮是一种隐喻',
  'bala-bala': '给中秋前上班的你做一个解压小工具。压力大的时候不妨来戳一戳，按一按，扒拉扒拉。\n可以上传照片，定制属于你自己的球球。比如上传你老板的照片，然后狠狠旋转它。\n如果你解锁了好玩的球球，评论区分享给大家看看。\n如果你是同担，输入解锁密码，还可以有专享同担五球哦。\n如果你喜欢这个小工具，欢迎点个关注哦。\n#小红书vibecoding大赛 #vibetool #wmls #5525',
  /* 本人作品：手头只有笔记标题 + 自己的一句话简介，没有原文全文，故不往下补话题标签 */
  'defcon': '战争策略游戏 | 核战危机 DEFCON 🌏\n一场没有赢家的博弈，愿世界和平🕊️',
  'earth-3d': '把地球装进口袋！太绝了🌍\n3D 地球科普，近 5000 人玩过🌍',
  'jurassic-park': '手机沉浸式逛侏罗纪公园！太上头了🦖\n坐巡逻车探访史前恐龙🦕'
};

/* ===================== 工具函数 ===================== */

function $(id) { return document.getElementById(id); }

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function dimsOf(w) {
  var d = window.COVER_DIMS && window.COVER_DIMS[w.cover];
  return d || [540, 720];
}

var PALETTE = ['#ff8a65', '#7986cb', '#4db6ac', '#ffb74d', '#f06292', '#9575cd', '#4fc3f7', '#aed581'];
function avatarColor(s) {
  var h = 0;
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff;
  return PALETTE[h % PALETTE.length];
}
function firstChar(s) { var a = Array.from(s); return a[0] || '?'; }
function workById(id) {
  for (var i = 0; i < WORKS.length; i++) if (WORKS[i].id === id) return WORKS[i];
  return null;
}

var toastTimer = null;
function toast(msg) {
  var t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
}

/* ===================== 存储层（容器 Storage + localStorage 双通道） =====================
 * 参照 offwork-heatmap 的统一存储契约（与 mood-diary / ai-os 同构）：
 *   1) 双通道：容器 Storage（客户端 ≥ 9.46.0 且注入了 setStorage / getStorage）+ localStorage 镜像；
 *   2) 写：镜像同步先行、容器异步跟上，任一成功即算成功，两条都失败才算失败（§3.7）；
 *   3) 读：容器优先，缺失 / 失败退回镜像；容器有而镜像没有则回填；
 *   4) 启动：先用镜像起步（不阻塞首屏），再判定容器通道并对齐两侧；SDK 注入晚于首屏时轮询等待；
 *   5) 端能力一律走 success / fail 回调 + 800ms 超时兜底（旧容器上 Promise 版不可靠，也不能挂住调用方）；
 *   6) 版本号取 buildVersion 抹末 3 位，取不到按「不支持容器 Storage」处理，全过程绝不抛错。
 * 点赞数据量小，本地与容器同 key（vcg-likes），旧 localStorage 数据无需迁移。 */
var LS_KEY = 'vcg-likes';
var STORAGE_MIN_CLIENT_VERSION = 9460;  /* 客户端 9.46.0 */
var XHS_CALL_TIMEOUT = 800;
var INJECT_WAIT = 1500;
var INJECT_POLL = 100;

var containerUsable = false;   /* 判定结果：容器 Storage 通道是否可用 */
var containerReason = 'probing';
var likesDirty = false;        /* 启动后用户是否已改过点赞：改过后内存最新，不许容器回灌 */
var detecting = null;

function sdkState() {
  var xhs = null;
  try { xhs = window.xhs; } catch (e) { return { api: null, reason: 'no-bridge' }; }
  if (!xhs) return { api: null, reason: 'no-bridge' };
  var api = null;
  try { api = xhs.miniTool; } catch (e) { api = null; }
  if (!api) return { api: null, reason: 'no-api' };
  if (typeof api.setStorage !== 'function' || typeof api.getStorage !== 'function') {
    return { api: null, reason: 'no-storage-api' };
  }
  return { api: api, reason: '' };
}
function miniToolApi() { return sdkState().api; }
function readBuildVersion(lo) {
  var env = lo && lo.miniToolEnv;
  return Number(env && env.buildVersion) || 0;
}
function getClientVersion(v) { return Math.floor(v / 1000); }
/* getLaunchOptions：文档说 Promise 与回调都支持，真机上只认回调的实现存在，故两种都给，
   再叠超时兜底，保证只 resolve 一次。 */
function fetchLaunchOptions(api) {
  return new Promise(function (resolve) {
    var done = false;
    var timer = setTimeout(function () { finish(null); }, XHS_CALL_TIMEOUT);
    function finish(lo) { if (done) return; done = true; clearTimeout(timer); resolve(lo || null); }
    try {
      var ret = api.getLaunchOptions({
        success: function (lo) { finish(lo); },
        fail: function () { finish(null); }
      });
      if (ret && typeof ret.then === 'function') ret.then(finish, function () { finish(null); });
      else if (ret) finish(ret);
    } catch (e) { finish(null); }
  });
}
function getBuildVersion(api) {
  var sync = 0;
  try { sync = readBuildVersion(window.xhs && window.xhs.launchOptions); } catch (e) { sync = 0; }
  if (sync) return Promise.resolve(sync);
  if (!api || typeof api.getLaunchOptions !== 'function') return Promise.resolve(0);
  return fetchLaunchOptions(api).then(readBuildVersion);
}
/* 等端能力注入：官方未承诺注入时机，首屏脚本可能比注入早，「现在没看到」不等于「不支持」 */
function waitForInjection(waitMs) {
  return new Promise(function (resolve) {
    var st = sdkState();
    if (st.api || !waitMs) { resolve(st); return; }
    var waited = 0;
    var timer = setInterval(function () {
      var cur = sdkState();
      waited += INJECT_POLL;
      if (cur.api || waited >= waitMs) { clearInterval(timer); resolve(cur); }
    }, INJECT_POLL);
  });
}
function xhsCall(apiName, payload) {
  return new Promise(function (resolve) {
    var api = miniToolApi();
    if (!api || typeof api[apiName] !== 'function') { resolve({ ok: false, res: null }); return; }
    var done = false;
    var timer = setTimeout(function () { finish(false, null); }, XHS_CALL_TIMEOUT);
    function finish(ok, res) { if (done) return; done = true; clearTimeout(timer); resolve({ ok: ok, res: res || null }); }
    payload.success = function (res) { finish(res !== false, res); };
    payload.fail = function () { finish(false, null); };
    try { api[apiName](payload); } catch (e) { finish(false, null); }
  });
}
/* 镜像通道（localStorage）：一律吞异常（§2.4 不保证可用 / 持续有效） */
function lsGet(key) {
  try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
}
/* 读：容器优先，缺失 / 失败退回镜像；容器有而本地没有时顺手回填镜像 */
function storageGet(key) {
  if (!containerUsable) return Promise.resolve(lsGet(key));
  return xhsCall('getStorage', { key: key }).then(function (r) {
    var nativeVal = (r.ok && r.res && typeof r.res.data !== 'undefined') ? r.res.data : null;
    if (nativeVal === null || nativeVal === undefined) return lsGet(key);
    if (lsGet(key) === null) lsSet(key, nativeVal);
    return nativeVal;
  });
}
/* 写：镜像同步先行 + 容器异步跟上，任一成功即算成功 */
function storageSet(key, val) {
  var localOk = lsSet(key, val);
  if (!containerUsable) return Promise.resolve(localOk);
  return xhsCall('setStorage', { key: key, data: val }).then(function (r) { return localOk || r.ok; });
}
function detectContainer(waitMs) {
  if (detecting) return detecting;
  detecting = waitForInjection(waitMs).then(function (st) {
    if (!st.api) { containerUsable = false; containerReason = st.reason; return false; }
    return getBuildVersion(st.api).then(function (buildVersion) {
      if (getClientVersion(buildVersion) < STORAGE_MIN_CLIENT_VERSION) {
        containerUsable = false;
        containerReason = buildVersion ? 'old-client' : 'no-version';
        return false;
      }
      containerUsable = true;
      containerReason = '';
      return true;
    });
  });
  detecting.then(function () { detecting = null; }, function () {
    containerUsable = false; containerReason = 'error'; detecting = null;
  });
  return detecting;
}
/* 未启用容器通道的原因码 → 人话（只进 console，真机自查用） */
var REASON_TEXT = {
  probing: '正在检测端能力',
  'no-bridge': '未注入端能力 SDK（window.xhs 不存在）',
  'no-api': '端能力对象缺失（window.xhs.miniTool 不存在）',
  'no-storage-api': '端能力里没有 Storage 接口（随客户端 9.46.0 注入）',
  'no-version': '未取到客户端版本号',
  'old-client': '客户端版本低于 9.46.0',
  error: '端能力调用异常'
};

/* ===================== 点赞状态 ===================== */

var likes = [];
function normalizeLikes(v) {
  if (!v || !Array.isArray(v)) return [];
  var out = [];
  for (var i = 0; i < v.length; i++) {
    if (typeof v[i] === 'string' && out.indexOf(v[i]) === -1) out.push(v[i]);
  }
  return out;
}
function isLiked(id) { return likes.indexOf(id) !== -1; }
function refreshHearts(id) {
  var btns = document.querySelectorAll('[data-like="' + id + '"]');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('liked', isLiked(id));
    btns[i].classList.remove('pop');
    void btns[i].offsetWidth;
    btns[i].classList.add('pop');
  }
}
function toggleLike(id, on) {
  var i = likes.indexOf(id);
  if (on && i === -1) likes.push(id);
  if (!on && i !== -1) likes.splice(i, 1);
  likesDirty = true;
  storageSet(LS_KEY, likes);       /* 双通道写：镜像先行、容器跟上 */
  refreshHearts(id);
  renderChips();
  if (state.track === 'liked') renderFeed(true);
}
/* 启动：先用镜像通道起步（首屏不阻塞）→ 判定容器通道 → 对齐两侧。
   用户已改过点赞（likesDirty）时内存才是最新的，只上推不回灌。 */
function initLikes() {
  likes = normalizeLikes(lsGet(LS_KEY));
  detectContainer(INJECT_WAIT).then(function () {
    try {
      console.log('[storage] 数据通道：' + (containerUsable ? '容器 Storage'
        : 'localStorage（降级） · ' + (REASON_TEXT[containerReason] || containerReason)));
    } catch (e) { /* console 不可用时忽略 */ }
    if (!containerUsable) return;
    if (likesDirty) { storageSet(LS_KEY, likes); return; }
    storageGet(LS_KEY).then(function (val) {
      if (val === null || val === undefined) { storageSet(LS_KEY, likes); return; }
      var before = JSON.stringify(likes);
      var merged = normalizeLikes(val);
      if (JSON.stringify(merged) !== before) {
        likes = merged;
        renderChips();
        renderFeed(true);
      }
    });
  });
}

/* ===================== 瀑布流 ===================== */

var state = { track: 'all', q: '' };

/* 每次载入随机打乱一次顺序：本次会话内保持稳定，
   切换赛道 / 搜索时不再重排，避免筛选后卡片跳来跳去 */
var feedOrder = shuffle(WORKS);

function filtered() {
  var q = state.q.trim().toLowerCase();
  return feedOrder.filter(function (w) {
    if (state.track === 'liked') {
      if (!isLiked(w.id)) return false;
    } else if (state.track !== 'all' && w.track !== state.track) {
      return false;
    }
    if (!q) return true;
    return (w.title + ' ' + w.author + ' ' + w.intro).toLowerCase().indexOf(q) !== -1;
  });
}

/* ---- 图片加载：不依赖 IntersectionObserver ----
 * 容器 webview 里 IO 并不总是可靠——搜索会整树重建瀑布流 DOM，
 * 重建后的元素 IO 可能不再回调，表现为图片一直没有 src、整片空白。
 * 因此改为：每次重渲染后直接加载「视口内 + 预载带」的图，
 * 滚动 / 缩放时节流补查。17 张封面共 ~860KB 且本地缓存，代价可忽略，胜在稳定。 */
var PRELOAD_MARGIN = 420;

function loadImg(img) {
  var src = img.getAttribute('data-src');
  if (!src || img.getAttribute('data-loaded')) return;   /* 幂等：重复调用不重复加载 */
  img.setAttribute('data-loaded', '1');
  img.onload = function () { img.classList.add('loaded'); };
  img.onerror = function () { img.classList.add('loaded'); };
  img.src = src;
}
/* 加载视口内 + 预载带（上下各 420px）里的封面 */
function loadVisible() {
  var vh = window.innerHeight || document.documentElement.clientHeight || 0;
  var imgs = document.querySelectorAll('.feed img[data-src]');
  for (var i = 0; i < imgs.length; i++) {
    var img = imgs[i];
    if (img.getAttribute('data-loaded')) continue;
    var box = img.getBoundingClientRect();
    if (box.top < vh + PRELOAD_MARGIN && box.bottom > -PRELOAD_MARGIN) loadImg(img);
  }
}

function makeCard(w, idx) {
  var d = dimsOf(w);
  var card = document.createElement('div');
  card.className = 'card';
  card.style.animationDelay = (Math.min(idx, 9) * 40) + 'ms';
  card.innerHTML =
    '<div class="cover-box" style="padding-top:' + (d[1] / d[0] * 100).toFixed(3) + '%">' +
      '<img alt="' + esc(w.title) + '" data-src="./covers/' + w.cover + '">' +
      '<div class="badges">' +
        (w.mine ? '<span class="mine-badge">我的</span>' : '') +
        '<span class="track-badge">' + esc(TRACKS[w.track].tag) + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="card-title">' + esc(w.title) + '</div>' +
    '<div class="card-foot">' +
      '<span class="avatar" style="background:' + avatarColor(w.author) + '">' + esc(firstChar(w.author)) + '</span>' +
      '<span class="author-name">' + esc(w.author) + '</span>' +
      '<span class="like-btn' + (isLiked(w.id) ? ' liked' : '') + '" data-like="' + w.id + '">&#9829;</span>' +
    '</div>';
  bindCard(card, w);
  return card;
}

/* 双击点赞 / 单击进详情（300ms 双击窗，位移 >10px 视为滚动） */
var tap = { id: null, time: 0, timer: 0 };
function cancelTap() {
  clearTimeout(tap.timer);
  tap = { id: null, time: 0, timer: 0 };
}
function handleTap(w, x, y) {
  var now = Date.now();
  if (tap.id === w.id && now - tap.time < 300 && tap.timer) {
    cancelTap();
    if (!isLiked(w.id)) toggleLike(w.id, true);
    burstHeart(x, y);
  } else {
    clearTimeout(tap.timer);
    tap.id = w.id; tap.time = now;
    var id = w.id;
    tap.timer = setTimeout(function () {
      cancelTap();
      openDetail(id);
    }, 300);
  }
}
function bindCard(card, w) {
  var likeBtn = card.querySelector('.like-btn');
  var sx = 0, sy = 0;
  card.addEventListener('pointerdown', function (e) { sx = e.clientX; sy = e.clientY; });
  card.addEventListener('pointercancel', cancelTap);
  card.addEventListener('pointerup', function (e) {
    if (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10) { cancelTap(); return; }
    handleTap(w, e.clientX, e.clientY);
  });
  likeBtn.addEventListener('pointerup', function (e) { e.stopPropagation(); });
  likeBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    toggleLike(w.id, !isLiked(w.id));
  });
}

function burstHeart(x, y) {
  var h = document.createElement('div');
  h.className = 'burst-heart';
  h.innerHTML = '&#9829;';
  h.style.left = x + 'px';
  h.style.top = y + 'px';
  document.body.appendChild(h);
  setTimeout(function () { if (h.parentNode) h.parentNode.removeChild(h); }, 700);
}

function renderFeed(anim) {
  var list = filtered();
  var colL = $('col-l'), colR = $('col-r');
  if (anim === false) document.body.classList.add('no-anim');
  colL.innerHTML = '';
  colR.innerHTML = '';
  $('empty').style.display = list.length ? 'none' : 'block';
  var colW = colL.clientWidth || 160;
  var hs = [0, 0];
  var frs = [document.createDocumentFragment(), document.createDocumentFragment()];
  for (var i = 0; i < list.length; i++) {
    var w = list[i];
    var d = dimsOf(w);
    var c = hs[0] <= hs[1] ? 0 : 1;
    frs[c].appendChild(makeCard(w, i));
    hs[c] += colW * d[1] / d[0] + 47 + 35 + 10;
  }
  colL.appendChild(frs[0]);
  colR.appendChild(frs[1]);
  /* 渲染完立即加载视口内的图——搜索 / 切赛道重建 DOM 后不再依赖 IO 回调 */
  loadVisible();
  if (anim === false) {
    setTimeout(function () { document.body.classList.remove('no-anim'); }, 60);
  }
}

/* ===================== 赛道 chips ===================== */

function renderChips() {
  var counts = { all: WORKS.length, game: 0, tool: 0, guofeng: 0, liked: likes.length };
  for (var i = 0; i < WORKS.length; i++) counts[WORKS[i].track]++;
  var keys = ['all', 'game', 'tool', 'guofeng', 'liked'];
  var html = '';
  for (var j = 0; j < keys.length; j++) {
    var k = keys[j];
    html += '<button class="chip' + (state.track === k ? ' active' : '') + '" data-track="' + k + '">' +
      TRACKS[k].label +
      '<span class="cnt">' + counts[k] + '</span></button>';
  }
  $('chips').innerHTML = html;
}

function setTrack(t) {
  state.track = t;
  renderChips();
  renderFeed(true);
}

/* ===================== 详情页 ===================== */

var detailId = null;

function openDetail(id) {
  var w = workById(id);
  if (!w) return;
  detailId = id;
  $('detail-scroll').innerHTML =
    '<div class="detail-cover-wrap"><img src="./covers/' + w.cover + '" alt="' + esc(w.title) + '"></div>' +
    '<div class="detail-body">' +
      '<div class="detail-title">' + esc(w.title) + '</div>' +
      '<div class="author-row">' +
        '<span class="avatar" style="background:' + avatarColor(w.author) + '">' + esc(firstChar(w.author)) + '</span>' +
        '<div class="meta">' +
          '<div class="name">' + esc(w.author) +
            (w.mine ? '<span class="mine-tag">本人作品</span>' : '') + '</div>' +
          '<div class="sub">' + esc(w.tech) + '</div>' +
        '</div>' +
        '<span class="detail-track">' + esc(TRACKS[w.track].tag) + '</span>' +
      '</div>' +
      '<div class="section-title"><span class="dot"></span>作品简介</div>' +
      '<div class="detail-intro">' + esc(w.intro) + '</div>' +
      '<div class="section-title"><span class="dot"></span>亮点拆解</div>' +
      w.highlights.map(function (h, i) {
        return '<div class="hl-item"><span class="num">' + (i + 1) + '</span><span class="txt">' + esc(h) + '</span></div>';
      }).join('') +
      (NOTES[w.id]
        ? '<div class="section-title"><span class="dot"></span>原笔记摘录</div>' +
          '<div class="note-body">' + esc(NOTES[w.id]) + '</div>'
        : '') +
      '<div class="section-title"><span class="dot"></span>原笔记链接</div>' +
      '<div class="link-box">' +
        '<div class="tip">点底部按钮选中链接，长按复制，再到小红书打开</div>' +
        '<div class="url">' + esc(w.link) + '</div>' +
        (w.link.indexOf('xsec_token=') === -1
          ? '<div class="url-warn">此条归档原文就未取到分享令牌（xsec_token），站外可能打不开</div>'
          : '') +
      '</div>' +
    '</div>';
  $('detail-bar').innerHTML =
    '<span class="bar-like' + (isLiked(id) ? ' liked' : '') + '" data-like="' + id + '">&#9829;</span>' +
    '<button class="bar-note-btn">复制链接去打开</button>';
  var overlay = $('detail');
  overlay.classList.add('open');
  /* 必须在 overlay 可见之后再复位滚动：display:none 时给 scrollTop 赋值无效，
     否则第二次打开详情会停在上一篇的滚动位置 */
  void overlay.offsetWidth;
  $('detail-scroll').scrollTop = 0;
  overlay.classList.add('slide');
}

function closeDetail() {
  var overlay = $('detail');
  overlay.classList.remove('slide');
  setTimeout(function () {
    overlay.classList.remove('open');
    detailId = null;
  }, 280);
}

/* 容器内无法直接打开外部链接（必定打不开），统一走「选中链接 → 长按复制 → 到小红书打开」。
   先把「原笔记链接」区滚进视野再选中——否则用户停在详情页顶部，看不到已选中的链接。 */
function selectLink() {
  var scroll = $('detail-scroll');
  var box = scroll ? scroll.querySelector('.link-box') : null;
  var url = box ? box.querySelector('.url') : null;
  if (box && scroll) {
    try { scroll.scrollTop = Math.max(0, box.offsetTop - 72); } catch (e) { /* 忽略 */ }
  }
  if (url) {
    try {
      var range = document.createRange();
      range.selectNodeContents(url);
      var sel = window.getSelection();
      if (sel) { sel.removeAllRanges(); sel.addRange(range); }
    } catch (e) { /* 选中失败不影响后续提示 */ }
  }
  toast('已选中链接，长按复制，再到小红书打开');
}

/* ===================== 扭蛋机（刚体物理模拟） =====================
 * 按真机扭蛋的做法重写：
 *   1) 罩内小球是刚体模拟——重力 + 罩顶（平顶 + 两侧圆角）/侧壁/地面碰撞 +
 *      球间弹性碰撞 + 地面摩擦，滚动时角速度 = 水平速度 / 半径（高光随球转动）；
 *   2) 打开面板时小球从罩顶散落，靠重力自然落底归位；
 *   3) 「摇一摇」= 机身小幅摇摆（重力向量随机身偏转）+ 上下颠簸 + 微扰，
 *      球是被真实“晃”起来的，不是预设关键帧；
 *   4) 出蛋 = 旋钮转动 → 扭蛋从取蛋口掉落（落地弹跳）→ 上下两半裂开 → 结果卡出现。
 * 摇摆作用在 #m-body 上，与 .machine 的收起过渡互不干扰；点旋钮也可触发。 */
var GACHA_LINES = [
  '缘分到了！', '命运的齿轮开始转动', '这颗扭蛋里是——',
  '今日宜：玩这个', '红线牵到了这件', '摇中了本命作品'
];
var gachaQueue = [];
var rolling = false;

/* ---- 物理参数（px / s） ---- */
var BALL_SPECS = [
  { r: 20, c: '#ffd54d' }, { r: 18, c: '#ff9db5' }, { r: 17, c: '#8fd8c0' },
  { r: 16, c: '#8cc9ff' }, { r: 15, c: '#f7a8b8' }, { r: 15, c: '#b9a8ff' },
  { r: 14, c: '#ffc98a' }, { r: 13, c: '#a7e3c8' }, { r: 12, c: '#ffb3c1' },
  { r: 12, c: '#8ecbff' }, { r: 11, c: '#ffe08a' }, { r: 11, c: '#c9b8ff' },
  { r: 10, c: '#9fe0d2' }, { r: 10, c: '#ffd0a8' }
];
var GRAV = 1500;          /* 重力加速度 */
var REST_WALL = 0.5;      /* 罩壁 / 地面反弹系数 */
var REST_BALL = 0.4;      /* 球间反弹系数 */
var FLOOR_FRIC = 0.55;    /* 触地水平摩擦（每秒衰减比例） */
/* 摇晃时机身的竖直加速度振幅：必须大于 GRAV，球才会被真正抛起（否则只是压地微颤） */
var SHAKE_ACC = 2600;
var SHAKE_W = 20;         /* 竖直震动角频率（≈3.2Hz） */

var gBalls = [];          /* { x, y, vx, vy, r, rot, m, el } */
var gDomeW = 0, gDomeH = 0;
var gRAF = 0, gLast = 0, gT = 0, gTilt = 0;
var gShaking = false;

function gMeasure() {
  /* clientWidth/Height 不含边框，正好是罩内可用尺寸 */
  gDomeW = $('dome').clientWidth;
  gDomeH = $('dome').clientHeight;
}
function gCreateBalls() {
  var d = $('dome');
  d.innerHTML = '';
  gBalls = [];
  for (var i = 0; i < BALL_SPECS.length; i++) {
    var s = BALL_SPECS[i];
    var el = document.createElement('div');
    el.className = 'ball';
    el.style.width = el.style.height = (s.r * 2) + 'px';
    el.style.background = s.c;
    d.appendChild(el);
    gBalls.push({ r: s.r, m: s.r * s.r, el: el, x: 0, y: 0, vx: 0, vy: 0, rot: 0 });
  }
}
/* 每次打开：小球按错位网格散在罩顶附近（避免大量重叠导致开局弹飞），靠重力落底归位 */
function gScatter() {
  var n = gBalls.length;
  var perRow = Math.ceil(n / 2);
  var cellW = gDomeW / perRow;
  for (var i = 0; i < n; i++) {
    var b = gBalls[i];
    var idx = i % perRow;
    var row = Math.floor(i / perRow);
    b.x = cellW * (idx + 0.5) + (Math.random() - 0.5) * cellW * 0.25;
    b.y = b.r + 4 + row * (b.r * 2 + 3) + Math.random() * 3;
    b.vx = (Math.random() - 0.5) * 40;
    b.vy = 0;
    if (b.x < b.r) b.x = b.r;
    if (b.x > gDomeW - b.r) b.x = gDomeW - b.r;
  }
}
function gStep(dt) {
  var i, j, b, b2;
  /* 摇晃：机身摆动（≈±5°）→ 重力向量随机身偏转；同时机身做竖直加速运动，
     在机身参考系里等效重力 = GRAV - 机身加速度，加速度振幅大于 GRAV 时等效重力
     变负，球才会被真正抛起来（小于重力则只是压在地面的微颤，看不出变化）。
     gTilt 向目标角缓动，停止摇晃时机身平滑回正而不是硬切。 */
  var target = gShaking ? 0.085 * Math.sin(gT * 14) : 0;
  gTilt += (target - gTilt) * Math.min(1, 12 * dt);
  var acc = gShaking ? SHAKE_ACC * Math.sin(gT * SHAKE_W) : 0;
  var gx = -GRAV * Math.sin(gTilt);
  var gy = GRAV * Math.cos(gTilt) - acc;
  var cr = Math.min(67, gDomeW / 2);   /* 罩顶圆角半径（对应 border-radius 67px） */
  for (i = 0; i < gBalls.length; i++) {
    b = gBalls[i];
    b.vx += gx * dt;
    b.vy += gy * dt;
    if (gShaking) {
      /* 微扰：打散整齐同步；向上的随机冲量让堆在一起的球也能翻腾 */
      b.vx += (Math.random() - 0.5) * 1500 * dt;
      b.vy -= Math.random() * 900 * dt;
    }
    b.vx *= 1 - 0.3 * dt;                                    /* 空气阻力 */
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    /* 地面 */
    if (b.y > gDomeH - b.r) {
      b.y = gDomeH - b.r;
      if (b.vy > 0) b.vy = -b.vy * REST_WALL;
      b.vx *= Math.max(0, 1 - FLOOR_FRIC * dt);
      if (Math.abs(b.vy) < 20) b.vy = 0;
    }
    /* 侧壁 */
    if (b.x < b.r) { b.x = b.r; if (b.vx < 0) b.vx = -b.vx * REST_WALL; }
    if (b.x > gDomeW - b.r) { b.x = gDomeW - b.r; if (b.vx > 0) b.vx = -b.vx * REST_WALL; }
    /* 罩顶：平顶 + 两侧圆角（球心到最近顶点弧保持 ≤ 圆角半径 - 球半径） */
    if (b.y < cr) {
      var cx = b.x < cr ? cr : (b.x > gDomeW - cr ? gDomeW - cr : b.x);
      var ddx = b.x - cx, ddy = b.y - cr;
      var dd = Math.sqrt(ddx * ddx + ddy * ddy);
      var maxD = cr - b.r;
      if (dd > maxD && dd > 0.001) {
        var nx = ddx / dd, ny = ddy / dd;
        b.x = cx + nx * maxD;
        b.y = cr + ny * maxD;
        var vn = b.vx * nx + b.vy * ny;
        if (vn > 0) { b.vx -= (1 + REST_WALL) * vn * nx; b.vy -= (1 + REST_WALL) * vn * ny; }
      }
    }
    /* 滚动：触地为纯滚动，空中按同式近似（保留旋转惯性观感） */
    b.rot += (b.vx / b.r) * 57.3 * dt;
  }
  /* 球间碰撞：位置分离 + 冲量 */
  for (i = 0; i < gBalls.length; i++) {
    for (j = i + 1; j < gBalls.length; j++) {
      b = gBalls[i]; b2 = gBalls[j];
      var cdx = b2.x - b.x, cdy = b2.y - b.y;
      var d2 = cdx * cdx + cdy * cdy;
      var minD = b.r + b2.r;
      if (d2 < minD * minD && d2 > 0.0001) {
        var d = Math.sqrt(d2);
        var ux = cdx / d, uy = cdy / d;
        var overlap = minD - d;
        var total = b.m + b2.m;
        b.x -= ux * overlap * (b2.m / total);
        b.y -= uy * overlap * (b2.m / total);
        b2.x += ux * overlap * (b.m / total);
        b2.y += uy * overlap * (b.m / total);
        var rvx = b2.vx - b.vx, rvy = b2.vy - b.vy;
        var rel = rvx * ux + rvy * uy;
        if (rel < 0) {
          var imp = -(1 + REST_BALL) * rel / (1 / b.m + 1 / b2.m);
          b.vx -= imp * ux / b.m; b.vy -= imp * uy / b.m;
          b2.vx += imp * ux / b2.m; b2.vy += imp * uy / b2.m;
        }
      }
    }
  }
}
function gRender() {
  for (var i = 0; i < gBalls.length; i++) {
    var b = gBalls[i];
    b.el.style.transform = 'translate(' + (b.x - b.r).toFixed(1) + 'px,' + (b.y - b.r).toFixed(1) +
      'px) rotate(' + b.rot.toFixed(1) + 'deg)';
  }
  /* 机身同步做微幅竖直位移（振幅 = 加速度 / 频率² ≈ 6.5px），与球的抛动观感一致 */
  var yOff = gShaking ? (SHAKE_ACC / (SHAKE_W * SHAKE_W)) * Math.sin(gT * SHAKE_W) : 0;
  $('m-body').style.transform =
    'translateY(' + yOff.toFixed(2) + 'px) rotate(' + (gTilt * 57.3).toFixed(2) + 'deg)';
}
function gLoop(ts) {
  if (!gLast) gLast = ts;
  var dt = Math.min(0.033, (ts - gLast) / 1000);
  gLast = ts;
  gT += dt;
  gStep(dt);
  gRender();
  gRAF = requestAnimationFrame(gLoop);
}
function gStart() {
  if (gRAF) return;
  gLast = 0;
  gRAF = requestAnimationFrame(gLoop);
}
function gStop() {
  if (gRAF) cancelAnimationFrame(gRAF);
  gRAF = 0;
  gShaking = false;
  $('m-body').style.transform = '';
}

function shuffle(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
function nextWork() {
  if (!gachaQueue.length) gachaQueue = shuffle(WORKS);
  return gachaQueue.pop();
}

function openGacha() {
  $('gacha-result').classList.remove('show');
  $('gacha-result').innerHTML = '';
  $('gacha-shake').style.display = '';
  $('gacha-panel').classList.remove('has-result');
  $('capsule').className = 'capsule';
  $('gacha').classList.add('open');
  gMeasure();
  if (!gBalls.length) gCreateBalls();
  gScatter();
  gStart();
}
function closeGacha() {
  $('gacha').classList.remove('open');
  gachaQueue = [];
  gStop();
}

/* 摇一摇 →（球被真实晃起）→ 旋钮转动 → 扭蛋掉落弹跳 → 裂开 → 出结果 */
function shakeGacha() {
  if (rolling) return;
  rolling = true;
  var btn = $('gacha-shake');
  btn.disabled = true;
  gShaking = true;
  setTimeout(function () {                    /* 1. 摇 1.15s */
    gShaking = false;
    $('m-knob').classList.add('turn');        /* 2. 旋钮转动 */
    setTimeout(function () {
      $('m-knob').classList.remove('turn');
      $('capsule').classList.add('drop');     /* 3. 扭蛋掉落（带弹跳） */
      setTimeout(function () {
        $('capsule').classList.add('open');   /* 4. 上下两半裂开 */
        setTimeout(function () {
          $('capsule').className = 'capsule';
          revealGacha();
        }, 460);
      }, 640);
    }, 720);
  }, 1150);
}

function revealGacha() {
  gStop();
  rolling = false;
  $('gacha-shake').disabled = false;
  var w = nextWork();
  var line = GACHA_LINES[Math.floor(Math.random() * GACHA_LINES.length)];
  var result = $('gacha-result');
  result.innerHTML =
    '<div class="gacha-line">' + esc(line) + '</div>' +
    '<div class="gacha-card">' +
      '<div class="thumb" style="background-image:url(./covers/' + w.cover + ')"></div>' +
      '<div class="info">' +
        '<div class="t">' + esc(w.title) + '</div>' +
        '<div class="a">' + esc(w.author) + ' · ' + esc(TRACKS[w.track].label) + '</div>' +
        '<div class="d">' + esc(w.intro) + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="gacha-actions">' +
      '<button class="again">再摇一个</button>' +
      '<button class="go">去看看</button>' +
    '</div>';
  result.classList.add('show');
  $('gacha-shake').style.display = 'none';
  /* 出结果后收起机身：面板变矮，结果不用翻页就能看全 */
  $('gacha-panel').classList.add('has-result');
  var again = result.querySelector('.again');
  var go = result.querySelector('.go');
  again.addEventListener('click', function () {
    result.classList.remove('show');
    $('gacha-shake').style.display = '';
    $('gacha-panel').classList.remove('has-result');
    gStart();
    shakeGacha();
  });
  go.addEventListener('click', function () {
    closeGacha();
    openDetail(w.id);
  });
}

/* ===================== 回到顶部 ===================== */

function scrollToTop() {
  /* Chrome 61 起支持 scroll-behavior；不支持时退回瞬移 */
  if ('scrollBehavior' in document.documentElement.style) {
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); return; } catch (e) { /* 退回瞬移 */ }
  }
  window.scrollTo(0, 0);
}
function updateBackTop() {
  var y = window.pageYOffset || document.documentElement.scrollTop || 0;
  var el = $('back-top');
  if (!el) return;
  if (y > 400) el.classList.add('show');
  else el.classList.remove('show');
}

/* ===================== 事件绑定与初始化 ===================== */

/* 宿主 in-app 检测（参照 ai-os）：注入了 window.xhs.miniTool 视为容器内；
   另认 ?inapp=1 便于本地模拟。命中则给 body 加 .in-app，抬高 --top-gap 让开宿主顶栏。 */
function detectInApp() {
  var inApp = false;
  try {
    if (window.xhs && window.xhs.miniTool) inApp = true;
    if (String(window.location.search || '').indexOf('inapp=1') !== -1) inApp = true;
  } catch (e) { inApp = false; }
  if (inApp) document.body.classList.add('in-app');
}

function init() {
  detectInApp();
  initLikes();

  $('chips').addEventListener('click', function (e) {
    var btn = e.target;
    while (btn && btn !== this && !btn.getAttribute('data-track')) btn = btn.parentNode;
    if (btn && btn !== this && btn.getAttribute('data-track')) setTrack(btn.getAttribute('data-track'));
  });

  $('search-input').addEventListener('input', function (e) {
    state.q = e.target.value;
    renderFeed(true);
  });

  $('detail-back').addEventListener('click', closeDetail);

  $('detail-bar').addEventListener('click', function (e) {
    var like = e.target.closest('.bar-like');
    if (like) {
      var id = like.getAttribute('data-like');
      toggleLike(id, !isLiked(id));
      return;
    }
    if (e.target.closest('.bar-note-btn')) selectLink();
  });

  $('gacha-open').addEventListener('click', openGacha);
  $('gacha-close').addEventListener('click', closeGacha);
  $('gacha-shake').addEventListener('click', shakeGacha);
  $('m-knob').addEventListener('click', shakeGacha);

  $('back-top').addEventListener('click', scrollToTop);
  window.addEventListener('scroll', updateBackTop);
  updateBackTop();

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { renderFeed(false); }, 200);
  });

  /* 滚动时节流补查预载带（IO 缺失 / 不回调时的兜底） */
  var visTimer = 0;
  window.addEventListener('scroll', function () {
    if (visTimer) return;
    visTimer = setTimeout(function () { visTimer = 0; loadVisible(); }, 120);
  }, false);

  /* 创作者数按唯一作者统计（同一博主多件作品只算一位），作品数按条目数 */
  var authorSeen = {}, authorCount = 0;
  for (var ai = 0; ai < WORKS.length; ai++) {
    var key = WORKS[ai].author;
    if (!authorSeen[key]) { authorSeen[key] = 1; authorCount++; }
  }
  $('work-count').textContent = authorCount;
  $('work-count2').textContent = WORKS.length;
  $('gacha-count').textContent = WORKS.length;

  renderChips();
  renderFeed(true);
}

init();
