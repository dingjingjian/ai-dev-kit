/* 全球月亮神话数据 · 14 个文明点位
 * 每条：civ(文明) / name(神话名) / slug(配图文件名主体) / region(区域) / lat,lon(经纬度)
 *       / story(80-150字) / tags(关键词) / img(配图路径，缺图自动回退到程序化占位)
 * 区域：east-asia / south-asia / middle-east / europe / africa / americas / oceania
 * color 用于底部筛选条上的彩色提示点（同 solar-system-3d dock 的圆点）
 * 经纬度与 earth-3d 的 ll2v 对齐（贴图 UV：lon+180 转 u）
 * 配图规格与提示词见 docs/配图提示词.md；2026-09 已按文献逐条事实核查（见同文档第七节）
 */
var REGIONS=[
  {id:'all',        name:'全部',   lat:20, lon:30,  color:'#e8ecf5'},
  {id:'east-asia',  name:'东亚',   lat:30, lon:118, color:'#e0574d'},
  {id:'south-asia', name:'南亚',   lat:20, lon:80,  color:'#f0a24f'},
  {id:'middle-east',name:'中东',   lat:30, lon:40,  color:'#d4b66a'},
  {id:'europe',     name:'欧洲',   lat:52, lon:15,  color:'#6fa8dc'},
  {id:'africa',     name:'非洲',   lat:0,  lon:20,  color:'#7ec850'},
  {id:'americas',   name:'美洲',   lat:25, lon:-95, color:'#c07bc4'},
  {id:'oceania',    name:'大洋洲', lat:-20,lon:135, color:'#4fc3c7'}
];

