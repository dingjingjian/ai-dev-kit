/* 中国铁路图鉴 · 数据与渲染（经典脚本，ES2017 基线，无模块 / 无内联事件）
 *
 * 收录口径：写「具体型号」。四类 —— 火车头 / 客运车厢 / 货运车厢 / 著名车站，
 * 同一分类内按问世（或投用）时间从早到晚排列，合起来是中国铁路自 1881 年至今的发展脉络。
 *
 * 数据是唯一真源：
 *   CATS   —— 分类（key / tabZh 顶栏 2 字短名 / note / accent / icon）
 *   ITEMS  —— 条目（id / cat / name / en / kind / era / tag / intro / specs / feats / zh / subject）
 *   IMG_STYLE         —— 车辆类条目图的统一风格前缀（图鉴式侧视插画）
 *   IMG_STYLE_ARCH    —— 车站类条目图的统一风格前缀（建筑正视立面插画）
 *   IMG_STYLE_COVER      —— 车辆类分类封面的风格前缀（写实棚拍静物，道具横排，与条目图分层）
 *   IMG_STYLE_COVER_ARCH —— 车站类分类封面的风格前缀（写实棚拍静物，站台器物横排）
 *   COVER_SUBJECTS       —— 四类封面各摆哪几件道具（英文主体描述，按分类 key 取）
 *
 * 配图：条目图 ./assets/img/<id>.<ext>，分类封面 ./assets/img/cover-<catKey>.<ext>；
 *       文件缺失时页面自动显示占位块（写明期望文件名），补图不需要改代码。
 *       提示词清单由 _dev/gen_image_prompts.py 从本文件派生到 _dev/IMAGE_PROMPTS.md。
 */
