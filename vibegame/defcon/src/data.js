/*
 * defcon — data.js
 * 阵营 / 城市 / 事件卡 / 全局配置（纯 JS 字面量，不 fetch，不联网）
 * 命名空间：window.DC （离线小工具经典脚本，无 import/export/type=module）
 * 加载顺序：data.js → geo.js → sim.js → ai.js → render.js → ui.js → game.js
 */
(function (global) {
  'use strict';
  var DC = global.DC = global.DC || {};

  /* ───────────────────────── 1. 阵营（6，半架空）─────────────────────────
   * 代号 NATO 音标字母；主色用于球面阵营色块与 HUD。
   *
   * 命名口径（2026-09-08 改）：城市已用真实坐标，阵营名若还是「北境/西海」这种纯方位词，
   * 现实感会撕裂 —— 玩家看到燕京、长港、雾京，却不知道自己在替谁打仗。
   * 因此阵营名改为**带地缘指代但不点名真实国家**的大区集团名（美洲同盟、东亚联盟…），
   * region 也细化到真实大区。
   * ⚠ 红线：不出现任何真实国家名、真实政治军事组织名（北约/华约/欧盟等）。
   *   核打击真实国家有过审风险，也会把作品拖进现实政治叙事，与本作立意不符。
   */
  /* ───────────────────────── 1. 阵营（六个，半架空）─────────────────────────
   * trait 是**核姿态性格**，按现实地缘的核门槛高低排列，不按刻板印象：
   *   ALFA    北方联邦 —— 常规力量相对衰退、最依赖核威慑、核门槛最低、惯用核讹诈 → 最鹰
   *   BRAVO   美洲同盟 —— 唯一实战用过核武、全球投送 + 延伸威慑，但极度精算得失 → 偏鹰
   *   CHARLIE 欧亚公约 —— 外交制度化、核门槛高、内部意见多元 → 稳健居中
   *   DELTA   东亚联盟 —— 公开承诺不首先使用、经济深度依存、最怕打起来 → 最鸽
   *   ECHO    赤道共同体 —— 拉美/非洲/东南亚均为法定无核区，反核立场鲜明但左右逢源 → 偏鸽
   *   FOXTROT 南洋联邦 —— 无核、远离任何战线、只想自保 → 鸽
   * ⚠ 红线：不出现真实国家名与真实政治军事组织名；性格只作系数上的抽象，不指名影射。
   */
  /* perk：阵营特色加成（DESIGN §2.1 阵营差异化）。
   *   missiles    —— 发射井更多，核弹基数最大（北方联邦）
   *   airDefense  —— SAM 更多 + 拦截率加成（美洲同盟）
   *   radar       —— 雷达更多 + 覆盖半径加成（欧亚公约）
   *   population  —— 城市人口加成（东亚联盟）
   *   diplomacy   —— 每回合危机值额外降温（赤道共同体）
   *   spread      —— 人口稀疏 + 城市更多（南洋联邦）
   * perkDesc 供阵营选择界面展示。 */
  DC.FACTIONS = [
    { code: 'ALFA',    name: '北方联邦',   color: '#378ADD', region: '北亚 · 北欧 · 北极圈', trait: '倚核自重·先手威慑',  perk: 'missiles',   perkDesc: '核弹基数最多' },
    { code: 'BRAVO',   name: '美洲同盟',   color: '#639922', region: '北美 · 中美', trait: '全域打击·精算得失',  perk: 'airDefense', perkDesc: '防空拦截加成' },
    { code: 'CHARLIE', name: '欧亚公约',   color: '#1D9E75', region: '欧洲 · 地中海 · 中东', trait: '外交优先·稳健克制',  perk: 'radar',      perkDesc: '雷达探测加成' },
    { code: 'DELTA',   name: '东亚联盟',   color: '#E24B4A', region: '东亚 · 西太平洋', trait: '不首先用·极度审慎',  perk: 'population', perkDesc: '城市规模最大' },
    { code: 'ECHO',    name: '赤道共同体', color: '#EF9F27', region: '拉美 · 非洲 · 东南亚', trait: '无核地带·左右逢源',  perk: 'diplomacy',  perkDesc: '外交降温加成' },
    { code: 'FOXTROT', name: '南洋联邦',   color: '#7F77DD', region: '大洋洲 · 太平洋群岛', trait: '无核·避战自保',  perk: 'spread',      perkDesc: '城市多而分散' }
  ];

  /* ───────────────────────── 2. 城市（60，每阵营 10）─────────────────────────
   * 经纬度为公开地理常识（不侦察）；人口单位：百万（3–18M，每阵营约 90M）。
   * id 规则：<阵营>-<两位序号>
   *
   * ⚠ 坐标口径（2026-09-08 改）：城市不再随机撒点，**经纬度取真实城市坐标**，
   *   名称改为该城的中文别称（取地貌/别号，不直接用真名），并保留 real 字段记录原型。
   *   理由：随机撒点会让城市飘在海里、阵营区块边界失真，球面沙盘的地理说服力全丢；
   *   改用真实坐标后，跨洲飞行距离、雷达覆盖、弹道时长的观感才与玩家直觉一致。
   *   real 字段不进 UI，仅供维护与后续调参对照。
   */
  DC.CITIES = [
    // ── ALFA 北境联邦（环北极：北欧 / 北亚 / 北美北端）──
    { id: 'ALFA-01',    faction: 'ALFA',    name: '白京', real: '莫斯科',           lat: 55.76, lon: 37.62,   pop: 14 },
    { id: 'ALFA-02',    faction: 'ALFA',    name: '北港', real: '圣彼得堡',         lat: 59.93, lon: 30.34,   pop: 12 },
    { id: 'ALFA-03',    faction: 'ALFA',    name: '极港', real: '摩尔曼斯克',       lat: 68.97, lon: 33.08,   pop: 9 },
    { id: 'ALFA-04',    faction: 'ALFA',    name: '使城', real: '阿尔汉格尔斯克',   lat: 64.54, lon: 40.54,   pop: 8 },
    { id: 'ALFA-05',    faction: 'ALFA',    name: '岭城', real: '叶卡捷琳堡',       lat: 56.84, lon: 60.61,   pop: 10 },
    { id: 'ALFA-06',    faction: 'ALFA',    name: '新原', real: '新西伯利亚',       lat: 55.03, lon: 82.92,   pop: 9 },
    { id: 'ALFA-07',    faction: 'ALFA',    name: '湖京', real: '赫尔辛基',         lat: 60.17, lon: 24.94,   pop: 8 },
    { id: 'ALFA-08',    faction: 'ALFA',    name: '桦岛', real: '斯德哥尔摩',       lat: 59.33, lon: 18.07,   pop: 9 },
    { id: 'ALFA-09',    faction: 'ALFA',    name: '雪湾', real: '安克雷奇',         lat: 61.22, lon: -149.90, pop: 7 },
    { id: 'ALFA-10',    faction: 'ALFA',    name: '冻城', real: '雅库茨克',         lat: 62.03, lon: 129.73,  pop: 6 },

    // ── BRAVO 西海同盟（西半球：北美 / 中美）──
    { id: 'BRAVO-01',   faction: 'BRAVO',   name: '雾湾', real: '洛杉矶',           lat: 34.05, lon: -118.24, pop: 10 },
    { id: 'BRAVO-02',   faction: 'BRAVO',   name: '金岬', real: '旧金山',           lat: 37.77, lon: -122.42, pop: 8 },
    { id: 'BRAVO-03',   faction: 'BRAVO',   name: '雨港', real: '西雅图',           lat: 47.61, lon: -122.33, pop: 7 },
    { id: 'BRAVO-04',   faction: 'BRAVO',   name: '枫湾', real: '温哥华',           lat: 49.28, lon: -123.12, pop: 7 },
    { id: 'BRAVO-05',   faction: 'BRAVO',   name: '风城', real: '芝加哥',           lat: 41.88, lon: -87.63,  pop: 11 },
    { id: 'BRAVO-06',   faction: 'BRAVO',   name: '油港', real: '休斯顿',           lat: 29.76, lon: -95.37,  pop: 9 },
    { id: 'BRAVO-07',   faction: 'BRAVO',   name: '长港', real: '纽约',             lat: 40.71, lon: -74.01,  pop: 13 },
    { id: 'BRAVO-08',   faction: 'BRAVO',   name: '湖城', real: '多伦多',           lat: 43.65, lon: -79.38,  pop: 8 },
    { id: 'BRAVO-09',   faction: 'BRAVO',   name: '谷京', real: '墨西哥城',         lat: 19.43, lon: -99.13,  pop: 12 },
    { id: 'BRAVO-10',   faction: 'BRAVO',   name: '高城', real: '丹佛',             lat: 39.74, lon: -104.99, pop: 6 },

    // ── CHARLIE 中央联合体（欧洲 / 地中海 / 中东）──
    { id: 'CHARLIE-01', faction: 'CHARLIE', name: '雾京', real: '伦敦',             lat: 51.51, lon: -0.13,   pop: 10 },
    { id: 'CHARLIE-02', faction: 'CHARLIE', name: '光城', real: '巴黎',             lat: 48.86, lon: 2.35,    pop: 10 },
    { id: 'CHARLIE-03', faction: 'CHARLIE', name: '铁京', real: '柏林',             lat: 52.52, lon: 13.40,   pop: 8 },
    { id: 'CHARLIE-04', faction: 'CHARLIE', name: '丘城', real: '罗马',             lat: 41.90, lon: 12.50,   pop: 7 },
    { id: 'CHARLIE-05', faction: 'CHARLIE', name: '台京', real: '马德里',           lat: 40.42, lon: -3.70,   pop: 7 },
    { id: 'CHARLIE-06', faction: 'CHARLIE', name: '平城', real: '华沙',             lat: 52.23, lon: 21.01,   pop: 6 },
    { id: 'CHARLIE-07', faction: 'CHARLIE', name: '峡京', real: '伊斯坦布尔',       lat: 41.01, lon: 28.98,   pop: 11 },
    { id: 'CHARLIE-08', faction: 'CHARLIE', name: '沙京', real: '开罗',             lat: 30.04, lon: 31.24,   pop: 12 },
    { id: 'CHARLIE-09', faction: 'CHARLIE', name: '山京', real: '德黑兰',           lat: 35.69, lon: 51.39,   pop: 9 },
    { id: 'CHARLIE-10', faction: 'CHARLIE', name: '石港', real: '雅典',             lat: 37.98, lon: 23.73,   pop: 6 },

    // ── DELTA 东陆公约（东亚）──
    { id: 'DELTA-01',   faction: 'DELTA',   name: '燕京', real: '北京',             lat: 39.90, lon: 116.41,  pop: 11 },
    { id: 'DELTA-02',   faction: 'DELTA',   name: '江口', real: '上海',             lat: 31.23, lon: 121.47,  pop: 12 },
    { id: 'DELTA-03',   faction: 'DELTA',   name: '穗港', real: '广州',             lat: 23.13, lon: 113.26,  pop: 9 },
    { id: 'DELTA-04',   faction: 'DELTA',   name: '锦城', real: '成都',             lat: 30.57, lon: 104.07,  pop: 8 },
    { id: 'DELTA-05',   faction: 'DELTA',   name: '江城', real: '武汉',             lat: 30.59, lon: 114.31,  pop: 8 },
    { id: 'DELTA-06',   faction: 'DELTA',   name: '秦城', real: '西安',             lat: 34.34, lon: 108.94,  pop: 7 },
    { id: 'DELTA-07',   faction: 'DELTA',   name: '沈城', real: '沈阳',             lat: 41.80, lon: 123.43,  pop: 7 },
    { id: 'DELTA-08',   faction: 'DELTA',   name: '东湾', real: '东京',             lat: 35.68, lon: 139.65,  pop: 12 },
    { id: 'DELTA-09',   faction: 'DELTA',   name: '汉阳', real: '首尔',             lat: 37.57, lon: 126.98,  pop: 9 },
    { id: 'DELTA-10',   faction: 'DELTA',   name: '原京', real: '乌兰巴托',         lat: 47.89, lon: 106.91,  pop: 4 },

    // ── ECHO 赤道共同体（拉美 / 非洲 / 东南亚）──
    { id: 'ECHO-01',    faction: 'ECHO',    name: '糖港', real: '里约热内卢',       lat: -22.91, lon: -43.17, pop: 9 },
    { id: 'ECHO-02',    faction: 'ECHO',    name: '松京', real: '圣保罗',           lat: -23.55, lon: -46.63, pop: 10 },
    { id: 'ECHO-03',    faction: 'ECHO',    name: '旱城', real: '利马',             lat: -12.05, lon: -77.04, pop: 8 },
    { id: 'ECHO-04',    faction: 'ECHO',    name: '岭京', real: '波哥大',           lat: 4.71,  lon: -74.07,  pop: 7 },
    { id: 'ECHO-05',    faction: 'ECHO',    name: '泻港', real: '拉各斯',           lat: 6.52,  lon: 3.38,    pop: 11 },
    { id: 'ECHO-06',    faction: 'ECHO',    name: '河京', real: '金沙萨',           lat: -4.44, lon: 15.27,   pop: 9 },
    { id: 'ECHO-07',    faction: 'ECHO',    name: '高原', real: '内罗毕',           lat: -1.29, lon: 36.82,   pop: 7 },
    { id: 'ECHO-08',    faction: 'ECHO',    name: '椰港', real: '雅加达',           lat: -6.21, lon: 106.85,  pop: 10 },
    { id: 'ECHO-09',    faction: 'ECHO',    name: '狮港', real: '新加坡',           lat: 1.35,  lon: 103.82,  pop: 6 },
    { id: 'ECHO-10',    faction: 'ECHO',    name: '棕城', real: '马尼拉',           lat: 14.60, lon: 120.98,  pop: 8 },

    // ── FOXTROT 南洋联邦（大洋洲 / 太平洋群岛）──
    { id: 'FOXTROT-01', faction: 'FOXTROT', name: '帆港', real: '悉尼',             lat: -33.87, lon: 151.21, pop: 13 },
    { id: 'FOXTROT-02', faction: 'FOXTROT', name: '金湾', real: '墨尔本',           lat: -37.81, lon: 144.96, pop: 11 },
    { id: 'FOXTROT-03', faction: 'FOXTROT', name: '晴港', real: '布里斯班',         lat: -27.47, lon: 153.03, pop: 9 },
    { id: 'FOXTROT-04', faction: 'FOXTROT', name: '孤港', real: '珀斯',             lat: -31.95, lon: 115.86, pop: 9 },
    { id: 'FOXTROT-05', faction: 'FOXTROT', name: '酒湾', real: '阿德莱德',         lat: -34.93, lon: 138.60, pop: 8 },
    { id: 'FOXTROT-06', faction: 'FOXTROT', name: '北门', real: '达尔文',           lat: -12.46, lon: 130.84, pop: 6 },
    { id: 'FOXTROT-07', faction: 'FOXTROT', name: '云港', real: '奥克兰',           lat: -36.85, lon: 174.76, pop: 9 },
    { id: 'FOXTROT-08', faction: 'FOXTROT', name: '岬城', real: '惠灵顿',           lat: -41.29, lon: 174.78, pop: 7 },
    { id: 'FOXTROT-09', faction: 'FOXTROT', name: '珠屿', real: '檀香山',             lat: 21.31, lon: -157.86, pop: 7 },
    { id: 'FOXTROT-10', faction: 'FOXTROT', name: '珊屿', real: '苏瓦',             lat: -18.14, lon: 178.44, pop: 6 },
    // ── FOXTROT 加 2 城（perk: spread —— 城市更多、人口稀疏）──
    { id: 'FOXTROT-11', faction: 'FOXTROT', name: '塔港', real: '霍巴特',             lat: -42.88, lon: 147.33, pop: 5 },
    { id: 'FOXTROT-12', faction: 'FOXTROT', name: '震城', real: '基督城',             lat: -43.53, lon: 172.64, pop: 4 }
  ];

  /* ───────────────────────── 3. 事件卡（22，冷战风味）─────────────────────────
   * 结构：id / title / desc（冷战风味）/ options[2..3]
   * 选项：label + crisis（全局危机值修正，±5–15，极端可达 ±30）
   *   crisis 也可是字符串 'MAX' —— 选中即把全局危机值直接拉到 100 并立即开战，
   *   不参与「六方取均值」的常规结算（见 §4.4 拉满机制）。
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
        { label: '立即全面反击', crisis: 'MAX' },
        { label: '等待二次确认', crisis: -6 },
        { label: '提升戒备等级', crisis: 8 }
      ]
    },
    {
      id: 'E03', title: '敌方提议裁军谈判',
      desc: '一份照会悄然递到各国使馆，措辞客气，却暗藏试探。',
      options: [
        { label: '接受谈判', crisis: -14, effect: { type: 'boost_pop', target: 'self', mode: 'ratio', amount: 0.05 } },
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
        { label: '有条件部署', crisis: 4, effect: { type: 'add_missiles', target: 'self', amount: 1 } },
        { label: '立即前沿部署', crisis: 13, effect: { type: 'add_missiles', target: 'self', amount: 2 } }
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
        { label: '暂缓军备转民生', crisis: -9, effect: { type: 'boost_pop', target: 'self', mode: 'ratio', amount: 0.04 } }
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
        { label: '同步试射干扰预警', crisis: 15, effect: { type: 'degrade_facility', target: 'enemy', facility: 'radar', amount: 1, mode: 'radius_half' } }
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
        { label: '趁乱突袭敌方雷达', crisis: 12, effect: { type: 'destroy_facility', target: 'enemy', facility: 'radar', amount: 1 } }
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
        { label: '接受调停', crisis: -10, effect: { type: 'add_radar', target: 'self' } },
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
        { label: '保留优势', crisis: 3, effect: { type: 'add_sam', target: 'self' } },
        { label: '加速部署', crisis: 7, effect: { type: 'add_sam', target: 'self' } }
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
    },
    {
      id: 'E23', title: '敌战略轰炸机群转向我方',
      desc: '雷达上密密麻麻的光点突然改变航向，正对着我方腹地。距离判定窗口只剩几分钟。',
      options: [
        { label: '派机拦截伴飞', crisis: 6 },
        { label: '保持监视不动作', crisis: -3 },
        { label: '判定为首轮打击，立即发射', crisis: 'MAX' }
      ]
    },
    {
      id: 'E24', title: '难民潮涌入边境',
      desc: '邻国战火逼出成千上万的流离者，队伍绵延至地平线。安置是道义，也是负担。',
      options: [
        { label: '开放安置', crisis: -8, effect: { type: 'boost_pop', target: 'self', amount: 4 } },
        { label: '封锁边境', crisis: 5 },
        { label: '强制遣返', crisis: 12 }
      ]
    },
    {
      id: 'E25', title: '盟友共享卫星情报',
      desc: '一个友方情报机构发来密档，里面标注着对手几座关键城市的驻防部署。',
      options: [
        { label: '接受情报', crisis: -6, effect: { type: 'intel_city', target: 'enemy', amount: 2 } },
        { label: '婉拒共享', crisis: 2 },
        { label: '借机渗透其卫星系统', crisis: 13, effect: { type: 'intel_city', target: 'enemy', amount: 3 } }
      ]
    },
    {
      id: 'E26', title: '秘密扩军计划',
      desc: '军方提交了一份地下工事扩建方案，可在不惊动外界的情况下补充核武库存。',
      options: [
        { label: '否决计划专注民生', crisis: -10, effect: { type: 'boost_pop', target: 'self', mode: 'ratio', amount: 0.03 } },
        { label: '小规模补充', crisis: 3, effect: { type: 'add_missiles', target: 'self', amount: 1 } },
        { label: '全面扩军', crisis: 11, effect: { type: 'add_missiles', target: 'self', amount: 2 } }
      ]
    },
    {
      id: 'E27', title: '特种部队突袭发射井',
      desc: '一支精锐小队待命出击，目标是一座敌方发射井。得手可削弱其核武库存，失手则授人以柄。',
      options: [
        { label: '取消行动', crisis: -4 },
        { label: '有限破坏', crisis: 7, effect: { type: 'degrade_facility', target: 'enemy', facility: 'silo', amount: 1, mode: 'missiles_half' } },
        { label: '全力摧毁', crisis: 14, effect: { type: 'destroy_facility', target: 'enemy', facility: 'silo', amount: 1 } }
      ]
    },
    {
      id: 'E28', title: '情报渗透敌方防空指挥',
      desc: '网络部队报告已摸到敌方防空网的边缘节点，可植入假指令瘫痪其部分阵地。',
      options: [
        { label: '收手不前', crisis: -3 },
        { label: '瘫痪一处防空', crisis: 6, effect: { type: 'degrade_facility', target: 'enemy', facility: 'sam', amount: 1, mode: 'ammo_half' } },
        { label: '全面入侵暴露其体系', crisis: 10, effect: { type: 'intel_city', target: 'enemy', amount: 2 } }
      ]
    }
  ];

  /* ───────────────────────── 4. 全局配置（初始值，可调）─────────────────────────
   * 数值取自 DESIGN.md §3.1 / §4.1，sim.js 消费。
   */
  DC.CONFIG = {
    // 危机值与 DEFCON（§4.1）
    initialCrisis: 10,
    /* 每回合基础漂移：世界自己在滑向战争，光靠选缓和选项拖不出和平，只能拖慢。
     * 4 → 6.8（2026-09-08）：性格改成现实向（ALFA 最鹰 / DELTA 最鸽）后，六方选择整体上偏鸽，
     * 实测 9/10 局都爬不到 DEFCON 1、全靠 maxRounds 兜底强行开战，危机博弈失去张力。
     * 漂移 6.8 后 150 局实测：开战回合 min7 / 中位 11 / max14，撞上限 7/150（改前 9/10）。 */
    crisisDrift: 6.8,
    /* 「拉满」机制（§4.4）：任一方选中 crisis:'MAX' 的选项，或任一枚核弹落地，
     * 全局危机值立刻置 crisisMax（100）并进入热核战争，跳过均值结算。
     * crisisMaxAiScore 只用于 AI 打分与数值审计 —— AI 不能真的一秒开战，
     * 否则六方里只要有一个鹰派，第一回合就结束了，危机博弈彻底失去意义。 */
    crisisMax: 100,
    crisisMaxAiScore: 30,      // 'MAX' 在 AI 打分/审计中的等价危机分（与最激化选项同档）
    /* AI 按下「拉满」的最低危机值。用 crisis 而非 defcon 卡阈值，是为了把开战时机
     * 钉死在 §6.1 设计的 8–14 回合内：从 initialCrisis 10 出发、每回合净约 +7.76，
     * 爬到 70 恰好是第 8 回合 —— 再早放闸，鹰派 AI 会在第 7 回合就把世界点了。 */
    aiMaxMinCrisis: 70,
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
    /* 潜艇（2026-09-09 新增，§11.10）：机动发射平台，功能与发射井一致 —— 带弹、可发射、
     * 发射后同样被弹道溯源暴露。区别只在它是「海上机动」的叙事与图上符号。
     * 每阵营 2 艘 × 2 枚 = +4 枚，六方合计 +24 枚（101 → 125）。
     * 为什么不给它更多弹：核威慑的叙事重点是「二次反击」，潜艇存在的意义是
     * 让先手倾泻打不干净对手的还手之力，而不是单纯把弹数堆高。
     *
     * ⚠ 平衡代价（2026-09-09 实测，tests/balance.js 60 局，该脚本为固定种子、结果可复现）：
     *   潜艇把总发射量抬上去后，防空强势阵营（美洲同盟 6 座 SAM + 拦截加成）白捡优势 ——
     *   胜率 40% → 48%，越过「无阵营独大」判定线。削减潜艇弹数无用（2/艇→1/艇→1 艇×1 弹
     *   实测仍在 47~48%），因为它吃的是「多出来的发射量」，不是潜艇自己的那几枚弹。
     *   故改为同步回调 perkSamProbBonus（0.08 → 0.03）抵消，见该项注释。 */
    subsPerFaction: 2,         // 战略核潜艇（机动发射平台）
    missilesPerSub: 2,         // 每艇 SLBM
    /* 每回合基础产能（§11.13）：危机博弈每回合结算时，六方都拿到一份「基础增长」，
     * 让统计栏的数字每回合都活着，也让「拖回合」有可感知的收益与代价。
     *   roundPopGrowth  每座存活城市规模 ×(1+0.008)，上限 CITY_POP_CAP（20M）——
     *                   全阵营约 +0.7M/回合，玩家在统计栏看得见；
     *   roundMissileGain 每回合 +1 枚弹头，轮流补进未满的发射井（潜艇不补，产能算本土的）；
     *   siloExtraCap    每口井在初始基数之上还能再补几枚（ALFA 3+2=5）。
     * ⚠ 改这三个值必须重跑 tests/balance.js：它们抬高全局发射量，直接影响阵营胜率。 */
    roundPopGrowth: 0.008,
    roundMissileGain: 1,
    siloExtraCap: 2,
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
    /* SAM 覆盖角半径。§3.1 没给这个值，属实现补充常量。
     * ⚠ 2026-09-08 由 18° 下调到 9°（约 1000 km）：城市坐标改成真实城市后，
     *   18° 的覆盖圈能一次罩住整块大陆（欧洲、北美东部全境），实测总拦截率飙到 82%，
     *   108 枚弹只有 19 枚落地，核战阶段打不出任何战果。下调到 9° 后拦截率回到 66%，
     *   与改坐标前的 68% 基本持平。附带好处：地缘造成的伤亡极差从 3.7x 压到 1.6x。 */
    samRadiusDeg: 9,
    samCooldownSec: 12,        // SAM 每拦 1 枚后恢复 1 发所需秒数（§3.1 的"冷却 2 回合"换算）
    /* §11.5 拦截视觉同步：逻辑层判定拦截成功后，不立刻 m.alive=false，
     * 而是延迟 interceptDelaySec（与渲染层 INT_RISE 对齐）让拦截弹升空演出完成，
     * 核弹在此期间渐隐，二者在接触点同时消失/爆闪。 */
    interceptDelaySec: 0.34,
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
    /* 鹰鸽系数按现实核姿态重排（2026-09-08）：
     * 原设定把东亚写成 +0.90 的疯子、把美洲写成 -0.60 的求和派，与现实核门槛完全相反 ——
     * 现实中核威慑依赖最深、门槛最低的是北方（ALFA），而承诺不首先使用、经济依存最深、
     * 最怕局势失控的恰恰是东亚（DELTA）。刻板印象会让懂地缘的玩家一秒出戏。
     * 取值让总体激化强度与旧设定大致相当（和 0.20 对旧 0.30），节奏不因改性格而崩。 */
    aiHawkishness: {
      ALFA:    0.90,   // 最鹰：核威慑是它唯一的大国筹码
      BRAVO:   0.70,   // 偏鹰：有全球打击与延伸威慑，但精算得失
      CHARLIE: 0.00,   // 居中：外交优先、制度约束
      DELTA:  -0.80,   // 最鸽：不首先使用 + 经济依存，踩刹车的一方
      ECHO:   -0.20,   // 偏鸽：法定无核区，反核立场鲜明
      FOXTROT: -0.40   // 鸽：无核、避战
    },
    aiNoise: 0.20,             // 决策随机扰动幅度（相对性格项，过大则性格失效、过小则呆板）
    aiReserveRatio: 0.25,      // AI 保留作二次反击的核弹比例，前 60% 战争时长内不动用
    /* 目标选择：sc = pop / (飞行时间 + 8) ^ aiDistWeight，再在得分 top-K 里按权重随机。
     * 这两个值是 60 局×多组参数的实测扫描结果（见 tests/balance.js），勿凭直觉改：
     *   aiDistWeight=1,  topK=5  → 胜率 0%~83%，伤亡极差 23x  ← 地缘直接决定胜负，不可用
     *   aiDistWeight=0.15, topK=8 → 胜率 5%~30%，伤亡极差 2.7x ← 随机撒点时代采用
     *
     * ⚠ 2026-09-08 重扫（城市改用真实坐标，地缘格局彻底变了，旧结论作废）：
     *   aiDistWeight=0.15, topK=8  → 胜率 4%~41%，伤亡极差 2.3x
     *   aiDistWeight=0.30, topK=12 → 胜率 6%~27%，伤亡极差 1.6x ← 当时采用（150 局复核）
     * 距离权重 0.15 → 0.30：真实坐标下远近差距被显著拉大，必须给「就近打击」更强的倾向，
     * 否则偏远阵营（南洋）永远排在目标队列末尾，谁也打不到它。topK 8 → 12 同为分散火力。
     *
     * ⚠ 2026-09-08 三扫（性格改成现实向，危机漂移 +4→6.8，两组参数耦合，须一起看）：
     *   drift6.8 dist0.10 topK20 → 胜率 8~29%，极差 21%
     *   drift6.8 dist0.10 topK30 → 胜率 6~26%，极差 20%，伤亡极差 2.1x ← 采用（150 局复核：
     *     开战回合 min7/中位11/max14，撞上限 7/150，南洋从 32% 压到 19%）
     *   drift7.0 dist0.10 topK30 → 极差 25%（东亚、北方被抬到 27%/31%，反而更偏）
     * 结论反转的原因：漂移调高让战争来得更早，AI 有更多弹头与更长时间去够到远处的南洋，
     * 此时「就近打击」的倾向反而成了南洋的保护伞 —— 距离权重必须调低、候选池必须调大，
     * 火力才会真正摊到大洋洲头上。
     * ⚠ D5 实现弹道溯源后须再扫：远射将新增「不易被定位」的收益，会改变最优解。
     */
    /* ⚠ 2026-09-09 四扫 + 五扫（潜艇入列、布点重做后）：
     *   潜艇把总发射量抬了约 20%，"挨打少的阵营"优势被放大 —— BRAVO（6 座 SAM + 拦截加成）
     *   一度到 48%，削其拦截加成后换成 FOXTROT（太偏远）47% 冒头。
     *   两端轮流冒头 ⇒ 候选池还不够"远"、距离权重还太强，火力打不到大洋洲与美洲头上。
     *   五扫定值：distWeight 0.10 → 0.05、topK 30 → 34，配合 perkSamProbBonus 0.08 → 0.03：
     *   胜率区间 0~37%（基线 0~40%），伤亡极差 2.5x（基线 3.4x）—— 比改动前更均衡。 */
    aiDistWeight: 0.05,
    aiTargetTopK: 34,          // 见 aiDistWeight 的四扫注释（30 → 34）

    /* 事件卡 city_defense 的防御层折算系数（实现补充）。
     * DESIGN §4.2 只写了「amount: 1 座城市获得防御」，没给数值：
     * 取 0.35 即防御层把一次命中的杀伤压到常规的三成五，够格挡一次、不够永久免疫。 */
    cityDefenseFactor: 0.35,

    /* ── 阵营特色加成参数（DESIGN §2.1 perk）──
     * 各阵营在单位数量 / 拦截率 / 雷达半径 / 人口 / 外交上有差异化加成，
     * 让选阵营有策略意义而非纯配色区别。helper 见 DC.perkOf。
     *
     * ⚠ 2026-09-09 核武梯度（DESIGN §11.1）：原设定除 ALFA 外五方都是 18 枚，
     *   阵营差异只剩颜色与几个 perk，核武体量没有策略区分度。
     *   改为按 §2.1 鹰鸽系数拉开梯度：鹰派多弹、鸽派少弹、南洋多井少弹。
     *   ⚠ 2026-09-09 二调：东亚 15 → 18、欧亚 18 → 15（井数对调，总量不变）。
     *     口径与核姿态对齐 —— 东亚承诺不首先使用，但体量决定它必须有足够还手之力；
     *     欧亚外交优先、内部多元，存量居中偏保守。
     *   梯度（井弹，不含潜艇）：ALFA 24 / BRAVO 18 / CHARLIE 15 / DELTA 18 / ECHO 12 / FOXTROT 14。
     *   - ALFA  8 井 × 3 弹 = 24（倚核自重，核弹基数最多，沿用 perkMissileSilos）
     *   - BRAVO 6 井 × 3 弹 = 18（默认，全域打击但精算得失）
     *   - CHARLIE 5 井 × 3 弹 = 15（外交优先，核武存量居中偏保守）
     *   - DELTA 6 井 × 3 弹 = 18（不首先使用，但保有足够二次反击能力）
     *   - ECHO  6 井 × 2 弹 = 12（法定无核地带，核武存量最少）
     *   - FOXTROT 7 井 × 2 弹 = 14（无核但分散部署，多井少弹，与 spread perk 对齐）
     *   井弹合计 101 枚（原 108）；每阵营另加 2 艘潜艇 × 2 枚 = 4 枚，全局合计 125 枚。 */
    perkMissileSilos: 8,        // ALFA 发射井数（其他阵营按 perkSilosByFaction 取）
    perkSamCount: 6,            // BRAVO SAM 数（其他 samPerFaction=4）
    /* BRAVO 拦截概率加成。两次下调都是同一条理由：只要有「防空更强」的阵营，
     * 全局发射量一涨，它的优势就被放大（少挨的每一发都是白赚的存活人口）。
     *   §11.8  0.15 → 0.08（剩余人口计分下防空优势放大）
     *   §11.10 0.08 → 0.03（潜艇抬高总发射量后，BRAVO 胜率 40% → 48%，越线）
     * ⚠ 改这个值必须重跑 tests/balance.js：它同时决定拦截率与阵营胜率极差。 */
    perkSamProbBonus: 0.03,
    perkRadarCount: 5,          // CHARLIE 雷达数（其他 radarPerFaction=3）
    perkRadarRadiusBonus: 15,   // CHARLIE 雷达覆盖半径加成（度）
    perkPopMultiplier: 1.3,     // DELTA 城市人口倍率
    perkSpreadPopMul: 0.8,      // FOXTROT 城市人口倍率（稀疏）
    perkDiplomacyDrift: -1.5,   // ECHO 每回合危机值额外降温（外交斡旋）
    /* 各阵营发射井数（按 §11.1 拉开梯度）。不带 perk 的阵营回退到 silosPerFaction。
     * ALFA 走 perkMissileSilos 兼容旧调用，其余按此表取。 */
    perkSilosByFaction: {
      ALFA: 8, BRAVO: 6, CHARLIE: 5, DELTA: 6, ECHO: 6, FOXTROT: 7
    },
    /* 各阵营每井 ICBM 数（按 §11.1 拉开梯度）。鸽派阵营每井弹数下调，
     * 与发射井数配合形成「核武存量」维度的阵营差异化。 */
    perkMissilesPerSiloByFaction: {
      ALFA: 3, BRAVO: 3, CHARLIE: 3, DELTA: 3, ECHO: 2, FOXTROT: 2
    }
  };

  /* ───────────────────────── 5. 危机值读取工具 ─────────────────────────
   * crisis 有两种形态：数值 ±30，或字符串 'MAX'（直接拉满）。
   * 凡是「把 crisis 当数字用」的地方（AI 打分、数值审计、UI 排序）都必须走 crisisValue，
   * 否则 Math.min/max 会把 'MAX' 转成 NaN 并污染整条计算链。
   */
  DC.isCrisisMax = function (o) { return !!(o && o.crisis === 'MAX'); };
  DC.crisisValue = function (o) {
    if (!o) return 0;
    if (o.crisis === 'MAX') return DC.CONFIG.crisisMaxAiScore;
    return (typeof o.crisis === 'number') ? o.crisis : 0;
  };

  /* ───────────────────────── 6. 查找表（纯函数构建，便于 sim/ui 直接取用）───────────────────────── */
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

  /* ───────────────────────── 7. 阵营特色加成（perk）─────────────────────────
   * 把「阵营 → 单位数量 / 拦截率 / 雷达半径 / 人口倍率 / 外交降温」的差异化集中在一处，
   * sim.deployUnits / sim.create / render.buildUnits / ui.showSetup 共用同一口径。
   * 不带 perk 的阵营回退到 CONFIG 默认值，保证只有显式给 perk 的阵营才被改写。 */
  DC.perkOf = function (code) {
    var f = DC.FACTIONS_BY_CODE[code] || {};
    var p = f.perk, C = DC.CONFIG;
    var silos = C.silosPerFaction, sam = C.samPerFaction, radar = C.radarPerFaction;
    var samProb = C.samInterceptProb, radarR = C.radarRadiusDeg;
    var popMul = 1, dipDrift = 0;
    var mps = C.missilesPerSilo;
    /* §11.1 核武梯度：每阵营的发射井数 / 每井弹数按 perk 表取值，
     * 不再只有 ALFA 拿到 perkMissileSilos、其余全默认。 */
    if (C.perkSilosByFaction && C.perkSilosByFaction[code] != null) {
      silos = C.perkSilosByFaction[code];
    }
    if (p === 'missiles')   silos = C.perkMissileSilos;   // ALFA 仍走旧字段，保持向后兼容
    if (C.perkMissilesPerSiloByFaction && C.perkMissilesPerSiloByFaction[code] != null) {
      mps = C.perkMissilesPerSiloByFaction[code];
    }
    if (p === 'airDefense') { sam = C.perkSamCount; samProb = C.samInterceptProb + C.perkSamProbBonus; }
    if (p === 'radar')      { radar = C.perkRadarCount; radarR = C.radarRadiusDeg + C.perkRadarRadiusBonus; }
    if (p === 'population') popMul = C.perkPopMultiplier;
    if (p === 'spread')     popMul = C.perkSpreadPopMul;
    if (p === 'diplomacy')  dipDrift = C.perkDiplomacyDrift;
    return {
      silos: silos, sam: sam, radar: radar,
      subs: C.subsPerFaction,               // 潜艇数（六方一致，机动平台不参与阵营梯度）
      missilesPerSilo: mps,
      missilesPerSub: C.missilesPerSub,
      samProb: samProb, radarRadiusDeg: radarR,
      popMul: popMul, dipDrift: dipDrift,
      perk: p, perkDesc: f.perkDesc || ''
    };
  };

  // 阵营核弹总数（选择阵营界面展示用）：发射井 + 潜艇
  DC.factionMissiles = function (code) {
    var k = DC.perkOf(code);
    return k.silos * k.missilesPerSilo + k.subs * k.missilesPerSub;
  };

})(typeof window !== 'undefined' ? window : globalThis);
