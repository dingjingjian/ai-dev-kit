/* 罗马军团图鉴 · 装备表
 *
 * 检阅页右列那块「装备拆解」的真源。三张表：
 *   GEAR_SLOTS  槽位定义与显示顺序（[key, 中文名]）
 *   GEAR        装备词表：id -> {slot, name, note}。**这是受控词表**，
 *               同义词必须归一（长矛 / 简陋长矛 / 萨里沙长矛是三种东西；
 *               但「长骑枪」与「骑枪」要分开，一个双手一个单手）。
 *               图位按 id 派生：./assets/gear/<id>.webp，缺图退成槽位名文字。
 *   KIT         兵种 -> 槽位引用表。键是 units.js 里的 id；null 或省略＝这个兵种没有这件装备，
 *               **渲染时空槽直接不显示**（一件没有就不占位）。
 *
 * 为什么 KIT 不放 units.js：装备是独立一块领域知识（词表 + 引用），48 条挂进 units.js
 * 会让那个文件更难读；而 check_data.js 会校验两边对得上（KIT 的键必须在 units.js 里、
 * 值必须在 GEAR 里、slot 必须一致）。
 *
 * 规模：52 件覆盖 48 个兵种的 178 个非空槽位（平均复用 3.4 次，每兵种 2–5 件）。
 * 出图规格见 docs/装备图集需求.md；提示词由 tools/gen_prompts.py 生成。
 */
var GEAR_SLOTS=[
  ['head','头部'],
  ['body','甲胄'],
  ['shield','盾'],
  ['melee','主武器'],
  ['ranged','远程'],
  ['mount','坐骑 · 战兽']
];

