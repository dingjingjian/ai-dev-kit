/* 全球交通工具图鉴 · 数据与渲染（经典脚本，ES2017 基线，无模块 / 无内联事件）
 *
 * 数据是唯一真源：
 *   CATS      —— 分类（tabZh 为顶栏 2 字短名，同 tabKey 的分类共用一个 tab）
 *   VEHICLES  —— 条目（id / cat / name / en / tag / intro / specs / feats / subject）
 *   IMG_STYLE —— 配图提示词的统一风格前缀
 *
 * 配图：条目图 ./assets/img/<id>.<ext>，分类封面 ./assets/img/cover-<catKey>.<ext>；
 *       文件缺失时页面自动显示占位块（写明期望文件名），补图不需要改代码。
 *       提示词清单由 _dev/gen_image_prompts.py 从本文件派生到 _dev/IMAGE_PROMPTS.md。
 */
(function(){
"use strict";

/* 配图统一风格：所有条目图 / 分类封面图都用同一套渲染规格，保证整册视觉一致。
   图片生成 agent 请把本串 + 条目的 subject 拼接后使用，详见 _dev/IMAGE_PROMPTS.md。 */
var IMG_STYLE = "Clean editorial vehicle encyclopedia illustration, photorealistic 3D product render, three-quarter front view, soft even studio lighting, plain uncluttered light-gray gradient background, subtle contact shadow under the subject, subject centered and fully visible with about 20% empty margin on all sides, no people, no text, no letters, no logo, no watermark, landscape 16:9";

/* 分类：tabKey 相同的分类共用顶栏一个 tab（轮船 · 客运 / 货运 合成「轮船」）。 */
var CATS = [
  {key:"car", tabKey:"car", tabZh:"汽车", zh:"汽车 / 卡车", en:"Cars & Trucks",
   note:"从家用轿车、皮卡到长途重卡",
   accent:"#2563eb", soft:"#eaf1ff", icon:"car"},
  {key:"train", tabKey:"train", tabZh:"火车", zh:"火车", en:"Trains & Rail",
   note:"高速动车组、干线机车与城市轨道",
   accent:"#16a34a", soft:"#e9f7ef", icon:"train"},
  {key:"plane", tabKey:"plane", tabZh:"飞机", zh:"飞机", en:"Aircraft",
   note:"民航客机、大型货机与运输机",
   accent:"#7c3aed", soft:"#f1ecff", icon:"plane"},
  {key:"ship-pax", tabKey:"ship", tabZh:"轮船", zh:"轮船 · 客运", en:"Ships · Passenger",
   note:"邮轮、远洋班轮与渡轮",
   accent:"#0891b2", soft:"#e6f6fb", icon:"ship"},
  {key:"ship-cargo", tabKey:"ship", zh:"轮船 · 货运", en:"Ships · Cargo",
   note:"集装箱船、LNG 船与特种货船",
   accent:"#ea580c", soft:"#fdeee1", icon:"cargo"},
  {key:"other", tabKey:"other", tabZh:"其他", zh:"其他", en:"Others",
   note:"磁浮、单轨、直升机、飞艇与航天器",
   accent:"#db2777", soft:"#fde8f2", icon:"other"}
];

/* 条目：48 台现役有特点的交通工具（每类 8 台）。
   subject 为配图主体描述（英文，不含风格），供图像生成使用。 */
var VEHICLES = [
  /* ===================== 汽车 / 卡车 ===================== */
  {id:"car-01", cat:"car", name:"丰田卡罗拉", en:"Toyota Corolla",
   tag:"全球累计销量最高的车型，超过 5000 万辆",
   intro:"自 1966 年问世以来，卡罗拉以耐用、省油、易维护著称，在全球 150 多个国家销售，是名副其实的「世界车」。第十二代起大规模普及混动版本。",
   specs:[["首发年份","1966 年"],["最高时速","约 190 km/h"],["综合油耗","约 4.5–5.5 L/100km（混动）"],["车身形式","轿车 / 两厢 / 旅行车"]],
   feats:["全球累计销量突破 5000 万辆，居所有车型之首","混动版本在多国占其销量一半以上","以低故障率成为多国出租车与家用车首选"],
   subject:"a white Toyota Corolla sedan, 12th generation, clean modern family car"},
  {id:"car-02", cat:"car", name:"大众高尔夫", en:"Volkswagen Golf",
   tag:"掀背车的定义者，五十余年累计销量超 3700 万辆",
   intro:"1974 年由乔治亚罗设计的第一代高尔夫，用水冷前驱掀背结构取代了后置风冷的甲壳虫，成为欧洲紧凑型车的标准答案，并衍生出 GTI 性能车家族。",
   specs:[["首发年份","1974 年"],["累计销量","超 3700 万辆"],["最高时速","约 200 km/h（1.5 TSI）"],["驱动形式","前置前驱 / 四驱（R）"]],
   feats:["定义了「掀背车 Hatchback」这一车型级别","GTI 版本开创了「小钢炮」细分市场","八代车型在全球持续销售"],
   subject:"a compact German hatchback car, dark gray metallic, 8th generation styling"},
  {id:"car-03", cat:"car", name:"福特 F-150", en:"Ford F-150",
   tag:"美国连续四十余年的最畅销车型",
   intro:"F 系列自 1948 年问世，F-150 是其中销量最大的主力。铝合金车身、涡轮增压 V6、混动与纯电版本同堂销售，既下工地也进车库。",
   specs:[["首发年份","1948 年（F 系列）"],["最高时速","约 180 km/h"],["最大拖拽","约 6.3 吨（视配置）"],["车身形式","单排 / 双排 / 四门皮卡"]],
   feats:["长期占据美国单一车型销量第一","2022 年推出纯电版 F-150 Lightning","被大量用于工程、农业与救援改装"],
   subject:"a large American pickup truck, blue body, chrome grille, off-road tires"},
  {id:"car-04", cat:"car", name:"特斯拉 Model 3", en:"Tesla Model 3",
   tag:"让纯电动车进入主流市场的车型",
   intro:"2017 年交付的 Model 3 以极简内饰、集中式电子电气架构和 OTA 升级改变了汽车的产品形态，也把电动化从实验推入主流。",
   specs:[["首发年份","2017 年"],["续航","约 500–700 km（CLTC）"],["最高时速","约 225 km/h"],["0–100 km/h","约 6.1 s（后驱版）"]],
   feats:["长期位居全球纯电车型销量榜首","采用一体式压铸与集中式架构，零件数量大幅减少","通过 OTA 持续更新功能"],
   subject:"a sleek white electric sedan with smooth aerodynamic body and no front grille"},
  {id:"car-05", cat:"car", name:"丰田海拉克斯", en:"Toyota Hilux",
   tag:"以开不坏闻名的全球中型皮卡",
   intro:"1968 年问世的 Hilux 以极强的可靠性成为皮卡标杆，在矿区、农场、极地与冲突地区都能见到它的身影，Top Gear 曾专门做「试图弄坏它」的节目。",
   specs:[["首发年份","1968 年"],["最高时速","约 175 km/h"],["载重","约 1 吨"],["驱动形式","后驱 / 分时四驱"]],
   feats:["在极端环境与冲突地区被广泛使用并改装","多国军方与联合国系统的采购车型","车身、货斗与底盘可长期耐用服役"],
   subject:"a rugged silver double-cab pickup truck with roof rack, dusty off-road setting"},
  {id:"car-06", cat:"car", name:"奔驰乌尼莫克", en:"Mercedes-Benz Unimog",
   tag:"门式车桥的越野多面手，1948 年投产至今",
   intro:"乌尼莫克最初被设想为农用牵引机，门式车桥带来极高的离地间隙，配合柔性车架与三差速锁，使其成为消防、林业、抢险与科考的首选特种车。",
   specs:[["首发年份","1948 年"],["涉水深度","约 1.2 m"],["驱动形式","分时四驱 + 三把差速锁"],["最高时速","约 90 km/h"]],
   feats:["门式车桥让轮心高于车桥中心，获得罕见的离地间隙","可挂载喷洒、除雪、起重机等数十种上装","被多国用于消防与灾害救援"],
   subject:"an orange articulated off-road utility truck with portal axles and high ground clearance"},
  {id:"car-07", cat:"car", name:"斯堪尼亚 S 系列", en:"Scania S-Series",
   tag:"长途干线运输的旗舰驾驶室",
   intro:"S 系列是斯堪尼亚的平地板旗舰牵引车驾驶室，配 V8 发动机与全套驾驶辅助系统，是欧洲长途物流车队的主力车型。",
   specs:[["首发年份","2016 年"],["发动机","V8 16.4 L"],["最大功率","约 770 hp"],["驾驶室","平地板高顶"]],
   feats:["2017 年被评为国际年度卡车","平地板驾驶室大幅改善长途司机的生活空间","可选天然气与生物燃料动力"],
   subject:"a European long-haul semi truck tractor unit with flat-floor high cab, blue and white livery"},
  {id:"car-08", cat:"car", name:"沃尔沃 FH16", en:"Volvo FH16",
   tag:"欧洲量产卡车中的动力之最",
   intro:"FH16 搭载 D16 直列六缸柴油机，最大输出 750 马力，专为北欧木材运输等重载工况设计，同时也是沃尔沃安全技术的展示平台。",
   specs:[["首发年份","1993 年（FH 系列）"],["最大功率","750 hp"],["最大扭矩","3550 N·m"],["最大总重","60 吨以上（视法规）"]],
   feats:["750 马力长期是欧洲量产卡车的功率上限","2016 年铁骑士改装车曾达到 2400 马力","配备自动紧急制动与队列行驶相关技术"],
   subject:"a heavy long-haul truck with tall sleeper cab, dark green cab, timber trailer"},

  /* ===================== 火车 ===================== */
  {id:"train-01", cat:"train", name:"新干线 N700S", en:"Shinkansen N700S",
   tag:"东海道新干线的第五代主力",
   intro:"2020 年投入运营的 N700S（S 为 Supreme）通过更紧凑的牵引系统实现了编组自由度，并首次在新干线批量装备蓄电池自走系统，可在停电时低速退出区间。",
   specs:[["投入运营","2020 年"],["最高运营时速","285 km/h（东海道）"],["编组","16 辆（亦可 8 辆）"],["供电方式","25 kV 交流 60 Hz"]],
   feats:["首款可选装蓄电池自走系统的新干线列车","车头进一步降低微气压波（隧道爆音）","座椅电源与全车 Wi-Fi 为标准配置"],
   subject:"a Japanese Shinkansen N700S high-speed train, white body with blue and gold stripe, streamlined long nose"},
  {id:"train-02", cat:"train", name:"复兴号 CR400AF/BF", en:"Fuxing CR400AF/BF",
   tag:"中国标准动车组，350 km/h 商业运营",
   intro:"CR400 系列是中国自主研发、具备完全知识产权的复兴号动车组，2017 年在京沪高铁实现 350 km/h 商业运营，并衍生出 17 辆超长编组与智能型。",
   specs:[["投入运营","2017 年"],["最高运营时速","350 km/h"],["试验速度","420 km/h"],["编组","8 辆 / 16 辆 / 17 辆"]],
   feats:["中国首款实现 350 km/h 持续商业运营的动车组","全车覆盖 Wi-Fi，座椅间距与气压控制明显改善","17 辆编组版本载客量超过 1200 人"],
   subject:"a Chinese Fuxing CR400AF high-speed EMU train, silver-white body with red stripe, streamlined nose"},
  {id:"train-03", cat:"train", name:"TGV Duplex", en:"TGV Duplex",
   tag:"双层高速列车，轮轨速度纪录保持者",
   intro:"TGV Duplex 用双层车厢在既有线路限界内把载客量提高约 45%，是法国高铁大客流干线的绝对主力；TGV 的 V150 试验车在 2007 年创下 574.8 km/h 的轮轨世界纪录。",
   specs:[["投入运营","1996 年"],["最高运营时速","320 km/h"],["编组","10 辆（双层）"],["定员","约 510 人"]],
   feats:["轮轨列车世界速度纪录 574.8 km/h（2007 年 V150 试验车）","双层设计在同等站台长度下把载客量提升约 45%","铰接式转向架与动力集中编组"],
   subject:"a French TGV Duplex double-deck high-speed train, silver body with blue and orange stripes"},
  {id:"train-04", cat:"train", name:"ICE 4", en:"ICE 4 (BR 412)",
   tag:"德国铁路的新一代高速动车组",
   intro:"ICE 4 以模块化的动力车加拖车结构取代分散式动力布局，能耗与维护成本下降，是德铁长途网络换代的主力车型。",
   specs:[["投入运营","2017 年"],["最高运营时速","265 km/h"],["编组","7 / 12 / 13 辆"],["定员","最多 918 人（13 辆）"]],
   feats:["模块化编组，可按客流灵活拼组","比上一代 ICE 单座能耗降低约 22%","铝合金车体，牵引与转向架集中维护"],
   subject:"a modern German ICE high-speed train, white body with red stripe along the full length"},
  {id:"train-05", cat:"train", name:"欧洲之星 e320", en:"Eurostar e320",
   tag:"穿越英吉利海峡海底隧道的 320 km/h 列车",
   intro:"e320 基于西门子 Velaro 平台，2015 年起在伦敦—巴黎—布鲁塞尔—阿姆斯特丹线路上服役，是欧洲跨境高铁的标志车型。",
   specs:[["投入运营","2015 年"],["最高运营时速","320 km/h"],["编组","16 辆"],["定员","约 900 人"]],
   feats:["可在英、法、比、荷四国不同供电与信号系统间切换","海底隧道段按限速运行，车体为隧道断面定制","欧洲跨境高铁的代表车型"],
   subject:"a Eurostar e320 high-speed train, dark blue body with yellow front, international livery"},
  {id:"train-06", cat:"train", name:"SBB Re 460", en:"SBB Re 460",
   tag:"瑞士联邦铁路的经典主力机车",
   intro:"1991 年投入使用的 Re 460 是瑞士铁路现代化形象的一部分，牵引 IC/IR 城际客运列车与部分货运，涂装与外观由专业设计师操刀。",
   specs:[["投入运营","1991 年"],["最高时速","230 km/h"],["功率","6100 kW"],["供电","15 kV 16.7 Hz"]],
   feats:["瑞士铁路新机车形象工程的主角，外观由设计团队完成","至今仍在牵引城际客运主力列车","兼顾客运与货运牵引任务"],
   subject:"a Swiss SBB Re 460 electric locomotive in red livery with white front, pulling double-deck coaches"},
  {id:"train-07", cat:"train", name:"印度 Vande Bharat", en:"Vande Bharat Express",
   tag:"印度国产准高速动车组",
   intro:"2019 年首航的 Vande Bharat 是印度首个自主研制的动车组，采用分布式动力，在既有轨道上实现 160–180 km/h，是印度铁路提速换代的核心车型。",
   specs:[["投入运营","2019 年"],["最高运营时速","180 km/h"],["编组","16 辆"],["定员","约 1100 人"]],
   feats:["印度首款自研动车组，加速能力显著优于机车牵引列车","已扩展到数十条线路与多个版本（含卧铺型）","采用再生制动与密封车体"],
   subject:"an Indian Vande Bharat Express train, white body with orange and green stripes, semi-streamlined nose"},
  {id:"train-08", cat:"train", name:"迪拜地铁 7000 系", en:"Dubai Metro 7000 Series",
   tag:"全球最长的无人驾驶地铁系统用车",
   intro:"迪拜地铁 2009 年开通即采用全自动无人驾驶（GoA4）系统，车辆由日本近畿车辆制造，因高温沙尘环境而强化空调与密封设计。",
   specs:[["投入运营","2009 年"],["最高时速","90 km/h"],["编组","5 辆（亦可 3 辆）"],["驾驶方式","全自动无人驾驶 GoA4"]],
   feats:["全线无人驾驶，站台全封闭并配屏蔽门","为高温与沙尘环境定制的空调与过滤系统","红线无人驾驶里程长期居世界前列"],
   subject:"a modern driverless metro train on an elevated viaduct in a desert city, silver and blue livery"},

  /* ===================== 飞机 ===================== */
  {id:"plane-01", cat:"plane", name:"空客 A380", en:"Airbus A380",
   tag:"全球最大的量产客机",
   intro:"全双层四发的 A380 以极低的单位座公里成本设计，2007 年投入商业运营，最多可布置 853 座；因市场转向双发宽体，2021 年停产。",
   specs:[["首飞","2005 年"],["最大载客","853 人（单级）"],["翼展","79.8 m"],["最大起飞重量","575 t"]],
   feats:["唯一量产的全双层客机，主客舱与上层客舱贯通","最大起飞重量与翼展长期居客机之首","共交付 251 架，2021 年停产"],
   subject:"an Airbus A380 double-deck four-engine airliner, white fuselage with blue tail, very wide wingspan"},
  {id:"plane-02", cat:"plane", name:"波音 747-8", en:"Boeing 747-8",
   tag:"空中女王的最终改型",
   intro:"747 于 1970 年把宽体客机带入民航，747-8 是最长、最省油的改型，机身长度 76.3 m，同时提供货机与公务机版本。",
   specs:[["首飞","1969 年（747）"],["机身长度","76.3 m"],["载客","约 467 人（两级）"],["航程","约 14320 km"]],
   feats:["首创双通道宽体客机布局","747-8F 是载重能力最强的量产货机之一","标志性的前部隆起成为航空文化符号"],
   subject:"a Boeing 747-8 jumbo jet with the distinctive upper deck hump, four engines under swept wings"},
  {id:"plane-03", cat:"plane", name:"空客 A350-1000", en:"Airbus A350-1000",
   tag:"碳纤维机身的双发远程宽体",
   intro:"A350 的机身与机翼超过一半采用碳纤维复合材料，配罗罗 Trent XWB 发动机，在超远程航线上替代了部分四发机型。",
   specs:[["首飞","2013 年"],["载客","约 350–410 人"],["航程","约 16100 km"],["机身宽","5.96 m"]],
   feats:["复合材料占比超过 50%，机身更轻、抗腐蚀","客舱气压可维持在更低等效高度，缓解长途疲劳","Trent XWB 是效率最高的现役大涵道比发动机之一"],
   subject:"an Airbus A350-1000 twin-engine wide-body airliner, white fuselage with black cockpit mask and elegant winglets"},
  {id:"plane-04", cat:"plane", name:"波音 787-9", en:"Boeing 787-9 Dreamliner",
   tag:"舷窗可调光的梦想客机",
   intro:"787 是第一架以复合材料为主的宽体客机，取消了传统引气系统，改用电动压缩机，带来更大的舷窗、更高湿度与更低客舱高度。",
   specs:[["首飞","2009 年"],["载客","约 290 人（两级）"],["航程","约 14140 km"],["复合材料占比","约 50%"]],
   feats:["舷窗加大并用电致调光取代遮光板","取消发动机引气，采用电动环境控制系统","油耗比同级别上一代机型低约 20%"],
   subject:"a Boeing 787 Dreamliner in flight, white and blue livery, large windows and raked wingtips"},
  {id:"plane-05", cat:"plane", name:"中国商飞 C919", en:"COMAC C919",
   tag:"中国自主研制的单通道干线客机",
   intro:"C919 于 2017 年首飞、2023 年投入商业运营，采用超临界机翼与 LEAP-1C 发动机，瞄准全球需求最大的 150 座级单通道市场。",
   specs:[["首飞","2017 年"],["商业运营","2023 年"],["座级","158–192 座"],["航程","约 4075–5555 km"]],
   feats:["中国首款按国际适航标准自研的干线客机","客舱为 3-3 布局并采用大尺寸行李箱","已开启多架交付与多条航线运营"],
   subject:"a COMAC C919 narrow-body airliner, white fuselage with green and blue tail livery, twin engines under wing"},
  {id:"plane-06", cat:"plane", name:"空客 A320neo", en:"Airbus A320neo",
   tag:"全球在役数量最多的单通道系列新成员",
   intro:"A320neo 通过换装新发动机与加装鲨鳍小翼，把油耗降低约 15%–20%，是 A320 家族史上最畅销的改型。",
   specs:[["首飞","2014 年"],["座级","165–195 座"],["航程","约 6300 km"],["发动机","LEAP-1A 或 PW1100G"]],
   feats:["A320 系列是全球交付量最大的客机家族","neo 版本可选两种新一代发动机","衍生出超远程型 A321XLR，航程约 8700 km"],
   subject:"an Airbus A320neo short-to-medium range twinjet, white fuselage with blue tail, sharklet wingtips"},
  {id:"plane-07", cat:"plane", name:"波音 777-300ER", en:"Boeing 777-300ER",
   tag:"双发宽体中运力与航程的长期标杆",
   intro:"777 是首款完全由计算机设计的波音客机，777-300ER 以双发实现接近四发的航程与载客量，长期是跨洋远程航线的主力。",
   specs:[["首飞","1994 年（777）"],["载客","约 396 人（两级）"],["航程","约 13650 km"],["发动机","GE90-115B"]],
   feats:["GE90-115B 单台推力约 52 吨，长期保持世界纪录","三轴六轮主起落架承载更大重量","推动了双发跨洋 ETOPS 运营的普及"],
   subject:"a Boeing 777-300ER long-range twinjet, large engine nacelles, white fuselage with airline blue tail"},
  {id:"plane-08", cat:"plane", name:"安托诺夫 An-124", en:"Antonov An-124 Ruslan",
   tag:"现役最大的量产运输机之一",
   intro:"An-124 于 1982 年首飞，四台 D-18T 发动机，最大载重 150 吨，配备可跪式起落架与前后贯通货舱，是超大型货物空运的主力。",
   specs:[["首飞","1982 年"],["最大载重","150 t"],["最大起飞重量","402 t"],["动力","4 台 D-18T 涡扇"]],
   feats:["现役最大的量产货机之一，可承运卫星、直升机与整列车厢","起落架可下跪以降低货舱地板高度","货舱前后贯通，货物可整件直进直出"],
   subject:"an Antonov An-124 heavy cargo aircraft with high wing and four engines, nose cargo door open"},

  /* ===================== 轮船 · 客运 ===================== */
  {id:"ship-pax-01", cat:"ship-pax", name:"海洋标志号", en:"Icon of the Seas",
   tag:"全球吨位与载客量最大的邮轮",
   intro:"2024 年首航的海洋标志号以约 25 万总吨成为史上最大邮轮，使用 LNG 动力，把八大主题街区与七座泳池装进一座海上城市。",
   specs:[["首航","2024 年"],["总吨位","约 248663 GT"],["最大载客","约 7600 人"],["动力","LNG 液化天然气"]],
   feats:["全球吨位与载客量最大的邮轮","首次在邮轮上设置大跨度悬空无边泳池","采用燃料电池与岸电等减排配置"],
   subject:"the world's largest cruise ship, white hull with bold blue and turquoise artwork on the bow, many decks with glass canopies"},
  {id:"ship-pax-02", cat:"ship-pax", name:"海洋交响号", en:"Symphony of the Seas",
   tag:"绿洲级邮轮的代表作",
   intro:"绿洲级把「中央公园」和「海滨大道」两条开放式街区搬上船，海洋交响号 2018 年首航，长期是加勒比航线的旗舰。",
   specs:[["首航","2018 年"],["总吨位","约 228081 GT"],["最大载客","约 6680 人"],["甲板层数","18 层"]],
   feats:["船上中央公园种植两万余株真实植物","首个海上滑道「终极深渊」设在船尾悬空段","开放式街区布局被后续大型邮轮广泛借鉴"],
   subject:"a giant Oasis-class cruise ship with an open central park district of real trees and a boardwalk, white hull"},
  {id:"ship-pax-03", cat:"ship-pax", name:"玛丽皇后二号", en:"Queen Mary 2",
   tag:"唯一仍在定期跨大西洋的远洋班轮",
   intro:"2004 年首航的玛丽皇后二号延续了跨大西洋班轮的百年传统，定期往返南安普顿与纽约，是当代唯一按班轮标准建造的大型客船。",
   specs:[["首航","2004 年"],["总吨位","约 149215 GT"],["载客","约 2691 人"],["最高航速","约 30 节"]],
   feats:["当代唯一定期跨大西洋的远洋班轮","少数可承运宠物并专设犬舍的客船","船体为强化冰区结构，可执行环球航线"],
   subject:"a classic ocean liner with red and black funnel and long dark hull, transatlantic liner profile"},
  {id:"ship-pax-04", cat:"ship-pax", name:"爱达·魔都号", en:"Adora Magic City",
   tag:"中国首艘国产大型邮轮",
   intro:"2024 年商业首航的爱达·魔都号由上海外高桥造船建造，标志着中国成为第五个能建造大型邮轮的国家，运营母港为上海。",
   specs:[["首航","2024 年"],["总吨位","约 13.55 万 GT"],["载客","约 5246 人"],["建造","上海外高桥造船"]],
   feats:["中国建造的第一艘大型邮轮，船体零件量级相当于数十架大型客机","船上融入敦煌艺术等本土文化主题","带动国内邮轮配套产业链成形"],
   subject:"a large modern cruise ship with blue and white hull and Chinese cultural art motifs on the bow"},
  {id:"ship-pax-05", cat:"ship-pax", name:"迪士尼愿望号", en:"Disney Wish",
   tag:"把主题乐园搬上船的 LNG 邮轮",
   intro:"2022 年首航的迪士尼愿望号由迈尔船厂建造，是全球首批 LNG 动力邮轮之一，以沉浸式主题餐厅与舞台演出为特色。",
   specs:[["首航","2022 年"],["总吨位","约 144000 GT"],["载客","约 4000 人"],["动力","LNG 液化天然气"]],
   feats:["首批以 LNG 为主燃料的大型邮轮","船上设有城堡主题大堂与沉浸式餐厅","延续迪士尼邮轮的主题客房与轮换演出体系"],
   subject:"a modern LNG cruise ship with dark navy hull and gold accents, playful family-oriented design with a fairytale castle motif"},
  {id:"ship-pax-06", cat:"ship-pax", name:"MSC 欧罗巴号", en:"MSC World Europa",
   tag:"LNG 动力的超大型邮轮",
   intro:"MSC 欧罗巴号 2022 年投入运营，约 21.5 万总吨，采用 LNG 动力并预留燃料电池，是欧洲船厂建造的最大邮轮之一。",
   specs:[["首航","2022 年"],["总吨位","约 215863 GT"],["最大载客","约 6762 人"],["动力","LNG + 燃料电池试验"]],
   feats:["船上有一条贯穿全船的海滨大道与螺旋滑道","搭载固体氧化物燃料电池试点系统","LNG 动力显著降低硫氧化物与颗粒物排放"],
   subject:"an ultra large LNG cruise ship with a long open promenade along the hull and a spiral slide, dark blue and white livery"},
  {id:"ship-pax-07", cat:"ship-pax", name:"全球号", en:"The World",
   tag:"全球最大的私人住宅邮轮",
   intro:"2002 年下水的全球号卖的不是船票，而是把 165 套公寓卖给个人业主，由业主投票决定航线与停靠港，船就是一座漂流的社区。",
   specs:[["首航","2002 年"],["总吨位","约 43788 GT"],["公寓","165 套"],["载客","约 200–300 人"]],
   feats:["全球唯一以私人产权公寓运营的大型船舶","航线由业主委员会投票决定","长期连续环球航行，不设母港"],
   subject:"a private residential cruise ship, elegant white hull with balconies along every deck"},
  {id:"ship-pax-08", cat:"ship-pax", name:"塔林客 Megastar", en:"Tallink Megastar",
   tag:"LNG 动力的高速穿梭渡轮",
   intro:"Megastar 号 2017 年在赫尔辛基—塔林航线投入运营，是首批使用 LNG 动力的穿梭渡轮之一，把两小时跨海航程变成了通勤线路。",
   specs:[["投入运营","2017 年"],["总吨位","约 49200 GT"],["载客","约 2800 人"],["载车","约 150 辆（含货车）"]],
   feats:["首批 LNG 动力穿梭渡轮之一，显著降低波罗的海航线排放","双燃料主机可在柴油与 LNG 之间切换","把跨境航线做成高频通勤班次"],
   subject:"a modern LNG powered shuttle ferry with blue and white livery crossing the Baltic sea"},

  /* ===================== 轮船 · 货运 ===================== */
  {id:"ship-cargo-01", cat:"ship-cargo", name:"MSC Irina", en:"MSC Irina",
   tag:"全球载箱量最大的集装箱船",
   intro:"MSC Irina 于 2023 年交付，可装载 24346 个标准箱，是当前全球载箱量最大的集装箱船，服务于亚欧干线。",
   specs:[["交付","2023 年"],["载箱量","24346 TEU"],["船长","约 399.9 m"],["船宽","61.3 m"]],
   feats:["载箱量居全球现役集装箱船之首","船长与船宽都接近苏伊士运河的通航极限","配套脱硫塔并预留甲醇燃料改装空间"],
   subject:"an ultra large container ship fully stacked with colorful containers, dark blue hull, huge bow"},
  {id:"ship-cargo-02", cat:"ship-cargo", name:"长荣 Ever Ace", en:"Ever Ace",
   tag:"长荣海运的 24000 箱级旗舰",
   intro:"Ever Ace 于 2021 年交付，是长荣海运 A 级集装箱船首艘，载箱量 23992 TEU，长期承担亚欧航线主力。",
   specs:[["交付","2021 年"],["载箱量","23992 TEU"],["船长","399.9 m"],["船宽","61.5 m"]],
   feats:["24000 箱级超大型集装箱船的代表船型","采用双岛式上层建筑与节能船首","配备压载水处理与低硫排放设备"],
   subject:"a 24000 TEU class container ship with green hull, twin-island superstructure, containers stacked high"},
  {id:"ship-cargo-03", cat:"ship-cargo", name:"HMM Algeciras", en:"HMM Algeciras",
   tag:"韩国新一代超大型集装箱船",
   intro:"HMM Algeciras 于 2020 年交付，载箱量 23964 TEU，交付时曾是全球最大集装箱船，同级 12 艘陆续投入亚欧航线。",
   specs:[["交付","2020 年"],["载箱量","23964 TEU"],["船长","399.9 m"],["船宽","61.0 m"]],
   feats:["交付时创下全球最大集装箱船纪录","采用 LNG-ready 双燃料预留设计","搭载智能船舶系统实时监测能耗"],
   subject:"a 24000 TEU class container ship with white and blue hull, ultra wide beam, fully loaded with containers"},
  {id:"ship-cargo-04", cat:"ship-cargo", name:"CMA CGM Jacques Saadé", en:"CMA CGM Jacques Saadé",
   tag:"全球最大的 LNG 动力集装箱船",
   intro:"达飞集团的 Jacques Saadé 于 2020 年交付，载箱量 23112 TEU，是首艘 23000 箱级 LNG 动力集装箱船，可减少约 99% 的硫氧化物排放。",
   specs:[["交付","2020 年"],["载箱量","23112 TEU"],["动力","LNG 双燃料"],["船长","399.9 m"]],
   feats:["首艘 23000 箱级 LNG 动力集装箱船","硫氧化物与颗粒物排放接近零","上层建筑前置、机舱后置的特殊总体布置"],
   subject:"an LNG powered ultra large container ship, dark blue hull with white superstructure at the front, tall containers"},
  {id:"ship-cargo-05", cat:"ship-cargo", name:"中远海运宇宙号", en:"COSCO Shipping Universe",
   tag:"中国船厂建造的 21000 箱级超大型集装箱船",
   intro:"宇宙号由中远海运重工建造，2018 年交付，载箱量 21237 TEU，是中国航运企业运营的最大级别集装箱船之一。",
   specs:[["交付","2018 年"],["载箱量","21237 TEU"],["船长","400 m"],["船宽","58.6 m"]],
   feats:["中国自主设计与建造的 21000 箱级旗舰","采用高效螺旋桨与节能导轮降低油耗","服务亚欧干线与沿线港口"],
   subject:"a 21000 TEU class container ship with white hull and red accents, dense container stacks"},
  {id:"ship-cargo-06", cat:"ship-cargo", name:"Prelude FLNG", en:"Prelude FLNG",
   tag:"世界上最大的浮式结构物",
   intro:"壳牌的 Prelude FLNG 长 488 米、满载排水量超过 60 万吨，直接把海上气田变成液化天然气工厂，无需再建陆地终端。",
   specs:[["投产","2017 年"],["总长","488 m"],["满载排水量","约 60 万吨"],["储存能力","约 17.5 万 m³ LNG"]],
   feats:["目前世界上最大的浮式结构物","可在海上完成开采、液化、储存与转运全流程","可在台风区系泊并抵御恶劣海况"],
   subject:"an enormous floating LNG production facility, boxy industrial topsides on a huge hull, no self-propulsion"},
  {id:"ship-cargo-07", cat:"ship-cargo", name:"Höegh Aurora", en:"Höegh Aurora",
   tag:"全球载车量最大的汽车运输船",
   intro:"2024 年交付的 Höegh Aurora 可装载约 9100 辆汽车，是当前全球载车量最大的汽车运输船（PCTC），采用 LNG 双燃料并预留氨燃料方案。",
   specs:[["交付","2024 年"],["载车量","约 9100 辆"],["动力","LNG 双燃料"],["甲板","14 层（其中 6 层可升降）"]],
   feats:["载车量居全球汽车运输船之首","预留氨燃料改装方案","部分甲板覆盖太阳能板辅助供电"],
   subject:"a very large car carrier vessel with tall boxy enclosed decks and a small superstructure, orange and white hull"},
  {id:"ship-cargo-08", cat:"ship-cargo", name:"Christophe de Margerie", en:"Christophe de Margerie",
   tag:"全球首艘破冰 LNG 运输船",
   intro:"为亚马尔 LNG 项目建造的 Christophe de Margerie 是首艘 Arc7 级破冰 LNG 运输船，可在 2.1 米厚的冰层中自主航行，无需破冰船护航。",
   specs:[["交付","2017 年"],["破冰能力","自主破 2.1 m 冰层"],["动力","双燃料柴电"],["载货","约 17.3 万 m³ LNG"]],
   feats:["全球首艘 Arc7 破冰 LNG 运输船，可全年穿行北极东北航道","采用船尾破冰设计，可倒退破冰航行","双燃料动力可使用船用柴油与蒸发气"],
   subject:"an icebreaking LNG carrier with reinforced bow in arctic ice, red and white hull, four spherical or membrane tanks"},
  /* ===================== 其他 ===================== */
  {id:"other-01", cat:"other", name:"上海磁浮列车", en:"Shanghai Maglev",
   tag:"全球唯一商业运营的高速磁浮线路",
   intro:"2004 年开通的上海磁浮示范运营线连接龙阳路与浦东机场，线路全长约 30 km，采用常导电磁悬浮技术，是高速磁浮唯一的商业样本。",
   specs:[["开通","2004 年"],["线路长度","约 30 km"],["最高时速","300–430 km/h（视班次）"],["悬浮方式","常导电磁悬浮 EMS"]],
   feats:["世界上首条也是目前唯一商业运营的高速磁浮线路","无接触悬浮与导向，没有轮轨摩擦","单程约 7 分 20 秒跑完 30 km"],
   subject:"a high-speed maglev train on an elevated concrete guideway, white body with blue stripe, no wheels visible"},
  {id:"other-02", cat:"other", name:"重庆单轨 2 号线", en:"Chongqing Monorail Line 2",
   tag:"穿楼而过、运量最大的单轨系统",
   intro:"重庆轨道交通 2 号线 2005 年开通，采用跨座式单轨，列车要爬坡、过江、穿过居民楼，李子坝站「轻轨穿楼」成为广为人知的城市奇观。",
   specs:[["开通","2005 年"],["制式","跨座式单轨（橡胶轮胎）"],["编组","4–8 辆"],["最大坡度","约 6%"]],
   feats:["列车从 19 层居民楼的 6–8 层穿过，楼与站同步设计","爬坡与转弯能力远强于地铁，适应山城地形","重庆单轨网络运量居全球单轨系统前列"],
   subject:"a straddle-type monorail train passing directly through a hole in a residential building, hillside city"},
  {id:"other-03", cat:"other", name:"空客 H145", en:"Airbus H145",
   tag:"全球广泛使用的双发轻型直升机",
   intro:"H145（原 EC145）以无轴承主旋翼与双发安全性著称，广泛用于空中救护、警务巡逻、海上风电维护与高原运输。",
   specs:[["载客","最多 10 人"],["最大起飞重量","约 3.8 t"],["动力","双发涡轴"],["航程","约 680 km"]],
   feats:["采用无轴承主旋翼，零件更少、维护更简单","装配医疗担架后成为多国空中救护主力","可在高温高原环境执行任务"],
   subject:"a light twin-engine rescue helicopter with medical livery, white body with orange stripes, hovering low"},
  {id:"other-04", cat:"other", name:"齐柏林 NT 飞艇", en:"Zeppelin NT",
   tag:"现役最大的载人飞艇",
   intro:"齐柏林 NT 长 75 米，内部充氦气、由三台可转向发动机推进，1997 年复飞，至今在德国腓特烈港提供观光飞行。",
   specs:[["长度","75 m"],["气囊","氦气（不可燃）"],["载客","约 12–14 人"],["最高时速","约 125 km/h"]],
   feats:["目前世界最大的现役载人飞艇","采用不可燃的氦气，安全性远高于早期氢气飞艇","发动机可矢量转向，实现垂直起降"],
   subject:"a large modern zeppelin airship with a silver helium envelope flying above a lake and green hills"},
  {id:"other-05", cat:"other", name:"Ski-Doo 雪地摩托", en:"BRP Ski-Doo",
   tag:"雪地摩托的开创者",
   intro:"1959 年庞巴迪推出 Ski-Doo，让机械动力第一次可以大规模地在雪地上行走，如今它是全球雪地摩托的第一品牌。",
   specs:[["首发年份","1959 年"],["最高时速","约 130–160 km/h"],["驱动","履带 + 前置转向滑板"],["用途","通勤 / 救援 / 旅游 / 竞技"]],
   feats:["开创了「雪地摩托」这一车型","在极地与山区承担救援与科考运输","衍生出雪地救援、越野竞技与旅游体验等产业"],
   subject:"a modern snowmobile on fresh deep snow, black and yellow body, front skis and rear track"},
  {id:"other-06", cat:"other", name:"香港山顶缆车", en:"Peak Tram",
   tag:"亚洲第一条缆索铁路，1888 年运营至今",
   intro:"山顶缆车 1888 年投入服务，从香港中环花园道爬升至太平山顶，最陡处坡度达 27 度，是香港最古老的公共交通之一。",
   specs:[["开通","1888 年"],["线路长度","约 1.4 km"],["最大坡度","27 度"],["爬升高度","约 400 m"]],
   feats:["亚洲第一条缆索铁路，运营超过 130 年","采用斜置车厢与阶梯式座椅，坐感不同于普通缆车","第六代车厢 2022 年投入服务"],
   subject:"a red funicular tram on a very steep track climbing a green hillside, dense city skyline in the background"},
  {id:"other-07", cat:"other", name:"22220 型核动力破冰船", en:"Project 22220 Icebreaker",
   tag:"世界最大最强的核动力破冰船",
   intro:"22220 型首舰「北极号」2020 年服役，船长 173.3 米，配两座 RITM-200 反应堆，可连续破开 3 米厚的冰层，为北极航道上的 LNG 船队开道。",
   specs:[["服役","2020 年"],["破冰能力","约 3 m 厚冰"],["排水量","约 33540 t"],["动力","两座 RITM-200 反应堆"]],
   feats:["现役功率最大的核动力破冰船","采用可变吃水设计，兼顾远海与河口航道","为亚马尔 LNG 项目全年通航北极航线提供保障"],
   subject:"a huge red and white nuclear icebreaker smashing through thick arctic ice, tall bridge tower"},
  {id:"other-08", cat:"other", name:"SpaceX 载人龙飞船", en:"SpaceX Crew Dragon",
   tag:"首个商业载人航天的可重复使用飞船",
   intro:"载人龙飞船 2020 年首次载人飞行，把商业载人航天变成现实；飞船可重复使用，返回后经翻修再次执行任务。",
   specs:[["首次载人","2020 年"],["载员","最多 4–7 人"],["动力","8 台 SuperDraco 逃逸发动机"],["发射方式","猎鹰 9 号火箭"]],
   feats:["首次由商业公司完成的载人轨道飞行","配备全自动对接与发射逃逸系统","返回舱可多次复用，降低单位任务成本"],
   subject:"a reusable crewed space capsule with white body and dark heatshield docked to a space station"}
];

/* 分类图标（占位块用，纯描边 SVG） */
var ICONS = {
  car:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13.5 5.6 9a2 2 0 0 1 1.9-1.4h9a2 2 0 0 1 1.9 1.4L20 13.5v3.9H4z"/><circle cx="7.6" cy="17.4" r="1.7"/><circle cx="16.4" cy="17.4" r="1.7"/><path d="M4 13.5h16"/></svg>',
  train:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3.5" width="14" height="12.5" rx="3.2"/><path d="M5 10.5h14"/><circle cx="9.2" cy="13.4" r="1"/><circle cx="14.8" cy="13.4" r="1"/><path d="M8.4 19.5l2.2-3.5"/><path d="M15.6 19.5l-2.2-3.5"/><path d="M6.4 19.5h11.2"/></svg>',
  plane:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10.4 3.6a1.6 1.6 0 0 1 3.2 0v4.9l6.9 4.1v2.4l-6.9-2v3.1l1.9 1.5v1.8l-3.5-1.1-3.5 1.1v-1.8l1.9-1.5v-3.1l-6.9 2v-2.4l6.9-4.1z"/></svg>',
  ship:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v2.6"/><path d="M8.2 9.4V6.1h7.6v3.3"/><path d="M4.4 12.6h15.2l-1.7 4.6a2 2 0 0 1-1.9 1.3H8a2 2 0 0 1-1.9-1.3z"/><path d="M12 9.4v3.2"/><path d="M3 20.4c1.3 0 1.3-1 2.6-1s1.3 1 2.6 1 1.3-1 2.6-1 1.3 1 2.6 1 1.3-1 2.6-1 1.3 1 2.6 1 1.3-1 2.6-1"/></svg>',
  cargo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.2" y="8" width="7.2" height="4.6" rx="1"/><rect x="13.6" y="8" width="7.2" height="4.6" rx="1"/><rect x="3.2" y="3.4" width="7.2" height="4.6" rx="1"/><path d="M4 12.6h16l-1.8 5a2 2 0 0 1-1.9 1.3H7.7a2 2 0 0 1-1.9-1.3z"/></svg>',
  other:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.2l7.6 4.4v8.8L12 20.8 4.4 16.4V7.6z"/><circle cx="12" cy="12" r="2.7"/></svg>'
};

/* ============================ 渲染 ============================ */

var IMG_DIR = "./assets/img/";
/* 图片后缀回退链：图 agent 产出 webp / jpg / png 都能被认出来，不必改代码。 */
var EXTS = ["webp", "jpg", "jpeg", "png"];

/* 顶栏 tab：同一 tabKey 的分类合并成一个 tab（轮船 · 客运 / 货运 → 轮船） */
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
function filePathOf(base, ext){
  return IMG_DIR + base + "." + ext;
}

/* 图片框：占位块永远在 DOM 里，实图加载成功后盖在上面。
   图片缺失 / 后缀不符时依次退回 EXTS 的下一个后缀，全部失败则隐藏 img，露出占位块。 */
function shotHtml(base, title, label, cls, catKey){
  var ext = EXTS[0];
  return '<div class="shot ' + cls + '">' +
      '<div class="shot-ph">' +
        (label ? '<span class="bd">' + escapeHtml(label) + '</span>' : '') +
        '<span class="ic">' + (ICONS[catOf(catKey).icon] || ICONS.other) + '</span>' +
        '<span class="nm">' + escapeHtml(title) + '</span>' +
        '<span class="fp">' + escapeHtml(filePathOf(base, ext)) + '</span>' +
      '</div>' +
      '<img class="shot-img" alt="" data-base="' + escapeHtml(IMG_DIR + base) + '" data-try="0">' +
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
  titleEl.textContent = "全球交通工具图鉴";
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
                     '<span class="cnt">' + items.length + ' 台</span>';
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
        shotHtml(v.id, v.name, null, "", v.cat) +
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

  var badge = document.createElement("div");
  badge.className = "cat-badge";
  badge.textContent = c.zh;
  d.appendChild(badge);

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
    '<button class="copy-btn" id="copyBtn">' + ICON_COPY + '复制提示词</button>' +
    '<div class="file-line">目标文件：<code>' + escapeHtml(filePathOf(v.id, EXTS[0])) + '</code><br>' +
      '放入 <code>assets/img/</code> 后重新打包，占位块会自动被配图替换。</div>';
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