var MYTHS=[
  {civ:'中国',name:'嫦娥奔月',slug:'china-change',region:'east-asia',lat:35,lon:105,
   story:'后羿射落九日，求得不死药于西王母。其妻姮娥窃药服之，身轻飞升，托身月宫，是为月精。《淮南子》只记"窃以奔月"，怅然有丧，无以续之——世人仰头看月，似见其影。玉兔捣药、吴刚伐桂皆后世所添；宋人中秋拜月，便成了遥寄思念的旧俗。',
   tags:['月宫','玉兔','中秋','广寒'],img:'./assets/illus/china-change.webp'},
  {civ:'日本',name:'辉夜姬',slug:'japan-kaguya',region:'east-asia',lat:36,lon:138,
   story:'竹取翁于竹中得一女婴，三月长成绝色。五位贵人求婚，她各许以世间难寻之物，皆不果。帝欲纳之，亦拒。忽一夜，月使来迎，方知她是月都之人，因罪谪居尘世。升归时留不死之药，帝命人携至骏河山顶焚之，烟直升月宫——那座山从此名为富士。',
   tags:['竹取物语','月宫','归天'],img:'./assets/illus/japan-kaguya.webp'},
  {civ:'印度',name:'月神苏摩',slug:'india-soma',region:'south-asia',lat:22,lon:78,
   story:'吠陀中苏摩既是月神，亦是不死之露。搅乳海时月与甘露同出；湿婆取一弯新月戴在额上，故有"持月者"之名。月为何盈亏？《梵书》说诸神饮其精华则月亏，日光复补之则月盈。罗睺本是偷饮甘露的阿修罗，头被毗湿奴斩落而不死，追吞日月，遂有日月食。',
   tags:['吠陀','甘露','湿婆','罗睺'],img:'./assets/illus/india-soma.webp'},
  {civ:'苏美尔',name:'南纳',slug:'sumer-nanna',region:'middle-east',lat:31,lon:45,
   story:'恩利尔与宁利尔之子南纳，苏美尔月神，号"光明之主"。其城乌尔，大塔庙高耸至今。新月即其舟，他乘之横渡夜空。其像为长须青金石、头顶一弯新月的坐姿男子，执掌智慧与时间，以月相定历法——其数三十，正合一个太阴月。后阿卡德人呼他为辛，传遍两河。',
   tags:['乌尔','青金石','月舟','历法'],img:'./assets/illus/sumer-nanna.webp'},
  {civ:'埃及',name:'孔苏',slug:'egypt-khonsu',region:'middle-east',lat:26,lon:30,
   story:'孔苏，阿蒙与穆特之子，名意为"巡游者"。其形为少年，头顶月盘与新月，侧脑束着孩童发辫，像其青春不谢。他掌月与时间，也主治病驱邪。月为何有亏缺？传说他与托特掷塞尼特棋，输去七十二分之一日的光，托特把赢来的光凑成五天加在岁末——从此月才有圆缺。底比斯有其大神庙。',
   tags:['底比斯','月盘','塞尼特棋','托特'],img:'./assets/illus/egypt-khonsu.webp'},
  {civ:'希腊',name:'塞勒涅',slug:'greece-selene',region:'europe',lat:38,lon:23,
   story:'塞勒涅，提坦月女神，驾双马之车巡夜。她最著名的恋事：见牧人恩底弥翁酣睡山洞，爱之，求得永眠不老，每夜下界相会。月有盈亏，或云是与恩底弥翁幽会时月轮渐隐，复圆时归来。晚期希腊把她与阿尔忒弥斯、赫卡忒合为三相，分别管天上、地上与冥界的月。',
   tags:['提坦','恩底弥翁','三相','银车'],img:'./assets/illus/greece-selene.webp'},
  {civ:'北欧',name:'玛尼',slug:'norse-mani',region:'europe',lat:60,lon:10,
   story:'玛尼，蒙迪尔法利之子，驭月车行于天，拉车的马叫亚斯维德尔。月常被巨狼哈提追赶，诸神黄昏时哈提终将吞下月亮，是为"天狼食月"。月车里还坐着两个孩子——比尔与海约基，他们从泉边扛着水桶与扁担回家时被带上天，月面上的斑点，据说就是这两个孩子。',
   tags:['埃达','巨狼','诸神黄昏','哈提'],img:'./assets/illus/norse-mani.webp'},
  {civ:'凯尔特',name:'布里吉德',slug:'celtic-brigid',region:'europe',lat:53,lon:-8,
   story:'布里吉德是凯尔特三位一体的女神：诗人、铁匠与医者各戴其名，主火、诗艺与医术。她的节日伊姆波尔克在二月一日，是冬春之交、母羊产羔之始。基尔代尔的圣火长燃不熄，十九位女守护轮值守夜，第二十夜归她自己。后世教会把她转为圣布里吉特，点灯迎春的旧俗仍留在爱尔兰乡间。',
   tags:['三相','圣火','伊姆波尔克'],img:'./assets/illus/celtic-brigid.webp'},
  {civ:'斯拉夫',name:'月亮沙皇',slug:'slavic-moon-tsar',region:'europe',lat:55,lon:38,
   story:'斯拉夫民间呼月亮为"月亮沙皇"，儿歌里向它讨一副金角。保加利亚传说中，月亮时而算太阳的兄弟，时而算太阳的新娘。乌克兰与白俄罗斯的故事里，月娶晨星为妻又变了心，被罚上天，从此月圆月缺。民间又说日富而骄、月贫而慈，故月夜出行须诵咒相护，免遭鬼魅。',
   tags:['金角','晨星','盈亏','月咒'],img:'./assets/illus/slavic-moon-tsar.webp'},
  {civ:'阿兹特克',name:'科约尔沙乌基',slug:'aztec-coyolxauhqui',region:'americas',lat:19,lon:-99,
   story:'科约尔沙乌基，"金铃绘面"之意，是日神维齐洛波奇特利的姐姐。她率四百星神（南方诸星）攻打怀孕的母亲科亚特利奎；弟弟自母腹全副武装而出，斩下她的头抛上天，化作月亮。所以月面只见她的头与耳上的金铃；星辰被日出驱散，便是四百星神溃败之象。',
   tags:['金铃','四百星神','维齐洛波奇特利'],img:'./assets/illus/aztec-coyolxauhqui.webp'},
  {civ:'因纽特',name:'阿宁安',slug:'inuit-annigan',region:'americas',lat:70,lon:-130,
   story:'因纽特月神阿宁安，与姐姐玛莉娜同在天上：姐姐成了太阳，弟弟成了月亮。他追她，她逃，日追月而永不能及，姐弟自此不再相见。阿宁安追得忘了吃饭，人瘦下去便是亏月，记起吃食又胖回来便是盈月。因纽特人看月相认潮汐、定猎期。',
   tags:['玛莉娜','日追月','潮汐','猎期'],img:'./assets/illus/inuit-annigan.webp'},
  {civ:'波利尼西亚',name:'马乌伊',slug:'polynesia-maui',region:'oceania',lat:-17,lon:-149,
   story:'马乌伊，波利尼西亚的半神与捣蛋鬼。他最有名的两件事：用鱼钩从深海钓起诸岛，铺成今天的群岛；又与兄弟用椰绳结成套索，套住太阳逼它放慢脚步，白昼从此变长。至于月亮，各岛故事不一：月是女神希娜，她织布、也司月相；马乌伊的本事，止于钓岛与缚日。',
   tags:['钓岛','缚日','希娜','月相'],img:'./assets/illus/polynesia-maui.webp'},
  {civ:'班图',name:'恩库伦库鲁',slug:'bantu-unkulunkulu',region:'africa',lat:-28.5,lon:31,
   story:'祖鲁人说，造物主恩库伦库鲁从芦苇中造出人，又派变色龙去传话：人将如月亮，死了还会回来。可蜥蜴抢先跑到，喊的是"人会死，不再回来"。于是月亮每月死去又复生，人却只能死一次。此后月相成了农时与祭祀的历法：新月为吉，月食为凶。',
   tags:['祖鲁','变色龙','死而复生','农时'],img:'./assets/illus/bantu-unkulunkulu.webp'},
  {civ:'澳洲原住民',name:'恩加利恩迪',slug:'aboriginal-ngalindi',region:'oceania',lat:-13,lon:134,
   story:'阿纳姆地的尤尔古人说，月人恩加利恩迪原是个又胖又懒的汉子。他的妻子们举斧砍他，把他削得越来越瘦——这就是亏月；他逃上天去，一月之后又长胖回来，这就是盈月。月亮的死而复生，是尤尔古人眼中万物循环的凭证，也是成年礼上要讲给少年听的一课。',
   tags:['梦时代','尤尔古','斧痕','死而复生'],img:'./assets/illus/aboriginal-ngalindi.webp'}
];
