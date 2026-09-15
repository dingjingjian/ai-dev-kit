/* 侏罗纪公园 · 数据集
 * 每条记录字段：
 *   name        恐龙/展品名
 *   country     化石发现国
 *   city        化石发现地
 *   lat, lon    经纬度（用于在地球上定位化石发现地）
 *   era         地质年代：paleozoic/triassic/jurassic/cretaceous/cenozoic
 *   intro       介绍（50-80 字）
 *   traits      关键特征（替代原项目的 ingredients）
 *   tags        展品标签
 *   stats       六维特征分值 [体型,威胁,速度,智力,防御,稀有]，各 0-5 整数
 *               —— 用于「游览总结」的特征图谱；口径为该物种的代表性个体，
 *               不以个体差异为准。改分值时六维顺序不可变（app.js 的 STATS_DIMS 对应）。
 *   length      体长（米）—— 用于「游览总结」的体型合计。
 *               口径为该物种成年个体的代表性体长，非精确值；
 *               换算常量（展厅均长基准）在 app.js。
 *   color       色卡主色（无图或加载失败时回退到此色）
 *   img         恐龙图路径，省略则用 color 色卡（相对 index.html）
 */
var DINOS=[
  /* ===== 古生代 · 祖先馆（恐龙之前的合弓类与初龙类）===== */
  {name:'异齿龙',country:'美国',city:'得克萨斯',lat:31.5,lon:-99.0,era:'paleozoic',color:'#8a5a2b',img:'./assets/dinos/dimetrodon.webp',
    intro:'二叠纪的顶级掠食者，背上帆状脊椎骨可调节体温。虽名"龙"，实为合弓类——哺乳动物的远祖，比恐龙早数千万年。',
    traits:['帆状背脊','犬齿','合弓类'],tags:['肉食','帆背','祖先'],
    stats:[2, 3, 2, 1, 2, 3],length:4.5},
  {name:'水龙兽',country:'南非',city:'卡鲁盆地',lat:-32.0,lon:24.0,era:'paleozoic',color:'#6b4423',img:'./assets/dinos/lystrosaurus.webp',
    intro:'二叠纪末大灭绝的幸存者，桶状身体、两根长牙、喙状嘴。掘洞避寒，食草为生，灾后遍布全球，是生态复苏的标志。',
    traits:['桶状身','长牙','掘洞'],tags:['植食','幸存者','祖先'],
    stats:[1, 1, 1, 1, 2, 2],length:1.5},

  /* ===== 三叠纪 ===== */
  {name:'始盗龙',country:'阿根廷',city:'圣胡安',lat:-31.5,lon:-68.5,era:'triassic',color:'#c97a3e',img:'./assets/dinos/eoraptor.webp',
    intro:'已知最早恐龙之一，体小如犬，前肢既能抓握又能奔跑。肉植兼食，是后来所有恐龙的共同雏形。',
    traits:['早期恐龙','杂食','三趾足'],tags:['杂食','早期','小型'],
    stats:[1, 2, 3, 2, 1, 4],length:1.0},
  {name:'埃雷拉龙',country:'阿根廷',city:'圣胡安',lat:-31.5,lon:-68.5,era:'triassic',color:'#a0522d',img:'./assets/dinos/herrerasaurus.webp',
    intro:'三叠纪晚期顶级肉食者，长颈利齿、双足奔行。下颌铰链灵活，能吞大块肉，是兽脚类恐龙的早期蓝图。',
    traits:['长颈','利齿','双足'],tags:['肉食','顶级','早期'],
    stats:[3, 4, 3, 2, 1, 4],length:6.0},
  {name:'腔骨龙',country:'美国',city:'新墨西哥',lat:35.0,lon:-106.0,era:'triassic',color:'#d2622a',img:'./assets/dinos/coelophysis.webp',
    intro:'骨中空如鸟，体轻善奔。群居化石成百共埋一坑，或示集体行动。胃中曾见幼体，疑有同类相食。',
    traits:['中空骨','群居','细长'],tags:['肉食','群居','善奔'],
    stats:[2, 3, 4, 2, 1, 3],length:3.0},
  {name:'板龙',country:'德国',city:'图宾根',lat:48.5,lon:9.0,era:'triassic',color:'#9a6b3a',img:'./assets/dinos/plateosaurus.webp',
    intro:'三叠纪晚期大型植食者，前肢有爪可抓叶，后肢粗壮能双足站立。蜥脚类的祖先形态，巨龙时代由此起。',
    traits:['双足站立','抓叶爪','长颈'],tags:['植食','大型','祖先'],
    stats:[4, 1, 1, 1, 2, 2],length:9.0},
  {name:'里奥哈龙',country:'阿根廷',city:'拉里奥哈',lat:-29.4,lon:-66.8,era:'triassic',color:'#8b5a2b',img:'./assets/dinos/riojasaurus.webp',
    intro:'三叠纪晚期重型植食者，四肢粗壮、脊柱坚实。体态已近蜥脚类，是板龙的近亲，南半球常见。',
    traits:['四足','重型','坚实'],tags:['植食','重型','南半球'],
    stats:[4, 1, 1, 1, 3, 3],length:10.0},

  /* ===== 侏罗纪 ===== */
  {name:'异特龙',country:'美国',city:'科罗拉多',lat:39.0,lon:-105.5,era:'jurassic',color:'#7a3b1f',img:'./assets/dinos/allosaurus.webp',
    intro:'侏罗纪晚期北美顶级肉食者，"异特"指其椎骨中空异形。长颌短臂，以幼年蜥脚类为食，化石数量极丰。',
    traits:['中空椎骨','长颌','短臂'],tags:['肉食','顶级','北美'],
    stats:[4, 5, 3, 3, 2, 2],length:9.0},
  {name:'剑龙',country:'美国',city:'怀俄明',lat:43.0,lon:-107.5,era:'jurassic',color:'#5d6b3a',img:'./assets/dinos/stegosaurus.webp',
    intro:'背两排骨板、尾四根尖刺。脑仅核桃大，却是植食巨兽。尾刺可贯穿掠食者，"最笨恐龙"实为误传。',
    traits:['骨板','尾刺','小脑'],tags:['植食','骨板','防御'],
    stats:[4, 2, 1, 1, 4, 2],length:9.0},
  {name:'梁龙',country:'美国',city:'怀俄明',lat:43.0,lon:-107.5,era:'jurassic',color:'#6b7a4a',img:'./assets/dinos/diplodocus.webp',
    intro:'体长二十七米而体重仅十余吨，骨骼极轻。尾细长如鞭，颈如吊桥。吞石助消化，化石完整度极高。',
    traits:['鞭尾','轻骨','长颈'],tags:['植食','巨长','轻骨'],
    stats:[5, 1, 1, 1, 2, 2],length:27.0},
  {name:'腕龙',country:'美国',city:'科罗拉多',lat:39.0,lon:-105.5,era:'jurassic',color:'#4a6b3a',img:'./assets/dinos/brachiosaurus.webp',
    intro:'前肢长于后肢，故颈高举如鹤。体高可达十三米，心脏须极强方能供血至脑。坦桑尼亚亦有同类化石。',
    traits:['高颈','前肢长','巨型'],tags:['植食','高耸','巨型'],
    stats:[5, 1, 1, 1, 2, 2],length:23.0},
  {name:'角鼻龙',country:'美国',city:'科罗拉多',lat:39.0,lon:-105.5,era:'jurassic',color:'#6b3410',img:'./assets/dinos/ceratosaurus.webp',
    intro:'鼻上单角、眼上双角，口满利齿。与异特龙同域争食，或择沼泽为猎场以避竞争，习性近现代鳄。',
    traits:['鼻角','利齿','沼泽'],tags:['肉食','角龙','竞争'],
    stats:[3, 4, 3, 2, 2, 3],length:6.0},
  {name:'美颌龙',country:'德国',city:'索伦霍芬',lat:48.8,lon:11.0,era:'jurassic',color:'#cfa93c',img:'./assets/dinos/compsognathus.webp',
    intro:'体仅鸡大，是已知最小恐龙之一。骨骼轻巧、长腿善奔，捕蜥蜴为食。索伦霍芬石灰岩中与始祖鸟同层。',
    traits:['极小','长腿','善奔'],tags:['肉食','小型','善奔'],
    stats:[1, 2, 4, 2, 1, 3],length:1.0},
  {name:'华阳龙',country:'中国',city:'四川自贡',lat:29.4,lon:104.8,era:'jurassic',color:'#8a6b2a',img:'./assets/dinos/huayangosaurus.webp',
    intro:'剑龙类早期代表，背板小而尖、尾刺粗。自贡大山铺化石群出土，是亚洲最完整的早期剑龙类。',
    traits:['早期剑龙','尖板','尾刺'],tags:['植食','剑龙','中国'],
    stats:[3, 2, 1, 1, 4, 4],length:4.5},
  {name:'沱江龙',country:'中国',city:'四川自贡',lat:29.4,lon:104.8,era:'jurassic',color:'#7a5a2a',img:'./assets/dinos/tuojiangosaurus.webp',
    intro:'大型剑龙类，背板十五对、尾刺两对。自贡出土，与华阳龙同域，是东方剑龙类的代表。',
    traits:['大剑龙','多板','尾刺'],tags:['植食','剑龙','中国'],
    stats:[4, 2, 1, 1, 4, 3],length:7.0},

  /* ===== 白垩纪 ===== */
  {name:'霸王龙',country:'美国',city:'蒙大拿',lat:46.5,lon:-111.0,era:'cretaceous',color:'#3d1f12',img:'./assets/dinos/tyrannosaurus.webp',
    intro:'白垩纪末顶级掠食者，咬合力达六吨。双眼前置立体视觉，脑大智高。"苏"与"斯坦"是化石界的明星。',
    traits:['巨颌','双目立体','短臂'],tags:['肉食','顶级','明星'],
    stats:[5, 5, 3, 4, 2, 1],length:13.0},
  {name:'三角龙',country:'美国',city:'怀俄明',lat:43.0,lon:-107.5,era:'cretaceous',color:'#8b5a2b',img:'./assets/dinos/triceratops.webp',
    intro:'三角脸、颈盾大、喙如鹦鹉。群居植食，以角抵御霸王龙。白垩纪末最常见的大型恐龙之一。',
    traits:['三角','颈盾','鹦鹉喙'],tags:['植食','角龙','防御'],
    stats:[4, 3, 2, 2, 5, 1],length:9.0},
  {name:'迅猛龙',country:'蒙古',city:'戈壁沙漠',lat:43.5,lon:104.0,era:'cretaceous',color:'#c97a3e',img:'./assets/dinos/velociraptor.webp',
    intro:'火鸡大小，羽毛满身，足二趾有镰刀爪。群猎大型猎物，智力在恐龙中名列前茅。电影放大其体型，实则更小。',
    traits:['羽毛','镰刀爪','群猎'],tags:['肉食','群猎','羽毛'],
    stats:[2, 4, 5, 4, 1, 2],length:2.0},
  {name:'甲龙',country:'美国',city:'蒙大拿',lat:46.5,lon:-111.0,era:'cretaceous',color:'#4a3c2a',img:'./assets/dinos/ankylosaurus.webp',
    intro:'全身覆甲，尾端骨槌可碎骨。低伏贴地，如活堡垒。白垩纪末植食者的重装代表，化石完整度极高。',
    traits:['覆甲','尾槌','低伏'],tags:['植食','重甲','堡垒'],
    stats:[3, 2, 1, 1, 5, 2],length:8.0},
  {name:'厚头龙',country:'美国',city:'蒙大拿',lat:46.5,lon:-111.0,era:'cretaceous',color:'#6b3410',img:'./assets/dinos/pachycephalosaurus.webp',
    intro:'颅顶厚达二十五厘米，如头盔。或以头槌争偶，或侧顶相抵。化石多仅存颅顶，全身骨架罕见。',
    traits:['厚颅顶','头槌','双足'],tags:['植食','头槌','罕见'],
    stats:[3, 3, 2, 2, 3, 2],length:4.5},
  {name:'棘龙',country:'埃及',city:'巴哈里亚',lat:28.5,lon:29.0,era:'cretaceous',color:'#2a4a5a',img:'./assets/dinos/spinosaurus.webp',
    intro:'背帆高耸、吻如鳄、肢短善泳。以鱼为食，是已知最长肉食恐龙。化石在二战中被炸毁，后据新标本复原。',
    traits:['背帆','鳄吻','善泳'],tags:['肉食','半水生','背帆'],
    stats:[5, 5, 2, 3, 2, 3],length:15.0},
  {name:'禽龙',country:'英国',city:'怀特岛',lat:50.7,lon:-1.3,era:'cretaceous',color:'#5a6b3a',img:'./assets/dinos/iguanodon.webp',
    intro:'最早被命名的恐龙之一。拇指成刺可防身，齿排如梳能磨叶。群居化石成百共埋一坑，白垩纪早期遍布欧亚。',
    traits:['拇指刺','梳齿','群居'],tags:['植食','群居','早期'],
    stats:[4, 2, 2, 2, 3, 2],length:10.0},
  {name:'镰刀龙',country:'蒙古',city:'戈壁沙漠',lat:43.5,lon:104.0,era:'cretaceous',color:'#8a5a3a',img:'./assets/dinos/therizinosaurus.webp',
    intro:'巨爪长近一米，羽身、腹宽、植食。形态怪异，分类长期成谜。镰刀状爪或用于扯枝、争斗或威慑。',
    traits:['巨爪','羽毛','植食'],tags:['植食','巨爪','怪异'],
    stats:[4, 3, 2, 2, 3, 4],length:5.0},
  {name:'副栉龙',country:'加拿大',city:'阿尔伯塔',lat:53.5,lon:-113.5,era:'cretaceous',color:'#3a6b7a',img:'./assets/dinos/parasaurolophus.webp',
    intro:'头后长管弯曲如冠，或能发声传讯、或调体温。鸭嘴龙类，群居植食，白垩纪晚期北美常见。',
    traits:['头冠长管','鸭嘴','群居'],tags:['植食','头冠','群居'],
    stats:[4, 1, 2, 2, 2, 2],length:10.0},
  {name:'犹他盗龙',country:'美国',city:'犹他',lat:39.5,lon:-111.5,era:'cretaceous',color:'#a0522d',img:'./assets/dinos/utahraptor.webp',
    intro:'迅猛龙的大型亲戚，体长七米、重一吨。足镰刀爪可开膛破肚，白垩纪早期北美顶级群猎者。',
    traits:['大型镰爪','群猎','重爪'],tags:['肉食','群猎','大型'],
    stats:[3, 5, 4, 3, 1, 3],length:7.0},
  {name:'南方巨兽龙',country:'阿根廷',city:'内乌肯',lat:-38.5,lon:-68.5,era:'cretaceous',color:'#5d3b1f',img:'./assets/dinos/giganotosaurus.webp',
    intro:'体长逾十三米，比霸王龙更长，或更重。白垩纪中期南半球顶级肉食者，以巨型蜥脚类为猎。',
    traits:['巨型','长颌','南半球'],tags:['肉食','顶级','巨型'],
    stats:[5, 5, 3, 3, 2, 3],length:13.0},
  {name:'牛龙',country:'阿根廷',city:'巴塔哥尼亚',lat:-41.0,lon:-69.0,era:'cretaceous',color:'#c0392b',img:'./assets/dinos/carnotaurus.webp',
    intro:'双角如牛、吻短、皮甲成列。前肢极短更甚霸王龙。善奔，或以高速冲撞猎物，南半球白垩纪晚期肉食者。',
    traits:['双角','短臂','皮甲'],tags:['肉食','角龙','善奔'],
    stats:[3, 4, 4, 2, 2, 3],length:8.0},
  {name:'小盗龙',country:'中国',city:'辽宁朝阳',lat:41.5,lon:120.5,era:'cretaceous',color:'#2a5a4a',img:'./assets/dinos/microraptor.webp',
    intro:'四翼恐龙，前后肢皆长羽可滑翔。体仅鸽大，树栖食虫。辽宁热河生物群出土，是恐龙-鸟类过渡的关键证据。',
    traits:['四翼','羽毛','树栖'],tags:['肉食','四翼','过渡'],
    stats:[1, 2, 4, 3, 1, 4],length:0.8},

  /* ===== 新生代 · 后代馆（恐龙灭绝后的鸟类后代）===== */
  {name:'渡渡鸟',country:'毛里求斯',city:'马斯卡雷',lat:-20.3,lon:57.5,era:'cenozoic',color:'#a08a6b',img:'./assets/dinos/dodo.webp',
    intro:'不会飞的大型鸽类，恐龙的现代后代。孤岛演化失却飞翔与恐惧，十七世纪被人类捕绝，是灭绝的符号。',
    traits:['不会飞','大型鸽','孤岛'],tags:['杂食','已灭绝','后代'],
    stats:[1, 1, 1, 2, 1, 2],length:1.0},
  {name:'象鸟',country:'马达加斯加',city:'南部雨林',lat:-22.0,lon:47.0,era:'cenozoic',color:'#7a5a3a',img:'./assets/dinos/elephant-bird.webp',
    intro:'高三米、重半吨的巨型不会飞鸟类，恐龙直系后代。卵为已知最大鸟卵，十七世纪前已灭绝，或与人类活动有关。',
    traits:['巨型','不会飞','巨卵'],tags:['植食','已灭绝','后代'],
    stats:[3, 1, 1, 2, 2, 3],length:3.0}
];
