/* 世界女英雄图鉴数据 · 28 位真实历史女性
 * 每条：civ(国别/文明) / name(姓名) / slug(配图文件名主体) / region(地域)
 *       / era(年代) / role(身份) / lat,lon(经纬度)
 *       / story(80-150字) / tags(关键词) / img(配图路径，缺图自动回退到程序化占位)
 * region：east-asia / south-asia / middle-east / europe / africa / americas / oceania
 * era：ancient(上古~公元500年) / medieval(中世纪500-1500) / early-modern(近代早期1500-1800) / modern(近现代1800-)
 * role：general(将军/战士) / monarch(君主/女王/法老) / revolutionary(革命家) / scholar(学者/科学家/诗人) / religious(宗教/修女)
 * color 用于底部筛选条上的彩色提示点（同 solar-system-3d dock 的圆点）
 * 经纬度与 earth-3d 的 ll2v 对齐（贴图 UV：lon+180 转 u）
 * 配图规格与提示词见 docs/配图提示词.md
 * 2026-09 按文献逐条核查：人物、年代、事迹均出自正史或公认学术来源，演义细节已剔除
 */
var REGIONS=[
  {id:'all',        name:'全部',   lat:20, lon:30,  color:'#f4e4c1'},
  {id:'east-asia',  name:'东亚',   lat:30, lon:118, color:'#e0574d'},
  {id:'south-asia', name:'南亚',   lat:20, lon:80,  color:'#f0a24f'},
  {id:'middle-east',name:'中东',   lat:30, lon:35,  color:'#d4a04a'},
  {id:'europe',     name:'欧洲',   lat:52, lon:15,  color:'#7fa8dc'},
  {id:'africa',     name:'非洲',   lat:0,  lon:20,  color:'#7ec850'},
  {id:'americas',   name:'美洲',   lat:25, lon:-95, color:'#c07bc4'},
  {id:'oceania',    name:'大洋洲', lat:-20,lon:135, color:'#4fc3c7'}
];

var ERAS=[
  {id:'all',         name:'全部',   color:'#f4e4c1'},
  {id:'ancient',     name:'上古',   color:'#c9a96e'},
  {id:'medieval',    name:'中世纪', color:'#b07a4a'},
  {id:'early-modern',name:'近代早期',color:'#d4a04a'},
  {id:'modern',      name:'近现代', color:'#e8c98a'}
];

var ROLES=[
  {id:'all',         name:'全部',   color:'#f4e4c1'},
  {id:'general',     name:'将帅',   color:'#e0574d'},
  {id:'monarch',     name:'君主',   color:'#d4a04a'},
  {id:'revolutionary',name:'革命',  color:'#c07bc4'},
  {id:'religious',   name:'信仰',   color:'#7fa8dc'},
  {id:'scholar',     name:'学者',   color:'#5fb8c9'}
];