var GEAR={
  /* ---- 头部 ---- */
  'montefortino':    {slot:'head',  name:'蒙式青铜盔',   note:'顶上插羽饰，护住头顶与后颈'},
  'attic':           {slot:'head',  name:'阿提卡式盔',   note:'希腊式开面盔，视野与防护折中'},
  'corinthian':      {slot:'head',  name:'科林斯式盔',   note:'全罩式，只留 T 形视线口'},
  'spangenhelm':     {slot:'head',  name:'条片铆接盔',   note:'铁条拼铆，部落工匠的做法'},
  'mask-helm':       {slot:'head',  name:'遮面头盔',     note:'连面罩，只留一条眼缝'},
  'soft-cap':        {slot:'head',  name:'尖顶软帽',     note:'草原软帽，不挡视野也无防护'},
  'beast-hood':      {slot:'head',  name:'兽皮头兜',     note:'狼皮 / 狐皮 / 熊皮，威慑多于防护'},
  'hair-band':       {slot:'head',  name:'束发带',       note:'无盔，只把头发束起'},
  'feather':         {slot:'head',  name:'羽毛头饰',     note:'努比亚弓手的羽饰'},

  /* ---- 甲胄 ---- */
  'lorica-hamata':   {slot:'body',  name:'锁子甲',       note:'铁环连缀，罗马军团的主力甲'},
  'lorica-squamata': {slot:'body',  name:'鳞甲',         note:'铁片叠缀如鱼鳞，正面防护最优'},
  'lorica-segmentata':{slot:'body', name:'分段板条胸甲', note:'铁条横连，活动性好'},
  'bronze-cuirass':  {slot:'body',  name:'希腊式青铜胸甲',note:'整片胸背甲，内衬皮革'},
  'linen-cuirass':   {slot:'body',  name:'亚麻胸甲',     note:'多层麻布胶合，轻而韧'},
  'pectorale':       {slot:'body',  name:'小胸甲',       note:'只护住胸口的一小块铁板'},
  'hide-armour':     {slot:'body',  name:'皮甲 / 兽皮',  note:'皮革与兽皮，轻但挡不住利刃'},
  'coarse-tunic':    {slot:'body',  name:'粗布束腰衣',   note:'无甲，只有一层粗布'},
  'cataphract-plate':{slot:'body',  name:'具装鳞甲',     note:'人与马同披，只露眼缝'},
  'elephant-armour': {slot:'body',  name:'象衣 / 象甲片',note:'披挂象身的甲片与织物'},
  'dog-collar':      {slot:'body',  name:'带钉皮项圈',   note:'护住颈部，对付刀剑'},
  'no-armour':       {slot:'body',  name:'无甲',         note:'赤身或仅束腰'},

  /* ---- 盾 ---- */
  'scutum':          {slot:'shield',name:'罗马曲面大盾', note:'弧面矩形，可遮住半身'},
  'oval-shield':     {slot:'shield',name:'椭圆盾',       note:'木芯包皮，配金属盾心'},
  'round-shield':    {slot:'shield',name:'希腊式大圆盾', note:'青铜覆面的大圆盾'},
  'parma':           {slot:'shield',name:'小圆盾',       note:'轻便小盾，多给轻步兵与骑兵'},
  'pelta':           {slot:'shield',name:'新月轻盾',     note:'月牙形，轻装散兵用'},
  'silver-shield':   {slot:'shield',name:'银饰盾',       note:'银箔覆面，兼作身份标识'},
  'wood-buckler':    {slot:'shield',name:'木盾',         note:'原木拼板，只包一层铁边'},
  'hide-buckler':    {slot:'shield',name:'小圆皮盾',     note:'蒙皮小盾，草原骑兵用'},

  /* ---- 近战武器 ---- */
  'gladius':         {slot:'melee', name:'罗马短剑',     note:'双刃直剑，刺优于砍'},
  'xiphos':          {slot:'melee', name:'希腊短剑',     note:'叶形双刃，近身格斗'},
  'iberian-sword':   {slot:'melee', name:'西班牙短剑',   note:'两面开刃，刺砍皆利'},
  'celtic-longsword':{slot:'melee', name:'凯尔特长剑',   note:'长而无尖，靠劈砍与冲势'},
  'spear':           {slot:'melee', name:'长矛',         note:'一杆到底的通用长兵器'},
  'sarissa':         {slot:'melee', name:'萨里沙长矛',   note:'五点五米以上，双手持握'},
  'lance':           {slot:'melee', name:'骑枪',         note:'单手持握的骑用枪'},
  'kontos':          {slot:'melee', name:'长骑枪',       note:'双手平端，借马力贯刺'},
  'battle-axe':      {slot:'melee', name:'单手战斧',     note:'靠重量破甲'},
  'scythe':          {slot:'melee', name:'轴镰',         note:'装在车轮轴端的长镰'},
  'natural-weapons': {slot:'melee', name:'天生武器',     note:'象牙 / 獠牙，不靠人手'},

  /* ---- 远程 · 投掷 ---- */
  'pilum':           {slot:'ranged',name:'重标枪',       note:'细长铁杆，命中即折'},
  'javelin':         {slot:'ranged',name:'轻标枪',       note:'轻便易携，多用于骚扰'},
  'sling':           {slot:'ranged',name:'投石带',       note:'铅弹或卵石，射程极远'},
  'composite-bow':   {slot:'ranged',name:'复合弓',       note:'木角筋胶合，短而劲'},
  'self-bow':        {slot:'ranged',name:'单木弓',       note:'整木削成，简易可靠'},
  'francisca':       {slot:'ranged',name:'投掷战斧',     note:'飞掷破盾，落地还能捡'},

  /* ---- 坐骑 · 载具 · 战兽 ---- */
  'horse':           {slot:'mount', name:'战马',         note:'四角鞍毯，无鞍无镫'},
  'light-horse':     {slot:'mount', name:'无鞍轻马',     note:'靠膝盖控马，耐力见长'},
  'armoured-horse':  {slot:'mount', name:'具装战马',     note:'马身同披鳞甲'},
  'elephant':        {slot:'mount', name:'战象',         note:'北非 / 非洲 / 印度象，背负象轿'},
  'chariot':         {slot:'mount', name:'卷镰战车',     note:'四马双轮，轮轴装镰'},
  'war-dog':         {slot:'mount', name:'战獒',         note:'带钉项圈的猛犬'}
};

