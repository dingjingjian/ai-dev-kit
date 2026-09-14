/* 世界美食大百科 · 数据集
 * 每条记录字段：
 *   name        菜名
 *   country     国家
 *   city        城市
 *   lat, lon    经纬度（用于在地球上定位）
 *   continent   大洲：asia/europe/africa/nam/sam/oce
 *   intro       介绍（50-80 字）
 *   ingredients 关键食材
 *   tags        风味/烹饪标签
 *   color       色卡主色（程序化代替图片）
 */
var FOODS=[
  /* ===== 亚洲 ===== */
  {name:'北京烤鸭',country:'中国',city:'北京',lat:39.9,lon:116.4,continent:'asia',color:'#8b3a1f',
    intro:'果木明火吊烤八九十分钟，皮酥肉嫩、枣红透亮。片皮蘸甜面酱、葱丝，卷薄饼而食，是国宴上的常客。',
    ingredients:['填鸭','果木','甜面酱','大葱','薄饼'],tags:['烤制','皮酥','国宴']},
  {name:'小笼包',country:'中国',city:'上海',lat:31.2,lon:121.5,continent:'asia',color:'#f5e6d3',
    intro:'皮冻入馅，蒸化为一包鲜汤。咬破薄皮先吸汤再吃馅，"轻轻提、慢慢移、先开窗、后喝汤"是吃法口诀。',
    ingredients:['猪夹心肉','皮冻','高汤','面粉'],tags:['蒸制','鲜汤','点心']},
  {name:'寿司',country:'日本',city:'东京',lat:35.7,lon:139.7,continent:'asia',color:'#e63946',
    intro:'以醋米握成一口饭团，覆上生鲜鱼料。江户前寿司讲究"握"的力道与温度，鱼料温要与体温相近才鲜。',
    ingredients:['醋米','金枪鱼','鲷鱼','山葵','酱油'],tags:['生食','醋饭','江户前']},
  {name:'韩式烤肉',country:'韩国',city:'首尔',lat:37.6,lon:127.0,continent:'asia',color:'#7a1f1f',
    intro:'炭火铜盘上烤五花肉、牛小排，肉汁与油香在高温下瞬间锁住。生菜包肉、蒜片、辣酱同食，解腻增香。',
    ingredients:['五花肉','牛小排','辣酱','生菜','蒜片'],tags:['烤制','包食','炭火']},
  {name:'冬阴功',country:'泰国',city:'曼谷',lat:13.8,lon:100.5,continent:'asia',color:'#ff6b35',
    intro:'香茅、南姜、青柠叶熬出酸香底汤，加入椰浆与朝天椒。酸辣鲜香四味同台，被誉为世界三大名汤之一。',
    ingredients:['虾','香茅','南姜','青柠','椰浆','辣椒'],tags:['酸辣','汤','椰浆']},
  {name:'印度咖喱',country:'印度',city:'新德里',lat:28.6,lon:77.2,continent:'asia',color:'#d4a017',
    intro:'数十种香料现磨现炒，姜黄、孜然、小豆蔻层层叠叠。南北印度咖喱风味迥异：北浓奶，南重椰与酸。',
    ingredients:['姜黄','孜然','小豆蔻','洋葱','番茄','酥油'],tags:['香料','炖煮','素食']},
  {name:'越南河粉',country:'越南',city:'河内',lat:21.0,lon:105.8,continent:'asia',color:'#c9a37a',
    intro:'牛骨文火熬汤十二小时，汤清味醇。滚汤冲熟薄粉，配九层塔、豆芽、青柠，挤柠檬一口鲜甜。',
    ingredients:['牛骨','河粉','九层塔','青柠','鱼露'],tags:['汤面','清鲜','慢熬']},
  {name:'沙威玛',country:'土耳其',city:'伊斯坦布尔',lat:41.0,lon:28.9,continent:'asia',color:'#6b3410',
    intro:'层层腌肉叠上垂直烤柱，外层烤焦就片下夹饼。配蒜酱、酸黄瓜、番茄，街头一卷便是伊斯坦布尔的午后。',
    ingredients:['鸡肉','羊肉','蒜酱','皮塔饼','腌菜'],tags:['烤制','街头','卷饼']},
  {name:'肉骨茶',country:'马来西亚',city:'吉隆坡',lat:3.1,lon:101.7,continent:'asia',color:'#4a2c1a',
    intro:'排骨、当归、川芎、八角同煲，汤色深褐药香扑鼻。巴生派重药味，福建派重汤色，配油条蘸酱油吃。',
    ingredients:['排骨','当归','八角','蒜','油条'],tags:['药膳','煲汤','南洋']},
  {name:'茶碗蒸',country:'日本',city:'京都',lat:35.0,lon:135.7,continent:'asia',color:'#f4d35e',
    intro:'高汤、蛋液以 1:3 调和，小火慢蒸至中心微颤。揭开茶碗一抹柴鱼片香气，是怀石里的温柔一笔。',
    ingredients:['蛋液','高汤','银杏','香菇','海老'],tags:['蒸制','怀石','温润']},

  /* ===== 欧洲 ===== */
  {name:'那不勒斯披萨',country:'意大利',city:'那不勒斯',lat:40.8,lon:14.4,continent:'europe',color:'#c1272d',
    intro:'圣马扎诺番茄、水牛马苏里拉、罗勒，三味而已。450° 果木窑烤 60 秒，饼边起泡焦斑，是披萨的"原点"。',
    ingredients:['00 面粉','圣马扎诺番茄','水牛芝士','罗勒'],tags:['烤制','原产','极简']},
  {name:'法国可颂',country:'法国',city:'巴黎',lat:48.9,lon:2.4,continent:'europe',color:'#d4a017',
    intro:'黄油反复折叠三次，层层起酥 27 层。外皮金黄酥脆，内里蜂巢气孔，咬下"咔嚓"一声是巴黎清晨的声音。',
    ingredients:['面粉','黄油','酵母','蛋液'],tags:['烘焙','起酥','早餐']},
  {name:'西班牙海鲜饭',country:'西班牙',city:'巴伦西亚',lat:39.5,lon:-0.4,continent:'europe',color:'#e8853a',
    intro:'米粒吸饱藏红花高汤与海鲜汁液，锅底结一层金黄锅巴。正宗吃法不拌不翻，直接从锅边铲起一勺。',
    ingredients:['西班牙短米','藏红花','虾','青口','鱿鱼'],tags:['焖饭','锅巴','原产']},
  {name:'德国猪脚',country:'德国',city:'慕尼黑',lat:48.1,lon:11.6,continent:'europe',color:'#6b3410',
    intro:'猪前腿先煮后烤，皮脆肉糯。配酸菜、芥末与黑啤，一桌巴伐利亚的豪迈，吃的是手与刀的较量。',
    ingredients:['猪前腿','酸菜','芥末','黑啤'],tags:['烤制','下酒','豪迈']},
  {name:'炸鱼薯条',country:'英国',city:'伦敦',lat:51.5,lon:-0.1,continent:'europe',color:'#f4c430',
    intro:'鳕鱼裹啤酒面糊炸至金黄，外脆内嫩。配粗切薯条淋麦芽醋，是英国人午休时裹报纸卷起的一束暖意。',
    ingredients:['鳕鱼','啤酒面糊','土豆','麦芽醋'],tags:['油炸','街头','国民']},
  {name:'希腊木沙卡',country:'希腊',city:'雅典',lat:38.0,lon:23.7,continent:'europe',color:'#b5651d',
    intro:'茄子、土豆、肉酱层层叠叠，覆以贝夏梅白酱烤至焦黄。一勺挖下三层风味，是希腊家宴的周日仪式。',
    ingredients:['茄子','土豆','肉酱','贝夏梅酱'],tags:['烤制','层叠','家宴']},
  {name:'罗宋汤',country:'俄罗斯',city:'莫斯科',lat:55.8,lon:37.6,continent:'europe',color:'#be3a3a',
    intro:'甜菜根炖出深红汤色，加牛肉、卷心菜与一勺酸奶油。冷热两吃皆宜，是俄罗斯漫长冬日里的一抹暖红。',
    ingredients:['甜菜根','牛肉','卷心菜','酸奶油'],tags:['汤','酸甜','冬食']},
  {name:'芝士火锅',country:'瑞士',city:'苏黎世',lat:47.4,lon:8.5,continent:'europe',color:'#e8c547',
    intro:'锅擦蒜瓣，倒白葡萄酒与格鲁耶尔芝士，小火搅至拉丝。面包块蘸而食之，是阿尔卑斯雪夜里的暖炉。',
    ingredients:['格鲁耶尔芝士','白葡萄酒','面包','蒜'],tags:['融芝士','蘸食','冬食']},

  /* ===== 非洲 ===== */
  {name:'塔吉锅',country:'摩洛哥',city:'马拉喀什',lat:31.6,lon:-8.0,continent:'africa',color:'#a0522d',
    intro:'锥形陶盖让蒸汽冷凝回流，无水慢炖数小时。羊肉、杏脯、香料层层叠叠，揭开陶盖是柏柏尔人的智慧。',
    ingredients:['羊肉','杏脯','孜然','肉桂','陶锅'],tags:['慢炖','甜咸','无水']},
  {name:'英吉拉',country:'埃塞俄比亚',city:'亚的斯亚贝巴',lat:9.0,lon:38.7,continent:'africa',color:'#6b4423',
    intro:'苔麸发酵三天，摊成海绵状酸饼。各种炖菜堆于饼上，徒手撕饼蘸食，一桌人围吃是一桌人的关系。',
    ingredients:['苔麸粉','炖菜','辣粉','黄油'],tags:['发酵','手食','共享']},
  {name:'库纳法',country:'埃及',city:'开罗',lat:30.0,lon:31.2,continent:'africa',color:'#d4a017',
    intro:'细如发丝的面丝缠绕软芝士，烤至金黄酥脆，浇玫瑰糖浆。一勺拉出长长的芝士丝，是开罗夜市的甜梦。',
    ingredients:['面丝','软芝士','糖浆','玫瑰水'],tags:['甜点','烤制','拉丝']},
  {name:'南非烤肉',country:'南非',city:'开普敦',lat:-33.9,lon:18.4,continent:'africa',color:'#4a2c1a',
    intro:'南非人称 Braai 为国民活动。炭火明烈，牛排、羊肉串、博尔沃斯香肠齐上，配玉米糊与番茄洋葱酱。',
    ingredients:['牛排','羊肉','博尔沃斯香肠','玉米糊'],tags:['烤制','国民','社交']},
  {name:'贾洛夫饭',country:'尼日利亚',city:'拉各斯',lat:6.5,lon:3.4,continent:'africa',color:'#e63946',
    intro:'长米在番茄、辣椒、肉汤中染成橘红，一锅焖出粒粒分明。配烤鸡或炸鱼，是西非家宴与派对的主角。',
    ingredients:['长米','番茄','辣椒','肉汤','烟熏鱼'],tags:['焖饭','香辣','西非']},

  /* ===== 北美洲 ===== */
  {name:'汉堡',country:'美国',city:'纽约',lat:40.7,lon:-74.0,continent:'nam',color:'#6b3410',
    intro:'牛肉饼大火煎出焦壳，夹入软包，配生菜、番茄、洋葱与一抹酱汁。一手掌握的丰腴，是美式快食能量的源头。',
    ingredients:['牛肉饼','面包','切达芝士','生菜','番茄'],tags:['煎制','快餐','丰腴']},
  {name:'深盘披萨',country:'美国',city:'芝加哥',lat:41.9,lon:-87.6,continent:'nam',color:'#c1272d',
    intro:'深盘如派，饼皮立起三寸。先铺芝士、再堆馅料、最后倒番茄酱封顶。烤完倒扣，一刀下去馅料如熔岩涌出。',
    ingredients:['深盘饼皮','马苏里拉','番茄酱','香肠'],tags:['烤制','厚派','芝士']},
  {name:'墨西哥塔可',country:'墨西哥',city:'墨西哥城',lat:19.4,lon:-99.1,continent:'nam',color:'#d62828',
    intro:'玉米软饼托起烤肉、洋葱、香菜，挤青柠、淋莎莎酱。街头小贩两手翻飞，一卷一递，是墨西哥的清晨。',
    ingredients:['玉米饼','烤肉','香菜','青柠','莎莎酱'],tags:['卷饼','街头','香辣']},
  {name:'普丁',country:'加拿大',city:'蒙特利尔',lat:45.5,lon:-73.6,continent:'nam',color:'#e8c547',
    intro:'炸薯条铺上新鲜奶酪凝块，浇滚烫肉汁。奶酪块在热汁中半融不融，一勺下去又脆又软又咸鲜，是加拿大的冬夜。',
    ingredients:['炸薯条','奶酪凝块','肉汁'],tags:['浇汁','热食','国民']},
  {name:'古巴三明治',country:'古巴',city:'哈瓦那',lat:23.1,lon:-82.4,continent:'nam',color:'#b5651d',
    intro:'古巴面包夹烤猪肉、火腿、瑞士芝士、酸黄瓜与黄芥末，压烤至两面焦脆。一切两半，是哈瓦那午后的便当。',
    ingredients:['古巴面包','烤猪肉','火腿','瑞士芝士','芥末'],tags:['压烤','三明治','咸鲜']},

  /* ===== 南美洲 ===== */
  {name:'巴西烤肉',country:'巴西',city:'圣保罗',lat:-23.5,lon:-46.6,continent:'sam',color:'#7a1f1f',
    intro:'罗德里戈大厨仅以粗盐调味，长铁串串起整块牛腩，悬于炭火坑烤。侍者串串上门，一刀切下，是南美的豪放。',
    ingredients:['牛腩','粗盐','铁串','菠萝'],tags:['烤制','自助','粗盐']},
  {name:'阿根廷烤肉',country:'阿根廷',city:'布宜诺斯艾利斯',lat:-34.6,lon:-58.4,continent:'sam',color:'#6b3410',
    intro:'Asado 是阿根廷的周日仪式。整肋排立架于炭火旁，慢烤三小时，配奇米丘里酱与马尔贝克红酒，肉香与酒香相和。',
    ingredients:['牛肋排','奇米丘里酱','红酒'],tags:['慢烤','家宴','配酒']},
  {name:'酸橘汁腌鱼',country:'秘鲁',city:'利马',lat:-12.0,lon:-77.0,continent:'sam',color:'#f4d35e',
    intro:'生鱼块浸入青柠汁，酸使蛋白变性如"熟"。配红洋葱、辣椒、玉米粒，是太平洋岸的鲜美与印加的酸辣。',
    ingredients:['生鱼','青柠','红洋葱','辣椒','玉米粒'],tags:['生腌','酸辣','原产']},
  {name:'玉米馅饼',country:'智利',city:'圣地亚哥',lat:-33.4,lon:-70.6,continent:'sam',color:'#e8c547',
    intro:'Pastel de Choclo：玉米面糊覆于牛肉、鸡肉、橄榄、水煮蛋之上，烤至表面焦糖色。一勺挖到底，是智利的家常味道。',
    ingredients:['玉米面','牛肉','鸡肉','橄榄','水煮蛋'],tags:['烤制','家常','甜咸']},

  /* ===== 大洋洲 ===== */
  {name:'澳洲肉派',country:'澳大利亚',city:'悉尼',lat:-33.9,lon:151.2,continent:'oce',color:'#8b5a2b',
    intro:'酥皮派壳灌入肉块与浓汁，顶覆一坨番茄酱。一手捧热派一脚踩球赛，是澳洲午休的国民姿势。',
    ingredients:['酥皮','牛肉','肉汁','番茄酱'],tags:['烘焙','国民','街头']},
  {name:'毛利地炉',country:'新西兰',city:'惠灵顿',lat:-41.3,lon:174.8,continent:'oce',color:'#4a2c1a',
    intro:'Hangi：挖坑、烧热石、铺湿布，肉与菜裹布埋入地中蒸三四小时。烟熏土香沁入食材，是毛利人千年的地火。',
    ingredients:['鸡肉','猪肉','红薯','热石','亚麻布'],tags:['地蒸','烟熏','原住民']},
  {name:'夏威夷拌鱼',country:'美国',city:'檀香山',lat:21.3,lon:-157.9,continent:'oce',color:'#f4a4a4',
    intro:'Poke：切块生鱼拌酱油、麻油、海藻、洋葱。本是渔夫船上的零食，如今是夏威夷便当盒里的一抹海洋鲜。',
    ingredients:['生鱼','酱油','麻油','海藻','洋葱'],tags:['生食','凉拌','海岛']}
];
