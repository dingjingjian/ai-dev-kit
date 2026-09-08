/*
 * defcon — data.js
 * 阵营 / 城市 / 事件卡 / 全局配置（纯 JS 字面量，不 fetch，不联网）
 * 命名空间：window.DC （离线小工具经典脚本，无 import/export/type=module）
 * 加载顺序：data.js → geo.js → sim.js → ai.js → render.js → ui.js → game.js
 */
(function (global) {
  'use strict';
  var DC = global.DC = global.DC || {};

  /* ───────────────────────── 1. 阵营（6，全部虚构）─────────────────────────
   * 代号 NATO 音标字母；名称方位虚构；主色用于球面阵营色块与 HUD。
   * 边界不按真实国界，按大陆大区粗略划分（见 DESIGN.md §2.1）。
   */
  DC.FACTIONS = [
    { code: 'ALFA',    name: '北境联邦', color: '#378ADD', region: '大陆北部' },
    { code: 'BRAVO',   name: '西海同盟', color: '#639922', region: '大陆西部' },
    { code: 'CHARLIE', name: '中央联合体', color: '#1D9E75', region: '大陆中部' },
    { code: 'DELTA',   name: '东陆公约', color: '#E24B4A', region: '大陆东部' },
    { code: 'ECHO',    name: '赤道共同体', color: '#EF9F27', region: '赤道带' },
    { code: 'FOXTROT', name: '南洋联邦', color: '#7F77DD', region: '南洋群岛' }
  ];

  /* ───────────────────────── 2. 城市（60，每阵营 10）─────────────────────────
   * 经纬度为公开地理常识（不侦察）；人口单位：百万（3–18M，每阵营约 90M）。
   * id 规则：<阵营>-<两位序号>
   * 坐标布局：北境居高纬、西海居西半球、中央居中、东陆居东、赤道近赤道、南洋居南半球群岛。
   */
  DC.CITIES = [
    // ── ALFA 北境联邦（大陆北部，高纬）──
    { id: 'ALFA-01',    faction: 'ALFA',    name: '霜港', lat: 64,  lon: -45,  pop: 8 },
    { id: 'ALFA-02',    faction: 'ALFA',    name: '铁峰', lat: 68,  lon: 28,   pop: 10 },
    { id: 'ALFA-03',    faction: 'ALFA',    name: '白桦', lat: 60,  lon: 70,   pop: 7 },
    { id: 'ALFA-04',    faction: 'ALFA',    name: '寒溪', lat: 65,  lon: 108, pop: 9 },
    { id: 'ALFA-05',    faction: 'ALFA',    name: '北塔', lat: 70,  lon: 130,  pop: 6 },
    { id: 'ALFA-06',    faction: 'ALFA',    name: '钢脊', lat: 58,  lon: -100, pop: 12 },
    { id: 'ALFA-07',    faction: 'ALFA',    name: '雪原', lat: 66,  lon: -120, pop: 7 },
    { id: 'ALFA-08',    faction: 'ALFA',    name: '孤松', lat: 62,  lon: 15,   pop: 10 },
    { id: 'ALFA-09',    faction: 'ALFA',    name: '黑岩', lat: 54,  lon: 160,  pop: 11 },
    { id: 'ALFA-10',    faction: 'ALFA',    name: '晨岭', lat: 71,  lon: 90,   pop: 8 },

    // ── BRAVO 西海同盟（大陆西部，西半球中纬）──
    { id: 'BRAVO-01',   faction: 'BRAVO',   name: '雾湾', lat: 34,  lon: -118, pop: 9 },
    { id: 'BRAVO-02',   faction: 'BRAVO',   name: '长堤', lat: 40,  lon: -110, pop: 12 },
    { id: 'BRAVO-03',   faction: 'BRAVO',   name: '暗礁', lat: 22,  lon: -98,  pop: 6 },
    { id: 'BRAVO-04',   faction: 'BRAVO',   name: '风岩', lat: 48,  lon: -125, pop: 7 },
    { id: 'BRAVO-05',   faction: 'BRAVO',   name: '灰石', lat: 30,  lon: -90,  pop: 10 },
    { id: 'BRAVO-06',   faction: 'BRAVO',   name: '潮汐', lat: 25,  lon: -80,  pop: 8 },
    { id: 'BRAVO-07',   faction: 'BRAVO',   name: '断崖', lat: 44,  lon: -70,  pop: 9 },
    { id: 'BRAVO-08',   faction: 'BRAVO',   name: '远岬', lat: 38,  lon: -122, pop: 7 },
    { id: 'BRAVO-09',   faction: 'BRAVO',   name: '盐洲', lat: 20,  lon: -105, pop: 6 },
    { id: 'BRAVO-10',   faction: 'BRAVO',   name: '沉湾', lat: 50,  lon: -60,  pop: 11 },

    // ── CHARLIE 中央联合体（大陆中部）──
    { id: 'CHARLIE-01', faction: 'CHARLIE', name: '铁砧', lat: 45,  lon: -20,  pop: 10 },
    { id: 'CHARLIE-02', faction: 'CHARLIE', name: '铜谷', lat: 30,  lon: -10,  pop: 8 },
    { id: 'CHARLIE-03', faction: 'CHARLIE', name: '中坻', lat: 38,  lon: 5,    pop: 11 },
    { id: 'CHARLIE-04', faction: 'CHARLIE', name: '炉城', lat: 25,  lon: 20,   pop: 9 },
    { id: 'CHARLIE-05', faction: 'CHARLIE', name: '磨坊', lat: 50,  lon: -5,   pop: 7 },
    { id: 'CHARLIE-06', faction: 'CHARLIE', name: '麦浪', lat: 40,  lon: 15,   pop: 8 },
    { id: 'CHARLIE-07', faction: 'CHARLIE', name: '石桥', lat: 28,  lon: 35,   pop: 10 },
    { id: 'CHARLIE-08', faction: 'CHARLIE', name: '轮城', lat: 47,  lon: 25,   pop: 6 },
    { id: 'CHARLIE-09', faction: 'CHARLIE', name: '仓野', lat: 33,  lon: 0,    pop: 9 },
    { id: 'CHARLIE-10', faction: 'CHARLIE', name: '平畴', lat: 42,  lon: 40,   pop: 7 },

    // ── DELTA 东陆公约（大陆东部）──
    { id: 'DELTA-01',   faction: 'DELTA',   name: '赤砂', lat: 35,  lon: 75,   pop: 11 },
    { id: 'DELTA-02',   faction: 'DELTA',   name: '烈阳', lat: 28,  lon: 95,   pop: 9 },
    { id: 'DELTA-03',   faction: 'DELTA',   name: '孤峰', lat: 45,  lon: 110,  pop: 7 },
    { id: 'DELTA-04',   faction: 'DELTA',   name: '深屿', lat: 22,  lon: 125,  pop: 8 },
    { id: 'DELTA-05',   faction: 'DELTA',   name: '瀚原', lat: 50,  lon: 80,   pop: 10 },
    { id: 'DELTA-06',   faction: 'DELTA',   name: '玄铁', lat: 40,  lon: 135,  pop: 12 },
    { id: 'DELTA-07',   faction: 'DELTA',   name: '朔风', lat: 55,  lon: 100,  pop: 6 },
    { id: 'DELTA-08',   faction: 'DELTA',   name: '穹顶', lat: 33,  lon: 145,  pop: 9 },
    { id: 'DELTA-09',   faction: 'DELTA',   name: '戈壁', lat: 38,  lon: 65,   pop: 7 },
    { id: 'DELTA-10',   faction: 'DELTA',   name: '荒垣', lat: 48,  lon: 120,  pop: 8 },

    // ── ECHO 赤道共同体（赤道带，全球散布）──
    { id: 'ECHO-01',    faction: 'ECHO',    name: '蕉林', lat: 5,   lon: -75,  pop: 10 },
    { id: 'ECHO-02',    faction: 'ECHO',    name: '雨穹', lat: -2,  lon: -60,  pop: 9 },
    { id: 'ECHO-03',    faction: 'ECHO',    name: '蒸泽', lat: 8,   lon: -15,  pop: 11 },
    { id: 'ECHO-04',    faction: 'ECHO',    name: '棕榈', lat: 0,   lon: 20,   pop: 8 },
    { id: 'ECHO-05',    faction: 'ECHO',    name: '烈日', lat: 10,  lon: 40,   pop: 10 },
    { id: 'ECHO-06',    faction: 'ECHO',    name: '湿谷', lat: -8,  lon: 110,  pop: 9 },
    { id: 'ECHO-07',    faction: 'ECHO',    name: '藤桥', lat: 3,   lon: 130,  pop: 7 },
    { id: 'ECHO-08',    faction: 'ECHO',    name: '雾林', lat: -10, lon: 100,  pop: 10 },
    { id: 'ECHO-09',    faction: 'ECHO',    name: '暖流', lat: 6,   lon: 150,  pop: 8 },
    { id: 'ECHO-10',    faction: 'ECHO',    name: '翠屿', lat: -5,  lon: -120, pop: 9 },

    // ── FOXTROT 南洋联邦（南洋群岛，南半球）──
    { id: 'FOXTROT-01', faction: 'FOXTROT', name: '珊瑚', lat: -12, lon: 130,  pop: 9 },
    { id: 'FOXTROT-02', faction: 'FOXTROT', name: '珠礁', lat: -20, lon: 145,  pop: 8 },
    { id: 'FOXTROT-03', faction: 'FOXTROT', name: '帆屿', lat: -8,  lon: 115,  pop: 10 },
    { id: 'FOXTROT-04', faction: 'FOXTROT', name: '南浦', lat: -30, lon: 150,  pop: 11 },
    { id: 'FOXTROT-05', faction: 'FOXTROT', name: '浪谷', lat: -40, lon: 170,  pop: 7 },
    { id: 'FOXTROT-06', faction: 'FOXTROT', name: '碧环', lat: -15, lon: 120,  pop: 9 },
    { id: 'FOXTROT-07', faction: 'FOXTROT', name: '浅滩', lat: -25, lon: 160,  pop: 8 },
    { id: 'FOXTROT-08', faction: 'FOXTROT', name: '潮门', lat: -35, lon: 140,  pop: 10 },
    { id: 'FOXTROT-09', faction: 'FOXTROT', name: '屿链', lat: -18, lon: 175,  pop: 7 },
    { id: 'FOXTROT-10', faction: 'FOXTROT', name: '晏岛', lat: -45, lon: 100,  pop: 9 }
  ];

  /* ───────────────────────── 3. 事件卡（22，冷战风味）─────────────────────────
   * 结构：id / title / desc（冷战风味）/ options[2..3]
   * 选项：label + crisis（全局危机值修正，±5–15，极端可达 ±30）
   * 可选 effect：副作用类型（见 DESIGN.md §4.2）
   *   - expose_silo  暴露己方某座发射井
   *   - reveal_radar 揭示敌方雷达位置
   *   - city_defense 某城防空 +amount 级
   *   - pop_loss     直接人口损失 amount（百万）
   *   - radar_down   雷达停摆 turns 回合
   *   target: 'self' | 'enemy' | 'random'
   */
  DC.EVENTS = [
    {
      id: 'E01', title: '侦察机在敌境失踪',
      desc: '一架无标识侦察机未在预定时间返航，残骸可能已落入对方之手。各方屏息等待。',
      options: [
        { label: '否认任务存在', crisis: -4 },
        { label: '公开提出抗议', crisis: 9 },
        { label: '派机越境搜救', crisis: 14, effect: { type: 'reveal_radar', target: 'enemy' } }
      ]
    },
    {
      id: 'E02', title: '雷达误报 200 枚来袭导弹',
      desc: '预警系统在一瞬间显示密密麻麻的光点正扑向本土，操作员手心冒汗。',
      options: [
        { label: '立即反击', crisis: 30 },
        { label: '等待二次确认', crisis: -6 },
        { label: '提升戒备等级', crisis: 8 }
      ]
    },
    {
      id: 'E03', title: '敌方提议裁军谈判',
      desc: '一份照会悄然递到各国使馆，措辞客气，却暗藏试探。',
      options: [
        { label: '接受谈判', crisis: -14 },
        { label: '拖延观望', crisis: 0 },
        { label: '拒绝并增兵', crisis: 8 }
      ]
    },
    {
      id: 'E04', title: '我方雷达遭网络攻击瘫痪',
      desc: '指挥中心的屏幕上雪花一片，北部预警网失明了。',
      options: [
        { label: '报复性示威', crisis: 11 },
        { label: '静默修复系统', crisis: -3, effect: { type: 'radar_down', target: 'self', turns: 2 } }
      ]
    },
    {
      id: 'E05', title: '公海舰船对峙',
      desc: '两艘补给舰在争议海域并排航行，炮口微微转向彼此。',
      options: [
        { label: '后撤避免冲突', crisis: -7 },
        { label: '保持对峙', crisis: 5 },
        { label: '开火警告', crisis: 16 }
      ]
    },
    {
      id: 'E06', title: '边境部队未经授权交火',
      desc: '一线哨所传来零星枪声，谁先开的火已无人能说清。',
      options: [
        { label: '掩盖事件', crisis: -5 },
        { label: '上报总部', crisis: 6 },
        { label: '越境反击', crisis: 12 }
      ]
    },
    {
      id: 'E07', title: '盟友请求部署核武',
      desc: '一个摇摇欲坠的伙伴希望借你的力量壮胆，代价是引火烧身的风险。',
      options: [
        { label: '婉拒请求', crisis: -8 },
        { label: '有条件部署', crisis: 4 },
        { label: '立即前沿部署', crisis: 13 }
      ]
    },
    {
      id: 'E08', title: '情报显示敌井位置泄漏',
      desc: '截获的通讯里反复出现几组坐标，你埋藏多年的发射井可能已暴露。',
      options: [
        { label: '加固隐蔽', crisis: -6 },
        { label: '先发试探', crisis: 10, effect: { type: 'expose_silo', target: 'self' } },
        { label: '公开谴责', crisis: 3 }
      ]
    },
    {
      id: 'E09', title: '卫星拍到异常建筑',
      desc: '一张模糊的轨道影像里，荒漠中矗立着不该存在的几何体。',
      options: [
        { label: '外交询问', crisis: -3 },
        { label: '提高戒备', crisis: 7 },
        { label: '摧毁卫星', crisis: 18 }
      ]
    },
    {
      id: 'E10', title: '国内反战示威',
      desc: '广场上的人群举着标语，要求把导弹换成面包。',
      options: [
        { label: '强硬镇压', crisis: 9 },
        { label: '安抚民意', crisis: -5 },
        { label: '暂缓军备', crisis: -9 }
      ]
    },
    {
      id: 'E11', title: '海底电缆遭切断',
      desc: '跨洋通讯在一夜间中断，指挥链路只剩最后的无线电。',
      options: [
        { label: '低调修复', crisis: -4 },
        { label: '指控敌国', crisis: 8 },
        { label: '切断敌方网络', crisis: 12 }
      ]
    },
    {
      id: 'E12', title: '敌方试射洲际导弹',
      desc: '一道火光划破夜空，落点溅起冲天水柱——这是警告，还是预演？',
      options: [
        { label: '视作严重威胁', crisis: 10 },
        { label: '要求解释', crisis: -2 },
        { label: '同步试射', crisis: 15 }
      ]
    },
    {
      id: 'E13', title: '使馆人质事件',
      desc: '外交官被扣在铁栅栏后，谈判桌与刺刀同时摆上桌面。',
      options: [
        { label: '谈判解决', crisis: -7 },
        { label: '经济制裁', crisis: 5 },
        { label: '武装营救', crisis: 14, effect: { type: 'pop_loss', target: 'self', amount: 2 } }
      ]
    },
    {
      id: 'E14', title: '核材料失踪',
      desc: '一份库存清单对不上数，几公斤高浓缩铀不翼而飞。',
      options: [
        { label: '全境排查', crisis: -6, effect: { type: 'city_defense', target: 'self', amount: 1 } },
        { label: '封锁边境', crisis: 4 },
        { label: '嫁祸敌国', crisis: 11 }
      ]
    },
    {
      id: 'E15', title: '计算机误判来袭',
      desc: '新上线的智能预警把一群大雁识别成了机群。',
      options: [
        { label: '忽略告警', crisis: 9 },
        { label: '人工复核', crisis: -4 },
        { label: '全面戒备', crisis: 7 }
      ]
    },
    {
      id: 'E16', title: '边境地震暴露基地',
      desc: '山体滑坡掀开了伪装网，地下工事的轮廓暴露在卫星之下。',
      options: [
        { label: '封锁消息', crisis: -5 },
        { label: '争取国际援助', crisis: 3 },
        { label: '连夜转移装备', crisis: 10 }
      ]
    },
    {
      id: 'E17', title: '敌国领导人更替',
      desc: '一场突如其来的权力交接，让原本按部就班的对手变得难以捉摸。',
      options: [
        { label: '静观其变', crisis: -2 },
        { label: '递出橄榄枝', crisis: -8 },
        { label: '趁乱施压', crisis: 12 }
      ]
    },
    {
      id: 'E18', title: '网络泄露我方部署',
      desc: '一份标注着防空盲区的文件在暗网流传，你的底牌被人翻开。',
      options: [
        { label: '否认报道', crisis: -3 },
        { label: '重组部队', crisis: 6, effect: { type: 'city_defense', target: 'self', amount: 1 } },
        { label: '报复黑客', crisis: 13 }
      ]
    },
    {
      id: 'E19', title: '中立国请求调停',
      desc: '一个远离风暴的小国主动提出做和事佬，桌上摆好了茶。',
      options: [
        { label: '接受调停', crisis: -10 },
        { label: '表面答应', crisis: 0 },
        { label: '拒绝并警告', crisis: 9 }
      ]
    },
    {
      id: 'E20', title: '油轮在争议海域被扣',
      desc: '满载原油的巨轮被登船检查，能源命脉捏在了别人手里。',
      options: [
        { label: '外交斡旋', crisis: -6 },
        { label: '武力威慑', crisis: 8 },
        { label: '直接扣押敌船', crisis: 15 }
      ]
    },
    {
      id: 'E21', title: '科研突破可拦截导弹',
      desc: '实验室传来捷报：一种新拦截算法让末段命中率骤降。',
      options: [
        { label: '共享技术', crisis: -9 },
        { label: '保留优势', crisis: 3 },
        { label: '加速部署', crisis: 7 }
      ]
    },
    {
      id: 'E22', title: '末日时钟被调快',
      desc: '权威机构把指针拨近午夜，全球媒体的头条瞬间变红。',
      options: [
        { label: '谴责媒体炒作', crisis: -4 },
        { label: '全民戒备', crisis: 6 },
        { label: '加速备战', crisis: 14 }
      ]
    }
  ];

  /* ───────────────────────── 4. 全局配置（初始值，可调）─────────────────────────
   * 数值取自 DESIGN.md §3.1 / §4.1，sim.js 消费。
   */
  DC.CONFIG = {
    // 危机值与 DEFCON（§4.1）
    initialCrisis: 10,
    crisisDrift: 4,            // 每回合基础漂移 +4（世界滑向战争）
    defconLevels: [            // 危机值区间 → DEFCON 等级（升序）
      { min: 0,  level: 5 },
      { min: 20, level: 4 },
      { min: 40, level: 3 },
      { min: 60, level: 2 },
      { min: 80, level: 1 }    // DEFCON 1 解锁核弹
    ],
    // 单位系统（§3）
    silosPerFaction: 6,        // 发射井
    missilesPerSilo: 3,        // 每井 ICBM
    samPerFaction: 4,          // 防空导弹 SAM
    radarPerFaction: 3,        // 雷达
    // 战斗参数（§3.1）
    samInterceptProb: 0.55,    // SAM 拦截概率
    samCapacity: 2,            // SAM 每波拦截容量
    samCooldown: 2,            // SAM 冷却（回合）
    radarRadiusDeg: 45,        // 雷达覆盖角半径（约 5000 km）
    killRate: 0.85,            // 命中城市损失该城 85% 人口
    missileFlightMin: 15,      // 导弹飞行时间下限（秒）
    missileFlightMax: 40,      // 导弹飞行时间上限（秒，按大圆距离映射）
    missileFullDistKm: 20000,  // 飞行时间映射用的“满程”距离（约半地球）
    // 弹道溯源误差模型（§5.1）：σ = σ0 + k × 角距离(deg)
    traceSigma0: 1.5,          // σ0（度）
    traceK: 0.06,              // k（度/度）
    traceDissipateTurns: 3,    // 怀疑区域若干回合后消散
    // 局节奏（§6.1）
    roundSeconds: 20,          // 危机博弈每回合时长
    briefingSeconds: 10,       // 态势简报
    minRounds: 8,
    maxRounds: 14,
    earthRadiusKm: 6371,

    /* ── 以下为实现补充参数：DESIGN 未指定具体数值，由 D2 实现需要引入 ──
     * 不改动 DESIGN 已定稿的任何设定，仅补齐缺失的工程常量；D5 调参可直接改这里。
     */
    warSeconds: 180,           // 核战阶段时长（§6.1 说 2–3 分钟）
    warIdleEndSec: 25,         // 核战阶段内无任何在飞导弹且持续这么久 → 提前终局
    samRadiusDeg: 18,          // SAM 覆盖角半径（约 2000 km）；§3.1 只给了概率/容量/冷却
    samCooldownSec: 12,        // SAM 每拦 1 枚后恢复 1 发所需秒数（§3.1 的"冷却 2 回合"换算）
    aiFireMinSec: 4,           // AI 两批发射之间的最小间隔
    aiFireMaxSec: 11,          // AI 两批发射之间的最大间隔
    aiSalvoMax: 3,             // AI 单批最多发射枚数

    // AI 性格系数（§4.3）：hawkishness ∈ [-1,1]，鹰派偏好激化、鸽派偏好缓和。
    // 单独列在 CONFIG 而非 FACTIONS 里，使 §2.1 阵营表保持与 DESIGN 逐字对应。
    //
    // ⚠ 调参依据（D2 实测，勿凭直觉改）：
    //   22 张卡「随机选一个选项」的期望 crisis = +3.76，加漂移 +4 → 每回合净 7.76
    //   → 从 10 起约 10 回合达 DEFCON 1，正落在 §6.1 设计的 8–14 回合区间中点。
    //   因此六方性格须**围绕 0 分布**（当前 5 个 AI 均值 ≈ +0.06），让个体偏离产生性格
    //   而整体期望不被推离。偏鹰会过早开战（>4.75 时 8 回合内），偏鸽则永远打不起来。
    aiHawkishness: {
      ALFA:    0.00,   // 玩家席位，实际以玩家选择为准
      BRAVO:  -0.60,   // 西海在求和（§4.3 举例）
      CHARLIE: 0.10,
      DELTA:   0.90,   // 东陆是疯子（§4.3 举例）
      ECHO:    0.20,
      FOXTROT: -0.30
    },
    aiNoise: 0.20,             // 决策随机扰动幅度（相对性格项，过大则性格失效、过小则呆板）
    aiReserveRatio: 0.25,      // AI 保留作二次反击的核弹比例，前 60% 战争时长内不动用
    /* 目标选择：sc = pop / (飞行时间 + 8) ^ aiDistWeight，再在得分 top-K 里按权重随机。
     * 这两个值是 60 局×多组参数的实测扫描结果（见 tests/balance.js），勿凭直觉改：
     *   aiDistWeight=1,  topK=5  → 胜率 0%~83%，伤亡极差 23x  ← 地缘直接决定胜负，不可用
     *   aiDistWeight=0.15, topK=8 → 胜率 5%~30%，伤亡极差 2.7x ← 采用
     * 距离权重压到 0.15 是有意保留的一点点「就近打击」倾向；完全归零会让 AI 行为失真。
     * ⚠ D5 实现弹道溯源后须重扫：远射将新增「不易被定位」的收益，会改变最优解。
     */
    aiDistWeight: 0.15,
    aiTargetTopK: 8,

    /* 事件卡 city_defense 的防御层折算系数（实现补充）。
     * DESIGN §4.2 只写了「amount: 1 座城市获得防御」，没给数值：
     * 取 0.35 即防御层把一次命中的杀伤压到常规的三成五，够格挡一次、不够永久免疫。 */
    cityDefenseFactor: 0.35
  };

  /* ───────────────────────── 5. 查找表（纯函数构建，便于 sim/ui 直接取用）───────────────────────── */
  DC.FACTIONS_BY_CODE = {};
  DC.FACTIONS.forEach(function (f) { DC.FACTIONS_BY_CODE[f.code] = f; });

  DC.CITIES_BY_ID = {};
  DC.CITIES_BY_FACTION = {};
  DC.FACTIONS.forEach(function (f) { DC.CITIES_BY_FACTION[f.code] = []; });
  DC.CITIES.forEach(function (c) {
    DC.CITIES_BY_ID[c.id] = c;
    if (DC.CITIES_BY_FACTION[c.faction]) DC.CITIES_BY_FACTION[c.faction].push(c);
  });

  DC.EVENTS_BY_ID = {};
  DC.EVENTS.forEach(function (e) { DC.EVENTS_BY_ID[e.id] = e; });

})(typeof window !== 'undefined' ? window : globalThis);
