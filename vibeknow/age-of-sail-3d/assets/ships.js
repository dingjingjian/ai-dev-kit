/* 大航海时代 · 帆船图鉴 —— 数据集
 * 30 艘帆船，按 5 大海域家族组织（北欧/地中海/大西洋/印度洋/东亚），
 * 每条记录字段：
 *   name        船名（中文）
 *   cls         船级：small / medium / large（对应大航海时代4 的小型船/中型船/大型船）
 *   country     建造国
 *   yard        建造地（船坞/港口城市）
 *   lat, lon    建造地经纬度（用于在地球上定位船坞）
 *   family      海域家族：northsea / mediterranean / atlantic / indian / eastasia
 *   year        首航年代（约数），卡面以 AD xxxx 显示
 *   intro       介绍（50-80 字）
 *   traits      关键特征（3 条，卡面胶囊）
 *   tags        类别/帆装标签
 *   stats       六维性能分值 [载重, 火力, 航速, 耐久, 机动, 稀有]，各 0-5 整数
 *               —— 用于「航海日志」的性能图谱；口径为该船型的典型配置，
 *               不以历史个别改装船为准。改分值时六维顺序不可变（app.js 的 STATS_DIMS 对应）。
 *   tons        满载排水量（吨，约数）—— 用于「航海日志」的自然简报（合计排水量 / 最大 / 最小）
 *   color       色卡主色（无图或加载失败时回退到此色）
 *   img         帆船图路径，省略则用 color 色卡（相对 index.html）
 */