(function(){
"use strict";

/* ============================ 配图风格 ============================ */

/* 车辆类（条目图）统一风格：博物馆式侧视插画。
   写法要点：
   1) 先把「性质 + 视角」说清楚，再讲画法，最后集中给负面项；
   2) 「只画一辆车」必须显式写死：动车组类条目只画一节头车，车头只在一端，
      否则模型会把 CRH380A / CR400AF 画成两端都是车头的「双头车」（已实际踩坑）；
   3) 构图用量化短句反复强调「主体只占画面中间一半高度」，压住模型「越大越好看」的默认倾向
      （页面用 object-fit:cover 裁切，主体过高会被卡片切掉）；
   4) 负面项里把「地线 / 轨道」拆开写死：早期版本只写 no ground line，模型仍会横贯画一条轨道线，
      现改为「禁止地平线 + 允许极淡的接触阴影」，两头堵住；
   5) 画面里不得出现任何车型编号、文字、路徽、logo、人物与场景，型号只靠造型本身辨认。 */
var IMG_STYLE = "Clean railway museum technical illustration, one single rail vehicle shown alone in a strict side elevation view, vector-flat illustration with precise proportions and very subtle soft shading, thin dark ink outlines, flat pale warm off-white background completely free of scenery, horizon, sky, buildings, rails and sleepers, no horizontal ground line running across the image, only a very faint soft contact shadow hugging the bottom of the wheels, the vehicle is small in the frame and fully inside it, horizontally centered with an equal empty margin at both ends, occupying only the middle half of the frame height, wide empty background above and below, no text, no letters, no numbers, no logos, no emblems, no flags, no brand marks, no watermarks, no people, landscape 16:9";

/* 车站类（条目图）统一风格：建筑正视立面插画。
   车站是横向很宽的建筑，务必整栋横向居中且不贴画框左右边缘（区别于车辆的「压低高度」）。 */
var IMG_STYLE_ARCH = "Clean architectural elevation illustration of one single railway station building, strict front elevation view, vector-flat illustration with precise proportions and very subtle soft shading, thin dark ink outlines, flat pale warm off-white background completely free of scenery, sky, clouds, trees, roads, vehicles and any horizontal ground line running across the image, only a very faint soft contact shadow hugging the base of the building, the whole building is small in the frame and fully inside it, horizontally centered with an equal empty margin at both sides, occupying only the middle half of the frame width and less than half of the frame height, wide empty background on all sides, no text, no letters, no numbers, no logos, no emblems, no flags, no brand marks, no watermarks, no people, landscape 16:9";

/* ============================ 分类封面风格 ============================ */

/* 分类封面（4 张，列表页每个分组顶部的大图）与条目图分层：
   条目图是图鉴式插画（信息优先），封面要的是**氛围与质感**（视觉优先），
   所以封面改用写实棚拍**静物小品**：同一片浅暖白底上，把该类别的铁路物件**聚成一景**。

   关键：封面是**一个完整画面**，不是「一排摆件」。
   一组物件要有主次、有叠放遮挡、共用一个落脚阴影，读起来像一张拍出来的静物画；
   四张封面共用同一套配方（同底色、同光位、同正交视角、同样的主件 + 陪衬结构、
   同样的占宽与高度区间），才能像同一个系列的封面，而不是四张各画各的素材图。

   封面不画具体车型，理由是三条：
   1) 几何：封面显示框按源图 16:9（960×540）整幅铺满，不再纵向裁切；
      一节车正侧视约 6:1，塞进 16:9 只有两条路——被压短成方盒子
      （旧版封面即如此，车厢又短又高），或者小到看不清。物件没有固定长宽比，
      聚成一景正好吃满整个画面，还不必跟比例较劲。
   2) 叙事：认型号是条目图的活（50 张都是具体型号、都对着实车照片画）；
      封面只要说清「这里是机车 / 客车 / 货车 / 车站」，不必抢条目图的活。
   3) 氛围：动轮与连杆、煤与铁锹、车厢门与皮箱、麻袋与木箱、铸铁站台灯——
      这些物件的材质与做旧，比一台干净的整车更有年代感。

   写法要点：
   1) 不要写 diorama —— 模型把它理解成「沙盘」，会自动补轨道、道砟、地面与地平线；
   2) 轨道 / 道砟 / 地面 / 地平线 / 人物 / 文字逐项写死，只写 no ground line 挡不住；
      但**允许一组物件共用一片极淡的落地阴影**（这是「成景」的关键），前提是不成一条直线；
   3) 必须写清「一件主、其余靠/叠/压在前」，否则模型会把物件等距排成一行摆件；
   4) 一律正交感平视（无透视、无景深），与条目图的正侧视 / 正立面同一套底子。

   画面主体描述见下面的 COVER_SUBJECTS，改景只改那张表。 */
var IMG_STYLE_COVER = "Premium large-format studio photograph of one complete composed still life scene, a small group of Chinese railway objects gathered tightly together as a single arrangement on a seamless flat pale warm off-white studio backdrop, one large dominant object anchoring the group slightly left of center with the smaller pieces leaning against it, resting on it, set down in front of it or stacked behind it so the objects overlap and read as one single picture instead of a row of separate items, the whole group sharing one soft pooled contact shadow where it meets the backdrop, everything seen in a straight-on orthographic view with no perspective, the group fully inside the frame, horizontally centered and spanning about 75 percent of the frame width, the tallest object not more than about 45 percent of the frame height, wide empty backdrop above and below, photorealistic materials, matte painted steel, cast iron, brass, weathered wood, canvas, enamel, glass and coal with believable dents, scratches and patina, soft large-area studio lighting from above and slightly to the front left, gentle ambient occlusion, calm warm neutral palette with an even tonal range, consistent series look, nothing else in the picture: no scenery, no landscape, no horizon, no straight ground line, no visible floor, no sky, no clouds, no rails, no track, no sleepers, no ballast, no gravel, no platform, no buildings, no complete locomotive, no complete carriage, no complete train, no extra objects, no overhead wires, no text, no letters, no numbers, no logos, no emblems, no flags, no brand marks, no watermarks, no people, no hands, landscape 16:9";

var IMG_STYLE_COVER_ARCH = "Premium large-format studio photograph of one complete composed still life scene, a small group of old Chinese railway station fittings gathered tightly together as a single arrangement on a seamless flat pale warm off-white studio backdrop, one large dominant piece anchoring the group slightly left of center with the smaller pieces leaning against it, set down in front of it or stacked behind it so they overlap and read as one single picture instead of a row of separate items, the whole group sharing one soft pooled contact shadow where it meets the backdrop, everything seen in a straight-on orthographic view with no perspective, the group fully inside the frame, horizontally centered and spanning about 75 percent of the frame width, the tallest object not more than about 45 percent of the frame height, wide empty backdrop above and below, photorealistic materials, painted cast iron, riveted steel, pale stone, varnished timber, aged brass, frosted glass and worn leather with believable chipped paint and patina, soft large-area studio lighting from above and slightly to the front left, gentle ambient occlusion, calm warm neutral palette with an even tonal range, consistent series look, nothing else in the picture: no scenery, no landscape, no horizon, no straight ground line, no visible floor or platform surface, no sky, no clouds, no track, no rails, no ballast, no buildings, no station facade, no complete station, no vehicles, no overhead wires, no text, no letters, no numbers, no logos, no emblems, no flags, no brand marks, no watermarks, no people, no hands, landscape 16:9";

/* 分类封面主体描述（英文，直接拼在风格串后面当提示词）：四类各**一景**，
   写法是「一件主件 + 2～3 件陪衬 + 谁靠着谁 / 谁叠在谁前面」，不要写成并列清单。
   只写「是什么 + 材质 + 年代特征」，不写具体型号，也不要点名任何一节的编号。
   改景改这里，然后重跑 python _dev/gen_image_prompts.py。 */
var COVER_SUBJECTS = {
  loco: "the group is built around one large black steam locomotive driving wheel with its polished steel connecting rod, standing upright as the anchor slightly left of center, a round black smokebox door with a brass hinge band leaning against the wheel, an old brass locomotive headlamp with a domed top and a round glass lens set down in front of the wheel, and a worn iron coal shovel resting across a small heap of coal at the wheel's foot",

  pax: "the group is built around one dark green passenger coach door panel with a single large sealed window, a cream beltline strip and a flush handle, standing as the anchor slightly left of center, a scuffed leather and canvas travel trunk with brass corner pieces set down in front of it, a steel vacuum flask and a chipped white enamel mug standing on the trunk, and a folded sleeping berth blanket with a pillow draped over the top of the trunk",

  freight: "the group is built around one deep blue-grey steel gondola wagon side panel with pressed vertical corrugations and one large drop door, standing as the anchor slightly left of center, a full burlap sack leaning against the panel, a slatted wooden crate bound with steel strapping set down in front of the panel, a small heap of coal spilled at its foot, and a single freight wagon wheelset lying on the backdrop to the right",

  station: "the group is built around one low section of a cast iron station platform canopy with a riveted steel truss and glass panels, standing as the anchor slightly left of center, an old cast iron platform lamp post with a domed frosted glass shade standing directly in front of it, a wooden waiting room bench with turned legs and iron armrests set down beside it, and a two wheeled station luggage trolley carrying two leather suitcases tucked behind the bench",
};

/* ============================ 分类 ============================ */

var CATS = [
  {key:"loco", tabKey:"loco", tabZh:"机车", zh:"火车头", en:"Locomotives",
   note:"牵引动力的百年更替：蒸汽 → 内燃 → 电力 → 动车组",
   accent:"#1f6f4f", soft:"#e8f2ec", icon:"loco"},
  {key:"pax", tabKey:"pax", tabZh:"客车", zh:"客运车厢", en:"Passenger Cars",
   note:"从 21 型硬座到 25T 型空调车，坐着出行的方式变了四代",
   accent:"#2f5f9e", soft:"#e9eff8", icon:"pax"},
  {key:"freight", tabKey:"freight", tabZh:"货车", zh:"货运车厢", en:"Freight Cars",
   note:"按货品订制的各式车体：敞车、棚车、罐车、平车与长大货物车",
   accent:"#8a5a1d", soft:"#f6efe2", icon:"freight"},
  {key:"station", tabKey:"station", tabZh:"车站", zh:"著名车站", en:"Stations",
   note:"从京张铁路的小站到亚洲最大的高铁枢纽，站房记录了每个年代",
   accent:"#8c3a3a", soft:"#f7eaea", icon:"station"}
];

/* 分类图标（占位块用，纯描边 SVG） */
var ICONS = {
  loco:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 4.2h6.2l.8 4.6h3.4v5.4H4.6V8.8h3.4z"/><path d="M9.4 4.2v4.6"/><path d="M4.6 14.2h15.2"/><circle cx="8.4" cy="17.4" r="1.8"/><circle cx="15.6" cy="17.4" r="1.8"/></svg>',
  pax:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.6 6.6h14.8v8.2H4.6z"/><path d="M8.2 9.6h2.2"/><path d="M13.6 9.6h2.2"/><path d="M8.2 12.4h2.2"/><path d="M13.6 12.4h2.2"/><path d="M4.6 14.8v1.6h14.8v-1.6"/><circle cx="8.6" cy="18.4" r="1.5"/><circle cx="15.4" cy="18.4" r="1.5"/></svg>',
  freight:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.8 8.4h14.4v8.4H4.8z"/><path d="M4.8 12h14.4"/><path d="M9 8.4v8.4"/><path d="M14.6 8.4v8.4"/><path d="M4.8 16.8v1.4h14.4v-1.4"/><circle cx="8.6" cy="20" r="1.4"/><circle cx="15.4" cy="20" r="1.4"/></svg>',
  station:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.4 19.6h17.2"/><path d="M5.2 19.6V10l6.8-4.4 6.8 4.4v9.6"/><path d="M12 5.6V2.4"/><circle cx="12" cy="12.4" r="2.2"/><path d="M8.6 13.4h6.8"/></svg>'
};

/* ============================ 条目 ============================ */

var ITEMS = [
  /* ===================== 火车头 · 蒸汽 ===================== */
  {id:"loco-01", cat:"loco", name:"龙号机车", en:"Rocket of China",
   kind:"第一台中国造蒸汽机车", era:"1881 年 — 1930 年代",
   tag:"中国铁路的第一台火车头，用废旧锅炉拼出来",
   intro:"1881 年开平矿务局修建唐胥铁路，英国工程师金达（Claude Kinder）主持，在胥各庄修车厂用废旧的卷扬机锅炉和旧车轮拼出这台小型蒸汽机车，被矿工称作「龙号」。它是中国土地上出现的第一种实用铁路牵引动力，唐胥铁路也因此成为中国自己修筑铁路的起点。",
   specs:[["问世时间","1881 年"],["动力类型","燃煤蒸汽"],["轮式","0-6-0 三对动轮"],["运用场合","唐胥铁路运煤 / 工程牵引"]],
   feats:["用矿上的废旧材料拼装而成，是典型的应急之作","英国工程师为它取名「中国火箭」，中文习称龙号","唐胥铁路后来延伸成京山铁路，是中国自办铁路的开端"],
   zh:"一台十九世纪式样的小型水柜式蒸汽机车，短小的圆形锅炉、顶上一根粗矮烟囱和一个蒸汽包，三对很小的动轮，开放式的司机棚在车尾没有包厢，全黑车身没有任何装饰。",
   subject:"a small nineteenth century Chinese industrial tank steam locomotive, very short round boiler with a riveted surface, one short thick smokestack and one small steam dome on top, three pairs of tiny driving wheels, wooden-beam buffer beams front and rear, an open driver platform at the rear with a simple sheet-metal weather board, entirely matte black body, full side elevation"},
  {id:"loco-02", cat:"loco", name:"解放型蒸汽机车", en:"JF Class (Jiefang)",
   kind:"新中国第一台自制干线机车", era:"1952 年 — 1990 年代",
   tag:"新中国自己造出的第一台干线蒸汽机车",
   intro:"1952 年青岛四方机车车辆厂参照满铁遗留的米卡伊型机车，制出新中国第一台干线蒸汽机车，8 月 1 日出厂，当时称「八一」号，后定型为解放型（代号 JF）。此后二十多年间，解放型及其改进型承担了全国干线客货运输的主要牵引任务，也培养出了中国第一代机车设计队伍。",
   specs:[["问世时间","1952 年"],["动力类型","燃煤蒸汽"],["轮式","2-8-2（前进型先祖）"],["构造速度","约 80 km/h"]],
   feats:["结束了中国不能自制干线机车的历史","从此开启二十余年蒸汽机车自主改进与量产","不少改进型一直使用到 1990 年代才退出现役"],
   zh:"一台典型美式风格的干线蒸汽机车，黑色长锅炉、驼峰状的司机室在后部、前面有一个圆形烟箱门和高烟囱，后面拖着一辆四轴煤水车。",
   subject:"a Chinese JF class mainline steam locomotive, long riveted black boiler, single tall smokestack above a large round smokebox with a small round door, a steam dome and sandbox casings along the top of the boiler, a boxy cab at the rear with two side windows, running on a leading bogie and four large driving wheels, coupled to a separate four-axle coal tender, full side elevation"},
  {id:"loco-03", cat:"loco", name:"前进型蒸汽机车", en:"QJ Class (Qianjin)",
   kind:"产量最大的国产蒸汽机车", era:"1956 年 — 2005 年",
   tag:"中国蒸汽机车的天花板，四千多台跑遍干线的货运主力",
   intro:"1956 年大连机车车辆厂参照苏联 FD 型设计出这台大功率干线货运蒸汽机车，初名「和平型」，后更名前进型，代号 QJ。它以巨大的火箱和五对动轮著称，适合长时间重载牵引，累计产量超过四千台，长期是中国干线货运的象征，直到 2005 年集通铁路的最后一批蒸汽机车退役，中国干线蒸汽时代才真正结束。",
   specs:[["问世时间","1956 年"],["轮式","2-10-2 五对动轮"],["构造速度","约 80 km/h"],["典型牵引","干线货运 2500–3000 吨级"]],
   feats:["中国产量最大的干线蒸汽机车，曾一度撑起大部分干线货运量","配六轴大型煤水车，适合长距离不落火运行","1990 年代后逐步被内燃、电力机车替代，2005 年干线退役"],
   zh:"一台体量最大的干线货运蒸汽机车，非常长的黑色锅炉，前部有大直径圆形烟箱和粗烟囱，中段有一个巨大方形蒸汽包，五对巨大的动轮，后部高大方正的司机室拖着一辆六轴大型煤水车。",
   subject:"a Chinese QJ class heavy freight steam locomotive, extremely long riveted black boiler, a large diameter round smokebox with a wide smokestack at the front, one prominent sandbox and steam dome near the middle, a huge angular cab with a tall rectangular side window at the rear, running on a leading bogie and five very large driving wheels, coupled to a long six-axle coal tender with high riveted sides, full side elevation"},
  {id:"loco-04", cat:"loco", name:"人民型蒸汽机车", en:"RM Class (Renmin)",
   kind:"国产客运蒸汽机车", era:"1958 年 — 1990 年代",
   tag:"蒸汽时代里跑得最快的一代国产客运机车",
   intro:"1958 年四方机车车辆厂在胜利型基础上改进，制出人民型干线客运蒸汽机车，代号 RM。它车体包覆线型外罩，司机室视野开阔，构造速度明显高于货运机型，长期担当京广、京沪等干线的旅客列车牵引，1990 年代随着牵引动力换代逐步退出。",
   specs:[["问世时间","1958 年"],["轮式","4-6-2 三对动轮"],["构造速度","约 110 km/h"],["典型用途","干线旅客列车牵引"]],
   feats:["车身加了流线型外罩，是蒸汽时代少见的讲究速度感的设计","动轮直径大，适合高速平稳运行","与胜利型、和平型共同构成中国自行制造客货运蒸汽机车的序列"],
   zh:"一台带流线外包的干线客运蒸汽机车，黑色车体，但锅炉前段有流畅的弧形外壳，前面有圆形烟箱盖和略细的烟囱，三对很大的动轮，司机室两侧是大方窗，尾部拖着煤水车。",
   subject:"a Chinese RM class streamlined passenger steam locomotive, long black boiler partly wrapped in smooth curved sheet-metal casing, round smokebox door and a slim smokestack at the front, a low steam dome centered on the boiler, a roomy cab with two large square side windows at the rear, running on a four-wheel leading bogie and three very tall driving wheels, coupled to a four-axle coal tender with a streamlined top edge, full side elevation"},
  {id:"loco-05", cat:"loco", name:"上游型蒸汽机车", en:"SY Class (Shangyou)",
   kind:"工矿调车的长青机型", era:"1960 年 — 至今",
   tag:"退役最晚、保有量最多的「厂矿老黄牛」",
   intro:"1960 年唐山机车车辆厂针对工矿企业与调车作业设计，代号 SY。它尺寸适中、转向灵活、维修简便，很快成为各大厂矿、港口与地方铁路的标准配置，总产量约一千八百台。干线蒸汽机车全部退役之后，仍有少量上游型在厂区、电厂与观光线路上点火运行，也是出口到海外做旅游观光的中国机型之一。",
   specs:[["问世时间","1960 年"],["轮式","2-8-2 四对动轮"],["构造速度","约 80 km/h"],["典型用途","厂矿运输 / 调车 / 观光线路"]],
   feats:["全国产量约一千八百台，是工矿企业最常见的蒸汽机型","结构简单、可靠性高，非常适合频繁启停的调车作业","至今仍有少量在厂区与旅游线路上运用，也是摄影常见的机型"],
   zh:"一台中等尺寸的工矿蒸汽机车，短粗的黑色锅炉，头顶一个圆保安阀和一个方形司机室，四对的动轮，车身前后都有排障器和牵引发电小刚梯，尾部跟着一辆较小的煤水车。",
   subject:"a Chinese SY class shunting steam locomotive, compact heavy-set black boiler with an external steam pipe running along its side, a plain smokestack and a round smokebox door at the front, small sandbox boxes on top with round handrails, a boxy cab with two square windows at the rear, four medium driving wheels with a small leading bogie, angled snowplow pilot beam at the very front, coupled to a short four-axle coal tender, full side elevation"},

  /* ===================== 火车头 · 内燃 ===================== */
  {id:"loco-06", cat:"loco", name:"东风型内燃机车", en:"DF (Dongfeng) Diesel-electric",
   kind:"中国第一台干线内燃机车", era:"1958 年 — 1990 年代",
   tag:"告别烧煤的第一代国产牵引动力",
   intro:"1958 年大连机车车辆厂试制成功中国第一台干线内燃机车，命名为「东风」型。它用柴油机发电再驱动牵引电动机，不需要锅炉与给水，启动快、续航长，操控条件也远好于蒸汽机车。东风系列的命名此后沿用数十年，成为中国内燃机车的基本谱系。",
   specs:[["问世时间","1958 年"],["动力类型","柴油发电机组驱动牵引电动机"],["标定功率","约 1500 kW 级"],["典型用途","干线客货牵引"]],
   feats:["中国自己试制的第一代干线内燃机车，代号 DF","电传动方式让柴油机始终工作在高效转速区间","东风系列此后发展出 DF4、DF8、DF11 等一整条谱系"],
   zh:"一台早期国产电传动内燃机车，方正的长车体，车顶两端略带弧度，侧墙上部一列竖向的散热百叶窗、下部若干方形进风窗，前后各有一个司机室开着宽大的前窗，下方两台三轴转向架。",
   subject:"an early Chinese DF class diesel-electric locomotive, long rectangular boxy body with gently rounded roof ends, a row of vertical engine-room ventilation louvers along the upper flank and several square air-intake grilles along the lower flank, a cab at each end with angled front windows, riding on two three-axle bogies with visible axle boxes, plain single-tone dark body paint, full side elevation"},
  {id:"loco-07", cat:"loco", name:"东风4型内燃机车", en:"DF4B Diesel-electric",
   kind:"使用最广的国产内燃机车", era:"1969 年 — 至今",
   tag:"中国铁路内燃化里的绝对主力，几千台跑遍全国",
   intro:"1969 年大连机车车辆厂制成第一台东风4型内燃机车，1982 年改进定型为 DF4B。它采用大功率柴油机与交直流电传动，功率与牵引力兼顾，可靠性高、检修方便，很快成为干线货运与客运的主要牵引机型，产量数以千计。几十年过去，DF4 系列仍在多条支线与货运线路上服役，是中国铁路技术图鉴里绕不开的一页。",
   specs:[["问世时间","1969 年（1982 年定型 DF4B）"],["动力类型","柴油机驱动发电机，直流牵引电动机"],["标定功率","约 2400 kW 级"],["构造速度","货运约 100 km/h / 客运约 120 km/h"]],
   feats:["东风系列中产量最大、运用最广的机型之一","交直流电传动结构简单可靠，适合大规模长期运用","至今仍在支线货运与调车作业中服役"],
   zh:"一台典型的 DF4B 内燃机车，两端是高起的司机室、中间为低矮的机械间，车体侧面一列高大的散热百叶窗和两组圆形通风口，车顶平整，深绿车身配一条奶黄色横腰带，下方两台三轴转向架。",
   subject:"a Chinese DF4B diesel-electric locomotive, long low body made of a prominent central engine compartment and two taller driver cabs at each end with sloped front windows and a rounded roof cap, rows of tall vertical ventilation louvers and two large round roof fans on top, two three-axle bogies underneath, dark green body with a wide cream horizontal stripe running below the roof line, full side elevation"},
  {id:"loco-08", cat:"loco", name:"东风5型内燃机车", en:"DF5 Shunter",
   kind:"车站与编组场调车机车", era:"1976 年 — 至今",
   tag:"不跑干线的幕后角色，把一列车的车厢编组起来",
   intro:"东风5型是1976 年试制、1984 年改进定型的调车兼小运转内燃机车。它功率适中、车体短，外走廊式车体上司机室只设在车体一端，视野开阔，适合在编组站、货场与专用线上往返推送车列，承担解体、编组与取送作业，是铁路里作业频次最高的一类机车。",
   specs:[["问世时间","1976 年（1984 年改进定型）"],["动力类型","柴油机驱动牵引电动机"],["标定功率","约 1200 kW 级"],["典型用途","编组站调车 / 小运转 / 专用线取送"]],
   feats:["车体短、转弯半径小，适应站场密集道岔","外走廊式车体，司机与调车人员沿车侧走台作业，观察车列方便","是铁路作业频次最高的车型之一，也承担部分小运转列车"],
   zh:"一台外走廊式调车机车，全车只有一端有司机室：司机室在前，后面是长长的低矮动力室，车尾是一道平直的机械间端墙（不要画第二个司机室，画面里只出现一个车头）；车身侧面是成列的散热百叶窗与若干检修门，车体两侧有带栏杆的贯通走台，橙黄涂装配白色腰带、车头排障器上有红白斜条，下方两台三轴转向架。",
   subject:"a short Chinese DF5 diesel shunting locomotive shown in strict side elevation with exactly one driver cab, the cab at the LEFT end only with large windows and a flat slightly raked front, the rest of the body running back as a low full-length engine compartment ending in a plain flat vertical end wall at the RIGHT end with no second cab and no second windshield anywhere in the picture, full-length external side walkway with pipe handrails running the whole length of the body, rows of vertical ventilation louvers and a few square access doors along the flank, small exhaust stack and roof hatches on top, warm orange-yellow livery with a white waist band, red and white striped snowplow pilot beam at the front, two three-axle bogies, full side elevation"},
  {id:"loco-09", cat:"loco", name:"东风11型内燃机车", en:"DF11 High-speed Diesel",
   kind:"准高速客运内燃机车", era:"1992 年 — 至今",
   tag:"九十年代铁路大提速的主力，内燃客运的顶点",
   intro:"1992 年戚墅堰机车车辆厂制成东风11型准高速客运内燃机车，功率与速度都明显高于此前的国产客运内燃机型，先后投入广深准高速铁路与京沪、京广等线路，是中国铁路几次大提速中最常见的一客运牵引机车。在电气化尚未覆盖的年代，它是特快列车最可靠的高速牵引形式。",
   specs:[["问世时间","1992 年"],["标定功率","约 3600 kW 级"],["构造速度","约 170 km/h"],["典型用途","准高速与特快旅客列车牵引"]],
   feats:["国产内燃客运机车速度最高的一类，承担多轮提速任务","采用了当时较先进的电子恒功率励磁与微机控制系统","与 25K、25T 型提速客车长期搭配使用"],
   zh:"一台流线感较强的客运内燃机车，车体较长，前脸是明显后倾的斜面司机窗，车顶有空调机组，侧面几处方形散热窗，白蓝红三色涂装和一条宽腰带。",
   subject:"a Chinese DF11 high-speed passenger diesel-electric locomotive, long streamlined body with a smoothly sloped nose and a raked windshield at the driver cab, roof-mounted air conditioning unit behind the cab, several square ventilation grilles along the flank, dark blue and white livery split by a wide horizontal band with a thin red line, two three-axle bogies, full side elevation"},
  {id:"loco-10", cat:"loco", name:"东风8B型内燃机车", en:"DF8B Heavy-haul Diesel",
   kind:"大功率重载货运机车", era:"1997 年 — 至今",
   tag:"一车拉动五千吨的内燃重载担当",
   intro:"1997 年戚墅堰机车车辆厂在 DF8 基础上推出东风8B型大功率重载货运内燃机车，采用更大功率的柴油机与重轴重转向架，单机可牵引数千吨的货物列车，主要服务于煤炭、矿石等大宗货物运输线路。它也是非电气化重载干线上牵引重车的主要机型之一。",
   specs:[["问世时间","1997 年"],["标定功率","约 3600 kW 级"],["轴重","约 25 吨"],["典型牵引","5000 吨级重载列车"]],
   feats:["国产大功率内燃货运机车，单机牵引量显著高于同级别","采用重轴重设计，兼顾牵引力与线路适应性","长期服务于煤炭运输通道与非电气化干线"],
   zh:"一台体量厚重的重载内燃机车，车体高大、正面方正，车顶一段散热器配两个大冷却风扇，侧面多组百叶窗，蓝白涂装并在司机室附近有斜向饰带，下方两台重载三轴转向架。",
   subject:"a heavy Chinese DF8B diesel freight locomotive, tall boxy body with a flat front face and a wide single front window band, roof-mounted radiator section with several large round cooling fans, clusters of square ventilation louvers along the flank, two heavy three-axle bogies with visible brake rigging, dark blue and cream livery split by a broad diagonal band near the cab, full side elevation"},

  /* ===================== 火车头 · 电力 ===================== */
  {id:"loco-11", cat:"loco", name:"韶山1型电力机车", en:"SS1 Electric",
   kind:"中国第一台干线电力机车", era:"1958 年 — 1990 年代",
   tag:"从架空线取电，中国电气化铁路从这里起步",
   intro:"1958 年株洲电力机车厂与湘潭电机厂联合试制出中国第一台干线电力机车，1968 年改进定型为韶山1型并投入批量生产。它通过车顶受电弓从接触网取电，早期用引燃管整流、后期改用硅整流，功率大、无需补水燃料，特别适合长隧道与长大坡道线路，是宝成铁路等早期电气化线路的主力机型。",
   specs:[["问世时间","1958 年（1968 年定型量产）"],["供电方式","单相工频交流 25 kV 接触网"],["持续功率","约 3800 kW 级"],["构造速度","约 90 km/h"]],
   feats:["中国干线电气化铁路的第一代主型电力机车","由引燃管整流改进为硅整流，可靠性大幅提升","奠定了此后韶山系列电力机车的基本格局"],
   zh:"一台早期国产干线电力机车，箱型车体略带圆角，车顶正中架着一副菱形受电弓，两端各有一个司机室与前窗相连的侧窗，侧面数个小圆窗，绿色涂装，两端顶部有两盏大前照灯。",
   subject:"an early Chinese SS1 electric locomotive, boxy riveted body with slightly rounded corners and a flat roofline, one diamond-shaped pantograph mounted centrally on the roof, a cab at each end with a large square front window and a small round porthole-like side window, rows of small ventilation louvers along the flank, deep green body with cream window band, front headlight housings above the buffer beams, two three-axle bogies, full side elevation"},
  {id:"loco-12", cat:"loco", name:"韶山3型电力机车", en:"SS3 Electric",
   kind:"第二代国产电力机车", era:"1978 年 — 至今",
   tag:"换上硅整流的「二世祖」，八十年代的干线主力",
   intro:"1978 年株洲电力机车厂制成韶山3型电力机车，采用半导体桥式整流与相控调压，性能较 SS1 明显提升，既可牵引货物列车也能牵引旅客列车。它在二十世纪八十至九十年代大量投产，产量一度居国产电力机车前列，是中国电气化铁路扩张时期最典型的机型之一。",
   specs:[["问世时间","1978 年"],["整流方式","硅半导体桥式整流"],["持续功率","约 4300 kW 级"],["构造速度","约 100 km/h"]],
   feats:["采用半导体整流调压，牵引特性比第一代电力机车明显改善","客货两用，在恶劣工况下仍保持较高可靠性","产量大、分布广，是八十至九十年代电气化干线上的常见面孔"],
   zh:"一台方箱型电力机车，车体侧面是成排的竖向百叶窗，车顶中部一副受电弓、两侧有一列条形电阻带，两端司机室连排窗，通体深绿色带浅色腰带，两台三轴转向架。",
   subject:"a Chinese SS3 electric locomotive, long angular box body, rows of narrow vertical ventilation louvers running along the flanks, one diamond pantograph on the roof flanked by flat resistor banks, a cab at each end with two wide windows, thick buffer beams at both ends, dark green livery with a light horizontal window-level stripe, two three-axle bogies, full side elevation"},
  {id:"loco-13", cat:"loco", name:"韶山4型电力机车", en:"SS4 Heavy-haul Electric",
   kind:"重载货运电力机车", era:"1985 年 — 至今",
   tag:"两节机车重联，把万吨煤炭拉出矿区",
   intro:"1985 年株洲电力机车厂推出韶山4型电力机车，采用两节完全相同的四轴机车重联、八轴同时驱动的形式，功率比单机型大幅提高，主要用于大秦铁路等重载通道牵引万吨级煤炭列车。它是国产重载货运电力机车的代表机型，也为后来和谐型大功率交流传动机车积累了经验。",
   specs:[["问世时间","1985 年"],["轴式","2×(Bo-Bo) 双节重联"],["持续功率","约 6400 kW 级"],["典型牵引","重载货物列车"]],
   feats:["双节重联设计让单机功率提升一倍，适配万吨级重载列车","在大秦铁路等煤炭运输通道长期担当主力","为后来 SS4G 改进型与大功率交流传动机车铺路"],
   zh:"一台双节重联的重载货运电力机车，两节几乎相同的短车体首尾相连，每节车顶各有一副受电弓，车体方正满是百叶窗，通身墨绿色，全车共有四台两轴转向架。",
   subject:"a Chinese SS4 heavy-haul electric locomotive consisting of two identical short four-axle units coupled back to back, each unit with its own central pantograph on the roof, angular boxy bodies densely covered with vertical ventilation louvers and square inspection hatches, cabs only at the two outer ends with wide flat windshields, matte dark green livery with a thin light stripe, four two-axle bogies in total, full side elevation"},
  {id:"loco-14", cat:"loco", name:"韶山8型电力机车", en:"SS8 High-speed Electric",
   kind:"准高速客运电力机车", era:"1997 年 — 至今",
   tag:"把旅客列车拉进 200 km/h 时代的国产机型",
   intro:"1997 年株洲电力机车厂制成韶山8型客运电力机车，功率集中在两台转向架上、轴重轻、速度快，专门用于牵引提速后的特快旅客列车。它在 1990 年代末的试验中跑出当时中国铁路的最高速度，直接推动了此后广深、京广等干线的提速实践。",
   specs:[["问世时间","1997 年"],["轴式","Bo-Bo 两轴转向架"],["持续功率","约 3600 kW 级"],["构造速度","约 170 km/h"]],
   feats:["国产 Bo-Bo 客运电力机车中速度等级最高的一型","1990 年代末的试验速度创下当时中国铁路的最高纪录","长期牵引直达特快列车，是提速时代的代表机型"],
   zh:"一台流线化的客运电力机车，前脸明显后倾并有一整块大弧面风挡玻璃，车顶一副受电弓，侧面简约，银灰或蓝白涂装并有一条深色饰带，两台两轴转向架。",
   subject:"a Chinese SS8 high-speed passenger electric locomotive, body with a strongly sloped streamlined nose front and rear and one large curved windshield panel at each cab, one diamond pantograph on the roof center, smooth nearly flush flanks with small ventilation slots, silver-grey body with a deep blue lower band and a thin red pinstripe, two two-axle bogies, full side elevation"},
  {id:"loco-15", cat:"loco", name:"和谐电3型电力机车", en:"HXD3 Electric",
   kind:"交流传动货运电力机车", era:"2006 年 — 至今",
   tag:"引进再国产化，把干线货运带进交流传动时代",
   intro:"2006 年起由大连机车车辆厂引进技术生产、后实现国产化的和谐电3型电力机车，采用大功率交流异步牵引电机与微机网络控制，牵引力大、粘着利用好、维护量低。它主要用于大宗货物与煤炭运输通道，可单机牵引数千吨列车，是「和谐型」大功率机车家族中数量最大的一档。",
   specs:[["问世时间","2006 年"],["传动方式","交—直—交流传动"],["标定功率","约 7200 kW 级"],["构造速度","约 120 km/h"]],
   feats:["交流异步牵引电机免维护特性好，适合长年高强度运用","功率约为此前国产直流传动机车的两倍以上","与交流传动客运机型共同构成和谐型大功率机车系列"],
   zh:"一台现代大功率货运电力机车，车体修长，两端司机室带倾斜的大玻璃，车顶两副受电弓那排银色母线贯通道，侧面几处简洁的百叶窗模块，蓝白相间的涂装，两台三轴转向架。",
   subject:"a modern Chinese HXD3 high-power AC electric freight locomotive, long clean boxy body with gently raked cab fronts and wide panoramic windshields, two diamond pantographs on the roof linked by a straight roof busbar, smooth flanks broken only by compact ventilation modules and a continuous row of small square windows, bold blue and white livery with a diagonal colour break at each cab, two three-axle bogies, full side elevation"},
  {id:"loco-16", cat:"loco", name:"和谐电3D型电力机车", en:"HXD3D Electric",
   kind:"准高速客运电力机车", era:"2013 年 — 至今",
   tag:"今天普速火车最常见的牵引机车",
   intro:"2013 年由大连机车车辆厂研制的和谐电3D型客运电力机车，功率大、起动加速快，同时具备向客车供电的能力，可以整列牵引 25T 型空调客车按 160 km/h 运行。它大量投入使用后,成为直达、特快旅客列车的主力机型，也是近年普速线路上最常见的客运机车。",
   specs:[["问世时间","2013 年"],["标定功率","约 7200 kW 级"],["构造速度","160 km/h"],["列车供电","可向客车整列供电"]],
   feats:["兼顾大功率与 160 km/h 速度等级，适配准高速客运","自带列车供电系统，免去加挂发电车","是目前普速客运线路上运用最普遍的客运电力机车"],
   zh:"一台现代客运电力机车，车体平滑、两端司机室为倾斜的流线大窗，车顶两副受电弓和贯通母线，侧面近无百叶窗只有几道简洁散热口，白蓝或红黄涂装，两台三轴转向架。",
   subject:"a modern Chinese HXD3D high-power electric passenger locomotive, sleek body with smoothly sloped cab fronts and large panoramic windshields, two roof pantographs with a connecting busbar, nearly flush smooth flanks with a few narrow slot vents, white base colour with broad blue sweeping panels along the lower body and thin gold lines, two three-axle bogies, full side elevation"},
  /* ===================== 火车头 · 动车组 ===================== */
  {id:"loco-17", cat:"loco", name:"CRH2 型动车组", en:"CRH2 EMU (Hexie)",
   kind:"和谐号高速动车组", era:"2007 年 — 至今",
   tag:"中国高铁第一批主力车型，从引进技术到批量国产",
   intro:"2007 年 4 月 18 日全国铁路第六次大提速，由南车四方引进日本川崎重工 E2 系技术制造的 CRH2 型动车组投入运用，担当时速 200–250 公里的动车组列车，是「和谐号」家族里投放最早、数量最多的一支。此后在它的基础上发展出 CRH2A、CRH2B、CRH2C 等衍生型号，既有线提速与早期高铁线上都留下过它的身影，也为后来的 CRH380A 积累了设计与制造经验。",
   specs:[["问世时间","2007 年（第六次大提速投用）"],["技术来源","引进日本新干线 E2 系技术"],["编组形式","8 辆动力分散（4 动 4 拖）"],["最高运营速度","250 km/h"]],
   feats:["中国铁路第六次大提速的开路车型，第一批大规模量产的和谐号","引进消化吸收后实现国产化，衍生出 CRH2A / 2B / 2C 等多个型号","银白车身配浅蓝腰带的车头造型，是很多人对「高铁」的第一印象"],
   zh:"一台和谐号动车组的头车（只画一节车，车头只出现在画面左端），银白色细长车体，车头是较长而下探的流线鼻端，鼻端上方的风挡玻璃大而倾斜，车体侧面一条浅蓝色腰带走在车窗下方、到车头处微微上挑，车窗是连续的黑边大窗，车顶浅灰配一列空调罩，右端为与车厢相接的平断面，不要画成两端都有车头。",
   subject:"a CRH2 Chinese high-speed EMU head car shown alone in strict side elevation, exactly one vehicle in the frame, long slim white aluminium body with a light grey roof, a moderately long smoothly tapering streamlined nose at the LEFT end only, the nose dipping low and ending in a rounded blunt tip, one large steeply raked windshield, a continuous dark-surround window band running along the coach, one light blue waist stripe below the windows sweeping up and wrapping around the low nose tip as a thin arc, flush air-conditioning fairings on the roof, the RIGHT end is a plain flat coach end wall with a gangway connection and no nose, do NOT draw a nose or a second cab at the right end and do NOT draw two head cars coupled together, full side elevation"},
  {id:"loco-18", cat:"loco", name:"CRH380A 型动车组", en:"CRH380A EMU (Hexie)",
   kind:"和谐号高速动车组", era:"2010 年 — 至今",
   tag:"把中国高铁推到 486 km/h 的和谐号明星",
   intro:"2010 年由南车青岛四方机车车辆股份有限公司研制的 CRH380A 型高速动车组投入运用，主要在京沪、武广等高速线上担当 300–350 km/h 级别的运营。它采用轻量化铝合金车体与低阻力流线车头，2010 年 12 月在京沪高铁先导段跑出 486.1 km/h 的试验速度，此后长期是中国高铁的主力车型之一。",
   specs:[["问世时间","2010 年"],["编组形式","8 辆短编 / 16 辆长编动力分散"],["最高运营速度","350 km/h"],["试验速度","486.1 km/h（2010 年）"]],
   feats:["动力分散布置，加速快、轴重轻、车体轻量化的铝合金结构","试验速度 486.1 km/h 是当时轮轨交通的高位记录","与后来的复兴号共同构成中国高速列车的主力阵容"],
   zh:"一台银白涂装的高速动车组的头车（只画一节车，车头只出现在画面左端），车厢细长、高度很低，车头是细长的尖喙式流线鼻端，鼻翼两侧各有一个小圆头灯，司机窗为梯形并向后延伸成黑带，车体侧面一条蓝色饰带贯穿车窗下方，车窗为连续带式的密接车窗，右端是与车厢相接的平断面，不要画成两端都有车头。",
   subject:"a CRH380A Chinese high-speed EMU head car shown alone in strict side elevation, exactly one vehicle in the frame, long slim aluminium body, very long smoothly tapering streamlined nose at the LEFT end only ending in a low pointed tip, two small round headlights set into the nose shoulders, steeply raked trapezoid cab window merging into a black window band running along the coach, a continuous row of flush fitting windows, silver-white body with a single horizontal blue stripe, the RIGHT end is a plain flat coach end wall with a gangway connection and no nose, do NOT draw a nose or a second cab at the right end and do NOT draw two head cars coupled together, full side elevation"},
  {id:"loco-19", cat:"loco", name:"CR400AF 复兴号动车组", en:"CR400AF Fuxing EMU",
   kind:"中国标准动车组", era:"2017 年 — 至今",
   tag:"具有完全自主知识产权的中国标准高速列车",
   intro:"2017 年 6 月 26 日，由中国铁路总公司牵头研制的中国标准动车组「复兴号」CR400AF 在京沪高铁首发。它在牵引、制动、网络控制等核心系统上实现自主化与标准化，可按 350 km/h 长期运营，并有 8 辆短编、17 辆超长编等多种编组，是目前中国高铁网络里运用最广的高速列车型号。",
   specs:[["问世时间","2017 年"],["编组形式","8 辆 / 17 辆动力分散"],["最高运营速度","350 km/h"],["网络电压","交流 25 kV"]],
   feats:["关键系统自主化，是全系列落成统一标准的「中国标准动车组」","17 辆超长编组运力更大，适配繁忙干线","长期承担京沪等主通道的高密度运营"],
   zh:"一台复兴号动车组的头车（只画一节车，车头只出现在画面左端），车体圆润修长，车头是较钝而流畅的「鹰嘴」流线鼻端，一对细长前灯斜插在鼻翼两侧，司机窗大而连贯、与侧面黑色窗带相接，车顶平滑仅一列空调罩，银灰车身配红色腰带，车窗连续布置，右端是与车厢相接的平断面，不要画成两端都有车头。",
   subject:"a China Railway CR400AF Fuxing high-speed EMU head car shown alone in strict side elevation, exactly one vehicle in the frame, long rounded albatross-style streamlined nose at the LEFT end only with a blunter taper than earlier designs, a pair of slim slanted headlight clusters set low beside the nose tip, a very large curved cab window flowing into a continuous black window band, flush continuous row of passenger windows, silver-grey lower body with a bold red stripe along the window band, the RIGHT end is a plain flat coach end wall with a gangway connection and no nose, do NOT draw a nose or a second cab at the right end and do NOT draw two head cars coupled together, full side elevation"},
  {id:"loco-20", cat:"loco", name:"CR200J 型动车组", en:"CR200J Power-concentrated EMU",
   kind:"动力集中型动车组", era:"2019 年 — 至今",
   tag:"跑普速线路的「绿巨人」，把老线速度提到 160",
   intro:"2019 年投入运用的 CR200J 型动力集中型动车组，一端为一台电力动力车、另一端为控制车，中间是改造自 25T 型客车的拖车，可在既有普速线路上按 160 km/h 运行。它逐步替代了一批老旧的直达、特快列车，让非高铁线路上的普速出行体验明显改善，因绿色涂装也被称为「绿巨人」。",
   specs:[["问世时间","2019 年"],["编组形式","动力集中的动力车 + 拖车 + 控制车"],["最高运营速度","160 km/h"],["适用线路","既有电气化普速铁路"]],
   feats:["可在既有普速线路运行，无需新建高铁即可提速","两端均可操纵，省去机车摘挂与掉头作业","内饰按动车标准改造，乘车体验优于传统普速客车"],
   zh:"一台扁方而不是流线型的电力动力车（只画一节动力车，车头只出现在画面左端），前脸是竖直的大平面玻璃略带斜角，车顶一副受电弓，车体侧面平整、只有少量散热口，通身深绿并有一条奶黄色细腰带，下面是两台三轴转向架，右端不要画第二个车头。",
   subject:"a CR200J power-concentrated EMU power car shown alone in strict side elevation, exactly one vehicle in the frame, flat-fronted semi-streamlined cab at the LEFT end only with a wide slightly raked window band and a smooth rounded roofline rather than a long nose, one diamond pantograph on the roof, plain flanks with a few narrow vents and a continuous row of passenger windows further back, deep green livery with a thin cream beltline and small cream cab corner blocks, two three-axle bogies, the RIGHT end is a plain flat car end wall with no nose, do NOT draw a nose or a second cab at the right end, full side elevation"},

  /* ===================== 客运车厢 ===================== */
  {id:"pax-01", cat:"pax", name:"21 型客车", en:"Type 21 Coach",
   kind:"中国第一代自造客车", era:"1953 年 — 1990 年代",
   tag:"新中国客车工业从这一辆车起步",
   intro:"1953 年青岛四方机车车辆厂设计制造了中国第一代自行研制的铁路客车，定型为 21 型，硬座车代号 YZ21。它车体较短、侧墙为铆焊混合的钢结构，车窗还是可以抬起的老式样子。虽然乘坐环境在今天看来相当朴素，但它结束了客车完全依赖进口与仿制的历史，此后二十多年国产客车的基本格局都从这里长出。",
   specs:[["问世时间","1953 年"],["车体","短车体全钢混合结构"],["定员","硬座约 88 人"],["构造速度","约 80–100 km/h"]],
   feats:["第一种由新中国自行设计并批量生产的铁路客车","车体短、窗户为手摇上提式，是早期客车的典型样子","为 22 型及后来的 25 型客车打下了设计与制造基础"],
   zh:"一节短而方正的老式硬座车厢，车体较低，车顶圆润并有一排通长的小通风器，侧墙一排方形上提车窗，下面是明显的铆钉线，两端有开放式通过台板，深绿色车身，两台带踏板的二轴转向架，没有车下裙板。",
   subject:"an early Chinese Type 21 mainline passenger coach, noticeably short body, low stance with a gently arched roof carrying a continuous row of small torpedo ventilators, a row of tall rectangular windows with sliding upper frames, exposed vertical rivet lines along the flank, open end platforms with low railings at each end, deep green livery, two plain two-axle bogies with footboards, full side elevation"},
  {id:"pax-02", cat:"pax", name:"22 型客车", en:"Type 22 Coach",
   kind:"绿皮硬座车", era:"1959 年 — 2010 年代",
   tag:"几代人记忆里的绿皮车，服役半个世纪的国民车厢",
   intro:"1959 年问世的 22 型客车是二十世纪后半中国铁路上数量最多、服役时间最长的主型客车，通体墨绿，人们更习惯叫它「绿皮车」。它没有空调，靠车窗上面的通风器和车顶的小风扇换气，夏天开窗、冬天烧锅炉取暖。从八十年代到二十一世纪初，绝大多数人的长途出行都是在这节车厢里度过的。",
   specs:[["问世时间","1959 年"],["车体","全钢薄壁筒形结构"],["定员","硬座约 116 人"],["构造速度","约 120 km/h"]],
   feats:["中国铁路上使用时间最长的客车车型，前后服役超过半个世纪","无空调的自然通风设计，是那个年代铁路出行的标准配置","衍生出硬卧车、软卧车、餐车、行李车等一整列车种"],
   zh:"一节典型的绿皮硬座车厢，车体长而略矮，车顶有二列长条形通风器，侧墙一整排方形上提车窗窗下有加强筋，两端贯通式通过台并覆盖折叠风挡，通体深绿并有一条窄的浅色腰带，两台摇枕式转向架。",
   subject:"a classic Chinese Type 22 green passenger coach, long low body with a slightly rounded roof carrying two rows of boxy ventilator housings, a long row of rectangular windows divided by narrow pillars with ribbed panels beneath, through gangway connections with folded bellows at each end, dark green livery with a thin pale beltline, outside-hung doors near each end, two simple two-axle bogies, full side elevation"},
  {id:"pax-03", cat:"pax", name:"双层客车", en:"Double-deck Coach",
   kind:"双层硬座车", era:"1987 年 — 至今",
   tag:"在用隧道限界里挤出两层客座解法",
   intro:"为了在不加长列车的前提下提高运量，中国从 1980 年代末开始研制双层客车，第一批双层硬座车投入沪宁等繁忙干线的城际运输。它的车体高度明显大于普通客车，内部靠端部楼梯连通上下两层客室。至今仍有个别线路上使用双层客车，后来的部分动车组也采用了同样的双层思路。",
   specs:[["问世时间","1987 年"],["车体","双层布置，车体高于普通客车"],["布置","上下两层客室 + 端部楼梯"],["典型用途","繁忙干线城际运输"]],
   feats:["在不增加编组长度的前提下，单节定员提高约三分之一","下层与上层靠端部楼梯连通，外观上因此分成上下两排窗带","双层车体重心与高度都受车辆限界约束，是设计上的难点"],
   zh:"一节明显高大的双层客车，车体几乎顶到车辆限界，上层是一长条连续的带形窗，下层是一排更大的独立窗，两排窗之间有一条明显的腰带，每端一个塞拉门、门的上方是楼梯间的位置，通体蓝白涂装，两台转向架几乎被车下裙板遮住。",
   subject:"a Chinese double-deck passenger coach, unusually tall body nearly filling the loading gauge, two rows of windows with the upper row forming a long continuous band and the lower row of wider upright windows, a strong horizontal band separating the two rows, single-leaf plug doors set low at each end with the stair vestibule above them, pale blue and white livery, two bolsterless bogies tucked beneath, full side elevation"},
  {id:"pax-04", cat:"pax", name:"25G 型客车", en:"Type 25G Coach",
   kind:"空调硬座车", era:"1992 年 — 至今",
   tag:"红皮车把空调和舒适带进普速列车",
   intro:"25G 型客车 1992 年起批量生产，是新一代改进型 25 型客车。车体长度约 25.5 米，采用集中供电的车顶单元式空调，窗户改为整块密封玻璃，运行平稳性和密封隔音都明显好于 22 型。因其红色涂装版本众多，被俗称「红皮车」，长期是中国铁路快速、普快列车的主力车型。",
   specs:[["问世时间","1992 年"],["车体","约 25.5 米薄壁筒形结构"],["供电","集中供电车顶单元式空调"],["构造速度","120 km/h"]],
   feats:["第一种大规模装备空调的国产主型客车，乘坐体验明显提升","车钩前的风挡、密封车窗与改进转向架让运行环境更安静","衍生出硬卧、软卧、餐车、行李车、邮政车等多种车种"],
   zh:"一节现代感较强的空调硬座车厢，车体长而中部略高，车顶平整只装一排薄型空调机组，侧墙是一整排封闭式大窗，两端各一个与墙面平齐的塞拉门，车下有一条通长裙板遮住设备，橙红色车身配白色窗带，两台带空气弹簧的转向架。",
   subject:"a Chinese Type 25G air-conditioned passenger coach, long body with a flat roof carrying a row of low-profile air conditioning units, a continuous row of large sealed single-pane windows with black rubber framing, one single-leaf plug door near each end set flush into the flank, smooth continuous lower skirt hiding the underfloor equipment, deep orange-red body with a white window band, two air-spring bogies, full side elevation"},
  {id:"pax-05", cat:"pax", name:"25K 型客车", en:"Type 25K Coach",
   kind:"快速列车车厢", era:"1996 年 — 至今",
   tag:"为提速而生的准高速车厢，跑 160 的蓝白列车",
   intro:"25K 型客车 1996 年起投入使用，是中国铁路第一次大提速的主力车种，构造速度提高到 160 km/h。它采用带空气弹簧与抗蛇行减震器的新型转向架、盘形制动与电气柜式控制系统，车体密封进一步加强，主要担当 K 字头的快速列车。此后的 25T 型就是在它的基础上继续改进而来的。",
   specs:[["问世时间","1996 年"],["构造速度","160 km/h"],["转向架","空气弹簧 + 抗蛇行减震器"],["制动","盘形制动"]],
   feats:["专门针对提速设计，运行速度比 25G 提高一级","盘形制动与新型转向架让高速运行的平稳性明显改善","蓝白灰涂装主导的「快速列车」形象由此深入人心"],
   zh:"一节修长流畅的快速客车，车体平滑整洁，车顶一列薄型空调机组，侧墙为通长的黑色窗带与整块玻璃窗，塞拉门与侧墙完全平齐，车下全包裙板，蓝白灰三色涂装，两台带盘形制动与横向减震器的转向架。",
   subject:"a Chinese Type 25K high-speed passenger coach, sleek smooth body, flat roof with one row of slim air conditioning modules, full-length black window band formed of large flush-glazed windows, plug doors set flush into the flanks near each end, continuous smooth underfloor skirt panels, blue-white-and-grey livery with a wide white roof band, two heavy air-spring bogies with disc brakes, full side elevation"},
  {id:"pax-06", cat:"pax", name:"25T 型客车", en:"Type 25T Coach",
   kind:"直达特快客车", era:"2003 年 — 至今",
   tag:"普速铁路的顶配车厢，也是青藏铁路高原客车",
   intro:"25T 型客车 2003 年起投入使用，主要担当 Z 字头直达特快列车。它在 25K 基础上进一步强化气密性与减震性能，采用真空集便器与更加可靠的电气系统；为青藏铁路研制的 25T 高原型还增加了供氧系统与耐紫外线车窗。这是中国在普速线路上批量运用的最高等级客车车型。",
   specs:[["问世时间","2003 年"],["构造速度","160 km/h"],["卫生系统","真空集便器"],["衍生型号","青藏铁路高原供氧型"]],
   feats:["气密性、减震与噪声控制再上台阶，代表国产普速客车的顶端","青藏铁路型号配备弥散式供氧与个人吸氧接口，适应高原环境","与 HXD3D、DF11 等机车长期搭配担当直达特快"],
   zh:"一节极为简洁平滑的高级客车，车体整齐光顺，车顶一列很薄的空调机组，侧墙是整条通长的黑色窗带与大块玻璃，塞拉门与车体完全平齐，车下全封闭裙板，银灰涂装配深色窗带，两台无摇枕转向架并可看到横向减震器。",
   subject:"a Chinese Type 25T deluxe passenger coach, very clean flush-sided body, flat roof with one slim row of integrated air conditioning units, continuous dark tinted window band of large flush windows, fully flush-fitting plug doors at each end, completely enclosed smooth underfloor fairing, silver-grey and white livery with a dark window band, two modern bolsterless bogies with visible anti-yaw dampers, full side elevation"},
  {id:"pax-07", cat:"pax", name:"硬卧车", en:"Hard Sleeper Coach",
   kind:"YW25G 型硬卧车", era:"1990 年代 — 至今",
   tag:"开放式的隔间里，六张铺位的中国式夜间旅行",
   intro:"硬卧车是中国普速列车上最常见的卧铺车型，以 25G 型硬卧车为代表。车厢一侧为纵向走廊，另一侧是若干组半开放的隔间，每组上下三层共六个铺位，配小桌、边座与行李架。不设包厢门，票价适中，是长途夜车最经济也最有生活气息的选择。",
   specs:[["代表型号","YW25G"],["布置","半开放式隔间，每组上下三层"],["典型定员","约 66 人"],["运行环境","长途普速夜车"]],
   feats:["双层三条铺位的隔间设计，让一节车厢既能坐也能躺","取消包厢门换来更高的载客效率与更低票价","配行李架、边座与小桌，是长途旅客的标准化方案"],
   zh:"一节硬卧车厢，深墨绿色涂装、车体中部一条黄色腰带贯通全车（不是橙红涂装，也不是白色窗带），侧墙只有一排小窗：约十来个尺寸偏小的矩形窗等距分布、位置偏高，窗与窗之间留着较宽的绿色墙板，不连成通长玻璃带；两端各有一扇带窗的车门，车顶是浅灰圆弧顶只带几个小通风器，车下是敞开的底架（转向架、蓄电池箱与制动装置外露，不封裙板），两台转向架。",
   subject:"a Chinese YW25G hard sleeper coach in strict side elevation, deep forest green body with one continuous yellow waist stripe running the full length just below the windows, a single row of about eleven small widely spaced rectangular windows set high on the flank with wide plain green panels between them and no continuous glazed window band, one narrow passenger door with a window near each end, light grey curved roof with only a few small roof vents, open underframe showing bogies, battery boxes and brake equipment instead of a smooth skirt, two standard bogies, no lettering and no running numbers on the body, full side elevation"},
  {id:"pax-08", cat:"pax", name:"软卧车", en:"Soft Sleeper Coach",
   kind:"RW25T 型软卧车", era:"2000 年代 — 至今",
   tag:"带门包厢的四人隔间，是普通列车上的头等舱",
   intro:"软卧车以 RW25T 为代表，车厢内是若干个带门的可上锁包厢，每间四个铺位，配小桌、衣架与独立照明。相比硬卧，铺位更宽、环境更安静私密，通常加挂在直达特快与夕发朝至列车上，是普速铁路里舒适度最高的车厢之一。",
   specs:[["代表型号","RW25T"],["布置","带门包厢，每间四人"],["典型定员","约 36 人"],["运行环境","直达特快 / 夕发朝至列车"]],
   feats:["带门包厢带来私密与安静，是普速车上最高等级的休息方式","包厢内配阅读灯、呼叫按钮与调节角度的顶部风阀","定员约为硬卧车的一半，人均空间明显更大"],
   zh:"一节软卧车厢，侧墙是若干个彼此分开的大面积包厢窗，窗与窗之间留有很宽的墙面板，整体节奏比硬卧车更疏朗，一端是端门、另一端为封闭端墙，银灰涂装配一条深色腰带，两台无摇枕转向架。",
   subject:"a Chinese RW25T soft sleeper coach, row of widely-spaced large compartment windows separated by wide plain panel sections giving a sparse rhythm, no continuous window band, plug doors near the ends and one blanked end with no gangway, pale silver body with a dark beltline under the windows, fully enclosed smooth underfloor fairing, two bolsterless bogies, full side elevation"},
  {id:"pax-09", cat:"pax", name:"餐车", en:"Dining Car",
   kind:"CA25 型餐车", era:"1990 年代 — 至今",
   tag:"把厨房与餐厅搬上铁路的车厢",
   intro:"餐车一半是厨房、一半是餐厅，为长途列车提供现做的饭菜，代表型号为 CA25 系列。为保证工作人员能穿行整列车，餐车的一侧通常留出通过台与通道。厨房内配备灶台、冰箱与排烟装置，餐厅侧是四人小桌与长椅。高铁普及之前，一趟长途旅行里最有仪式感的部分往往就在这节车厢。",
   specs:[["代表型号","CA25"],["布置","半餐厨 + 半餐厅"],["设施","灶台 / 冷藏 / 排烟装置"],["典型席位","约 40–50 个"]],
   feats:["在行驶的列车上完成整套烹饪，是铁路里最复杂的车辆之一","一侧设贯通通道，保证工作人员可从本车穿行到相邻车厢","近年来出现了半吧台、半餐位的混合布置型餐车"],
   zh:"一节餐车，两侧并不对称：餐厅一侧是一排宽大的观景窗，厨房一侧只有少量小窗和成组的排气口，车顶多出一个排烟罩和更多的空调机组，车体中部有几处小型通风百叶，白色涂装配红色窗带，两台通用转向架。",
   subject:"a Chinese CA25 dining car, asymmetric side elevation with a run of wide picture windows on the restaurant half and only small high frosted windows plus extraction vents on the kitchen half, a distinct kitchen chimney hood and additional roof-mounted air conditioning units above the kitchen section, three small ventilation louvers mid-body, white body with a deep red window band, two standard bogies, full side elevation"},
  {id:"pax-10", cat:"pax", name:"空调发电车", en:"Power Generator Car",
   kind:"KD25K 型发电车", era:"1990 年代 — 至今",
   tag:"整列车的电源车，没有它全车空调都开不起来",
   intro:"空调发电车编挂在列车的一端或两端，车内装柴油发电机组，专门为整列客车的空调、照明与电气设备供电，代表型号为 KD25K。在机车尚不具备供电能力的年代，它是全列车唯一的电源：外表几乎没有车窗，却决定了这趟车能不能吹上空调。",
   specs:[["代表型号","KD25K"],["功能","整列车空调与电气负载供电"],["动力","车内柴油发电机组"],["编挂位置","列车端部"]],
   feats:["自带电站，让非电气化线路也能用上空调客车","车体两侧大量的散热百叶窗与排气口是它最好认的特征","随着机车直供电普及，近年发电车的使用范围在缩小"],
   zh:"一节几乎没有乘客窗的车厢，侧墙几乎被成排的散热百叶窗、格栅式进风窗和排气口占满，只有少数几个小圆窗，车顶多个大型排气风扇，端部一扇大检修门，蓝白或灰黄涂装，下面两台重型转向架。",
   subject:"a Chinese KD25K generator car, side flank almost entirely occupied by rows of tall ventilation louvers, large mesh intake grilles and exhaust openings with only a couple of small porthole windows, several big roof-mounted cooling fans and exhaust stacks, one wide double maintenance door at one end, muted blue and white livery, heavy two-axle bogies, full side elevation"},

  /* ===================== 货运车厢 ===================== */
  {id:"freight-01", cat:"freight", name:"C62 型敞车", en:"C62 Gondola Car",
   kind:"通用敞车", era:"1960 年代 — 至今",
   tag:"侧开门敞车的数量担当，运煤砂石的主力车",
   intro:"敞车是侧面和端面装有挡板、顶部敞开的货车，煤、矿石、砂石、钢材等大宗货物大多由它承运。C62 型是其中最典型的一种 60 吨级通用敞车，车体两侧各开若干组下翻式车门，便于抓斗卸车。几十年来它与后继车型一起构成了中国铁路货运的最大基本盘。",
   specs:[["车型代号","C62"],["载重","约 60 吨"],["车体","钢制侧墙与端墙，顶部敞开"],["卸货方式","侧门下翻，抓斗或翻车机卸车"]],
   feats:["顶部敞开便于从上方抓斗取料，是散堆装货物的首选车型","侧墙上的下翻式车门是最重要的识别特征","与后来的 70 吨级敞车共同构成铁路散货运输的主力"],
   zh:"一辆侧牆高耸的敞式货车，车体四面是带竖向加强筋的钢墙，顶部完全敞开可见内部，侧墙下部有几组可下翻的车门，车体支承在铸钢转向架上，深灰褐色涂装，端墙上方各有一个扶手。",
   subject:"a Chinese C62 open gondola freight wagon, tall open-topped steel body with vertical rib stiffeners all around the sides and ends, several drop-door panels set into the lower half of each side wall, top bracing rails visible across the open mouth, ladders and grab irons on both ends, dark brown-grey weathered paint, two cast three-piece bogies, full side elevation"},
  {id:"freight-02", cat:"freight", name:"G60 型罐车", en:"G60 Tank Car",
   kind:"轻油罐车", era:"1960 年代 — 至今",
   tag:"装汽油柴油的卧式圆罐，几乎看不到车底架",
   intro:"罐车用来运输汽油、柴油、化工液体等货物，车体就是一个横卧在转向架上的圆筒。G60 型是中国长期使用的主力轻油罐车，罐体顶部设有人孔、呼吸式安全阀与走板护栏，装卸通过罐顶的人孔或下部的卸料阀完成。",
   specs:[["车型代号","G60"],["载重","约 50–60 吨"],["车体","卧式圆筒罐体"],["适装货物","汽油、柴油、煤油等轻质油品"]],
   feats:["罐体既是容器又是车体，取消了传统车底架中梁，自重更轻","顶部人孔、安全阀与走板是这类车型最好认的标志","运液体货物不必灌桶装车，装卸效率远高于棚车"],
   zh:"一辆运载液体的货车，最显眼的是横卧在车上的巨大圆筒罐体几乎看不到车身底架，罐体顶部有一条走板与栏杆，中心一个圆形人孔盖和几个小阀件，两端为碟形封头，罐体下半部有卸料阀与管路，浅灰或银色涂装，两台转向架。",
   subject:"a Chinese G60 tank wagon, one very large horizontal cylindrical tank forming almost the whole car sitting low between two bogies with no visible underframe, dished ends, a walkway with a handrail running along the top of the tank, a round manhole cover and small valve fittings on top, bottom outlet valve and pipework beneath one end, pale grey tank paint, two standard bogies, full side elevation"},
  {id:"freight-03", cat:"freight", name:"N17 型平车", en:"N17 Flat Car",
   kind:"通用平车", era:"1970 年 — 至今",
   tag:"没有车厢的大平板，专运钢轨、机械与集装箱",
   intro:"平车是一块只有地板、四周没有围挡的货车，N17 型是其中最常见的通用型。它的地板铺设在钢骨架上，两端可以放下活动端板，货物靠绳索、垫木与紧固装置固定，适合运输钢轨、木材、大型机械与集装箱等不怕日晒雨淋的货物。",
   specs:[["车型代号","N17"],["载重","约 60 吨"],["车体","平板地板 + 活动端板"],["典型货物","钢材、木材、机械设备、集装箱"]],
   feats:["没有围挡，装卸可以从侧面、端面甚至直接用吊车","两端活动端板放下后可用于装载超长货物","是许多专用货车（如集装箱专用平车）的发展基础"],
   zh:"一辆几乎没有车身的平板货车，只有一块厚实的木质与钢骨复合地板，四周没有侧墙，两边布着一排绳钩与捆绑装置，两端是可放倒的低矮端板，下方是钢制底架与两台转向架，深灰涂装。",
   subject:"a Chinese N17 flat wagon, completely flat open deck made of thick wooden planking in a steel frame with no sides at all, rows of rope hooks and lashing rings along both deck edges, short folding end bulkheads lying flat at each end, visible steel underframe sill, dark grey paint, two standard freight bogies, full side elevation"},
  {id:"freight-04", cat:"freight", name:"K18 型漏斗车", en:"K18 Coal Hopper Car",
   kind:"煤炭漏斗车", era:"1970 年代 — 至今",
   tag:"底部漏斗自流卸煤，专为电厂与港口的循环运输设计",
   intro:"漏斗车的车体下部做成漏斗形状，货物从顶部的装料口装入，卸车时打开漏斗底部的卸料门，货物靠自重流出，不必翻车也不需要抓斗。K18 型煤炭漏斗车主要用于发电厂、港口与矿区之间的单元运输，让整列列车可以在几分钟内完成卸车。",
   specs:[["车型代号","K18"],["载重","约 60 吨"],["车体","上部矩形、下部漏斗形"],["卸货方式","底开门自流卸车"]],
   feats:["底开门自流卸货，一列网络列车可在极短时间内卸完","适合矿区到电厂、港口之间固定循环的单元运输","卸车过程不需要翻车机，是对线路的友好方案"],
   zh:"一辆上宽下窄的漏斗车，车体上半部分是笔直的钢墙，下半部分向内收成两到三个斜面漏斗……底部可以看到方形的卸料口机械装置，车体侧面有多道横向加强带，黑色涂装，两台重型转向架。",
   subject:"a Chinese K18 coal hopper wagon, upper part of the body a straight-sided rectangular box while the lower third slopes inward into two steep funnel hoppers, square mechanical bottom discharge gates visible under each hopper, horizontal reinforcing bands around the sides, top chord rails along the open top, black paint, two heavy freight bogies, full side elevation"},
  {id:"freight-05", cat:"freight", name:"C64 型敞车", en:"C64 Gondola Car",
   kind:"改进型敞车", era:"1980 年代 — 至今",
   tag:"用耐候钢换来的更长车体与更长检修周期",
   intro:"C64 型是在 C62 基础上于二十世纪八十年代改进的 60 吨级通用敞车，车体加长、改用耐候钢并优化了侧门结构，载重略有提高而自重下降，检修周期也更长。它长期是中国铁路敞车的主力车型之一，与后来的 70 吨级 C70 共同构成散堆装货物运输的基础车型。",
   specs:[["车型代号","C64"],["载重","约 61 吨"],["车体材质","耐候钢"],["车体","加长车体，侧部下翻车门"]],
   feats:["改用耐候钢后耐腐蚀性能提升，厂修周期明显延长","车体加长，在相同编组长度下运量更大","与 C70 一起构成中国通用敞车的两代主力"],
   zh:"一辆比老式敞车更修长的敞式货车，车体侧面为略带波纹的钢板并有多组下翻车门，顶部敞开并有横向撑杆，端墙略高，车体显得比 C62 更连贯，锈褐色涂装，两台转向架。",
   subject:"a Chinese C64 gondola wagon, longer lower body than older designs, flanks of slightly corrugated steel plate stiffened by external vertical posts, several flush drop-door panels along the lower sides, cross braces over the open top, tall end walls with corner grab irons, rust-brown corrosion resistant steel finish, two bogies, full side elevation"},
  {id:"freight-06", cat:"freight", name:"P64 型棚车", en:"P64 Boxcar",
   kind:"通用棚车", era:"1990 年代 — 至今",
   tag:"带屋顶与滑动拉门的车厢，运一切怕淋的货物",
   intro:"棚车车体全封闭，车顶有盖、侧面设大拉门，可以装运粮食、化肥、日用品、器材等怕潮湿、怕失窃的货物。P64 型是九十年代批量使用的通用棚车，车顶设有通风器，侧墙的宽大拉门便于叉车进出作业，至今仍是铁路整车运输的主力车种之一。",
   specs:[["车型代号","P64"],["载重","约 60 吨"],["车体","全封闭车体 + 侧拉门"],["典型货物","粮食、化肥、百货、器材"]],
   feats:["全封闭车体让货物免于风雨，是怕湿货物的标准选择","宽大的侧拉门便于叉车与托盘作业","车顶通风器可在密闭条件下保持通气"],
   zh:"一辆全封闭的箱型货车，车体是一个完整的方箱，车顶略拱并在两端各有一组小型通风器，侧墙中间是一扇可以横向推拉的大拉门、门上有导轨，两侧还有小通风窗与遮阳百叶，绿灰涂装，两台转向架。",
   subject:"a Chinese P64 boxcar, fully enclosed rectangular box body with a gently arched roof carrying small ventilator housings near each end, one very wide sliding door set in the middle of each flank running on an exposed overhead rail track, small louvered vents near the roof line, plain steel side sheets with light vertical stiffeners, greenish grey paint, two bogies, full side elevation"},
  {id:"freight-07", cat:"freight", name:"X2K 型集装箱平车", en:"X2K Double-stack Well Car",
   kind:"双层集装箱专用车", era:"2000 年代 — 至今",
   tag:"凹底车体把两层集装箱叠进铁路限界",
   intro:"要把两层标准集装箱叠放在一起运输，必须让车体「沉下去」。 X2K 型双层集装箱专用平车采用凹形底架，把集装箱落在接近轨面的位置，从而在铁路限界内叠装两层。它主要用于港口到内陆的集装箱班列，让一趟列车的运量比单层平车提高近一倍。",
   specs:[["车型代号","X2K"],["车体","凹型底架（落下侧壁）"],["装载方式","双层标准集装箱"],["典型用途","港口至内陆集装箱班列"]],
   feats:["凹底设计是双层装箱的关键：车体两侧的立墙承重、中部下沉","单车载箱量翻倍，是集装箱铁水联运的主力车型","车体没有传统地板，只有集装箱锁座与导向板"],
   zh:"一辆呈 U 形的专用货车，车体中部深深下沉形成凹槽，两侧各有一片高耸的侧墙板，凹槽里能看见安放集装箱的扭锁座，车体轮廓因此呈现出明显的开口箱形状，深灰涂装，两台重载转向架。",
   subject:"a Chinese X2K double-stack container well car, deep U-shaped well frame with tall side walls at each end and a very low depressed deck between them, container corner-casting pedestals and twistlock shoes visible along the well floor, no conventional flat deck, overall silhouette forming an open-topped U, dark grey paint, two heavy-duty bogies, full side elevation"},
  {id:"freight-08", cat:"freight", name:"C70 型敞车", en:"C70 Gondola Car",
   kind:"70 吨级通用敞车", era:"2003 年 — 至今",
   tag:"车体同级升级，载重提高十吨的换代敞车",
   intro:"2003 年起投入运用的 C70 型敞车是中国通用敞车换代的标志：车体长度与结构重新设计，配合更大轴重的转向架，把载重从 60 吨提高到 70 吨级。它在中国铁路敞车保有量中占比很高，承担煤炭、矿石、砂石等大宗散货的日常运输，也让同样的列车长度能多拉不少货。",
   specs:[["车型代号","C70"],["载重","约 70 吨"],["轴重","约 23 吨"],["车体","加长车体 + 侧部下翻车门"]],
   feats:["载重比 60 吨级敞车提高约十吨，是换代升级的主力车型","采用高强度耐候钢与新型转向架，兼顾强度与自重","与大秦铁路等重载通道的运输组织方式相互适配"],
   zh:"一辆体量更大的现代敞车，车体长而高，侧墙为平整的钢板带竖向压筋和几组巨大的下翻车门，顶部敞开、四角有加固柱，整体比例比老式敞车更修长，深灰泛蓝的涂装，两台大轴重转向架。",
   subject:"a modern Chinese C70 gondola wagon, large long high-sided open-topped body, smooth steel flanks with pressed vertical corrugations, several very large drop-door panels along the lower sides, heavy corner posts and a straight top chord along the open mouth, noticeably longer and taller proportions than older gondolas, deep blue-grey weather-resistant paint, two heavy-axle-load bogies, full side elevation"},
  {id:"freight-09", cat:"freight", name:"P70 型棚车", en:"P70 Boxcar",
   kind:"70 吨级通用棚车", era:"2000 年代 — 至今",
   tag:"棚车的换代车型，更大的容积与更高的载重",
   intro:"P70 型是继 60 吨级棚车之后开发的 70 吨级通用棚车，车体较长、容积更大，同时提高了车门密封性与内衬保护能力，减少了粮食类散装货物在运输中的损耗。它与 C70 敞车同属中国铁路货车由 60 吨向 70 吨级升级的一代车型。",
   specs:[["车型代号","P70"],["载重","约 70 吨"],["车体","加长全封闭车体"],["典型货物","粮食、化肥、食糖、百货"]],
   feats:["容积比同级别棚车更大，装运轻泡货物更划算","车门密封与内衬改进，散装粮食运输损耗更低","与 C70 敞车构成 70 吨级通用货车的主力组合"],
   zh:"一辆比老棚车更长的封闭式箱型货车，车体平整方正，车顶平缓并有两处通长的通风器，侧墙中间一扇很宽的侧拉门、门上方有导轨和雨檐，车体下部一条裙线，浅灰或军绿涂装，两台大轴重转向架。",
   subject:"a modern Chinese P70 boxcar, long clean fully enclosed box body with flat side sheets and shallow vertical stiffeners, gently arched roof with continuous low ventilator housings, very wide sliding door in the middle of each flank under a rain gutter with its overhead guide rail, tidy lower skirt line, light grey livery, two heavy-axle-load bogies, full side elevation"},
  {id:"freight-10", cat:"freight", name:"D26 型长大货物车", en:"D26 Depressed-center Heavy-load Car",
   kind:"长大货物车", era:"1990 年代 — 至今",
   tag:"专为体积巨大的超限货物设计的特种车辆",
   intro:"发电机定子、变压器、轧机牌坊这类货物又重又大，普通货车装不下也超不过限界，于是有了长大货物车。D26 型采用凹底或落下孔式的车体，让货物的一部分落进车体开孔的位置、贴近轨面，从而把高度压进铁路限界之内。这类车配多轴转向架甚至液压均衡装置，是铁路货物运输里最能体现想象力的一族。",
   specs:[["车型代号","D26"],["车体","凹底 / 落下孔式车架"],["转向架","多轴转向架组"],["典型货物","发电机定子、变压器、大型设备"]],
   feats:["落下孔方案让货物的高度总量可以被压缩进限界之内","多轴转向架把集中载荷分散到线路允许的范围","装运前通常要做专门的运行方案设计与沿途勘测"],
   zh:"一辆又长又矮的特种货车，车体中部有一个明显下沉的凹坑或方形开口，两侧是高起的承重侧梁与厚实的端梁，车下部是多组密排的车轮（远多于普通货车），车体通体深色涂装并布有纵横的加强筋。",
   subject:"a Chinese D26 heavy-load depressed-centre wagon, extremely long low body with a pronounced depressed well or open hole section in the middle, massive deep side beams rising at each end over multi-axle bogie groups dense rows of small wheels far more numerous than an ordinary freight car, heavy cross-braced frame and thick end sills, dark industrial paint, full side elevation"},

  /* ===================== 著名车站 ===================== */
  {id:"station-01", cat:"station", name:"哈尔滨站", en:"Harbin Railway Station",
   kind:"中东铁路时期车站", era:"1903 年 — 至今",
   tag:"中东铁路上的百年老站，俄式立面原址复刻",
   intro:"1903 年中东铁路通车，哈尔滨站随之启用，最初的站房是俄式风格的两层砖石建筑：对称立面、中央高起的尖顶塔楼与窄长的拱窗，是近代中国东北地区最早一批铁路站房之一。2010 年代，车站在原址重建了新站房，立面复刻了当年的俄式样貌，成为这座城市最具辨识度的建筑。",
   specs:[["建成时间","1903 年"],["线路","中东铁路，今哈大、滨洲等干线"],["建筑风格","俄罗斯新艺术风格"],["站房","2010 年代原址复刻重建"]],
   feats:["中东铁路保存与延续最长的一座车站，见证近代东北铁路的开端","新站房按老照片复原了中央塔楼与立面比例","地处高寒地区，是中国纬度最高的铁路枢纽之一"],
   zh:"一栋对称构图的俄式老站房立面，中央是高耸的尖顶钟塔，两侧各有一段两层的石质墙面，窗户窄长且顶部带平缓的拱券，屋檐挑出的线条柔和，墙面为浅米黄与白色相间。",
   subject:"a symmetrical Russian art nouveau style railway station building, tall central tower with a steep pointed spire, two lower two-storey wings either side, rows of tall narrow arched windows, soft curving cornice lines and decorative parapets, pale cream and white painted masonry walls, shallow central entrance portico, front elevation"},
  {id:"station-02", cat:"station", name:"郑州站", en:"Zhengzhou Railway Station",
   kind:"特大型普速枢纽", era:"1904 年 — 至今",
   tag:"京广线与陇海线在这里十字交叉",
   intro:"1904 年京汉铁路建成时设郑州站，后来陇海铁路在此交汇，使它成为中国最重要的普速铁路枢纽：南北向的京广线与东西向的陇海线在这里十字交叉，郑州也因此被称作「火车拉来的城市」。今日的站房经过多次改扩建，是铁路网中昼夜不停的繁忙节点。",
   specs:[["建成时间","1904 年"],["交汇干线","京广线 × 陇海线"],["枢纽地位","普速铁路最重要的十字枢纽"],["配套","郑州北编组站"]],
   feats:["两条最繁忙的干线在这里十字交叉","带动郑州从一座小城发展为特大城市","跨线旅客列车多在此经过、停靠或换乘"],
   zh:"一栋横向很宽的现代化多层站房，立面采用对称构图，中央一段抬高的入口大厅与两侧较低的两翼相接，大面积连续的竖向窗带，屋顶是一条平直的水平线并挑出宽檐。",
   subject:"a very wide symmetrical modern railway station building, raised central entrance hall flanked by two long lower wings, continuous vertical window bands across the facade, one straight flat roofline with a deep projecting cornice, pale stone-coloured cladding, front elevation"},
  {id:"station-03", cat:"station", name:"青龙桥站", en:"Qinglongqiao Station",
   kind:"京张铁路百年小站", era:"1908 年 — 至今",
   tag:"人字形折返线上的小站，詹天佑留下的铁路样本",
   intro:"青龙桥站位于北京市延庆区、八达岭长城脚下的山坳里，是詹天佑主持修建的京张铁路上的关键车站。因为山势太陡，铁路在这里采用著名的「人」字形展线：列车先驶入车站所在的岔线停住，再反向驶出继续爬升。站内保留着当年的站房与詹天佑先生的塑像、墓地，是国内少见仍在使用的百年铁路车站。",
   specs:[["建成时间","1908 年"],["线路","京张铁路"],["技术特点","人字形折返展线"],["现状","文物车站，仍有列车通过"]],
   feats:["人字形展线由詹天佑设计，用折返换取更大的爬升坡度","站内保留詹天佑塑像与墓，是近代中国铁路史的现场","规模不大，却是全线最关键的会让点位"],
   zh:"一栋尺度很小的单层青砖小站房，两端对称中间一个小小的拱形门洞，两侧几扇方窗，屋顶为薄薄的坡顶并挑出短檐，墙面是可看见砖缝的青灰色砖墙，整体紧贴站台边缘。",
   subject:"a very small single-storey station building in grey brick, symmetrical facade with one arched doorway in the middle and two plain square windows either side, thin pitched roof with short overhanging eaves, exposed brick coursing with stone lintels, sitting close to the platform edge, front elevation"},
  {id:"station-04", cat:"station", name:"北京站", en:"Beijing Railway Station",
   kind:"建国十周年十大建筑", era:"1959 年 — 至今",
   tag:"当年的中国第一大客运站，中央钟塔是几代人的记忆",
   intro:"1959 年 9 月，作为建国十周年十大建筑之一的北京站落成启用，是当时中国规模最大、设备最完善的铁路客运站。站房立面严格对称，中央是高起的进站大厅与钟塔，两侧为高耸的塔楼，檐部厚重、立柱整齐；此后很长时间里，它既是中国铁路的门面，也是通往中国东北与华东方向列车的始发地。",
   specs:[["建成时间","1959 年"],["地位","建国十周年十大建筑之一"],["建筑风格","对称立面 + 中央钟塔"],["始发方向","中国东北、华东及国际联运列车"]],
   feats:["当年的中国第一客运大站，第一批现代化铁路站房的代表","中央钟塔至今仍是这一站最醒目的标志","对称的塔楼格局影响了一批后来的大型站房设计"],
   zh:"一栋庄重的对称站房立面，中央是高大的钟塔与下方的入口大厅，两侧各有一座更宽的塔楼夹住构图，窗户为成排的竖长方形，屋檐厚实，檐下有整齐的立柱，通体浅色石材色。",
   subject:"a monumental symmetrical railway station building, tall central clock tower above the main entrance hall, two broad flanking towers framing the composition, rows of tall rectangular windows, deep heavy cornice with a regular colonnade below it, pale stone-toned walls, restrained classical detailing, front elevation"},
  {id:"station-05", cat:"station", name:"广州站", en:"Guangzhou Railway Station",
   kind:"华南铁路门户", era:"1974 年 — 至今",
   tag:"京广线南端的终点，春运故事里最常出现的站名",
   intro:"广州站位于广州市中心城区，是京广铁路南端的门户车站，站房于 1974 年建成启用。它的主立面横向展开、构图对称，中央为带门廊的入口与钟塔，两侧是长条形的候车厅体量，立面为简洁的水平带状窗。作为中国南方最重要的铁路客运站之一，它多年以来一直是无数旅客南下打工、返家过年的起点与终点。",
   specs:[["建成时间","1974 年"],["位置","广州市中心城区"],["线路","京广线南端"],["地位","中国南方重要铁路门户"]],
   feats:["长期承担华南地区最密集的旅客到发任务","对称的横向站房格局是七十年代大型公共建筑的典型做法","站前广场是数十年来春运向全国的公共记忆"],
   zh:"一栋横向很长的对称站房立面，中央一段略微抬高的入口门廊与钟塔，两侧是长长的候车厅体量，水平带状窗一条条贯穿立面，屋檐平直伸出很长，通体浅灰白色。",
   subject:"a long symmetrical railway station building, slightly raised central entrance portico with a clock tower, long low wings of waiting halls stretching to either side, continuous horizontal ribbon windows running across the facade, a straight projecting roofline extending the full width, pale grey-white walls, front elevation"},
  {id:"station-06", cat:"station", name:"上海站", en:"Shanghai Railway Station",
   kind:"八十年代大型客站", era:"1987 年 — 至今",
   tag:"新客站把候车厅架到了轨道上方",
   intro:"1987 年底，新的上海站（俗称新客站）正式启用，接过了老北站的客运业务。它采用当时现代主义的处理方式：站房体量横向铺开，正立面为连续的横向带窗与分段的竖向量体，候车厅架设在轨道上方，旅客进站后向上走而不是向下穿。此后二十多年里，它一直是上海铁路客运的主站，直到高铁时代才把部分功能交给新建的虹桥等车站。",
   specs:[["建成时间","1987 年"],["位置","上海市中心城区"],["建筑特点","横向带窗立面 + 高架候车厅"],["线路","京沪线南端"]],
   feats:["八十年代中国大型铁路客站的代表作","高架候车厅把不同站台流线集中到同一个大厅","立面上的横向带窗简洁统一，是那个年代的典型手法"],
   zh:"一栋体量很长的现代站房，立面被横向窗带一条条划分得很整齐，中间几段竖向的楼梯间与入口体量略微凸出穿插其间，屋面平直，底部有一列通透的入口柱廊，整体为浅色墙面。",
   subject:"a long modern railway station building, facade divided into regular horizontal window bands, several slightly projecting vertical stair and entrance volumes breaking the horizontal rhythm, flat roofline, a recessed colonnade of slender columns along the ground level, pale light-toned walls, front elevation"},
  {id:"station-07", cat:"station", name:"拉萨站", en:"Lhasa Railway Station",
   kind:"青藏铁路终点站", era:"2006 年 — 至今",
   tag:"海拔最高的干线铁路车站，列车进藏的终点",
   intro:"2006 年 7 月 1 日青藏铁路全线通车，拉萨站同时启用，海拔约 3641 米。站房取西藏传统建筑的横向三段式与红白配色，体量方正稳重;站台设有大跨度无柱雨棚，以适应高原强烈的紫外线与风雪。作为青藏铁路上最耀眼的终点，它把坐火车进西藏变成了可能。",
   specs:[["建成时间","2006 年"],["海拔","约 3641 米"],["线路","青藏铁路格拉段终点"],["建筑特点","藏式红白配色 + 大跨无柱雨棚"]],
   feats:["世界海拔最高的铁路干线车站之一","藏式红白配色与横三段构图呼应本地建筑传统","站台无柱雨棚让高原环境下的人流组织更顺畅"],
   zh:"一栋横向铺开的方正站房，立面横向分成上下三段，下部厚重的墙体、中部连续的长窗、上部一条平直的檐帯，主色为白色墙面配合赭红色的檐部与窗套，屋顶平缓。",
   subject:"a horizontally composed railway station building in three stacked bands, thick solid base, continuous window band above it, flat banded cornice on top, white rendered walls with deep ochre-red cornice and window surrounds, gently sloping roof, restrained Tibetan-inspired colour scheme, front elevation"},
  {id:"station-08", cat:"station", name:"北京南站", en:"Beijing South Railway Station",
   kind:"特大型高铁枢纽", era:"2008 年 — 至今",
   tag:"椭圆穹顶下的车站，中国高铁时代的起手式",
   intro:"2008 年 8 月，配合京津城际铁路开通，新的北京南站启用，此后成为京沪高铁的始发站。它的整体是一个椭圆形的巨大体量，屋顶为中央抬起的椭圆穹顶并设采光带，把自然光引入下面的高架候车厅；出站层与地铁、公交无缝衔接，是中国高铁时代最早一批新建特大型枢纽之一。",
   specs:[["建成时间","2008 年"],["线路","京津城际、京沪高铁"],["建筑特点","椭圆体量 + 中央采光穹顶"],["运输","高铁与城际列车始发"]],
   feats:["椭圆穹顶成为此后高铁站房里最著名的一处屋顶","高架候车厅把多条轨道交通流线叠在一个枢纽内","中国高铁网络北端最重要的始发节点"],
   zh:"一个巨大的椭圆体量站房，屋顶呈平缓的弧形穹顶并沿中线开了一条细长的采光带，下层立面是连续通透的玻璃幕墙与规则的竖向构件，四角缓缓落地，整体轮廓宽而低。",
   subject:"a huge elliptical railway station building, gently curved dome roof with a long narrow skylight running along its centre line, continuous glazed curtain wall facades below divided by regular vertical mullions, rounded corners sweeping down to the ground, very wide low-slung silhouette, silver-grey metal cladding, front elevation"},
  {id:"station-09", cat:"station", name:"武汉站", en:"Wuhan Railway Station",
   kind:"京广高铁枢纽", era:"2009 年 — 至今",
   tag:"波浪形大屋顶与树杈般的立柱，最有造型的高铁站之一",
   intro:"2009 年底随武广高铁开通启用的武汉站，是京广高铁中段的重要节点。它的屋顶由若干个单元并排组成连绵的波浪形曲面，立柱自下而上像树枝一样分叉撑住屋架；高架候车厅设在轨道层之上，多个站场并列布置，让换乘与候车集中在一个完整的大空间里。",
   specs:[["建成时间","2009 年"],["线路","京广高铁"],["建筑特点","波浪形大屋顶 + 树状分叉立柱"],["布局","高架候车厅 + 并列站场"]],
   feats:["波浪形屋顶由单元化的曲面重复构成，结构即造型","树状立柱把荷载分散，同时撑起超大跨度的候车空间","多条高铁在此交汇，贯通中国南北的高速主通道"],
   zh:"一个由连续波浪曲面构成屋顶的超长站房，屋顶起伏明显高低错落像一排波浪，下方是通高的玻璃幕墙，能看到内部像树枝一样分叉的Y形立柱，整体外轮廓横向极宽且轻盈。",
   subject:"a very long railway station building crowned by a continuous wave-like roof of repeating curved shells rising and falling in bays, fully glazed facade beneath revealing Y-shaped branching tree columns, horizontal canopy extending along the whole front, aluminium and glass material palette, front elevation"},
  {id:"station-10", cat:"station", name:"上海虹桥站", en:"Shanghai Hongqiao Railway Station",
   kind:"综合交通枢纽高铁站", era:"2010 年 — 至今",
   tag:"高铁、飞机、地铁在同一座枢纽里换乘",
   intro:"2010 年启用的上海虹桥站，是虹桥综合交通枢纽的核心部分：高速铁路、航空、地铁与长途汽车在同一个屋檐下完成换乘。站房体量极大、线条平直，立面密布规则的竖向构件与连续的屋檐；内部把高架候车厅与站台层分区分层布置，是中国高铁网络里到发量最大的车站之一。",
   specs:[["建成时间","2010 年"],["线路","京沪高铁、沪昆高铁等"],["枢纽","虹桥综合交通枢纽核心"],["特点","高铁 + 机场 + 地铁立体换乘"]],
   feats:["把高铁与机场航站楼放进同一座枢纽，换乘步行距离极短","超大体量被平直的屋顶线与竖向构件统一起来","昼夜到发列车量在中国高铁站中位居前列"],
   zh:"一个体量极长、几乎没有弧线的站房，屋顶是一条极长的水平线并挑出很深的屋檐，立面由密集的竖向金属构件与通高玻璃交替排列，整体构图极为规整，通体冷灰色调的金属与玻璃材料。",
   subject:"an extremely long railway station building with almost no curves, one very long straight roofline with a deep projecting eave, facade composed of densely repeated vertical metal fins alternating with full-height glazing, strongly ordered grid-like composition, cool grey aluminium and glass palette, front elevation"},

];

/* ============================ 渲染 ============================ */

var IMG_DIR = "./assets/img/";
/* 图片后缀回退链：图 agent 产出 webp / jpg / png 都能被认出来，不必改代码。 */
var EXTS = ["webp", "jpg", "jpeg", "png"];

/* 顶栏 tab：按 tabKey 归并生成（当前四类各占一个 tab，合并逻辑为将来细分预留） */
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
function findItem(id){
  for(var i = 0; i < ITEMS.length; i++){ if(ITEMS[i].id === id){ return ITEMS[i]; } }
  return null;
}
function escapeHtml(str){
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
/* 列表卡片左上角只标问世年份（era 中「—」之前的一段），完整跨度放到详情页。 */
function eraStart(era){
  return String(era || "").split("—")[0].replace(/\s+$/, "");
}
/* 车站类用建筑立面风格，其余三类用车辆侧视风格。 */
function styleOf(catKey){
  return catKey === "station" ? IMG_STYLE_ARCH : IMG_STYLE;
}

/* 图片框：占位块永远在 DOM 里，实图加载成功后盖在上面。
   图片缺失 / 后缀不符时依次退回 EXTS 的下一个后缀，全部失败则隐藏 img，露出占位块。 */
function shotHtml(base, title, label, cls, catKey, era){
  var eraChip = era ? '<span class="shot-era">' + escapeHtml(era) + '</span>' : '';
  return '<div class="shot ' + cls + '">' +
      '<div class="shot-ph">' +
        (label ? '<span class="bd">' + escapeHtml(label) + '</span>' : '') +
        '<span class="ic">' + (ICONS[catOf(catKey).icon] || ICONS.loco) + '</span>' +
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
  titleEl.textContent = "中国铁路图鉴";
  fabBack.classList.remove("show");
  tabsEl.style.display = "flex";
  app.innerHTML = "";

  var wrap = document.createElement("div");
  wrap.className = "list";

  CATS.forEach(function(c){
    if(activeTab !== "all" && c.tabKey !== activeTab) return;
    var items = ITEMS.filter(function(v){ return v.cat === c.key; });
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
                     '<span class="cnt">' + items.length + ' 项</span>';
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
          '<div class="meta">' + escapeHtml(v.kind) + ' · ' + escapeHtml(v.en) + '</div>' +
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
  var v = findItem(id);
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
                       '<span class="era-pill">' + escapeHtml(v.era) + '</span>' +
                       '<span class="kind-pill">' + escapeHtml(v.kind) + '</span>';
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

  var prompt = styleOf(v.cat) + " " + v.subject;
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

/* 容器已禁用剪贴板类 API，改为选中提示词文本，引导用户长按手动复制。 */
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