var KIT={
  /* 罗马 */
  'velites':                  {head:'beast-hood',  body:'no-armour',        shield:'parma',         melee:null,            ranged:'javelin',       mount:null},
  'hastati':                  {head:'montefortino',body:'pectorale',        shield:'scutum',        melee:'gladius',       ranged:'pilum',         mount:null},
  'principes':                {head:'montefortino',body:'lorica-hamata',    shield:'scutum',        melee:'gladius',       ranged:'pilum',         mount:null},
  'triarii':                  {head:'montefortino',body:'lorica-squamata',  shield:'scutum',        melee:'spear',         ranged:null,            mount:null},
  'equites':                  {head:'montefortino',body:'lorica-hamata',    shield:'parma',         melee:'lance',         ranged:null,            mount:'horse'},
  'praetorians':              {head:'attic',       body:'lorica-segmentata',shield:'scutum',        melee:'gladius',       ranged:'pilum',         mount:null},

  /* 迦太基 */
  'libyan-inf':               {head:'corinthian',  body:'linen-cuirass',    shield:'oval-shield',   melee:'spear',         ranged:null,            mount:null},
  'sacred-band':              {head:'corinthian',  body:'bronze-cuirass',   shield:'round-shield',  melee:'xiphos',        ranged:null,            mount:null},
  'numidian-cav':             {head:'soft-cap',    body:'coarse-tunic',     shield:'hide-buckler',  melee:null,            ranged:'javelin',       mount:'light-horse'},
  'balearic-slingers':        {head:'hair-band',   body:'coarse-tunic',     shield:null,            melee:null,            ranged:'sling',         mount:null},
  'iberian-inf':              {head:null,          body:'coarse-tunic',     shield:'parma',         melee:'iberian-sword', ranged:null,            mount:null},
  'carthage-elephants':       {head:null,          body:'elephant-armour',  shield:null,            melee:'natural-weapons',ranged:null,           mount:'elephant'},

  /* 马其顿 */
  'phalanx':                  {head:'attic',       body:'linen-cuirass',    shield:'parma',         melee:'sarissa',       ranged:null,            mount:null},
  'hypaspists':               {head:'attic',       body:'bronze-cuirass',   shield:'round-shield',  melee:'xiphos',        ranged:null,            mount:null},
  'argyraspides':             {head:'attic',       body:'bronze-cuirass',   shield:'silver-shield', melee:'sarissa',       ranged:null,            mount:null},
  'companion-cav':            {head:'attic',       body:'bronze-cuirass',   shield:null,            melee:'kontos',        ranged:null,            mount:'horse'},
  'peltasts':                 {head:'beast-hood',  body:'coarse-tunic',     shield:'pelta',         melee:null,            ranged:'javelin',       mount:null},
  'cretan-archers':           {head:'hair-band',   body:'coarse-tunic',     shield:null,            melee:null,            ranged:'composite-bow', mount:null},

  /* 塞琉古 */
  'seleucid-phalanx':         {head:'attic',       body:'linen-cuirass',    shield:'parma',         melee:'sarissa',       ranged:null,            mount:null},
  'seleucid-silver-shields':  {head:'attic',       body:'bronze-cuirass',   shield:'silver-shield', melee:'sarissa',       ranged:null,            mount:null},
  'seleucid-cataphracts':     {head:'mask-helm',   body:'cataphract-plate', shield:null,            melee:'kontos',        ranged:null,            mount:'armoured-horse'},
  'scythed-chariots':         {head:null,          body:null,               shield:null,            melee:'scythe',        ranged:null,            mount:'chariot'},
  'indian-elephants':         {head:null,          body:'elephant-armour',  shield:null,            melee:'natural-weapons',ranged:'composite-bow',mount:'elephant'},
  'syrian-archers':           {head:'hair-band',   body:'coarse-tunic',     shield:null,            melee:null,            ranged:'self-bow',      mount:null},

  /* 托勒密埃及 */
  'machimoi':                 {head:'hair-band',   body:'linen-cuirass',    shield:'oval-shield',   melee:'spear',         ranged:null,            mount:null},
  'royal-guard':              {head:'attic',       body:'bronze-cuirass',   shield:'round-shield',  melee:'xiphos',        ranged:null,            mount:null},
  'nubian-archers':           {head:'feather',     body:'coarse-tunic',     shield:null,            melee:null,            ranged:'self-bow',      mount:null},
  'african-elephants':        {head:null,          body:'elephant-armour',  shield:null,            melee:'natural-weapons',ranged:null,           mount:'elephant'},
  'ptolemaic-cav':            {head:'attic',       body:'bronze-cuirass',   shield:null,            melee:'lance',         ranged:null,            mount:'horse'},
  'galatian-guard':           {head:null,          body:'hide-armour',      shield:'oval-shield',   melee:'celtic-longsword',ranged:null,          mount:null},

  /* 帕提亚 */
  'horse-archers':            {head:'soft-cap',    body:'coarse-tunic',     shield:null,            melee:null,            ranged:'composite-bow', mount:'horse'},
  'parthian-cataphracts':     {head:'mask-helm',   body:'cataphract-plate', shield:null,            melee:'kontos',        ranged:null,            mount:'armoured-horse'},
  'cataphract-archers':       {head:'mask-helm',   body:'cataphract-plate', shield:null,            melee:null,            ranged:'composite-bow', mount:'armoured-horse'},
  'saka-horse-archers':       {head:'soft-cap',    body:'hide-armour',      shield:null,            melee:null,            ranged:'composite-bow', mount:'light-horse'},
  'levied-spears':            {head:null,          body:'coarse-tunic',     shield:'wood-buckler',  melee:'spear',         ranged:null,            mount:null},
  'eastern-slingers':         {head:'hair-band',   body:'coarse-tunic',     shield:null,            melee:null,            ranged:'sling',         mount:null},

  /* 高卢 */
  'gallic-swordsmen':         {head:null,          body:'coarse-tunic',     shield:'oval-shield',   melee:'celtic-longsword',ranged:null,          mount:null},
  'chosen-swordsmen':         {head:'spangenhelm', body:'lorica-hamata',    shield:'oval-shield',   melee:'celtic-longsword',ranged:null,          mount:null},
  'naked-fanatics':           {head:null,          body:'no-armour',        shield:'oval-shield',   melee:'celtic-longsword',ranged:null,          mount:null},
  'gallic-noble-cav':         {head:'spangenhelm', body:'lorica-hamata',    shield:null,            melee:'celtic-longsword',ranged:null,          mount:'horse'},
  'gallic-skirmishers':       {head:null,          body:'coarse-tunic',     shield:'wood-buckler',  melee:null,            ranged:'javelin',       mount:null},
  'war-dogs':                 {head:null,          body:'dog-collar',       shield:null,            melee:'natural-weapons',ranged:null,           mount:'war-dog'},

  /* 日耳曼 */
  'suebi-warband':            {head:'hair-band',   body:'hide-armour',      shield:'wood-buckler',  melee:'celtic-longsword',ranged:null,          mount:null},
  'spear-warband':            {head:null,          body:'hide-armour',      shield:'wood-buckler',  melee:'spear',         ranged:null,            mount:null},
  'germanic-axes':            {head:null,          body:'coarse-tunic',     shield:'wood-buckler',  melee:'battle-axe',    ranged:'francisca',     mount:null},
  'noble-riders':             {head:'spangenhelm', body:'lorica-hamata',    shield:'wood-buckler',  melee:'spear',         ranged:null,            mount:'horse'},
  'germanic-hunters':         {head:null,          body:'hide-armour',      shield:null,            melee:null,            ranged:'self-bow',      mount:null},
  'berserkers':               {head:'beast-hood',  body:'hide-armour',      shield:null,            melee:'battle-axe',    ranged:null,            mount:null}
};