var SHIPS=[
  /* ===== 北海系 · 汉萨同盟与英荷的海贸船队 ===== */
  {name:'汉萨柯克船',cls:'small',country:'德国',yard:'吕贝克',lat:53.87,lon:10.69,family:'northsea',year:'1350',color:'#8a6b3a',img:'./assets/ships/cog.webp',
    intro:'汉萨同盟运盐运粮的主力：单桅方帆、平底船壳、船尾直舵。北欧海贸靠它撑了三百年，也是后来全帆装帆船的共同起点。',
    traits:['单桅横帆','平底直舵','汉萨同盟'],tags:['商船','北欧','中世纪'],
    stats:[2, 1, 2, 3, 2, 3],tons:200},
  {name:'汉萨式帆船',cls:'medium',country:'德国',yard:'汉堡',lat:53.55,lon:10.00,family:'northsea',year:'1500',color:'#9a7a42',img:'./assets/ships/hanseatic.webp',
    intro:'汉萨同盟后期的三桅商船，船身加高、舱容扩至柯克船的两倍，可长年在波罗的海与北海之间往返，甲板已预留炮位。',
    traits:['三桅方帆','高干舷','预留炮位'],tags:['商船','汉萨','波罗的海'],
    stats:[3, 2, 2, 3, 2, 2],tons:400},
  {name:'弗鲁特船',cls:'medium',country:'荷兰',yard:'霍伦',lat:52.64,lon:5.06,family:'northsea',year:'1595',color:'#a8874a',img:'./assets/ships/fluyt.webp',
    intro:'荷兰人为跑商专门设计的船型：船身窄、甲板平、缆具集中，所需水手不到同类船的一半，造价也低，被称作最会赚钱的商船。',
    traits:['甲板收窄','省人手','造价低'],tags:['商船','荷兰','跑商'],
    stats:[3, 1, 3, 3, 4, 2],tons:600},
  {name:'皮尼斯船',cls:'small',country:'英格兰',yard:'伦敦',lat:51.51,lon:-0.13,family:'northsea',year:'1600',color:'#b09668',img:'./assets/ships/pinnace.webp',
    intro:'英格兰的小型快船，帆装灵活、吃水浅、善抢风调向。既做沿岸侦察与联络，也随舰队远航充当补给与传令船。',
    traits:['吃水浅','善抢风','可兼划桨'],tags:['侦察','英伦','小型'],
    stats:[1, 1, 4, 2, 4, 2],tons:150},
  {name:'护航舰',cls:'medium',country:'英格兰',yard:'伍利奇',lat:51.49,lon:0.06,family:'northsea',year:'1650',color:'#7a6a4a',img:'./assets/ships/frigate.webp',
    intro:'介于小舰与战列舰之间的中等军舰：一列重炮、船身低长、航速突出，负责护航、巡弋与传令，也常单舰猎捕商船。',
    traits:['单列重炮','低长船身','航速突出'],tags:['军舰','巡弋','护航'],
    stats:[2, 4, 4, 3, 4, 3],tons:900},
  {name:'战列舰',cls:'large',country:'英格兰',yard:'朴次茅斯',lat:50.80,lon:-1.09,family:'northsea',year:'1670',color:'#6b5a3a',img:'./assets/ships/ship-of-the-line.webp',
    intro:'三层炮甲板、百门以上舰炮，专为在战列线中互相轰击而生。造价抵得上一座小镇的岁入，是海权时代最昂贵的机械。',
    traits:['三层炮甲板','百门舰炮','战列线'],tags:['主力舰','海权','堡垒'],
    stats:[3, 5, 3, 5, 2, 2],tons:2000},

  /* ===== 地中海系 · 桨与帆共治的内海 ===== */
  {name:'拉蒂纳三角帆船',cls:'small',country:'意大利',yard:'阿马尔菲',lat:40.63,lon:14.60,family:'mediterranean',year:'1300',color:'#c9a05a',img:'./assets/ships/lateen.webp',
    intro:'挂一张大三角帆的小船，帆可绕桅旋转，逆风也能走锯齿航线。地中海沿岸最古老也最实用的帆装，后随季风传遍印度洋。',
    traits:['三角纵帆','可逆风走','船身小巧'],tags:['纵帆','地中海','古老'],
    stats:[1, 1, 2, 2, 4, 2],tons:80},
  {name:'加莱桨帆船',cls:'small',country:'意大利',yard:'威尼斯',lat:45.44,lon:12.34,family:'mediterranean',year:'1450',color:'#a8683a',img:'./assets/ships/galley.webp',
    intro:'细长低矮，单层桨手配一桅三角帆。无风时靠桨，浅港与窄水道通行自如，代价是舱容极小、不抗风浪。',
    traits:['单层桨手','细长船身','桅帆辅助'],tags:['桨帆','威尼斯','近海'],
    stats:[1, 2, 3, 2, 4, 3],tons:200},
  {name:'威尼斯加莱船',cls:'medium',country:'意大利',yard:'基奥贾',lat:45.22,lon:12.28,family:'mediterranean',year:'1550',color:'#b08050',img:'./assets/ships/venetian-galeass.webp',
    intro:'威尼斯兵工厂的武装商船，以桨为主、桨手有遮甲板，舷侧设炮位。既能护航商队也能独立作战，是国家船坞的量产货。',
    traits:['桨手有甲板','舷侧炮位','量产船型'],tags:['桨帆','武装商船','威尼斯'],
    stats:[2, 4, 3, 3, 3, 4],tons:700},
  {name:'加莱塞战船',cls:'large',country:'意大利',yard:'那不勒斯',lat:40.85,lon:14.27,family:'mediterranean',year:'1570',color:'#8a5a4a',img:'./assets/ships/galleass.webp',
    intro:'桨帆船里最大的怪物：加大船身、舷侧重炮平台与船首巨炮，兼有桨的机动与帆舰的火力，勒班陀海战中的威尼斯杀手。',
    traits:['舷侧重炮','船首巨炮','桨帆并用'],tags:['主力舰','勒班陀','重炮'],
    stats:[2, 5, 2, 4, 2, 5],tons:1200},
  {name:'巨型桨帆船',cls:'medium',country:'意大利',yard:'热那亚',lat:44.41,lon:8.93,family:'mediterranean',year:'1500',color:'#9a7040',img:'./assets/ships/great-galley.webp',
    intro:'商用的巨型桨帆船，舱容比战用加莱大得多，桨与帆并用以保证通行班期。热那亚与威尼斯用它运送贵重货与朝圣客。',
    traits:['舱容大','桨帆并用','班期准'],tags:['商船','桨帆','地中海'],
    stats:[3, 3, 3, 3, 2, 4],tons:1000},
  {name:'双桅三角帆船',cls:'small',country:'突尼斯',yard:'突尼斯',lat:36.80,lon:10.18,family:'mediterranean',year:'1600',color:'#7a5a3a',img:'./assets/ships/xebec.webp',
    intro:'北非海域的快速纵帆船，两根桅都挂大三角帆，船首尖削、吃水极浅，可贴岸疾行，是巴巴里海盗与私掠船的首选。',
    traits:['双桅三角帆','尖削船首','吃水极浅'],tags:['快船','北非','私掠'],
    stats:[1, 2, 5, 2, 5, 3],tons:250},

  /* ===== 大西洋系 · 驶向未知深蓝 ===== */
  {name:'卡拉维尔帆船',cls:'small',country:'葡萄牙',yard:'拉各斯',lat:37.10,lon:-8.67,family:'atlantic',year:'1450',color:'#b08a5a',img:'./assets/ships/caravel.webp',
    intro:'葡萄牙为探非洲海岸而造的船：船身轻、吃水浅、三角帆能逆风返航，既可沿海摸索，也能驶向未知深蓝——大航海的钥匙。',
    traits:['轻船身','三角帆','可逆风返航'],tags:['探险','葡萄牙','大航海'],
    stats:[2, 1, 4, 2, 5, 2],tons:120},
  {name:'卡拉维尔「尼娜」号',cls:'small',country:'西班牙',yard:'莫格尔',lat:37.28,lon:-6.84,family:'atlantic',year:'1492',color:'#c09a66',img:'./assets/ships/nina.webp',
    intro:'哥伦布首航三船之一。出港时挂三角帆，返航前在加那利改装为方帆与三角帆混挂，成为最早横渡大西洋的卡拉维尔。',
    traits:['混挂帆装','横渡大西洋','首航船'],tags:['探险','哥伦布','明星船'],
    stats:[2, 1, 4, 3, 4, 5],tons:100},
  {name:'卡拉克帆船',cls:'medium',country:'葡萄牙',yard:'里斯本',lat:38.71,lon:-9.14,family:'atlantic',year:'1500',color:'#8a6a4a',img:'./assets/ships/carrack.webp',
    intro:'三桅或四桅的高干舷大船，前桅方帆、后桅三角帆，首尾各起船楼。远洋载货与自卫兼得，是葡萄牙海上帝国的运输骨干。',
    traits:['高干舷','首尾船楼','方纵混挂'],tags:['商船','葡萄牙','远洋'],
    stats:[4, 2, 2, 4, 2, 2],tons:800},
  {name:'拿屋船',cls:'medium',country:'葡萄牙',yard:'波尔图',lat:41.15,lon:-8.61,family:'atlantic',year:'1540',color:'#7a5a35',img:'./assets/ships/nao.webp',
    intro:'卡拉克的葡萄牙改良型，船身更圆厚，舱容与耐久兼顾，专跑香料航路。达伽马首航印度所乘的圣加百列号即此型。',
    traits:['圆厚船身','香料航路','耐久扎实'],tags:['商船','葡萄牙','印度航线'],
    stats:[4, 2, 2, 5, 2, 3],tons:900},
  {name:'盖伦帆船',cls:'large',country:'西班牙',yard:'加的斯',lat:36.53,lon:-6.29,family:'atlantic',year:'1560',color:'#6a4a3a',img:'./assets/ships/galleon.webp',
    intro:'西班牙人综合卡拉克与卡拉维尔之长造出的远洋船型：船身修长、船首下压、炮位集中在中低甲板，载货与作战一举两得。',
    traits:['修长船身','低甲板炮位','远洋船型'],tags:['商船','西班牙','大帆船'],
    stats:[4, 4, 3, 4, 3, 2],tons:1500},
  {name:'西班牙大帆船',cls:'large',country:'西班牙',yard:'塞维利亚',lat:37.39,lon:-5.99,family:'atlantic',year:'1588',color:'#5a3a2a',img:'./assets/ships/spanish-galleon.webp',
    intro:'盖伦的重装版本，专为运送白银与金币而造：船身厚实、炮位加倍，须有护航舰队才敢独行——大西洋上的移动宝库。',
    traits:['重装船身','加倍炮位','白银舰队'],tags:['宝船','西班牙','重装'],
    stats:[5, 4, 2, 5, 2, 3],tons:1800},

  /* ===== 印度洋系 · 季风与三角帆的世界 ===== */
  {name:'独桅三角帆船',cls:'small',country:'阿曼',yard:'马斯喀特',lat:23.61,lon:58.59,family:'indian',year:'1200',color:'#b58a5a',img:'./assets/ships/dhow.webp',
    intro:'阿拉伯海最古老的船：单桅大三角帆、船尾平截、船板以椰壳纤维缝合而非铁钉。顺季风往返东非与印度，千年未改其形。',
    traits:['单桅三角帆','缝合船板','季风航行'],tags:['纵帆','阿拉伯','季风'],
    stats:[1, 1, 3, 1, 5, 3],tons:60},
  {name:'阿拉伯船',cls:'medium',country:'也门',yard:'亚丁',lat:12.79,lon:45.03,family:'indian',year:'1400',color:'#a0784a',img:'./assets/ships/arab-ship.webp',
    intro:'红海与阿拉伯海的通用商船，双桅三角帆、低干舷、甲板宽平，装卸极快。亚丁港的货栈正是靠它连起东非与印度。',
    traits:['双桅三角帆','装卸便捷','低干舷'],tags:['商船','红海','阿拉伯'],
    stats:[2, 1, 3, 2, 4, 3],tons:300},
  {name:'阿拉伯轻快船',cls:'medium',country:'印度',yard:'苏拉特',lat:21.17,lon:72.83,family:'indian',year:'1600',color:'#96703f',img:'./assets/ships/baghla.webp',
    intro:'印度洋上的武装快船，三桅混挂、船首尖削，航速在同类中突出。莫卧儿港口的商队用它武装护航，也常被海盗征用。',
    traits:['三桅混挂','尖削船首','武装护航'],tags:['快船','印度','护航'],
    stats:[2, 2, 4, 2, 4, 4],tons:350},
  {name:'桨帆并用船',cls:'medium',country:'土耳其',yard:'伊斯坦布尔',lat:41.01,lon:28.98,family:'indian',year:'1550',color:'#7a4a3a',img:'./assets/ships/galley-frigate.webp',
    intro:'奥斯曼船坞的兼用船型：有桨手舱位、有帆装、也有炮位，风与人力随时互补。地中海、北海与印度洋都能见到它的身影。',
    traits:['桨帆炮三兼','中低干舷','通用船型'],tags:['桨帆','奥斯曼','通用'],
    stats:[2, 2, 3, 3, 3, 2],tons:400},
  {name:'巨型桨帆并用船',cls:'large',country:'埃及',yard:'亚历山大',lat:31.20,lon:29.92,family:'indian',year:'1580',color:'#8a5a3a',img:'./assets/ships/great-galley-frigate.webp',
    intro:'奥斯曼海军的大型桨帆旗舰：双层桨手加两桅风帆，舷侧可架重炮，既能在海战中压阵，也能载货远航红海与尼罗河口。',
    traits:['双层桨手','两桅风帆','舷侧重炮'],tags:['主力舰','奥斯曼','红海'],
    stats:[3, 3, 3, 4, 2, 3],tons:800},

  /* ===== 东亚系 · 硬帆、水密隔舱与铁甲 ===== */
  {name:'中国帆船',cls:'small',country:'中国',yard:'泉州',lat:24.87,lon:118.59,family:'eastasia',year:'1200',color:'#b03a2a',img:'./assets/ships/junk-small.webp',
    intro:'硬帆分片、可缩可张的东方船型：吃风效率高、桅杆可放倒避风，水密隔舱让某舱进水也不沉。宋元时已远航南洋。',
    traits:['硬帆分片','水密隔舱','桅可放倒'],tags:['帆船','中国','远洋'],
    stats:[2, 1, 2, 3, 3, 2],tons:200},
  {name:'大型戎克船',cls:'large',country:'中国',yard:'福州',lat:26.07,lon:119.30,family:'eastasia',year:'1400',color:'#9a3a26',img:'./assets/ships/junk-large.webp',
    intro:'福船里的大号货船，尖底深舱、多桅硬帆，顺风疾行、逆风走侧风路。闽粤海商远赴吕宋与爪哇的座船，也常武装自卫。',
    traits:['尖底深舱','多桅硬帆','侧风航行'],tags:['商船','福船','南洋'],
    stats:[4, 2, 2, 4, 3, 3],tons:700},
  {name:'郑和宝船',cls:'large',country:'中国',yard:'南京',lat:32.06,lon:118.80,family:'eastasia',year:'1405',color:'#c04a2a',img:'./assets/ships/treasure-ship.webp',
    intro:'明永乐年间下西洋船队的主力大船：九桅十二帆、多层甲板、数十间舱室，规模为当时世界之最，七下西洋自刘家港启程。',
    traits:['九桅十二帆','多层甲板','船队旗舰'],tags:['宝船','明朝','舰队'],
    stats:[5, 2, 2, 5, 2, 5],tons:2500},
  {name:'日本桨船（关船）',cls:'small',country:'日本',yard:'大阪',lat:34.69,lon:135.50,family:'eastasia',year:'1500',color:'#8a7a5a',img:'./assets/ships/sekibune.webp',
    intro:'濑户内海的中型军船，细长船身、桨手众多，逆风逆潮也能进退自如，用作水军先锋与传令，甲板上支起木板作临时盾。',
    traits:['桨手众多','细长船身','临时盾板'],tags:['桨船','水军','日本'],
    stats:[1, 2, 3, 2, 4, 3],tons:120},
  {name:'安宅船',cls:'medium',country:'日本',yard:'堺',lat:34.58,lon:135.48,family:'eastasia',year:'1575',color:'#6a7a5a',img:'./assets/ships/atakebune.webp',
    intro:'战国时代的大型水军旗舰：船身厚重如浮动城郭，四周立起厚木板与射击狭间，居高临下以铁炮与弓矢压制敌船。',
    traits:['船身厚重','木板护墙','居高临下'],tags:['水军旗舰','战国','日本'],
    stats:[2, 3, 2, 4, 2, 4],tons:800},
  {name:'铁甲船',cls:'large',country:'日本',yard:'鸟羽',lat:34.48,lon:136.85,family:'eastasia',year:'1578',color:'#4a5a6a',img:'./assets/ships/ironclad.webp',
    intro:'织田水军为破毛利大船队所造：船身外覆铁板、侧舷架大筒，火器居高临下。九鬼嘉隆在第二次木津川口海战中用它取胜。',
    traits:['外覆铁板','侧舷大筒','火器压制'],tags:['铁甲','水军','日本'],
    stats:[2, 4, 2, 5, 2, 5],tons:900},
  {name:'龟甲船',cls:'medium',country:'朝鲜',yard:'统营',lat:34.85,lon:128.43,family:'eastasia',year:'1592',color:'#3a5a7a',img:'./assets/ships/turtle-ship.webp',
    intro:'朝鲜水军将领李舜臣的战船：船顶覆铁板与尖刺，龟首吐烟，舷侧开炮孔。四面受敌亦无法登船，壬辰倭乱中的海战利器。',
    traits:['龟背顶盖','铁板尖刺','舷侧炮孔'],tags:['战船','朝鲜','李舜臣'],
    stats:[1, 3, 3, 4, 3, 5],tons:300}
];
