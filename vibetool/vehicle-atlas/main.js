/* 人类交通工具图鉴 · 数据与渲染（经典脚本，ES2017 基线，无模块 / 无内联事件）
 *
 * 收录口径：只讲「交通工具的类型」，不写具体型号 / 品牌，时间跨度覆盖整个人类历史。
 *
 * 数据是唯一真源：
 *   CATS      —— 分类（地面 / 水面 / 天空 / 太空；tabZh 为顶栏 2 字短名）
 *   VEHICLES  —— 条目（id / cat / name / en / era / tag / intro / specs / feats / subject）
 *   IMG_STYLE —— 配图提示词的统一风格前缀
 *
 * 配图：条目图 ./assets/img/<id>.<ext>，分类封面 ./assets/img/cover-<catKey>.<ext>；
 *       文件缺失时页面自动显示占位块（写明期望文件名），补图不需要改代码。
 *       提示词清单由 _dev/gen_image_prompts.py 从本文件派生到 _dev/IMAGE_PROMPTS.md。
 */
(function(){
"use strict";

/* 配图统一风格：所有条目图 / 分类封面图都用同一套渲染规格，保证整册视觉一致。
   写法要点（重写原因）：长串形容词互相稀释，模型容易忽略构图要求，因此——
   1) 主体定性放最前，视角只用「四分之三或正侧」两种；
   2) 构图用量化短句「the vehicle is small in the frame, occupying only the middle half of the frame height」，
      反复强调 wide empty background，压住模型「越大越好看」的默认倾向（主体过高会被卡片裁掉）；
   3) 负面项（文字 / 品牌 / 人物 / 场景）集中放最后；本串只描述环境，画面内容全靠 subject，
      因此 subject 里严禁再出现水面 / 冰面 / 站台 / 火焰等场景词，避免与影棚背景打架。
   图片生成 agent 请把本串 + 条目的 subject 拼接后使用。 */
var IMG_STYLE = "Clean transport encyclopedia studio photograph of a single vehicle, clear three-quarter or side view, photorealistic, highly detailed, soft even studio lighting, seamless plain light-gray studio background, a subtle soft shadow on the floor, the vehicle is small in the frame and fully inside it, horizontally centered, occupying only the middle half of the frame height, wide empty background above and below, no text, no letters, no numbers, no logos, no brand marks, no watermarks, no people, no scenery, landscape 16:9";

/* 分类：四大类按「地面 → 水面 → 天空 → 太空」排列，tabZh 为顶栏 2 字短名。 */
var CATS = [
  {key:"ground", tabKey:"ground", tabZh:"地面", zh:"地面交通", en:"Ground Transport",
   note:"从畜力车、自行车到蒸汽机车与高速列车，陆上交通走了五千年",
   accent:"#2563eb", soft:"#eaf1ff", icon:"car"},
  {key:"water", tabKey:"water", tabZh:"水面", zh:"水面交通", en:"Water Transport",
   note:"从独木舟、帆船到集装箱船与潜艇，人类在水上走了一万多年",
   accent:"#0891b2", soft:"#e6f6fb", icon:"ship"},
  {key:"sky", tabKey:"sky", tabZh:"天空", zh:"天空交通", en:"Air Transport",
   note:"从热气球、飞艇到喷气客机与无人机，离开地面只有两百多年",
   accent:"#7c3aed", soft:"#f1ecff", icon:"plane"},
  {key:"space", tabKey:"space", tabZh:"太空", zh:"太空交通", en:"Space Transport",
   note:"从运载火箭、载人飞船到空间站与漫游车，进入太空不到七十年",
   accent:"#db2777", soft:"#fde8f2", icon:"rocket"}
];

/* 条目：49 个交通工具「类型」（地面 14 / 水面 13 / 天空 12 / 太空 10），同一分类内按出现时间从早到晚排列，
   整体串成一部简明的交通工具史。era 为时间跨度，tag / intro / specs / feats 均描述「类型」本身。
   subject 为生图用主体描述（英文，不含风格），中国原型优先；型号名仅供生图、不在页面展示。
   subject 只写主体本身，不写场景（水 / 冰 / 站台 / 火焰等交给风格串的影棚背景），
   高个子主体（火箭 / 气球 / 飞艇）在句尾追加「the whole ... occupying only the middle half of the frame height」压构图。 */
var VEHICLES = [
  /* ===================== 地面 ===================== */
  {id:"ground-01", cat:"ground", name:"畜力车", en:"Animal-drawn Vehicle",
   era:"公元前 3000 年 — 至今",
   tag:"轮子加上畜力，统治陆上运输近五千年",
   intro:"轮子的出现让重物第一次能滚动前进，把轮车套上牛、马、骆驼等牲畜，就有了畜力车。从两河流域的牛车、古罗马驿车、欧洲四轮马车，到中国的独轮车与大车，它承担了工业革命之前几乎全部的陆路客货运输。",
   specs:[["出现时间","公元前 3000 年以前"],["动力","牛、马、骆驼等畜力"],["典型速度","约 5–15 km/h"],["典型用途","载货 / 载客 / 农耕"]],
   feats:["轮辐、车轴与转向架等结构沿用了数千年","驿道与驿站体系支撑了古代帝国的通信与贸易","至今仍在乡村运输与旅游场景中沿用"],
   subject:"a traditional Chinese two-wheel horse-drawn wooden cart with large spoked wheels and a flat cargo bed, plain weathered wood, harnessed to a single calm brown horse standing still, full side view"},
  {id:"ground-02", cat:"ground", name:"自行车", en:"Bicycle",
   era:"1817 年 — 至今",
   tag:"效率最高的人力交通工具",
   intro:"1817 年德莱斯造出带车把的两轮「奔跑机」，此后链条、充气轮胎与菱形车架相继出现，自行车成为不烧一滴燃料、却比步行省力数倍的个人交通工具，至今仍是全球保有量最大的车辆之一。",
   specs:[["出现时间","1817 年（现代形态 1885 年）"],["动力","人力踩踏"],["典型速度","约 15–25 km/h"],["典型用途","通勤 / 运动 / 载货"]],
   feats:["能量效率高于任何机动车，同样体力可走的距离是步行的三倍以上","中国、荷兰、丹麦等地形成了大规模的骑行城市","共享单车让「最后一公里」出行重新普及"],
   subject:"a classic Chinese 28-inch black roadster bicycle with full fenders, a rear rack, a chain guard and a chrome bell, standing on its kickstand, three-quarter view"},
  {id:"ground-03", cat:"ground", name:"摩托车", en:"Motorcycle",
   era:"1885 年 — 至今",
   tag:"内燃机与两轮结合，最灵活的个人机动车",
   intro:"1885 年戴姆勒把内燃机装上木制两轮车，摩托车由此诞生。它体积小、加速快、通过性强，在城市通勤、山区运输、越野竞技与赛事文化中都占有一席之地。",
   specs:[["出现时间","1885 年"],["动力","单缸至四缸内燃机，近年增添电动机"],["排量","约 50–1800 cc"],["典型用途","通勤 / 巡航 / 越野 / 赛事"]],
   feats:["单位重量功率高，加速性能常超过同价位汽车","是许多发展中国家家庭实现机动化的首选","衍生出踏板车、巡航车、越野车等细分类型"],
   subject:"a classic Chinese 125cc commuter motorcycle with a black body, chrome fenders and a single round headlight, held upright on its center stand, three-quarter front view"},
  {id:"ground-04", cat:"ground", name:"家用汽车", en:"Automobile",
   era:"1886 年 — 至今",
   tag:"二十世纪最具影响力的消费品",
   intro:"1886 年本茨造出第一辆内燃机三轮汽车，福特用流水线把它变成普通人买得起的商品。此后汽车重塑了城市形态、公路网络与日常生活，今天全球汽车保有量已超过十亿辆。",
   specs:[["出现时间","1886 年"],["动力","汽油 / 柴油内燃机、混合动力、纯电"],["典型速度","约 60–120 km/h"],["典型用途","家庭出行 / 通勤 / 出租"]],
   feats:["流水线生产让汽车从奢侈品变为大众消费品","带动高速公路、加油站与汽车社会的一整套基础设施","正在向电动化与智能化转型"],
   subject:"a modern Chinese compact four-door family sedan with a clean white body and sleek headlights, three-quarter front view"},
  {id:"ground-05", cat:"ground", name:"公共汽车", en:"Bus",
   era:"20 世纪初 — 至今",
   tag:"城市公共交通的主力",
   intro:"公共汽车把「多人共乘一辆车」变成城市日常：固定线路、固定班次、集中载客，用最少的道路资源运送最多的通勤者，是全球使用最广的公共交通方式。",
   specs:[["出现时间","20 世纪初"],["动力","柴油 / 天然气 / 纯电"],["载客量","约 30–200 人"],["典型用途","城市公交 / 快速公交 BRT / 长途客运"]],
   feats:["相同道路面积下的运力远高于小汽车","双层与铰接车型进一步放大单次载客量","正在大规模替换为电动与低地板车型"],
   subject:"a modern Chinese electric city bus with large windows, two doors and a blue-and-white livery, three-quarter front view"},
  {id:"ground-06", cat:"ground", name:"卡车", en:"Truck",
   era:"20 世纪初 — 至今",
   tag:"公路货运的绝对主力",
   intro:"卡车承担了绝大多数陆上货物运输。从轻型的配送厢车到几十吨的干线牵引车，它把工厂、港口与商店连在一起，是现代社会物流网络的毛细血管。",
   specs:[["出现时间","20 世纪初"],["动力","柴油内燃机为主，逐渐引入电动"],["载重","约 1–40 吨以上"],["典型用途","干线运输 / 城市配送 / 工程与冷链"]],
   feats:["干线牵引车可拖挂车厢，一车两段灵活组合","冷链、危化、工程等场景衍生出大量专用车型","是全球货运量与物流成本的关键变量"],
   subject:"a modern Chinese heavy long-haul semi truck with a tall white sleeper cab pulling a plain gray box trailer, three-quarter front view"},
  {id:"ground-07", cat:"ground", name:"拖拉机", en:"Tractor",
   era:"20 世纪初 — 至今",
   tag:"把农业从畜力时代带入机械时代",
   intro:"拖拉机用低速大扭矩的发动机和巨大的后轮提供牵引力，可以拉犁、带动收割机、驱动水泵。它的普及让一个人能耕种的土地面积成倍增加，直接改变了全球农业的面貌。",
   specs:[["出现时间","20 世纪初"],["动力","柴油内燃机"],["典型速度","约 20–40 km/h"],["典型用途","耕地 / 播种 / 牵引机具 / 运输"]],
   feats:["低转速高扭矩设计专为持续牵引而生","三点悬挂与动力输出轴让拖拉机可挂载上百种农具","在欧美与新兴农业国替代了大量畜力"],
   subject:"a Chinese Dongfanghong style 4WD agricultural tractor with small front wheels, large rear wheels and an open driver platform, red body, three-quarter front view"},
  {id:"ground-08", cat:"ground", name:"蒸汽机车", en:"Steam Locomotive",
   era:"1804 年 — 20 世纪中",
   tag:"第一次工业革命的陆上动力",
   intro:"蒸汽机车把锅炉、汽缸与车轮装在同一台车上，成为人类第一台能自行前进的强力机械。它开辟了铁路时代，让陆上运输的速度与运量第一次出现数量级的跃升。",
   specs:[["出现时间","1804 年（实用化 1825 年）"],["动力","燃煤锅炉产生蒸汽"],["典型速度","约 60–130 km/h"],["典型用途","铁路客货运输"]],
   feats:["铁路与蒸汽机车一起重塑了十九世纪的贸易与人口流动","大功率机车常采用铰接车架以适应弯道","现多退出运营，仅存于遗产铁路与旅游线路"],
   subject:"a Chinese Jiefang JF class steam locomotive with a 2-8-2 wheel arrangement, black boiler, tall smokestack, steam dome and a black coal tender, standing on a short straight section of track, full side view"},
  {id:"ground-09", cat:"ground", name:"电力机车", en:"Electric Locomotive",
   era:"20 世纪初 — 至今",
   tag:"从接触网取电的干线牵引主力",
   intro:"电力机车通过车顶的受电弓从接触网获取电能，驱动牵引电机前进。它不烧燃料、功率大、效率高，尤其适合长隧道、高原与重载干线；中国已建成世界最长的电气化铁路网，干线客货运输基本由电力机车与动车组承担。",
   specs:[["出现时间","20 世纪初（1879 年出现实验性电力铁路）"],["动力","接触网供电，牵引电机驱动"],["单机功率","约 2000–10000 kW"],["典型用途","干线客货牵引 / 重载运输"]],
   feats:["功率大、效率高，长距离运行的能耗成本低于内燃机车","再生制动可把动能变成电能回馈电网","不排放废气，特别适合长隧道与高原线路"],
   subject:"a Chinese HXD3 style electric locomotive with a boxy body, blue and white livery, exactly one diamond-shaped pantograph raised on the roof and no second pantograph, full side view"},
  {id:"ground-10", cat:"ground", name:"内燃机车", en:"Diesel Locomotive",
   era:"20 世纪 20 年代 — 至今",
   tag:"自带电站、不依赖电网的铁路牵引",
   intro:"内燃机车把柴油发电机组装进车身，经电力或液力传动装置驱动车轮，不需要接触网就能运行。它在电气化普及之前长期是世界铁路的主力，今天仍在无电线路、支线与调车场中不可替代。",
   specs:[["出现时间","20 世纪 20 年代（实用化 1930 年代）"],["动力","柴油机，经电力或液力传动驱动车轮"],["单机功率","约 1000–5000 kW"],["典型用途","无电线路牵引 / 支线与调车 / 救援"]],
   feats:["不依赖供电设施，哪里有钢轨就能去哪里","柴电传动让柴油机始终运行在高效转速区间","中国东风 4 系列产量数千台，曾长期担当货运主力"],
   subject:"a Chinese DF4B style diesel-electric locomotive with an angular dark-green body with a cream stripe, roof vents and handrails, no pantograph on the roof, full side view"},
  {id:"ground-11", cat:"ground", name:"高速列车", en:"High-speed Train",
   era:"1964 年 — 至今",
   tag:"轮轨速度的商业化巅峰",
   intro:"1964 年日本东海道新干线开通，第一次把铁路运营速度提到 200 km/h 以上。此后法国 TGV、德国 ICE、中国复兴号相继登场，高速列车以电力驱动、专用线路与流线型车体，成为中长距离出行的主力之一。",
   specs:[["出现时间","1964 年"],["动力","电力，分散式或多单元动力"],["最高运营速度","250–350 km/h"],["典型用途","城际与跨区域客运"]],
   feats:["轮轨试验速度纪录达 574.8 km/h","普遍采用铝合金车体、气密车厢与空气动力学车头","使数百公里范围内的城际出行快于航空"],
   subject:"a China Railway Fuxing CR400AF style high-speed train head car with a long streamlined nose, silver-white body with a red stripe, on a short straight section of track, three-quarter front view"},
  {id:"ground-12", cat:"ground", name:"城市轨道交通", en:"Urban Rail Transit",
   era:"1863 年 — 至今",
   tag:"大运量、准点的城市动脉",
   intro:"从 1863 年伦敦的蒸汽地铁，到今天的无人驾驶地铁与单轨，城市轨道交通用独立路权与高密度班次承担超大城市的日常通勤，是唯一能稳定应对早晚高峰的大运量方式。",
   specs:[["出现时间","1863 年"],["动力","电力（第三轨或接触网）"],["单向运力","约 1–8 万人次/小时"],["典型用途","城市与都市圈通勤"]],
   feats:["独立路权，不受地面拥堵影响，准点率高","无人驾驶（GoA4）线路已在多国投入运营","单轨、磁浮等制式可适应山地与特殊地形"],
   subject:"a modern Chinese metro train with a sleek white body, a red stripe, large windows and sliding doors, on a short straight section of track, three-quarter front view"},
  {id:"ground-13", cat:"ground", name:"缆索铁路与索道", en:"Funicular & Cable Car",
   era:"19 世纪 — 至今",
   tag:"用钢缆爬坡的轨道交通",
   intro:"在坡度太陡、普通列车无法依靠黏着爬升的地方，缆索铁路用绞盘与钢缆把车厢拉上山；索道则把车厢或吊舱悬挂在钢缆上跨过山谷。它们至今仍是山城与景区最实用的公共交通之一。",
   specs:[["出现时间","19 世纪"],["动力","地面绞盘或循环钢缆牵引"],["典型坡度","可达 30 度以上"],["典型用途","山地城市通勤 / 景区观光"]],
   feats:["爬坡能力远超普通轮轨列车与汽车","香港山顶缆车自 1888 年运营至今","常采用阶梯式车厢，保证乘客在陡坡上站立平稳"],
   subject:"a thick steel cable running horizontally across the middle of the frame with a single enclosed aerial gondola cabin hanging from it on a short hanger arm, the cabin with rounded corners, large wraparound windows and a red-and-white body, cable and cabin together occupying only the middle half of the frame height, no support towers, no mountains"},
  {id:"ground-14", cat:"ground", name:"雪地摩托", en:"Snowmobile",
   era:"1959 年 — 至今",
   tag:"让机械第一次大规模在雪原上行走",
   intro:"雪地摩托用前部的滑板转向、后部的履带驱动，把动力铺在松软的雪面上。它让极地、林区与雪原第一次有了高速的个人机动工具，如今在救援、科考、狩猎与旅游中广泛使用。",
   specs:[["出现时间","1959 年"],["动力","汽油发动机，履带驱动 + 前滑板转向"],["典型速度","约 60–130 km/h"],["典型用途","雪地通勤 / 救援 / 科考 / 旅游"]],
   feats:["履带把重量分散，可在深雪上行驶","在极地科考与山区救援中承担运输任务","衍生出越野竞技与雪地旅游产业"],
   subject:"a modern snowmobile with front skis and a rear rubber track, black and yellow body, three-quarter front view"},

  /* ===================== 水面 ===================== */
  {id:"water-01", cat:"water", name:"独木舟与皮划艇", en:"Canoe & Kayak",
   era:"史前 — 至今",
   tag:"人类最古老的水上交通工具",
   intro:"把一根树干挖空，或用树皮、兽皮蒙在骨架上，就得到了独木舟。它在数万年间把人类送过江河与近海，如今以皮划艇与赛艇的形式延续，仍是岛屿与湿地最重要的个人水上交通工具。",
   specs:[["出现时间","史前（数万年前）"],["动力","人力划桨"],["典型速度","约 4–10 km/h"],["典型用途","渔猎 / 短途运输 / 运动探险"]],
   feats:["格陵兰皮划艇与波利尼西亚独木舟发展出成熟的远航技艺","轻量、吃水浅，可进入河流与湿地深处","今天是奥运项目，也是大众户外运动"],
   subject:"a traditional wooden dugout canoe with a single wooden paddle resting across the gunwales, plain weathered wood, three-quarter view"},
  {id:"water-02", cat:"water", name:"桨帆船", en:"Galley",
   era:"公元前 2000 年 — 19 世纪",
   tag:"靠人力划桨驱动的古代战船与商船",
   intro:"在风帆之外，桨帆船靠成排的桨手提供稳定动力，机动性远好于纯帆船。从古希腊三列桨座战船、维京长船到地中海的加莱船，它统治了古代海战与近海贸易两千余年。",
   specs:[["出现时间","公元前 2000 年前后"],["动力","人力划桨，辅以风帆"],["典型速度","约 6–10 km/h"],["典型用途","海战 / 劫掠 / 近海运输"]],
   feats:["桨手分层排列以容纳更多动力，是古代造船的工程难题","吃水浅，可贴近海岸与河口作战","在火炮与远洋帆船成熟后逐渐退出历史舞台"],
   subject:"an ancient Greek trireme with a long wooden hull, three banks of oars on each side and a single furled square sail on one mast, full side view"},
  {id:"water-03", cat:"water", name:"帆船", en:"Sailing Ship",
   era:"公元前 3000 年 — 至今",
   tag:"用风把世界连成一体",
   intro:"从古埃及的方帆、阿拉伯的三角帆，到欧洲的盖伦帆船与十九世纪的飞剪船，帆船借助风的力量完成洲际航行，支撑了大航海、香料贸易与洲际移民，今天则成为运动与休闲方式。",
   specs:[["出现时间","公元前 3000 年前后"],["动力","风力，多桅多帆组合"],["典型速度","约 10–35 km/h"],["典型用途","远洋贸易 / 探索 / 渔业 / 运动"]],
   feats:["三角帆与纵帆让船可以逆风蛇形前进","盖伦帆船与飞剪船把帆船时代的远洋运输效率推到顶峰","现代帆船以竞速与休闲为主，大型帆船仍用于训练"],
   subject:"a large Chinese junk-style sailing ship with several masts and red battened sails, wooden hull, three-quarter view"},
  {id:"water-04", cat:"water", name:"蒸汽轮船", en:"Steamship",
   era:"1807 年 — 20 世纪中",
   tag:"让船摆脱风的束缚",
   intro:"1807 年富尔顿把蒸汽机与明轮装上船，轮船第一次可以不顾风向按班期航行。此后螺旋桨与钢制船体让船舶越造越大，蒸汽轮船把远洋旅行与贸易带入定期化的时代。",
   specs:[["出现时间","1807 年"],["动力","燃煤 / 燃油锅炉驱动蒸汽机或汽轮机"],["典型速度","约 15–30 节"],["典型用途","远洋客运 / 货运 / 内河航运"]],
   feats:["首次实现不依赖风向的定期航线","钢制船体与螺旋桨使船舶吨位大幅增长","是跨大西洋客运与移民潮的载体"],
   subject:"an early 20th century ocean liner with a black hull, white superstructure and four funnels, full side view"},
  {id:"water-05", cat:"water", name:"渡轮", en:"Ferry",
   era:"19 世纪 — 至今",
   tag:"把公路与铁路延伸过水面的班船",
   intro:"渡轮在固定两点之间往返，把人员、车辆甚至整列火车运过海峡、江河与湖泊。它是跨海通勤与岛屿供应的生命线，也是许多城市日常交通的一部分。",
   specs:[["出现时间","19 世纪（现代滚装渡轮 20 世纪）"],["动力","柴油 / LNG / 电力"],["载客量","数十至数千人，可载车"],["典型用途","跨海通勤 / 岛屿补给 / 观光"]],
   feats:["滚装渡轮让汽车与卡车连车带人一起过海","高频穿梭航线把跨海出行做成通勤班次","新一代渡轮开始使用 LNG 与电力推进"],
   subject:"a Chinese roll-on roll-off passenger ferry with an open vehicle deck, white hull with a blue stripe, full side view"},
  {id:"water-06", cat:"water", name:"邮轮", en:"Cruise Ship",
   era:"20 世纪 — 至今",
   tag:"把酒店、剧场与商场装进一艘船",
   intro:"当跨洋班轮被飞机取代，客船转向「旅行本身就是目的地」：邮轮以娱乐、餐饮与岸上观光为核心，把一座移动的城市带到海上，成为大众旅游的重要形式。",
   specs:[["出现时间","20 世纪（大众化始于 1970 年代）"],["动力","柴油电力 / LNG"],["总吨位","约 2 万–25 万 GT"],["典型用途","休闲旅游"]],
   feats:["大型邮轮相当于把街区、剧院与泳池搬上船","中央公园、海滨大道等开放式街区设计成为卖点","新船普遍采用 LNG 动力并试点燃料电池"],
   subject:"a large modern cruise ship with rows of balconies, a white hull and a rounded bow, three-quarter view"},
  {id:"water-07", cat:"water", name:"集装箱船", en:"Container Ship",
   era:"1956 年 — 至今",
   tag:"用标准箱子重塑全球贸易",
   intro:"1956 年标准集装箱与专用船的出现，让装卸不再靠人力搬货，而是整箱吊装。运输成本因此骤降，全球产业链才得以按「设计、制造、销售」分散到不同国家。",
   specs:[["出现时间","1956 年"],["动力","低速柴油机"],["载箱量","约 1000–24000 TEU"],["典型用途","洲际干线贸易"]],
   feats:["集装箱使港口装卸效率提高数十倍，运输成本大幅下降","超大型船船长接近 400 m，逼近运河通航极限","与全球供应链、港口枢纽体系深度绑定"],
   subject:"a very large container ship fully stacked with colorful shipping containers, white hull with red accents, full side view"},
  {id:"water-08", cat:"water", name:"散货船", en:"Bulk Carrier",
   era:"20 世纪 — 至今",
   tag:"把煤炭、矿石与粮食装进船舱",
   intro:"散货船专门运输不加包装的干散货——铁矿石、煤炭、谷物、水泥。它们通常采用大开口货舱与单甲板结构，配合抓斗或传送带装卸，是全球大宗商品贸易的载体。",
   specs:[["出现时间","20 世纪"],["动力","低速柴油机"],["载重","约 1 万–40 万吨"],["典型用途","矿石 / 煤炭 / 粮食 / 建材运输"]],
   feats:["大开口货舱便于抓斗作业，装卸效率高","大型矿砂船是最大级别的散货船之一","承担了全球干散货贸易量的绝大部分"],
   subject:"a very large bulk ore carrier with wide open hatches, dark red hull and deck cranes, full side view"},
  {id:"water-09", cat:"water", name:"油轮", en:"Oil Tanker",
   era:"1886 年 — 至今",
   tag:"把液体能源运过海洋",
   intro:"油轮用分隔的液货舱运输原油与成品油，是石油贸易的血管。二十世纪超级油轮的出现让中东的原油可以低成本送达全球，也带来了溢油污染等新的环境挑战。",
   specs:[["出现时间","1886 年"],["动力","低速柴油机"],["载重","约 1 万–50 万吨"],["典型用途","原油与成品油运输"]],
   feats:["液货舱分隔并配惰性气体系统以防爆","超级油轮（ULCC）载重可达 50 万吨","双壳船体与溢油事故推动了国际防污公约"],
   subject:"a very large crude oil tanker with a long flat deck and a superstructure at the stern, black hull, full side view"},
  {id:"water-10", cat:"water", name:"渔船", en:"Fishing Vessel",
   era:"古代 — 至今",
   tag:"人类最古老也最庞大的船队",
   intro:"渔船是数量最多的作业船舶：从近海的小型拖网船、围网船，到远洋的大型加工渔船，它们把海洋变成粮食来源，也不断面对资源与生态的平衡问题。",
   specs:[["出现时间","古代"],["动力","帆 / 柴油机"],["主要船型","拖网 / 围网 / 延绳钓 / 加工船"],["典型用途","捕捞 / 养殖辅助 / 水产加工"]],
   feats:["拖网、围网与延绳钓对应不同的鱼群与海况","大型远洋渔船自带加工与冷冻能力，可长期在海上作业","渔业管理推动渔船向选择性捕捞与低碳动力转型"],
   subject:"a steel fishing trawler with a forward wheelhouse, a deck winch and a trawl net stowed at the stern, blue hull, three-quarter view"},
  {id:"water-11", cat:"water", name:"破冰船", en:"Icebreaker",
   era:"19 世纪末 — 至今",
   tag:"为其他船在冰海里开路",
   intro:"破冰船用强化船体、特殊艏形与大功率动力压碎冰层，为航道上的商船开道。核动力破冰船更能长期在极地自主作业，是北极航线与极地科考的保障装备。",
   specs:[["出现时间","19 世纪末"],["动力","柴油电力 / 核动力"],["破冰能力","可达 3 m 厚冰"],["典型用途","极地护航 / 科考 / 港口破冰"]],
   feats:["船体与艏部经特殊强化，可骑上冰面把冰压碎","核动力破冰船可在极地持续作业数月","可变吃水设计兼顾远海与河口航道"],
   subject:"a modern Chinese polar icebreaker with a red and white hull and a thick reinforced rounded bow, full side view"},
  {id:"water-12", cat:"water", name:"潜艇", en:"Submarine",
   era:"1620 年 — 至今",
   tag:"唯一能长期在水下航行的交通工具",
   intro:"潜艇通过压载水舱调节浮力实现下潜与上浮，用耐压壳体承受海水压力。它在二十世纪的海战中成为战略力量，如今也用于海洋科考、海底勘探与观光。",
   specs:[["出现时间","1620 年（实用化 19 世纪末）"],["动力","柴电 / 核动力 / AIP"],["下潜深度","数十至数百米"],["典型用途","军事 / 科考 / 勘探 / 观光"]],
   feats:["核潜艇可数月不浮出水面，实现全球隐蔽巡航","耐压壳体与生命保障系统是其核心技术","载人深潜器已抵达万米级海底"],
   subject:"a modern conventional submarine with a long streamlined black hull, a conning tower and diving planes, full side view"},
  {id:"water-13", cat:"water", name:"气垫船", en:"Hovercraft",
   era:"1959 年 — 至今",
   tag:"用气垫在水陆之间滑行",
   intro:"气垫船用风扇向船底压入空气，形成一层气垫把船体托离水面，从而大幅降低阻力。它能高速穿越浅滩、沼泽与滩涂，既走水面也能短距离上岸，是两栖运输的独特方案。",
   specs:[["出现时间","1959 年"],["动力","燃气轮机或柴油机驱动风扇"],["典型速度","约 40–80 km/h"],["典型用途","客流渡运 / 两栖运输 / 救援"]],
   feats:["船体不接触水面，可在浅滩、沼泽与冰面通行","英吉利海峡气垫船航班曾是最快的水上渡运方式","噪声与运营成本高，如今多用于客运与救援"],
   subject:"a large cross-channel hovercraft with a boxy body, a visible air-cushion skirt all around and large rear propellers, blue and white body, three-quarter view"},

  /* ===================== 天空 ===================== */
  {id:"sky-01", cat:"sky", name:"热气球", en:"Hot Air Balloon",
   era:"1783 年 — 至今",
   tag:"人类第一次载人升空",
   intro:"1783 年蒙戈尔菲耶兄弟用热空气让载人气球升空，人类第一次离开地面。热气球靠加热球囊内的空气获得升力、靠燃烧器控制高度，至今仍是观光飞行与航空运动的经典形式。",
   specs:[["出现时间","1783 年"],["动力","无自航能力，随气流漂移"],["典型高度","数百至数千米"],["典型用途","观光 / 赛事 / 航空运动"]],
   feats:["是人类最早的载人飞行器","上升与下降靠加热与放气控制，水平方向完全随风","如今以观光与竞技为主，热气球节成为旅游名片"],
   subject:"a hot air balloon with a large striped fabric envelope and a wicker basket, compact composition with the envelope and basket together occupying only the middle half of the frame height"},
  {id:"sky-02", cat:"sky", name:"飞艇", en:"Airship",
   era:"1852 年 — 20 世纪中",
   tag:"比空气轻的庞然大物",
   intro:"飞艇靠充入氢气或氦气的艇囊获得浮力，再用发动机主动飞行。二十世纪前期，齐柏林飞艇曾开通跨大西洋定期航线，但兴登堡号事故后迅速被飞机取代，如今以氦气观光飞艇延续。",
   specs:[["出现时间","1852 年（硬式飞艇 1900 年）"],["动力","活塞或涡轮发动机，氦气浮力"],["典型速度","约 80–130 km/h"],["典型用途","跨洋客运（历史）/ 观光 / 广告 / 监测"]],
   feats:["曾实现跨大西洋与环球定期客运飞行","兴登堡号事故终结了氢气飞艇的客运时代","现代飞艇改用惰性氦气，用于观光与空中监测"],
   subject:"a white helium airship with a long envelope, tail fins and a small gondola cabin underneath, three-quarter view"},
  {id:"sky-03", cat:"sky", name:"滑翔机", en:"Glider",
   era:"19 世纪 — 至今",
   tag:"没有发动机也能持续飞行",
   intro:"滑翔机不带动力，靠牵引或绞盘升空后借助上升气流持续飞行。李林塔尔的滑翔试验直接启发了莱特兄弟，如今滑翔已成为一项成熟的航空运动。",
   specs:[["出现时间","19 世纪（现代滑翔运动 20 世纪）"],["动力","无（借助上升气流与牵引）"],["滑翔比","可达 50:1 以上"],["典型用途","航空运动 / 飞行训练 / 气象研究"]],
   feats:["极低的阻力与极高的滑翔比，可飞行数百公里","李林塔尔的滑翔试验为动力飞行提供了关键经验","是飞行员训练与航空气象研究的常用平台"],
   subject:"a white two-seat sailplane glider with very long slender wings and a bubble canopy, three-quarter view"},
  {id:"sky-04", cat:"sky", name:"螺旋桨飞机", en:"Propeller Aircraft",
   era:"1903 年 — 至今",
   tag:"人类第一架动力飞机的形态",
   intro:"1903 年莱特兄弟的「飞行者一号」用活塞发动机带动螺旋桨完成首次持续动力飞行。螺旋桨在低速段推进效率高，至今仍在通用航空、支线运输与运输机中广泛使用。",
   specs:[["出现时间","1903 年"],["动力","活塞发动机或涡桨发动机"],["典型速度","约 200–600 km/h"],["典型用途","通用航空 / 支线客运 / 运输 / 训练"]],
   feats:["开创了人类持续动力飞行的历史","涡桨发动机在中低速段比喷气更省油","至今是短途航线与农场、林区作业的主力"],
   subject:"a Chinese Y-12 style twin-turboprop utility aircraft with a high straight wing and fixed landing gear, white body with a blue stripe, three-quarter front view"},
  {id:"sky-05", cat:"sky", name:"直升机", en:"Helicopter",
   era:"1939 年 — 至今",
   tag:"能垂直起降与悬停的飞行器",
   intro:"直升机用旋翼同时产生升力与推力，可以垂直起降、悬停和任意方向移动，无需跑道。这让它在救援、医疗转运、巡视与难以到达地区的运输中不可替代。",
   specs:[["出现时间","1939 年（实用化 1940 年代）"],["动力","涡轴发动机驱动旋翼"],["典型速度","约 150–300 km/h"],["典型用途","救援 / 医疗 / 巡视 / 运输 / 观光"]],
   feats:["可垂直起降并悬停，摆脱对跑道的依赖","尾桨抵消反扭，多旋翼与共轴设计提供替代方案","山区救援与海上平台转运是其不可替代的场景"],
   subject:"a Chinese Z-9 style light twin-engine helicopter with skid landing gear, white and orange livery, three-quarter view"},
  {id:"sky-06", cat:"sky", name:"喷气式客机", en:"Jet Airliner",
   era:"1952 年 — 至今",
   tag:"把地球变成「地球村」",
   intro:"喷气发动机让客机的速度与航程同时跃升。1952 年彗星号开启喷气民航时代，此后宽体客机不断把票价压低，使洲际旅行从奢侈变为日常，现代旅游业与全球化由此成形。",
   specs:[["出现时间","1952 年"],["动力","涡扇发动机"],["巡航速度","约 800–950 km/h"],["典型用途","中远程客运与货运"]],
   feats:["喷气化使洲际旅行时间缩短一半以上","双发宽体与 ETOPS 规则让双发飞机可跨洋直飞","单位座公里油耗与噪声持续下降"],
   subject:"a Chinese narrow-body twinjet airliner with underwing engines, white fuselage with a green and blue tail, three-quarter front view"},
  {id:"sky-07", cat:"sky", name:"水上飞机", en:"Seaplane",
   era:"1910 年代 — 至今",
   tag:"不需要跑道的水上飞行",
   intro:"水上飞机用浮筒或船型机身在水面起降，把湖泊、海湾与河道都变成机场。在缺少跑道的岛屿、林区与偏远水域，它至今仍是重要的运输与救援工具。",
   specs:[["出现时间","1910 年代"],["动力","活塞或涡桨发动机，浮筒或船型机身"],["典型速度","约 150–300 km/h"],["典型用途","岛屿与湖区运输 / 救援 / 观光 / 消防"]],
   feats:["湖海河面即是跑道，覆盖无机场地区","灭火型水上飞机可直接在水面汲水投洒","曾开辟早期的跨洋与远程航线"],
   subject:"a large amphibious aircraft with a boat-shaped hull instead of landing gear, white and blue body, three-quarter front view"},
  {id:"sky-08", cat:"sky", name:"通用航空飞机", en:"General Aviation Aircraft",
   era:"20 世纪 — 至今",
   tag:"数量最多的有人驾驶飞机",
   intro:"除定期航班与军用飞机之外的飞行活动统称通用航空：私人小飞机、航拍、农用喷洒、飞行培训、公务机都属此类。它的机队数量远超民航客机，是航空最日常的一面。",
   specs:[["出现时间","20 世纪"],["动力","活塞或涡桨发动机"],["载员","2–10 人（公务机可更多）"],["典型用途","培训 / 航拍 / 农用 / 公务 / 私人飞行"]],
   feats:["是全球数量最大的有人驾驶飞机类别","起降条件要求低，可服务于小城镇与农场","公务机把高效出行延伸到没有定期航班的城市"],
   subject:"a high-wing single-engine light aircraft with fixed landing gear, white with a stripe, three-quarter front view"},
  {id:"sky-09", cat:"sky", name:"超音速飞机", en:"Supersonic Aircraft",
   era:"1947 年 — 至今",
   tag:"突破音障的飞行",
   intro:"1947 年 X-1 首次突破音障，此后战斗机普遍进入超音速，协和号与图-144 更把超音速带到民航。由于音爆、油耗与成本限制，超音速客机退役，但相关技术仍在推进。",
   specs:[["出现时间","1947 年"],["动力","涡喷与涡扇发动机，加力燃烧"],["典型速度","马赫 1–2"],["典型用途","军事 / 科研 / 历史上的超音速客运"]],
   feats:["贝尔 X-1 首次实现可控超音速飞行","协和号把跨大西洋航程缩短到约 3.5 小时","音爆与高油耗使超音速民航难以为继，新一代机型正在探索"],
   subject:"a supersonic passenger jet with sharply swept delta wings and a pointed drooping nose, white body, three-quarter front view"},
  {id:"sky-10", cat:"sky", name:"无人机", en:"Unmanned Aerial Vehicle",
   era:"21 世纪 — 至今",
   tag:"飞行器第一次真正走入日常",
   intro:"无人机由地面遥控或自主飞行，无需机上飞行员。消费级多旋翼把航拍变成大众玩法，工业级无人机则承担测绘、植保、巡检与物流，正在快速改写低空空域的利用方式。",
   specs:[["出现时间","21 世纪初（大众化 2010 年代）"],["动力","电动多旋翼 / 固定翼 / 混合布局"],["续航","约 20 分钟至数十小时"],["典型用途","航拍 / 植保 / 测绘 / 巡检 / 物流"]],
   feats:["多旋翼结构简单，可垂直起降与悬停","固定翼与复合翼机型大幅提升航程与续航","正在与低空经济、城市空中交通结合"],
   subject:"a folding quadcopter camera drone with four small rotors and a gimbal camera, gray body, three-quarter view"},
  {id:"sky-11", cat:"sky", name:"倾转旋翼机", en:"Tiltrotor",
   era:"1989 年 — 至今",
   tag:"兼具直升机与固定翼的两栖性能",
   intro:"倾转旋翼机的发动机舱可以旋转：起飞时像直升机一样垂直起降，巡航时转成螺旋桨像固定翼飞机飞行，从而同时获得垂直起降能力与远高于直升机的速度与航程。",
   specs:[["出现时间","1989 年"],["动力","涡轮轴发动机驱动可倾转旋翼"],["巡航速度","约 500 km/h"],["典型用途","军民两用运输 / 远程救援 / 海上作业"]],
   feats:["把垂直起降与固定翼巡航速度结合在一起","航程与速度显著优于同级直升机","结构复杂、成本高，是长期的技术挑战"],
   subject:"a tiltrotor aircraft with two large engine nacelles at the wingtips, gray body, three-quarter view"},
  {id:"sky-12", cat:"sky", name:"电动垂直起降飞行器", en:"eVTOL Aircraft",
   era:"2020 年代 — 至今",
   tag:"面向城市空中交通的电动飞行",
   intro:"eVTOL 用多个电动旋翼实现垂直起降，电力驱动带来低噪声与低排放，被视为城市空中出租与短途通勤的候选方案，多国正推进适航审定与试点运营。",
   specs:[["出现时间","2020 年代"],["动力","纯电或混合动力，多旋翼分布式推进"],["典型航程","约 50–250 km"],["典型用途","城市空中出租 / 短途通勤 / 医疗转运"]],
   feats:["分布式电推进大幅降低噪声与机械复杂度","目标是把通勤从地面搬到低空，避开拥堵","适航标准、充电与空域管理仍在成型"],
   subject:"an electric air taxi with a pod cabin and multiple small rotors on slender booms, white and gray, three-quarter view"},

  /* ===================== 太空 ===================== */
  {id:"space-01", cat:"space", name:"运载火箭", en:"Launch Vehicle",
   era:"1957 年 — 至今",
   tag:"把一切送离地球的起点",
   intro:"运载火箭靠多级结构逐级抛离空箱、持续加速，把卫星、飞船与探测器送出大气层。它是一切航天活动的前提，推力与运载能力决定了一个国家能到达多远的太空。",
   specs:[["出现时间","1957 年"],["动力","液体或固体火箭发动机，多级串联"],["近地轨道运力","约数百公斤至数十吨"],["典型用途","发射卫星 / 飞船 / 探测器"]],
   feats:["多级设计让火箭抛掉死重、持续加速","大型火箭的运力决定了深空探测的上限","可重复使用技术正在大幅降低发射成本"],
   subject:"a Chinese Long March 5 style heavy-lift rocket standing vertically, white body with a blue stripe and four strap-on boosters, full side view, the whole rocket occupying only the middle half of the frame height"},
  {id:"space-02", cat:"space", name:"人造卫星", en:"Satellite",
   era:"1957 年 — 至今",
   tag:"环绕地球的人造天体",
   intro:"1957 年斯普特尼克一号入轨，人类第一次把人造物体送上太空。如今数千颗卫星承担通信、导航、气象与遥感，构成了现代社会看不见的基础设施。",
   specs:[["出现时间","1957 年"],["轨道","低轨 / 中轨 / 地球同步与静止轨道"],["典型寿命","数年至数十年"],["典型用途","通信 / 导航 / 气象 / 遥感"]],
   feats:["通信、导航与气象卫星已成为民用基础设施","地球静止轨道上的卫星相对地面保持静止","低轨巨型星座正在改变全球互联网接入"],
   subject:"a Chinese BeiDou style navigation satellite with a gold foil body, two large solar panel wings and a dish antenna, three-quarter view"},
  {id:"space-03", cat:"space", name:"空间探测器", en:"Space Probe",
   era:"1959 年 — 至今",
   tag:"替人类去看更远的星",
   intro:"空间探测器是不返回的航天器，飞掠、环绕或着陆其他天体。从月球、火星到太阳系边缘，它们把人类的眼睛送到无法载人抵达的地方，不断改写我们对宇宙的认识。",
   specs:[["出现时间","1959 年"],["动力","化学推进 / 引力助推 / 放射性同位素电源"],["典型任务","飞掠 / 环绕 / 着陆 / 采样返回"],["典型用途","行星与深空科学探测"]],
   feats:["引力助推让探测器借助行星加速飞向深空","旅行者一号已飞出行星区域，进入星际空间","采样返回任务把地外物质带回地球研究"],
   subject:"a Chinese Tianwen-1 style deep space probe with a large dish antenna and folded solar panels, silver and gold body, three-quarter view"},
  {id:"space-04", cat:"space", name:"载人飞船", en:"Crewed Spacecraft",
   era:"1961 年 — 至今",
   tag:"把人送上轨道并带回地球",
   intro:"载人飞船是往返太空的「密封舱」：上升段随火箭发射，入轨后自主飞行并完成对接，返回时靠隔热盾与降落伞着陆。它是人类在轨活动最基本的交通工具。",
   specs:[["出现时间","1961 年"],["动力","化学推进，发射依靠运载火箭"],["载员","1–7 人"],["典型用途","载人往返空间站 / 登月 / 商业航天"]],
   feats:["隔热盾与再入控制是安全返回的核心","发射逃逸系统可在故障时把乘员带离火箭","新一代飞船正走向可重复使用"],
   subject:"a Chinese Shenzhou style crewed spacecraft with a conical return capsule, a cylindrical service module and two solar panel wings, full side view"},
  {id:"space-05", cat:"space", name:"登月着陆器", en:"Lunar Lander",
   era:"1969 年 — 至今",
   tag:"在另一个天体上降落与起飞",
   intro:"登月着陆器分为下降级与上升级，专门在地外天体软着陆并起飞返回。1969 年阿波罗登月舱实现首次载人登月，此后一系列着陆器把探测器与巡视车送上月球与火星。",
   specs:[["出现时间","1969 年"],["动力","化学推进，多级结构"],["任务模式","软着陆 + 上升级起飞返回"],["典型用途","载人与无人月球、行星着陆"]],
   feats:["下降级与上升级分离，抛掉着陆设备以减重返回","在真空与低重力下依靠反推精确着陆","新一代着陆器瞄准月球南极与载人重返"],
   subject:"a Chinese Chang'e style lunar lander with a descent stage, four landing legs and gold foil panels, three-quarter view"},
  {id:"space-06", cat:"space", name:"空间站", en:"Space Station",
   era:"1971 年 — 至今",
   tag:"长期在轨生活与工作的地方",
   intro:"空间站由多个舱段在轨组装，提供生命保障、实验与居住空间，让航天员能连续数月在轨工作。它是微重力科学、技术验证与长期太空生活的平台。",
   specs:[["出现时间","1971 年"],["轨道","近地轨道约 400 km"],["在轨规模","数舱至十余舱段"],["典型用途","科学研究 / 技术验证 / 长期在轨居住"]],
   feats:["国际空间站已连续载人驻留二十余年","太阳能翼为整个站提供电力，需定期补加推进剂维持轨道","是验证长期太空生活与生命保障系统的关键平台"],
   subject:"a Chinese Tiangong style space station with a T-shaped core module, docked laboratory modules and large solar arrays, three-quarter view"},
  {id:"space-07", cat:"space", name:"货运飞船", en:"Cargo Spacecraft",
   era:"1978 年 — 至今",
   tag:"空间站的补给与物流",
   intro:"货运飞船为空间站运送推进剂、水、氧气、实验设备与生活物资，并把废弃物带走。它通常不载人，任务结束后再入烧毁，是维持空间站长期运行的生命线。",
   specs:[["出现时间","1978 年"],["动力","化学推进，自动交会对接"],["载货量","约 2–6 吨"],["典型用途","空间站补给 / 推进剂补加"]],
   feats:["自动交会对接技术是长期在轨运行的前提","可补加推进剂以维持空间站的轨道高度","部分飞船兼作可返回的科学实验平台"],
   subject:"a Chinese Tianzhou style cargo spacecraft with a cylindrical pressurized module and two solar panel wings, full side view"},
  {id:"space-08", cat:"space", name:"航天飞机", en:"Space Shuttle",
   era:"1981 年 — 2011 年",
   tag:"第一个可重复使用的载人航天器",
   intro:"航天飞机由轨道器、外贮箱与两枚固体助推器组成，轨道器可多次往返天地，能布放、回收卫星并运送舱段，支撑了空间站的建造，也暴露了可重复使用的成本与安全难题。",
   specs:[["出现时间","1981 年"],["动力","固体助推器 + 液体主发动机"],["载员","最多 7 人，带大货舱"],["典型用途","卫星布放 / 空间站建造 / 在轨维修"]],
   feats:["首个把「可重复使用」作为核心目标的载人航天器","大货舱可整体运送空间站舱段","成本与安全代价高昂，2011 年退役"],
   subject:"a space shuttle orbiter with a white and black body, delta wings and open payload bay doors, three-quarter front view"},
  {id:"space-09", cat:"space", name:"行星漫游车", en:"Planetary Rover",
   era:"1970 年 — 至今",
   tag:"在地外天体上行驶的机器人",
   intro:"漫游车用轮式底盘在地外天体表面移动，搭载相机与仪器进行就地探测。从月球车到火星车，它们把地质学家的工作方式搬到了别的星球，可以数月甚至数年持续行驶。",
   specs:[["出现时间","1970 年"],["动力","太阳能或放射性同位素电源"],["行驶速度","约 0.01–0.2 km/h"],["典型用途","月面与火星表面巡视探测"]],
   feats:["六轮摇臂悬挂可在崎岖地表保持稳定","自主避障与远距离遥控结合，克服通信延迟","火星车可连续工作数年，累计行驶数十公里"],
   subject:"a Chinese Zhurong style six-wheeled Mars rover with butterfly-shaped solar panels and a camera mast, gold and gray body, three-quarter view"},
  {id:"space-10", cat:"space", name:"可重复使用运载器", en:"Reusable Launch Vehicle",
   era:"2015 年 — 至今",
   tag:"让火箭像飞机一样回收再用",
   intro:"可重复使用运载器通过反推着陆或海上回收的方式让火箭一级回到地面，经翻修后再次发射。它把「一次性火箭」的成本结构彻底改写，是当前航天发射的主流方向。",
   specs:[["出现时间","2015 年（一级回收）"],["动力","液体火箭发动机，反推垂直着陆或海上回收"],["复用次数","已实现数十次复用"],["典型用途","商业发射 / 星座组网 / 载人运输"]],
   feats:["一级垂直回收让单次发射成本显著下降","整流罩与上面级也在试验回收复用","推动了大规模低轨星座与商业航天的爆发"],
   subject:"a Falcon 9 style reusable rocket first-stage booster standing vertically on its four deployed landing legs, a tall white cylindrical body with dark grid fins near the top and a dark soot-stained engine section at the base, full side view, the whole rocket occupying only the middle half of the frame height"}
];

/* 分类图标（占位块用，纯描边 SVG） */
var ICONS = {
  car:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13.5 5.6 9a2 2 0 0 1 1.9-1.4h9a2 2 0 0 1 1.9 1.4L20 13.5v3.9H4z"/><circle cx="7.6" cy="17.4" r="1.7"/><circle cx="16.4" cy="17.4" r="1.7"/><path d="M4 13.5h16"/></svg>',
  plane:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10.4 3.6a1.6 1.6 0 0 1 3.2 0v4.9l6.9 4.1v2.4l-6.9-2v3.1l1.9 1.5v1.8l-3.5-1.1-3.5 1.1v-1.8l1.9-1.5v-3.1l-6.9 2v-2.4l6.9-4.1z"/></svg>',
  ship:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v2.6"/><path d="M8.2 9.4V6.1h7.6v3.3"/><path d="M4.4 12.6h15.2l-1.7 4.6a2 2 0 0 1-1.9 1.3H8a2 2 0 0 1-1.9-1.3z"/><path d="M12 9.4v3.2"/><path d="M3 20.4c1.3 0 1.3-1 2.6-1s1.3 1 2.6 1 1.3-1 2.6-1 1.3 1 2.6 1 1.3-1 2.6-1 1.3 1 2.6 1 1.3-1 2.6-1"/></svg>',
  rocket:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.6c2.6 2.2 4 5.3 4 8.6 0 2.1-.4 4-1.2 5.6H9.2A13.2 13.2 0 0 1 8 11.2c0-3.3 1.4-6.4 4-8.6z"/><circle cx="12" cy="9.6" r="1.6"/><path d="M9.2 16.8 7 20.4l2.5-.7"/><path d="M14.8 16.8 17 20.4l-2.5-.7"/><path d="M11.2 20.9c.5-.9 1.1-.9 1.6 0"/></svg>'
};

/* ============================ 渲染 ============================ */

var IMG_DIR = "./assets/img/";
/* 图片后缀回退链：图 agent 产出 webp / jpg / png 都能被认出来，不必改代码。 */
var EXTS = ["webp", "jpg", "jpeg", "png"];

/* 顶栏 tab：按 tabKey 归并生成（当前四大类各占一个 tab，合并逻辑为将来细分预留） */
var TABS = [];
CATS.forEach(function(c){
  var t = null;
  for(var i = 0; i < TABS.length; i++){ if(TABS[i].key === c.tabKey){ t = TABS[i]; break; } }
  if(!t){ t = {key:c.tabKey, zh:c.tabZh, cats:[]}; TABS.push(t); }
  t.cats.push(c.key);
});

function catOf(key){
  for(var i = 0; i < CATS.length; i++){ if(CATS[i].key === key){ return CATS[i]; } }
  return CATS[0];
}
function findVehicle(id){
  for(var i = 0; i < VEHICLES.length; i++){ if(VEHICLES[i].id === id){ return VEHICLES[i]; } }
  return null;
}
function escapeHtml(str){
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
/* 卡片上的时代只取起始时间（era 中「—」之前的一段），完整跨度放到详情页。 */
function eraStart(era){
  return String(era || "").split("—")[0].replace(/\s+$/, "");
}

/* 图片框：占位块永远在 DOM 里，实图加载成功后盖在上面。
   图片缺失 / 后缀不符时依次退回 EXTS 的下一个后缀，全部失败则隐藏 img，露出占位块。
   era 非空时在图片左上角叠一枚时代徽标（列表卡片用）。 */
function shotHtml(base, title, label, cls, catKey, era){
  var ext = EXTS[0];
  var eraChip = era ? '<span class="shot-era">' + escapeHtml(era) + '</span>' : '';
  return '<div class="shot ' + cls + '">' +
      '<div class="shot-ph">' +
        (label ? '<span class="bd">' + escapeHtml(label) + '</span>' : '') +
        '<span class="ic">' + (ICONS[catOf(catKey).icon] || ICONS.rocket) + '</span>' +
        '<span class="nm">' + escapeHtml(title) + '</span>' +
      '</div>' +
      '<img class="shot-img" alt="" data-base="' + escapeHtml(IMG_DIR + base) + '" data-try="0">' +
      eraChip +
    '</div>';
}

var io = null;
try {
  if(typeof window.IntersectionObserver === "function"){
    io = new window.IntersectionObserver(function(entries, obs){
      for(var i = 0; i < entries.length; i++){
        if(entries[i].isIntersecting){ loadImg(entries[i].target); obs.unobserve(entries[i].target); }
      }
    }, {rootMargin:"320px 0px"});
  }
} catch(err){ io = null; }

function loadImg(img){
  if(img.getAttribute("src")){ return; }
  var base = img.getAttribute("data-base") || "";
  var n = parseInt(img.getAttribute("data-try") || "0", 10) || 0;
  img.setAttribute("data-try", String(n));
  img.src = base + "." + EXTS[n];
}

function bindImgs(scope){
  var imgs = scope.querySelectorAll("img.shot-img");
  for(var i = 0; i < imgs.length; i++){
    (function(img){
      img.addEventListener("error", function(){
        var base = img.getAttribute("data-base") || "";
        var n = (parseInt(img.getAttribute("data-try") || "0", 10) || 0) + 1;
        if(n < EXTS.length){
          img.setAttribute("data-try", String(n));
          img.src = base + "." + EXTS[n];
        } else {
          img.style.display = "none";
        }
      });
      if(io){ io.observe(img); } else { loadImg(img); }
    })(imgs[i]);
  }
}

var app = document.getElementById("app");
var tabsEl = document.getElementById("tabs");
var titleEl = document.getElementById("title");
var toastEl = document.getElementById("toast");
var fabTop = document.getElementById("fabTop");
var fabBack = document.getElementById("fabBack");

var activeTab = "all";
var viewMode = "list";
var listScrollY = 0;

var ICON_CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
var ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';

function showToast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(function(){ toastEl.classList.remove("show"); }, 2000);
}

function renderTabs(){
  tabsEl.innerHTML = "";
  var all = document.createElement("button");
  all.className = "tab" + (activeTab === "all" ? " active" : "");
  all.textContent = "全部";
  all.addEventListener("click", function(){ activeTab = "all"; renderTabs(); renderList(); });
  tabsEl.appendChild(all);
  TABS.forEach(function(t){
    var b = document.createElement("button");
    b.className = "tab" + (activeTab === t.key ? " active" : "");
    b.textContent = t.zh;
    b.addEventListener("click", function(){ activeTab = t.key; renderTabs(); renderList(); });
    tabsEl.appendChild(b);
  });
}

function renderList(restoreY){
  titleEl.textContent = "人类交通工具图鉴";
  fabBack.classList.remove("show");
  tabsEl.style.display = "flex";
  app.innerHTML = "";

  var wrap = document.createElement("div");
  wrap.className = "list";

  CATS.forEach(function(c){
    if(activeTab !== "all" && c.tabKey !== activeTab) return;
    var items = VEHICLES.filter(function(v){ return v.cat === c.key; });
    if(!items.length) return;

    var sec = document.createElement("section");
    sec.className = "section";

    var cover = document.createElement("div");
    cover.className = "cat-cover";
    cover.innerHTML = shotHtml("cover-" + c.key, c.zh + " · 分类封面", "分类图", "sm", c.key);
    sec.appendChild(cover);

    var head = document.createElement("div");
    head.className = "section-head";
    head.innerHTML = '<h2>' + escapeHtml(c.zh) + '</h2><span class="en">' + escapeHtml(c.en) + '</span>' +
                     '<span class="cnt">' + items.length + ' 种</span>';
    sec.appendChild(head);

    var note = document.createElement("div");
    note.className = "cat-note";
    note.textContent = c.note;
    sec.appendChild(note);

    var grid = document.createElement("div");
    grid.className = "grid";
    items.forEach(function(v){
      var card = document.createElement("div");
      card.className = "card";
      card.innerHTML =
        shotHtml(v.id, v.name, null, "", v.cat, eraStart(v.era)) +
        '<div class="card-info">' +
          '<div class="card-head"><span class="name">' + escapeHtml(v.name) + '</span>' + ICON_CHEV + '</div>' +
          '<div class="en">' + escapeHtml(v.en) + '</div>' +
          '<div class="desc">' + escapeHtml(v.tag) + '</div>' +
        '</div>';
      card.addEventListener("click", function(){ location.hash = "#/v/" + v.id; });
      grid.appendChild(card);
    });
    sec.appendChild(grid);
    wrap.appendChild(sec);
  });

  app.appendChild(wrap);
  bindImgs(wrap);
  window.scrollTo(0, restoreY || 0);
}

function renderDetail(id){
  var v = findVehicle(id);
  if(!v){ location.hash = "#/"; return; }
  var c = catOf(v.cat);

  titleEl.textContent = v.name;
  fabBack.classList.add("show");
  tabsEl.style.display = "none";
  app.innerHTML = "";

  document.documentElement.style.setProperty("--accent", c.accent);
  document.documentElement.style.setProperty("--accent-soft", c.soft);

  var d = document.createElement("div");
  d.className = "detail";

  var hero = document.createElement("div");
  hero.className = "hero";
  hero.innerHTML = shotHtml(v.id, v.name, null, "lg", v.cat);
  d.appendChild(hero);

  var badgeRow = document.createElement("div");
  badgeRow.className = "badge-row";
  badgeRow.innerHTML = '<span class="cat-badge">' + escapeHtml(c.zh) + '</span>' +
                       '<span class="era-pill">' + escapeHtml(v.era) + '</span>';
  d.appendChild(badgeRow);

  var h2 = document.createElement("h2");
  h2.textContent = v.name;
  d.appendChild(h2);

  var en = document.createElement("div");
  en.className = "en-name";
  en.textContent = v.en;
  d.appendChild(en);

  var tagline = document.createElement("p");
  tagline.className = "tagline";
  tagline.textContent = v.tag;
  d.appendChild(tagline);

  var introBlock = document.createElement("div");
  introBlock.className = "block";
  introBlock.innerHTML = '<h3 class="h3-a">介绍</h3><p>' + escapeHtml(v.intro) + '</p>';
  d.appendChild(introBlock);

  var specBlock = document.createElement("div");
  specBlock.className = "block";
  var specHtml = '<h3 class="h3-b">关键参数</h3><div class="specs">';
  v.specs.forEach(function(p){
    specHtml += '<div class="spec"><span class="k">' + escapeHtml(p[0]) + '</span><span class="v">' + escapeHtml(p[1]) + '</span></div>';
  });
  specHtml += '</div>';
  specBlock.innerHTML = specHtml;
  d.appendChild(specBlock);

  var featBlock = document.createElement("div");
  featBlock.className = "block";
  var featHtml = '<h3 class="h3-c">亮点</h3><ul class="feats">';
  v.feats.forEach(function(f){ featHtml += '<li>' + escapeHtml(f) + '</li>'; });
  featHtml += '</ul>';
  featBlock.innerHTML = featHtml;
  d.appendChild(featBlock);

  var prompt = IMG_STYLE + " " + v.subject;
  var promptBlock = document.createElement("div");
  promptBlock.className = "block";
  promptBlock.innerHTML =
    '<h3 class="h3-d">AI 配图提示词</h3>' +
    '<p class="hint">点按下方文字可全选，长按即可手动复制，交给图像生成工具即可产出与本图鉴风格一致的配图</p>' +
    '<div class="prompt-box"><pre>' + escapeHtml(prompt) + '</pre></div>' +
    '<button class="copy-btn" id="copyBtn">' + ICON_COPY + '复制提示词</button>';
  d.appendChild(promptBlock);

  app.appendChild(d);
  bindImgs(d);

  document.getElementById("copyBtn").addEventListener("click", function(){ copyPrompt(this); });
  window.scrollTo(0, 0);
}

/* 容器已禁用剪贴板类 API（见 device-capabilities.md §3），
   改为选中提示词文本，引导用户长按手动复制。 */
function copyPrompt(btn){
  var box = btn && btn.closest ? btn.closest(".block") : null;
  var pre = box ? box.querySelector(".prompt-box pre") : null;
  if(pre){
    try {
      var range = document.createRange();
      range.selectNodeContents(pre);
      var sel = window.getSelection();
      if(sel){ sel.removeAllRanges(); sel.addRange(range); }
    } catch(err){ /* 选中失败不影响后续提示 */ }
  }
  btn.classList.add("done");
  var self = btn;
  setTimeout(function(){ self.classList.remove("done"); }, 1600);
  showToast("已选中提示词，请长按文字手动复制");
}

function route(){
  var h = location.hash || "#/";
  var m = h.match(/^#\/v\/([a-z0-9-]+)$/i);
  if(m){
    if(viewMode === "list"){
      listScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    }
    viewMode = "detail";
    renderDetail(m[1]);
  } else {
    viewMode = "list";
    document.documentElement.style.removeProperty("--accent");
    document.documentElement.style.removeProperty("--accent-soft");
    renderTabs();
    renderList(listScrollY);
  }
}

fabBack.addEventListener("click", function(){ location.hash = "#/"; });

fabTop.addEventListener("click", function(){
  try { window.scrollTo({top:0, behavior:"smooth"}); }
  catch(e){ window.scrollTo(0, 0); }
});

var ticking = false;
window.addEventListener("scroll", function(){
  if(ticking) return;
  ticking = true;
  window.requestAnimationFrame(function(){
    ticking = false;
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    if(y > 400){ fabTop.classList.add("show"); } else { fabTop.classList.remove("show"); }
  });
}, {passive:true});

window.addEventListener("hashchange", route);
route();

})();