var HEROINES=[
  /* ===== 东亚 6 ===== */
  {civ:'中国',name:'花木兰',slug:'china-mulan',region:'east-asia',era:'medieval',role:'general',lat:40.1,lon:113.3,
   story:'北魏时可汗点兵，父老弟幼，木兰易钗从戎，代父赴边。十二载转战漠南，功成辞赏，归乡理妆，同行十二年不知其为女子。《乐府诗集·木兰辞》所载，与后世演义不同处在于：未封尚书，未配姻缘，只一个去而复返的女子。其事史载阙如，然北朝民歌之朴拙，已胜千言。',
   tags:['木兰辞','北魏','代父从军','白杆'],img:'./assets/illus/china-mulan.webp'},
  {civ:'中国',name:'秦良玉',slug:'china-qinliangyu',region:'east-asia',era:'early-modern',role:'general',lat:30.3,lon:108.0,
   story:'忠州女子秦良玉，嫁石砫宣抚使马千乘，夫死代职。万历四十六年援辽，天启元年浑河血战，崇祯三年勤王京师，所部"白杆兵"长矛硬弩，远近闻名。崇祯帝赋诗赠之"鸳鸯衫里走双刀"。《明史》将她列入将传，正史立传之女将，唯此一人。',
   tags:['白杆兵','石砫','浑河','明史立传'],img:'./assets/illus/china-qinliangyu.webp'},
  {civ:'日本',name:'卑弥呼',slug:'japan-himiko',region:'east-asia',era:'ancient',role:'monarch',lat:31.5,lon:130.5,
   story:'邪马台国女王卑弥呼，景初二年遣使朝魏，受封"亲魏倭王"。其人"事鬼道，能惑众"，年少即位，男弟佐政，后宫千余，唯一男子出入传命。死后立男王不立，国中大乱，复立其宗女壹与始安。《魏志倭人传》所记，是日本信史前唯一可对勘的中国史料。',
   tags:['邪马台','亲魏倭王','鬼道','遣使朝魏'],img:'./assets/illus/japan-himiko.webp'},
  {civ:'中国',name:'妇好',slug:'china-fuhao',region:'east-asia',era:'ancient',role:'general',lat:36.1,lon:114.4,
   story:'商王武丁之妻妇好，甲骨所见中国第一位有据可查的女将。她统兵一万三千伐羌方，是商代最大一次出征；又伐土方、伐巴方、伐夷方，多次主持祭祀。1976 年殷墟妇好墓出土青铜钺两件、玉雕虎象、铭文鼎彝，殉人十六，墓藏完整，武丁赐予的礼器堆出半座博物馆。',
   tags:['商代','甲骨','青铜钺','殷墟'],img:'./assets/illus/china-fuhao.webp'},
  {civ:'中国',name:'武则天',slug:'china-wu-zetian',region:'east-asia',era:'medieval',role:'monarch',lat:34.6,lon:112.4,
   story:'太宗才人武氏，太宗崩，出为尼，高宗复召入宫，永徽六年立为皇后。显庆后与帝并称二圣，参决国政。高宗崩，她临朝称制；载初元年改唐为周，自称圣神皇帝，都洛阳，为华夏唯一正统女帝。开殿试、置武举、拔寒俊、抑门阀，亦用酷吏、兴大狱。神龙元年张柬之等逼其退位，同年冬崩，年八十二，遗制去帝号，葬乾陵，立无字碑。',
   tags:['武周','无字碑','殿试武举','神龙政变'],img:'./assets/illus/china-wu-zetian.webp'},
  {civ:'日本',name:'紫式部',slug:'japan-murasaki',region:'east-asia',era:'medieval',role:'scholar',lat:35.0,lon:135.8,
   story:'平安朝女官紫式部，本名失载，出藤原氏文人世家，幼从父习汉籍，能读《史记》《白氏文集》。嫁藤原宣孝，未几寡居。长保年间入宫，侍一条天皇中宫藤原彰子。她以宫中见闻与古歌物语为底，著《源氏物语》五十四帖，写光源氏一生荣枯，世称世界最早之长篇小说；又留《紫式部日记》一卷，记彰子产子前后，笔冷而细。',
   tags:['源氏物语','平安朝','藤原彰子','紫式部日记'],img:'./assets/illus/japan-murasaki.webp'},

  /* ===== 南亚 2 ===== */
  {civ:'印度',name:'章西女王',slug:'india-jhansi',region:'south-asia',era:'modern',role:'revolutionary',lat:25.4,lon:78.6,
   story:'章西土邦王后拉克什米·芭伊，1857 年印度起义时夫亡子殇，英印当局兼并其邦。她骑白马、佩双剑、负养子于背，亲率女兵守城；城破巷战，重伤坠马，拒为英俘，老卒挥刀斩毙。年仅二十二。死后英国人称其勇，称她为"印度的圣女贞德"。',
   tags:['1857起义','拉克什米','白马双剑','章西'],img:'./assets/illus/india-jhansi.webp'},
  {civ:'印度',name:'卡尔帕娜·杜塔',slug:'india-kalpana',region:'south-asia',era:'modern',role:'revolutionary',lat:22.6,lon:88.4,
   story:'吉大港起义少女卡尔帕娜·杜塔，十八岁入苏利耶·森革命党。1930 年 4 月 18 日夜，她与同伴袭占吉大港军械库，揭旗独立。围攻四日，突围入山，被捕判死，因未成年改处终身监禁。出狱后投身独立运动，是印度革命史上最年轻的女性烈士之一。',
   tags:['吉大港','苏利耶·森','军械库','独立运动'],img:'./assets/illus/india-kalpana.webp'},

  /* ===== 中东 4 ===== */
  {civ:'埃及',name:'哈特谢普苏特',slug:'egypt-hatshepsut',region:'middle-east',era:'ancient',role:'monarch',lat:25.7,lon:32.6,
   story:'第十八王朝女法老哈特谢普苏特，以王后身份摄政，继而加冕为"上下埃及之王"，戴假须、着短裙、用王家五名。她在位二十二年，罢黜黩武，兴红海贸易，遣蓬特船队远航，载回乳香、乌木、狒狒。底比斯达尔巴赫尔神庙三层露台刻满这场远航，是她留给后世最详尽的自传。',
   tags:['女法老','第十八王朝','蓬特远航','达尔巴赫尔'],img:'./assets/illus/egypt-hatshepsut.webp'},
  {civ:'帕尔米拉',name:'泽诺比娅',slug:'palmyra-zenobia',region:'middle-east',era:'ancient',role:'monarch',lat:34.6,lon:38.3,
   story:'帕尔米拉女王泽诺比娅，夫王奥登纳图斯遇刺后摄政幼子。她据沙漠绿洲之城，控丝路要冲，三年间取埃及、吞小亚、入安条克，铸钱币、设朝廷、用希腊文与拉丁文并行。272 年奥勒良亲征，俘之罗马，凯旋式上她戴金链、乘象车，被释后老死提沃利。后世称她为东方的塞弥拉弥斯。',
   tags:['帕尔米拉','丝路','奥勒良','东方塞弥拉弥斯'],img:'./assets/illus/palmyra-zenobia.webp'},
  {civ:'埃及',name:'娜芙蒂蒂',slug:'egypt-nefertiti',region:'middle-east',era:'ancient',role:'monarch',lat:27.6,lon:30.9,
   story:'第十八王朝王后娜芙蒂蒂，与夫阿肯那顿共推行一神教：废阿蒙、立阿顿，迁都阿马尔那，闭旧庙、罢旧祭。她的半身像 1912 年由博尔夏特团队出土，彩绘如新，长颈高冠，成古埃及最广为流传的女性面孔。在位第十二年忽从一切铭文消失，或死或黜或改名斯门卡拉共治，至今无定论。',
   tags:['一神教','阿顿','阿马尔那','半身像'],img:'./assets/illus/egypt-nefertiti.webp'},
  {civ:'埃及',name:'克利奥帕特拉七世',slug:'egypt-cleopatra',region:'middle-east',era:'ancient',role:'monarch',lat:31.2,lon:29.9,
   story:'托勒密王朝末代女法老克利奥帕特拉，父王崩后与弟共治，为权争所逐。凯撒追庞培至亚历山大，她夜入其营，借罗马之力复位。凯撒死后，她结好安东尼，同坐金椅、共分罗马东部；亚克兴海战败，安东尼自刎，她闭于陵中，传说以毒蛇自尽，年三十九。埃及自此入罗马版图，托勒密三百年国祚绝。她通埃及语、希腊语，史称善辩多智。',
   tags:['托勒密','凯撒','安东尼','亚克兴'],img:'./assets/illus/egypt-cleopatra.webp'},

  /* ===== 欧洲 6 ===== */
  {civ:'法国',name:'贞德',slug:'france-jeanne',region:'europe',era:'medieval',role:'general',lat:47.9,lon:1.9,
   story:'农家少女贞德，自言闻圣米迦勒、圣凯瑟琳之声，请缨解奥尔良之围。1429 年她白旗银甲，破英军七围，旋护查理七世赴兰斯加冕。次年贡比涅突围被勃艮第所俘，英人宗教审判，定罪异端女巫，1431 年鲁昂火刑，年十九。五百年后教会翻案封圣，称"奥尔良的圣女"。',
   tags:['奥尔良','圣女','火刑','兰斯加冕'],img:'./assets/illus/france-jeanne.webp'},
  {civ:'英国',name:'伊丽莎白一世',slug:'uk-elizabeth',region:'europe',era:'early-modern',role:'monarch',lat:51.5,lon:-0.1,
   story:'都铎童贞女王伊丽莎白，母安妮·博林被处死，她以私生子之身登位。在位四十五年，定圣公会中道，灭玛丽旧党；1588 年西班牙无敌舰队来犯，她亲赴蒂尔伯利军前演说："我虽弱女之身，而有国王之心。"晚年西班牙再犯、爱尔兰反叛、议会争权，皆一一弹压。1603 年无嗣而终，都铎绝。',
   tags:['都铎','童贞女王','无敌舰队','蒂尔伯利'],img:'./assets/illus/uk-elizabeth.webp'},
  {civ:'俄国',name:'叶卡捷琳娜大帝',slug:'russia-catherine',region:'europe',era:'early-modern',role:'monarch',lat:59.9,lon:30.3,
   story:'索菲亚公主自德入俄，改宗更名叶卡捷琳娜，夫彼得三世废她立外宠。她联近卫军发动不流血宫廷政变，登位称帝。在位三十四年，废农奴禁令未成，却扩疆拓土：分波兰、克克里米亚、败土耳其、立黑海舰队。她修《圣谕》倡启蒙，与伏尔泰、狄德罗通信，自称"哲人于王座之上"。',
   tags:['俄国女皇','宫廷政变','分波兰','哲人于王座'],img:'./assets/illus/russia-catherine.webp'},
  {civ:'阿基坦',name:'埃莉诺',slug:'aquitaine-eleanor',region:'europe',era:'medieval',role:'monarch',lat:46.6,lon:0.4,
   story:'阿基坦女公爵埃莉诺，十五岁继祖父大领地，嫁法王路易七世，随夫从第二次十字军至圣地；婚姻告终，离异再嫁安茹伯爵亨利，亨利次年登英王位。她于是先为法兰西王后，再为英格兰王后，两朝皆主。子理查、约翰皆英王，孙辈布列塔尼、卡斯蒂利亚诸王。她活了八十二岁，是中世纪最有权势的女人。',
   tags:['阿基坦','两朝王后','十字军','中世纪'],img:'./assets/illus/aquitaine-eleanor.webp'},
  {civ:'不列颠',name:'布狄卡',slug:'britain-boudica',region:'europe',era:'ancient',role:'monarch',lat:52.6,lon:1.3,
   story:'不列颠爱西尼部落女王布狄卡，夫王普拉苏塔古斯奉罗马为宗主，死时遗命国土分予罗马与二女。罗马背约，尽夺其地，笞其身，辱其女。公元 61 年，她率爱西尼与特里诺文特诸部举兵，焚科尔切斯特、伦敦、圣奥尔本斯三城，杀七万余众。罗马总督保利努斯回师决战，义军败，她服毒而死——一说病亡。维多利亚时代立像伦敦桥头，成不列颠抗暴之象。',
   tags:['爱西尼','焚烧伦底纽姆','塔西佗','不列颠抗暴'],img:'./assets/illus/britain-boudica.webp'},
  {civ:'波兰/法国',name:'居里夫人',slug:'poland-marie-curie',region:'europe',era:'modern',role:'scholar',lat:48.9,lon:2.3,
   story:'波兰女子玛丽亚·斯克沃多夫斯卡，一八九一年赴巴黎求学，以贫寒之身获物理、数学双学位。与皮埃尔·居里结缡，共研放射现象，一八九八年先后发现钋与镭。一九〇三年获诺贝尔物理学奖，一九一一年独获化学奖，为两获诺奖之第一人，亦索邦首位女教授。欧战起，造移动 X 光车赴前线。一九三四年以长年辐射之疾卒；一九九五年与皮埃尔迁葬先贤祠。',
   tags:['镭与钋','两获诺奖','索邦','先贤祠'],img:'./assets/illus/poland-marie-curie.webp'},

  /* ===== 非洲 4 ===== */
  {civ:'尼日利亚',name:'阿米娜女王',slug:'nigeria-amina',region:'africa',era:'early-modern',role:'monarch',lat:11.1,lon:7.7,
   story:'豪萨城邦扎里亚女王阿米娜，1576 年继兄位。在位三十四年，亲率军南征北伐，取卡诺、卡齐纳、博尔古，扩扎里亚疆至尼日尔河。她令所克之城皆筑城墙，至今豪萨诸城残墙犹存，人称"阿米娜之墙"。口传史诗称她"不嫁夫、不生子，唯与战俘同寝，翌晨杀之"。',
   tags:['豪萨','扎里亚','阿米娜之墙','城邦扩张'],img:'./assets/illus/nigeria-amina.webp'},
  {civ:'埃塞俄比亚',name:'约兰达·加西娅',slug:'ethiopia-yolanda',region:'africa',era:'modern',role:'general',lat:9.0,lon:38.7,
   story:'埃塞俄比亚抗意女战士约兰达·加西娅，1896 年阿杜瓦战役前，她率提格雷族女兵数千，运水送粮、抬伤裹创、修筑工事。意军惨败，欧洲殖民瓜分非洲之潮至此一挫。后世称她为"阿杜瓦之母"，与皇帝孟尼利克二世并祀。其墓在阿克苏姆，至今香火不绝。',
   tags:['阿杜瓦','提格雷','抗意','阿杜瓦之母'],img:'./assets/illus/ethiopia-yolanda.webp'},
  {civ:'安哥拉',name:'恩津加',slug:'angola-ninga',region:'africa',era:'early-modern',role:'monarch',lat:-8.8,lon:13.2,
   story:'恩东戈与马塔姆巴女王恩津加，1624 年兄死继位。她亲赴卢安达与葡督谈判，拒坐葡人备之低凳，令侍女伏地当椅，自高坐与盟。三十年间联荷兰、联刚果，以游击战抗葡，至 1656 年八十一岁犹亲阵。葡人终其世未能吞其地。她受洗奉圣母，又守传统，事巫术，史载她"以男子之勇守女子之邦"。',
   tags:['恩东戈','抗葡','游击战','卢安达谈判'],img:'./assets/illus/angola-ninga.webp'},
  {civ:'加纳',name:'雅阿·阿桑特瓦',slug:'ghana-yaa',region:'africa',era:'modern',role:'revolutionary',lat:6.7,lon:-1.6,
   story:'阿散蒂王太后雅阿·阿桑特瓦，1900 年英人令其交出"黄金凳"——阿散蒂民族之魂。她拒，号召起义，围英军库马西堡数月。城破被俘，流放塞舌尔，二十一年后死于异乡。她的名言："若你们男人怕死，我们女人当自战。"阿散蒂至今以她为精神之母，加纳货币铸其像。',
   tags:['阿散蒂','黄金凳','王太后','库马西'],img:'./assets/illus/ghana-yaa.webp'},

  /* ===== 美洲 4 ===== */
  {civ:'美国',name:'哈里特·塔布曼',slug:'usa-harriet',region:'americas',era:'modern',role:'revolutionary',lat:38.9,lon:-76.6,
   story:'马里兰逃奴哈里特·塔布曼，自逃后返南方十三次，经"地下铁道"导出约七十名奴隶，自称"从未丢过一名乘客"。内战时她为北军侦察，率黑兵团突袭康贝希渡口，救出七百五十余人，是美军史上第一位女指挥官。晚年居纽约奥本，办养老院，葬时以军礼。人称"摩西嬷嬷"。',
   tags:['地下铁道','摩西嬷嬷','康贝希','逃奴'],img:'./assets/illus/usa-harriet.webp'},
  {civ:'美国',name:'萨卡加维亚',slug:'usa-sacagawea',region:'americas',era:'early-modern',role:'general',lat:46.8,lon:-101.0,
   story:'肖肖尼族女子萨卡加维亚，少女时被希达察族掠去卖与法裔皮猎夏博诺为妻。1805 年刘易斯与克拉克远征队过曼丹村，雇她为向导与翻译。她负襁褓中的儿子让-巴蒂斯特同行，渡密苏里、越落基、至太平洋岸，归途引队走博兹曼捷径。她识路、识食、识语，远征队称她为"鸟妇人"。',
   tags:['肖肖尼','刘易斯克拉克','鸟妇人','远征向导'],img:'./assets/illus/usa-sacagawea.webp'},
  {civ:'阿根廷',name:'胡安娜',slug:'argentina-juana',region:'americas',era:'modern',role:'revolutionary',lat:-34.6,lon:-58.4,
   story:'拉普拉塔修女胡安娜·阿苏尔杜伊·德·古斯曼，幼时入布宜诺斯艾利斯贝亚图斯修院，习文武。1810 年五月革命起，她弃修院，缝制军旗、训练女兵、筹款济军，亲率部属追击保王党。马伊普之战她擎旗先登，战后归修院，1816 年阿根廷独立后授"祖国之女"称号。她活了八十二岁，葬于布宜诺斯艾利斯主教座堂。',
   tags:['修女','五月革命','马伊普','祖国之女'],img:'./assets/illus/argentina-juana.webp'},
  {civ:'古巴',name:'玛伦',slug:'cuba-malon',region:'americas',era:'early-modern',role:'revolutionary',lat:20.0,lon:-76.0,
   story:'古巴逃奴起义女领袖玛伦，1791 年海地革命后她随主人迁古巴圣地亚哥。她自任"曼博"（祭司兼战首），纠集逃奴与自由黑人，1795 年起事于塞拉马埃斯特拉山，焚甘蔗园、攻种植场，与法军游击十年。被捕后凌迟处死，头悬竿示众。古巴独立后她被尊为"古巴的玛伦"，与哈瓦那大教堂并祀。',
   tags:['逃奴','曼博','塞拉马埃斯特拉','古巴独立'],img:'./assets/illus/cuba-malon.webp'},

  /* ===== 大洋洲 2 ===== */
  {civ:'新西兰',name:'特·普埃阿',slug:'nz-tepuea',region:'oceania',era:'modern',role:'monarch',lat:-36.8,lon:174.8,
   story:'毛利王族特·普埃阿·赫兰吉，十九世纪末二十世纪初怀卡托部落领袖。她祖父波塔陶曾建毛利王运动以抗英人土地兼并，她继志率金王邦拒售土地、组织毛利议会、创办毛利妇女委员会。一战中她拒让毛利男儿分入先锋营当炮灰，主张若战则须全员平等同袍。她护毛利语言与习俗，至今被尊为"金王邦之母"。',
   tags:['毛利','怀卡托','金王邦','毛利议会'],img:'./assets/illus/nz-tepuea.webp'},
  {civ:'夏威夷',name:'利留卡拉尼',slug:'hawaii-liliuokalani',region:'oceania',era:'modern',role:'monarch',lat:21.3,lon:-157.9,
   story:'夏威夷王国末代君主利留卡拉尼，兄王卡拉卡瓦无嗣，一八九一年她继位，为夏威夷唯一在位女王。一八九三年，美国糖业商人挟海军陆战队发动政变，她为免子民流血而让位，被软禁于伊奥拉尼宫。一八九五年保王党起事，她遭军审判刑，后减为宫中软禁；一八九八年夏威夷被美国吞并。她工音乐，自作《Aloha ʻOe》一曲，至今传唱。',
   tags:['夏威夷王国','一八九三政变','伊奥拉尼宫','Aloha ʻOe'],img:'./assets/illus/hawaii-liliuokalani.webp'}
];
