(function(){
"use strict";
const PATTERNS = [
 {
  "id": "moon",
  "name": "明月",
  "diff": 1,
  "cat": "赏月",
  "lore": "今夜月明人尽望，不知秋思落谁家。",
  "n": 13,
  "grid": [
   "....ddddd....",
   "..ddyyyyydd..",
   ".dyywwyyyyyd.",
   ".dywwwwyyyyd.",
   "dywwwwwyyyyyd",
   "dyywwwwyyeyyd",
   "dyyywwyyyyyyd",
   "dyyyyyyyyyyyd",
   "dyyyyyyeeeyyd",
   ".dyyyeyyeyyd.",
   ".dyyyyyyyyyd.",
   "..ddyyyyydd..",
   "....ddddd...."
  ]
 },
 {
  "id": "mooncake",
  "name": "月饼",
  "diff": 1,
  "cat": "赏月",
  "lore": "小饼如嚼月，中有酥与饴。",
  "n": 13,
  "grid": [
   "....ooooo....",
   "..oodddddoo..",
   ".oodooooodoo.",
   ".odooooooodo.",
   "odooyowoyoodo",
   "odoooowoooodo",
   "odoowwywwoodo",
   "odoooowoooodo",
   "odooyowoyoodo",
   ".odooooooodo.",
   ".oodooooodoo.",
   "..oodddddoo..",
   "....ooooo...."
  ]
 },
 {
  "id": "rabbit",
  "name": "玉兔",
  "diff": 1,
  "cat": "玉兔",
  "lore": "白兔捣药秋复春，嫦娥孤栖与谁邻。",
  "n": 13,
  "grid": [
   ".............",
   "....w...w....",
   "....ww.ww....",
   "....lw.wl....",
   "....lw.wl....",
   "....l...l....",
   "....weeew....",
   "....wwwww....",
   "...ewkwkwe...",
   "...elwpwle...",
   "...ewwwwwe...",
   "....ewwwe....",
   "......e......"
  ]
 },
 {
  "id": "osmanthus",
  "name": "桂花",
  "diff": 1,
  "cat": "玉兔",
  "lore": "桂子月中落，天香云外飘。",
  "n": 13,
  "grid": [
   ".............",
   "........yy...",
   ".......yyyym.",
   "......y.yynm.",
   ".....yyy.nny.",
   "..yy.yyymmydy",
   ".yyyy.ymm..y.",
   "..yy..mm..nn.",
   "...nnmm.y....",
   "...nmn.ydy...",
   ".mmm.nnny....",
   "mmm..........",
   "m............"
  ]
 },
 {
  "id": "lantern",
  "name": "花灯",
  "diff": 2,
  "cat": "灯谜",
  "lore": "一夜鱼龙舞，灯明照岁寒。",
  "n": 17,
  "grid": [
   "........k........",
   "......ddddd......",
   "......ddddd......",
   "....yyyyyyyyy....",
   "......drdrd......",
   ".....rdrdrdr.....",
   "....rrdrwrdrr....",
   "....rrdwdwdrr....",
   "....rrdwwwdrr....",
   ".....rdrwrdr.....",
   ".....rdrdrdr.....",
   "......drdrd......",
   "....yyyyyyyyy....",
   "....yydddddyy....",
   "......dyyyd......",
   ".......yyy.......",
   ".......yyy......."
  ]
 },
 {
  "id": "osm_tree",
  "name": "桂树",
  "diff": 2,
  "cat": "赏月",
  "lore": "吴刚捧出桂花酒，寂寞嫦娥舒广袖。",
  "n": 17,
  "grid": [
   ".................",
   ".......nnn..ddd..",
   "......nynggdwyyd.",
   ".....nggnggnyyyd.",
   ".....ygggnnnyyyd.",
   "....gggggnnyndd..",
   "...nggnnnynnnn...",
   "...ngnnnynnnnn...",
   "...nnnnnnnnnnn...",
   "....nnnmnmynn....",
   ".......mmm.......",
   ".......mmm.......",
   ".......mmm.......",
   ".......mmm.......",
   ".......mmm.......",
   "nnnnnnnnnnnnnnnnn",
   "nnnnnnnnnnnnnnnnn"
  ]
 },
 {
  "id": "pestle",
  "name": "玉兔捣药",
  "diff": 2,
  "cat": "玉兔",
  "lore": "玉兔捣药，服之可以长生。",
  "n": 17,
  "grid": [
   ".................",
   ".................",
   "....w....d.......",
   "....l.l..dd......",
   "...wl.l..dd......",
   "...wwww..mm......",
   "...wwwww..m......",
   "...wwwwww.mm.....",
   "....wwwww.mm.....",
   "...wwwww..mm.....",
   "...wwwwww..m.....",
   "...wwwwww..eee...",
   "...wwwww..ekkke..",
   "....wwww..eeeee..",
   "nnnnnnnnnneeeeenn",
   "nnnnnnnnnnnnnnnnn",
   "nnnnnnnnnnnnnnnnn"
  ]
 },
 {
  "id": "cloud_moon",
  "name": "彩云追月",
  "diff": 2,
  "cat": "赏月",
  "lore": "彩云追月，月华如练。",
  "n": 17,
  "grid": [
   ".................",
   ".....ddd.........",
   "....dyyyd........",
   "...dwwwyyd.......",
   "..dywwwyyyd......",
   "..dywwwyyyd......",
   "..dyeyyyeyd......",
   "...deyyyed.......",
   "....dyyycc.......",
   "...c.cccccccc.c..",
   "...ceeeeeeeeeec..",
   "...ceeeeeeeeeec..",
   ".c.cccccc.c......",
   ".ceeeeeeeec......",
   ".ceeeeeeeec......",
   ".................",
   "................."
  ]
 },
 {
  "id": "pomelo",
  "name": "柚子",
  "diff": 2,
  "cat": "团圆",
  "lore": "柚子谐音「佑子」，中秋供之求平安。",
  "n": 17,
  "grid": [
   "......nnmnn......",
   "....nnn.m.nnn....",
   "......ddmdd......",
   "....ddyymyydd....",
   "...dyyyyyyyyyd...",
   "..dyywwwyydyyyd..",
   "..dywwwwyydyyyd..",
   ".dyyywyyyyyyyyyd.",
   ".dyyyyyyyyyyyyyd.",
   ".dyyydyyyyyyyyyd.",
   ".dyyydyyyyyyyyyd.",
   ".dyyyyyyyyydyyyd.",
   "..dyyddyyyydyyd..",
   "..dyyyyyyyyyyyd..",
   "...dyyyyyyyyyd...",
   "....ddyyyyydd....",
   "......ddddd......"
  ]
 },
 {
  "id": "cake_cut",
  "name": "莲蓉蛋黄",
  "diff": 2,
  "cat": "团圆",
  "lore": "一枚月饼切开，金黄蛋黄如满月。",
  "n": 17,
  "grid": [
   ".......ooo.......",
   "....ooommmooo....",
   "...oommmmmmmoo...",
   "..ommmmmwmmmmmo..",
   ".oommmmmmmmmmmoo.",
   ".ommmmmdddmmmmmo.",
   ".ommwmdyyydmwmmo.",
   "ommmmdywyyydmmmmo",
   "ommmmdyyyyydmmmmo",
   "ommmmdyyyyydmmmmo",
   ".ommwmdyyydmwmmo.",
   ".ommmmmdddmmmmmo.",
   ".oommmmmmmmmmmoo.",
   "..ommmmmwmmmmmo..",
   "...oommmmmmmoo...",
   "....ooommmooo....",
   ".......ooo......."
  ]
 },
 {
  "id": "change",
  "name": "嫦娥奔月",
  "diff": 3,
  "cat": "玉兔",
  "lore": "嫦娥应悔偷灵药，碧海青天夜夜心。",
  "n": 21,
  "grid": [
   ".....................",
   "..............ddd....",
   ".......d....ddyyydd..",
   ".....dddk...dywyyyd..",
   "...w..kkk..dywwyyyyd.",
   "...ww.kk...wwyyyyyyd.",
   "....wwwwwwwwyyyyyyyd.",
   ".....wwwwww.dyyyyyd..",
   "......www...ddyyydd..",
   "......wwwt....ddtt...",
   ".......ppptt..ttttt..",
   "......pppp.tttt...tt.",
   ".......www.......p.t.",
   ".......wwwpp...pppp..",
   ".......wew.ppppp..pp.",
   ".......wee...p.....pp",
   "......wecccc.........",
   "...c.cccccccccc.c....",
   "...ceeeeeeeeeeeec....",
   "...ceeeeeeeeeeeec....",
   "....................."
  ]
 },
 {
  "id": "palace",
  "name": "广寒宫",
  "diff": 3,
  "cat": "赏月",
  "lore": "琼楼玉宇高处，不胜清寒。",
  "n": 21,
  "grid": [
   "bbbbbbbbbdddbbbbbbbbb",
   "bbbbbwbbdyyydbbbbbbbb",
   "bbwbbbbdywyyydbbbbbbb",
   "bbbbbbbdywyyydbbbbbbb",
   "bbbbbbbdyyyyydbbbbbbb",
   "bbbbbbbbdyyydbbbbbbbb",
   "bbbbbbbbbdddbbbbbbbbb",
   "bbbbbbbbbbrbbbbbbbbbb",
   "bbnnbbbbrrrrrbbbbbbbb",
   "bnynnbbrrrrrrrbbbbbbb",
   "bnnndddddddddddddbbbb",
   "nnnnddddmmmmmddddbbbb",
   "nnnnnnbdmmmmmdbbbbbbb",
   "bnmmnbbdmkkkmdbbbbbbb",
   "bbmmbbbdmkkkmdbbwbbbb",
   "bbmmbbbdmkkkmdbbwwwbb",
   "bbmmbbbdmkkkmdbbwwwbb",
   "......eeeeeeeee......",
   "nnnnnnnnnnnnnnnnnnnnn",
   "nnnnnnnnnnnnnnnnnnnnn",
   "nnnnnnnnnnnnnnnnnnnnn"
  ]
 },
 {
  "id": "reunion",
  "name": "团圆宴",
  "diff": 3,
  "cat": "团圆",
  "lore": "月圆人圆事事圆，一桌清欢话团圆。",
  "n": 21,
  "grid": [
   ".........ddd.........",
   "......ddmmmmmdd......",
   "....ddmmmmmmmmmdd....",
   "...dcwwcmmwmmcwwcd...",
   "..dcdoowcwtwcwoodcd..",
   "..dwoyodcmwmcdoyowd..",
   ".dmwooodcmmmcdooowmd.",
   ".dmcwddwmmmmmwddwcmd.",
   ".mmmcccmmwdwmmwccmmm.",
   "dmmmmmmmwwdwwwwmmmmmd",
   "dmmmmmmwwwtwwwmmmmmmd",
   "dmmmmmmwwwwwwmmmmmmmd",
   ".mmmcccmmwwwmmcccmmm.",
   ".dmcwddwmmmmmwddwcmd.",
   ".dmwooodcmmmcdooowmd.",
   "..dwoyodcmwmcdoyowd..",
   "..dcdoowcwtwcwoodcd..",
   "...dcwwcmmwmmcwwcd...",
   "....ddmmmmmmmmmdd....",
   "......ddmmmmmdd......",
   ".........ddd........."
  ]
 },
 {
  "id": "pools",
  "name": "三潭印月",
  "diff": 3,
  "cat": "赏月",
  "lore": "三潭印月，一湖金波共婵娟。",
  "n": 21,
  "grid": [
   "bbdddbbbbbbbbbbbbbbbb",
   "bddyddbbbbbwbbbbbbbbb",
   "ddwwyddbbbbbbbbbwbbbb",
   "dyyyyydbbbbbbbbbbbbbb",
   "ddyyyddbbbbbbbbbbbbbb",
   "bddyddbbbbbbbbbbbbbbb",
   "bbdddbbbbbbbbwbbbbbbb",
   "bbbbbbbbbbbbbbbbbbbbb",
   "bbbbbbbbbbbbbbbbbbbbb",
   "tttyyttddtttddtttddtt",
   "ttyyyteeeeteeeeweeeew",
   "tttyytteewtweetwweeww",
   "ttyyyteeeeteeeeteeeet",
   "tttyyteeeeteeeeweeeew",
   "ttyyyttwwwtwwwtwwwtww",
   "tttyytttttttttttttttt",
   "ttyyytttttttttttttttt",
   "tttyytwwwwwwwwtwwwwww",
   "ttyyytttttttttttttttt",
   "ttttttttttttttttttttt",
   "ttttttttttttttttttttt"
  ]
 },
 {
  "id": "moon_palace",
  "name": "月宫全景",
  "diff": 4,
  "cat": "玉兔",
  "lore": "广寒宫里，桂树玉兔伴嫦娥。",
  "n": 25,
  "grid": [
   "..........ddddd..........",
   ".w.....dddyyyyyddd.......",
   "....w.dyyyyyyyyyyyd......",
   "....ddyyyyyyyyyyyyyddw...",
   "...ddyeeyyyyyyyyyyyydd...",
   "...dyeeeeyyyyyyyyyyyyd...",
   "..dyyeeeeyyyryyyyyeyyydw.",
   ".dyyyyeeyyrrrrryyeeeyyyd.",
   ".dyyyyyyyrrrrrrryyeyyyyd.",
   ".dyyyydddddddddddddyyyyd.",
   "dyyynyddddmmmmmddddyyyyyd",
   "dyyynnnnydmmmmmdyyyyyyyyd",
   "dyyynnnnndmkkkmdyyyyyyyyd",
   "dyynnnnnndmkkkmdyyyyyyyyd",
   "dyynnnnnndmkkkmdywywyyyyd",
   ".dyyyymmeeeeeeeeewwwyyyd.",
   ".dyyyymmeeeeeeeeewkwyyyd.",
   ".dyyyymmyyyyyyyyyywyyyyd.",
   "..dyyyeyyyyyyyyyyyyyyyd..",
   "...dyyyyyyyyyyyyyyyyyd...",
   "...ddyyyyyyyyyyyyyyydd...",
   "....ddyyyyyyyyyyyyydd....",
   "...cc.dyyyyyyyyyyydcc....",
   "c.cccc.cddyyyyydcdcccc.c.",
   "ceeeeeec..ddddd.ceeeeeec."
  ]
 },
 {
  "id": "miles",
  "name": "千里共婵娟",
  "diff": 4,
  "cat": "团圆",
  "lore": "但愿人长久，千里共婵娟。",
  "n": 25,
  "grid": [
   "...............dddddd....",
   "........w.....dyyyyyyd...",
   ".............dyywyyyyyd..",
   "............dyywwwyyyyyd.",
   ".....w......dywwwwyyyyyd.",
   "............dyywwwyyyyyd.",
   ".w..........dyyyyyyyyyyd.",
   ".w..........dyyyyyyyyyyd.",
   "............dyyyyyyyyyyd.",
   ".....c.cccc.cdyyyyyyyyd..",
   "c.ccccccccccccccycyyyd...",
   "ceeeeeeeeeeeeeeeecddd....",
   "ceeeeeeeeeeeeeeeec.......",
   "............bb...........",
   "....nn.....bbbb.....n....",
   "...nnnn...bbbbbb...nn....",
   "..nnnnnn..bbbbbb..nnnn...",
   "..nnnnnn.bbbbbbbbnnnnnn..",
   ".nnnnnnnbbbbbbbbnnnnnnnn.",
   "nnnnnnnbbbbbbbbnnnnnnnnnn",
   "cnnnwwccckkccccwwwcwwwnnc",
   "cnnwwwccckkccccwwwcwwwnnc",
   "cnnwwwmmmkkmmccwwwcwwwnnc",
   "cnnwwwcmmmmmcccwwwcwwwnnc",
   "ccccccccccccccccccccccccc"
  ]
 }
];

// 中秋色卡。硬约束：任意两色 RGB 欧氏距离 >= 60，否则逐格填豆时认不出（由 _dev/_check.py 体检）。
const PALETTE = [
  {code:'w',name:'月白',hex:'#FBF6E9'},{code:'e',name:'银灰',hex:'#9C9686'},
  {code:'k',name:'墨黑',hex:'#1C1A1E'},{code:'m',name:'栗棕',hex:'#63351A'},
  {code:'o',name:'赭石',hex:'#C8944E'},{code:'r',name:'朱砂',hex:'#D13B2E'},
  {code:'v',name:'绛紫',hex:'#7A2450'},{code:'p',name:'胭脂',hex:'#D9627F'},
  {code:'l',name:'藕荷',hex:'#E7B7C6'},{code:'y',name:'月黄',hex:'#FFD45E'},
  {code:'d',name:'描金',hex:'#A87A1E'},{code:'g',name:'豆绿',hex:'#8AB84E'},
  {code:'n',name:'松绿',hex:'#2E6B45'},{code:'t',name:'青碧',hex:'#35AD9C'},
  {code:'b',name:'夜蓝',hex:'#2E4FA6'},{code:'c',name:'天青',hex:'#8FB8DC'}
];
const PAL = {}; PALETTE.forEach(p=>PAL[p.code]=p.hex);
const MODES = {copy:'临摹',challenge:'挑战'};

// ==================== 中秋灯谜（拼成一幅图点亮一盏） ====================
const RIDDLES = [
  {id:'r1',q:'有时落在山腰，有时挂在树梢；有时像面圆镜，有时像把镰刀。（打一天体）',
   opts:['月亮','太阳','星星','云彩'],a:0,note:'阴晴圆缺都休说，且喜人间好时节。'},
  {id:'r2',q:'圆圆像个盘，甜甜馅里藏；中秋桌上摆，一家分着尝。（打一食品）',
   opts:['汤圆','月饼','烧饼','年糕'],a:1,note:'小饼如嚼月，中有酥与饴。'},
  {id:'r3',q:'耳朵长长尾巴短，红眼白毛爱捣药；嫦娥身边常相伴。（打一动物）',
   opts:['白猫','松鼠','玉兔','小鸡'],a:2,note:'白兔捣药秋复春，嫦娥孤栖与谁邻。'},
  {id:'r4',q:'八月开花香十里，金黄小粒藏叶底；吴刚挥斧砍不倒。（打一花木）',
   opts:['桂花','梅花','荷花','菊花'],a:0,note:'桂子月中落，天香云外飘。'},
  {id:'r5',q:'红红身子高高挂，肚里点灯照万家；中秋夜里满街走。（打一物）',
   opts:['蜡烛','烟花','对联','灯笼'],a:3,note:'一夜鱼龙舞，灯明照岁寒。'},
  {id:'r6',q:'一位仙女住月宫，偷吃灵药上青天；从此人间盼团圆。（打一神话人物）',
   opts:['织女','嫦娥','七仙女','龙女'],a:1,note:'嫦娥应悔偷灵药，碧海青天夜夜心。'},
  {id:'r7',q:'黄皮疙瘩大肚皮，剥开月牙一瓣瓣；中秋摆上求平安。（打一水果）',
   opts:['柚子','橘子','西瓜','苹果'],a:0,note:'柚子谐音「佑子」，中秋供果，护佑平安。'},
  {id:'r8',q:'八月十五月儿明，合家欢聚在堂前。（打一成语）',
   opts:['花好月圆','心想事成','年年有余','岁岁平安'],a:0,note:'但愿人长久，千里共婵娟。'}
];

// ==================== 音效引擎：Web Audio 程序化合成（零外部文件）====================
// 音色全部实时合成：木鱼/梆子（放豆）、编钟（通关）、古筝拨弦（背景音乐）、带通噪声（擦除/熨烫）
const SFX=(function(){
  let ctx=null, master=null, sfxBus=null, bgmBus=null, noiseBuf=null, reverb=null, wet=null;
  let on=true, bgmOn=true, unlocked=false;
  let bgmTimer=null, bgmBar=0, bgmBeat=0, lastPlace=0;
  // A 羽调式：羽 A - 宫 C - 商 D - 角 E - 徵 G，跨三个八度。
  // 选羽调式而非宫调式，是因为羽调式色彩清冷幽远，更贴合月夜；主音 A 落在低音区做根音。
  const PENTA=[220.00,261.63,293.66,329.63,392.00,440.00,523.25,587.33,659.25,783.99,880.00,1046.50];

  function ensure(){
    if(ctx) return ctx;
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC) return null;
    try{ ctx=new AC(); }catch(e){ return null; }
    master=ctx.createGain(); master.gain.value=on?0.85:0; master.connect(ctx.destination);
    sfxBus=ctx.createGain(); sfxBus.gain.value=0.95; sfxBus.connect(master);
    bgmBus=ctx.createGain(); bgmBus.gain.value=0.42; bgmBus.connect(master);
    // ConvolverNode 在部分老 WebView 上不存在：缺失时静默降级为无混响干声，不能因此抛错
    try{
      if(ctx.createConvolver){
        reverb=makeReverb(2.6,0.72);
        wet=ctx.createGain(); wet.gain.value=0.30; reverb.connect(wet); wet.connect(master);
      }
    }catch(e){ reverb=null; wet=null; }
    return ctx;
  }
  function live(){ return on && ctx; }
  // 程序化混响：噪声脉冲响应 + 一阶低通，尾巴越拖越暗，模拟月下空庭余韵（零外部 IR 文件）
  function makeReverb(sec,decay){
    const rate=ctx.sampleRate, len=Math.max(1,Math.floor(rate*sec));
    const buf=ctx.createBuffer(2,len,rate);
    for(let ch=0;ch<2;ch++){
      const d=buf.getChannelData(ch);
      let lp=0;
      for(let i=0;i<len;i++){
        lp+=((Math.random()*2-1)-lp)*0.36;
        d[i]=lp*Math.pow(1-i/len,decay);
      }
    }
    const cv=ctx.createConvolver(); cv.buffer=buf; return cv;
  }
  function noise(){
    if(!noiseBuf){
      const len=Math.floor(ctx.sampleRate*1.2);
      noiseBuf=ctx.createBuffer(1,len,ctx.sampleRate);
      const d=noiseBuf.getChannelData(0);
      for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
    }
    return noiseBuf;
  }

  // --- 基础音色 ---
  // 古筝拨弦：三角波主体 + 泛音，低通随时间收敛模拟弦振衰减
  function pluck(freq,t,dur,amp,dest,rev){
    const o=ctx.createOscillator(); o.type='triangle'; o.frequency.value=freq;
    const o2=ctx.createOscillator(); o2.type='sine'; o2.frequency.value=freq*2.01;
    const f=ctx.createBiquadFilter(); f.type='lowpass';
    f.frequency.setValueAtTime(Math.min(12000,freq*7),t);
    f.frequency.exponentialRampToValueAtTime(Math.max(120,freq*1.4),t+dur);
    const g=ctx.createGain(), g2=ctx.createGain();
    g.gain.setValueAtTime(0.0001,t);
    g.gain.linearRampToValueAtTime(amp,t+0.006);
    g.gain.exponentialRampToValueAtTime(0.0004,t+dur);
    g2.gain.setValueAtTime(0.0001,t);
    g2.gain.linearRampToValueAtTime(amp*0.28,t+0.004);
    g2.gain.exponentialRampToValueAtTime(0.0004,t+dur*0.45);
    o.connect(f); f.connect(g); g.connect(dest);
    o2.connect(g2); g2.connect(dest);
    if(rev&&reverb){ const rg=ctx.createGain(); rg.gain.value=rev; g.connect(rg); g2.connect(rg); rg.connect(reverb); }
    o.start(t); o.stop(t+dur+0.05);
    o2.start(t); o2.stop(t+dur+0.05);
  }
  // 木鱼/梆子：噪声瞬态 + 木质共鸣，用于放豆
  function mallet(freq,t,amp,dest){
    const src=ctx.createBufferSource(); src.buffer=noise(); src.loop=true;
    const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=freq*2.4; bp.Q.value=1.5;
    const ng=ctx.createGain();
    ng.gain.setValueAtTime(amp*0.55,t);
    ng.gain.exponentialRampToValueAtTime(0.0004,t+0.035);
    src.connect(bp); bp.connect(ng); ng.connect(dest);
    src.start(t,Math.random()*0.9); src.stop(t+0.06);
    const o=ctx.createOscillator(); o.type='triangle';
    o.frequency.setValueAtTime(freq,t);
    o.frequency.exponentialRampToValueAtTime(freq*0.8,t+0.07);
    const g=ctx.createGain();
    g.gain.setValueAtTime(0.0001,t);
    g.gain.linearRampToValueAtTime(amp,t+0.003);
    g.gain.exponentialRampToValueAtTime(0.0004,t+0.12);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t+0.18);
  }
  // 编钟/铃：非谐泛音叠加 + 长衰减
  function bell(freq,t,dur,amp,dest){
    [[1,1],[2.0,0.45],[2.76,0.28],[5.4,0.13]].forEach(function(p){
      const o=ctx.createOscillator(); o.type='sine'; o.frequency.value=freq*p[0];
      const g=ctx.createGain();
      g.gain.setValueAtTime(0.0001,t);
      g.gain.linearRampToValueAtTime(amp*p[1],t+0.007);
      g.gain.exponentialRampToValueAtTime(0.0003,t+dur*(1-0.14*Math.log2(p[0]+1)));
      o.connect(g); g.connect(dest);
      o.start(t); o.stop(t+dur+0.1);
    });
  }
  // 带通噪声扫频：擦除 / 熨烫
  function sweep(t,dur,f0,f1,amp,dest,q){
    const src=ctx.createBufferSource(); src.buffer=noise(); src.loop=true;
    const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.Q.value=q||1.1;
    bp.frequency.setValueAtTime(f0,t);
    bp.frequency.exponentialRampToValueAtTime(f1,t+dur);
    const g=ctx.createGain();
    g.gain.setValueAtTime(0.0001,t);
    g.gain.linearRampToValueAtTime(amp,t+Math.min(0.05,dur*0.25));
    g.gain.exponentialRampToValueAtTime(0.0004,t+dur);
    src.connect(bp); bp.connect(g); g.connect(dest);
    src.start(t,Math.random()*0.5); src.stop(t+dur+0.05);
  }

  // --- 背景音乐：固定乐句循环（慢板 52BPM，8 拍一句）---
  // 纯随机游走没有主题、听着像试音；改成「起承转合」四条乐句循环，才是一首曲子。
  // 值 = PENTA 索引，-1 = 留白（留白比填满更空灵，也更省 CPU）。
  const BEAT=60/52;
  const MEL=[
    [5,7,6,5, 4,-1,3,-1],   // 起：主音上行后回落
    [7,8,7,6, 5, 4,-1,-1],  // 承：攀到高音再下行
    [5,6,5,3, 4, 5,-1,-1],  // 转：中段徘徊
    [8,-1,7,6, 5,-1,4,-1]   // 合：收束回主音
  ];
  const BASS=[0,-1,-1,-1, 2,-1,-1,-1];   // 低音只在 1、5 拍落点，撑住调性
  function bgmTick(){
    bgmTimer=null;
    if(!on||!bgmOn||!ctx) return;
    const t=ctx.currentTime+0.03;
    const phr=MEL[bgmBar%MEL.length];
    const mi=phr[bgmBeat];
    if(mi>=0){
      pluck(PENTA[mi],t,2.2,0.115,bgmBus,0.5);
      // 邻音装饰：模拟古筝「按滑」，概率触发，避免每句完全一样
      if(Math.random()<0.16) pluck(PENTA[Math.min(PENTA.length-1,mi+2)],t+0.14,1.1,0.055,bgmBus,0.4);
    }
    const bi=BASS[bgmBeat];
    if(bi>=0) pluck(PENTA[bi]/2,t,3.4,0.085,bgmBus,0.25);   // 低八度衬底
    // 每 4 句一次远处风铃般的高音，打破循环的机械感
    if(bgmBar%4===3&&bgmBeat===0) pluck(PENTA[10],t+0.3,2.6,0.05,bgmBus,0.85);
    bgmBeat=(bgmBeat+1)%8; if(bgmBeat===0) bgmBar++;
    bgmTimer=setTimeout(bgmTick,BEAT*1000);
  }
  function stopBgm(){ if(bgmTimer){ clearTimeout(bgmTimer); bgmTimer=null; } }

  const api={
    unlock:function(){
      const c=ensure(); if(!c) return;
      if(c.state==='suspended') c.resume();
      if(!unlocked){ unlocked=true; if(on&&bgmOn&&!bgmTimer) bgmTick(); }
    },
    isOn:function(){ return on; },
    isBgmOn:function(){ return bgmOn; },
    setOn:function(v){
      on=v;
      if(master&&ctx) master.gain.setTargetAtTime(v?0.85:0,ctx.currentTime,0.02);
      if(!v) stopBgm();
      else if(bgmOn&&unlocked&&!bgmTimer) bgmTick();
    },
    setBgm:function(v){
      bgmOn=v;
      if(!v) stopBgm();
      else if(on&&unlocked&&!bgmTimer) bgmTick();
    },
    load:function(){
      try{
        var a=JSON.parse(localStorage.getItem('pma_audio')||'null');
        if(a){ on=a.s!==0; bgmOn=a.b!==0; }
      }catch(e){}
      api.syncLabels();
    },
    save:function(){
      try{ localStorage.setItem('pma_audio',JSON.stringify({s:on?1:0,b:bgmOn?1:0})); }catch(e){}
    },
    syncLabels:function(){
      const a=document.getElementById('sfxLabel'), b=document.getElementById('bgmLabel');
      if(a) a.textContent=on?'开':'关';
      if(b) b.textContent=bgmOn?'开':'关';
    },
    // --- 交互音效 ---
    click:function(){ if(!live())return; pluck(880,ctx.currentTime+0.01,0.26,0.09,sfxBus); },
    select:function(){ if(!live())return; const t=ctx.currentTime+0.01;
      pluck(659.25,t,0.5,0.15,sfxBus); pluck(987.77,t+0.045,0.4,0.09,sfxBus); },
    place:function(){
      if(!live())return;
      const now=performance.now();
      if(now-lastPlace<55) return;          // 拖动连续填豆时节流，避免糊成一片
      lastPlace=now;
      mallet([523.25,587.33,659.25,783.99][(Math.random()*4)|0],ctx.currentTime+0.005,0.22,sfxBus);
    },
    erase:function(){ if(!live())return; sweep(ctx.currentTime+0.005,0.17,1800,420,0.13,sfxBus,1.4); },
    hint:function(){ if(!live())return; const t=ctx.currentTime+0.01;
      bell(783.99,t,1.1,0.15,sfxBus); bell(1046.5,t+0.12,1.3,0.12,sfxBus); },
    clear:function(){ if(!live())return; const t=ctx.currentTime+0.01;
      sweep(t,0.5,900,180,0.15,sfxBus,1.2); pluck(196,t+0.1,0.7,0.09,sfxBus); },
    iron:function(){ if(!live())return; sweep(ctx.currentTime+0.01,1.5,300,1400,0.075,sfxBus,0.8); },
    win:function(){
      if(!live())return;
      const t=ctx.currentTime+0.02;
      [392.00,440.00,523.25,587.33,659.25].forEach(function(f,i){ bell(f,t+i*0.115,1.9,0.19,sfxBus); });
      pluck(130.81,t,2.6,0.15,sfxBus);
      pluck(196.00,t+0.24,2.4,0.12,sfxBus);
    },
    error:function(){ if(!live())return; const t=ctx.currentTime+0.01;
      pluck(174.61,t,0.34,0.13,sfxBus); pluck(164.81,t+0.09,0.4,0.10,sfxBus); }
  };
  return api;
})();


function hexToRgb(h){h=h.replace('#','');return{r:parseInt(h.slice(0,2),16),g:parseInt(h.slice(2,4),16),b:parseInt(h.slice(4,6),16)};}
function clamp(v){return v<0?0:v>255?255:v|0;}
// padStart（Chrome 57+）在安卓 9 以前的老 WebView 上不存在，用自实现代替
function pad2(s){s=String(s);return s.length<2?'0'+s:s;}
function rgbToHex(r,g,b){return '#'+[r,g,b].map(x=>pad2(clamp(x).toString(16))).join('');}
function adjust(hex,f){const c=hexToRgb(hex);return rgbToHex(c.r+f*255,c.g+f*255,c.b+f*255);}
function lighten(hex,f){return adjust(hex,f);}
function darken(hex,f){return adjust(hex,-f);}

let n=0, target=[], state=[], curColor=null, tool='pen', mode='copy';
let showRef=true, celebrated=false;
let startTime=0, timerId=null, elapsed=0, moves=0, mistakes=0, hints=0;
let cell=0, boardPx=0, dpr=1, pad=8, sprites={};
let curPattern=0, usedColors=[], records={}, progress={}, lastRestored=false;
let painting=false, ironT=0, ironAnim=null, atHome=true;

const board=document.getElementById('board');
const ctx=board.getContext('2d');
const refThumb=document.getElementById('refThumb');
const pctRing=document.getElementById('pctRing');
const timerEl=document.getElementById('timer');
const starsEl=document.getElementById('stars');
const patNameEl=document.getElementById('patName');
const patMetaEl=document.getElementById('patMeta');
const paletteEl=document.getElementById('palette');
const toastEl=document.getElementById('toast');
const stamp=document.getElementById('stamp');
const petals=document.getElementById('petals');
const winModal=document.getElementById('winModal');
const modeLabel=document.getElementById('modeLabel');

function roundRect(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}

// 拼豆=短塑料管。正视图为「外圈圆环+中心圆孔」，绝非球体。
// 要点：孔径≈外径一半；哑光塑料（线性渐变，低对比）；外缘管壁压暗；孔洞有厚度；高光只落在环面上。
function drawBeadSprite(g,s,hex){
  const cx=s/2, cy=s/2;
  const R=s*0.40;      // 珠体外半径
  const RH=s*0.23;     // 中心孔半径（真实拼豆孔径约占外径 57%）
  g.clearRect(0,0,s,s);

  // 1) 底部软阴影（立在钉板上）
  const sh=g.createRadialGradient(cx,cy+R*0.18,0,cx,cy+R*0.18,R*0.90);
  sh.addColorStop(0,'rgba(0,0,0,0.26)');
  sh.addColorStop(0.50,'rgba(0,0,0,0.09)');
  sh.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=sh;
  g.beginPath();g.ellipse(cx,cy+R*0.32,R*0.90,R*0.40,0,0,Math.PI*2);g.fill();

  // 2) 珠体：外圆挖去中心孔
  g.save();
  g.beginPath();
  g.arc(cx,cy,R,0,Math.PI*2);
  g.arc(cx,cy,RH,0,Math.PI*2,true);
  g.clip();

  // 哑光塑料受光：上下轻微渐变，对比更低更平
  const lg=g.createLinearGradient(cx,cy-R,cx,cy+R);
  lg.addColorStop(0, lighten(hex,0.08));
  lg.addColorStop(0.42, hex);
  lg.addColorStop(1, darken(hex,0.08));
  g.fillStyle=lg; g.fillRect(cx-R,cy-R,R*2,R*2);

  // 管壁厚度：外缘轻微压暗
  const wall=g.createRadialGradient(cx,cy,R*0.74,cx,cy,R);
  wall.addColorStop(0,'rgba(0,0,0,0)');
  wall.addColorStop(1,'rgba(0,0,0,0.16)');
  g.fillStyle=wall; g.fillRect(cx-R,cy-R,R*2,R*2);
  g.restore();

  // 3) 孔洞：露出钉板/钉柱的暖灰色，孔壁下侧受光、上侧背光
  g.fillStyle='rgba(74,66,58,0.96)';
  g.beginPath();g.arc(cx,cy,RH,0,Math.PI*2);g.fill();
  g.fillStyle='rgba(255,255,255,0.12)';
  g.beginPath();g.ellipse(cx,cy+RH*0.34,RH*0.52,RH*0.20,0,0.22*Math.PI,0.78*Math.PI);g.fill();
  g.fillStyle='rgba(0,0,0,0.22)';
  g.beginPath();g.ellipse(cx,cy-RH*0.30,RH*0.50,RH*0.16,0,1.20*Math.PI,1.80*Math.PI);g.fill();

  // 4) 环面高光：左上小椭圆，不进入孔内
  g.fillStyle='rgba(255,255,255,0.22)';
  g.beginPath();
  g.ellipse(cx-R*0.22, cy-R*0.30, R*0.10, R*0.055, -0.55, 0, Math.PI*2);
  g.fill();
}

function buildSprites(){
  const s=Math.max(10,Math.round(cell*dpr));
  sprites={};
  PALETTE.forEach(p=>{
    const cv=document.createElement('canvas');cv.width=cv.height=s;
    drawBeadSprite(cv.getContext('2d'),s,p.hex);
    sprites[p.code]=cv;
  });
}

function computeLayout(){
  const stage=document.querySelector('.stage');
  const cs=getComputedStyle(stage);
  const padX=parseFloat(cs.paddingLeft)||0, padY=parseFloat(cs.paddingTop)||0;
  // clientWidth/Height 含 padding，减去后才是画布可用区，避免画布顶到 stage 边缘
  const availW=stage.clientWidth-padX*2, availH=stage.clientHeight-padY*2;
  const avail=Math.max(n*4,Math.floor(Math.min(availW,availH)));
  // 棋盘四周留出内边距，使最外圈拼豆不会压到木框上
  cell=Math.max(4,Math.floor(avail/(n+1.1)));
  pad=Math.max(12,Math.round(cell*0.42));
  boardPx=cell*n+pad*2;
  // 若仍超出可用区，回退一档
  if(boardPx>avail){
    cell=Math.max(4,cell-1);
    pad=Math.max(12,Math.round(cell*0.42));
    boardPx=cell*n+pad*2;
  }
  dpr=Math.min(window.devicePixelRatio||1,2.5);
  board.width=board.height=Math.round(boardPx*dpr);
  board.style.width=board.style.height=boardPx+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  buildSprites();
  render();
}

function drawBoardBg(){
  const r=16; // 与 CSS border-radius 保持一致，避免描边错位
  // 外框
  ctx.fillStyle='#2a2016';roundRect(ctx,0,0,boardPx,boardPx,r);ctx.fill();
  const fg=ctx.createLinearGradient(0,0,boardPx,boardPx);
  fg.addColorStop(0,'#3d2e20');fg.addColorStop(0.5,'#2a2016');fg.addColorStop(1,'#1f160f');
  ctx.fillStyle=fg;roundRect(ctx,2,2,boardPx-4,boardPx-4,r-2);ctx.fill();
  // 钉板面：从 pad-4 起，完整包住格子区（pad … pad+cell*n），四角留木框
  const i0=Math.max(4,pad-6), i1=boardPx-i0*2;
  const bg=ctx.createRadialGradient(boardPx/2,boardPx/2,boardPx*0.15,boardPx/2,boardPx/2,boardPx*0.65);
  bg.addColorStop(0,'#272019');bg.addColorStop(1,'#1b140e');
  ctx.fillStyle=bg;roundRect(ctx,i0,i0,i1,i1,r-5);ctx.fill();
  // 板面高光
  const sg=ctx.createRadialGradient(boardPx*0.35,boardPx*0.25,boardPx*0.05,boardPx*0.45,boardPx*0.45,boardPx*0.55);
  sg.addColorStop(0,'rgba(255,235,200,0.05)');sg.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=sg;roundRect(ctx,i0,i0,i1,i1,r-5);ctx.fill();
  ctx.lineWidth=1.5;ctx.strokeStyle='rgba(212,175,55,0.22)';
  roundRect(ctx,i0+1,i0+1,i1-2,i1-2,r-6);ctx.stroke();
}

function drawPeg(i,j){
  const cx=pad+i*cell+cell/2,cy=pad+j*cell+cell/2,pr=cell*0.19;
  // 孔影
  ctx.fillStyle='rgba(0,0,0,0.5)';
  ctx.beginPath();ctx.ellipse(cx,cy+pr*0.25,pr*0.92,pr*0.72,0,0,Math.PI*2);ctx.fill();
  // 钉柱
  const pg=ctx.createLinearGradient(cx-pr,cy-pr,cx+pr,cy+pr);
  pg.addColorStop(0,'#554a3d');pg.addColorStop(0.5,'#2d241a');pg.addColorStop(1,'#17120d');
  ctx.fillStyle=pg;
  ctx.beginPath();ctx.ellipse(cx,cy,pr*0.9,pr*0.7,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='rgba(255,235,200,0.13)';
  ctx.beginPath();ctx.ellipse(cx,cy-pr*0.1,pr*0.45,pr*0.3,0,0,Math.PI*2);ctx.fill();
}

function drawBeadAt(i,j,code,t=0){
  if(t>0){ drawFusedBead(i,j,code,t); return; }
  const sp=sprites[code]; if(!sp)return;
  ctx.drawImage(sp,pad+i*cell,pad+j*cell,cell,cell);
}

// 熨烫：孔闭合 → 珠子压扁扩散（缝隙消失）→ 表面对比降低变平滑 → 整片出光泽
function drawFusedBead(i,j,code,t){
  const cx=pad+i*cell+cell/2, cy=pad+j*cell+cell/2;
  const hex=PAL[code];
  const grow=Math.min(1,t/0.62);                 // 压扁扩散进度
  const flat=Math.min(1,t/0.82);                 // 表面平滑进度
  const R=cell*(0.40+0.14*grow);               // 0.40→0.54，相邻相接并略重叠
  const RH=cell*0.23*(1-grow);                 // 孔闭合

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx,cy,R,0,Math.PI*2);
  if(RH>0.4) ctx.arc(cx,cy,RH,0,Math.PI*2,true);
  ctx.clip();
  const lg=ctx.createLinearGradient(cx,cy-R,cx,cy+R);
  const lf=Math.max(0.01,0.08-0.10*flat);
  const df=Math.max(0.01,0.08-0.10*flat);
  lg.addColorStop(0, lighten(hex,lf));
  lg.addColorStop(0.42, hex);
  lg.addColorStop(1, darken(hex,df));
  ctx.fillStyle=lg;
  ctx.fillRect(cx-R,cy-R,R*2,R*2);
  // 管壁暗边随熨烫逐渐消失
  if(t<0.90){
    const wa=0.16*(1-t);
    const wall=ctx.createRadialGradient(cx,cy,R*0.74,cx,cy,R);
    wall.addColorStop(0,'rgba(0,0,0,0)');
    wall.addColorStop(1,'rgba(0,0,0,'+wa+')');
    ctx.fillStyle=wall;
    ctx.fillRect(cx-R,cy-R,R*2,R*2);
  }
  ctx.restore();

  // 残留孔洞：露出钉柱色，随熨烫淡出
  if(RH>0.4){
    ctx.fillStyle='rgba(74,66,58,'+(0.96*(1-grow))+')';
    ctx.beginPath();ctx.arc(cx,cy,RH,0,Math.PI*2);ctx.fill();
  }
  // 表面高光：熨烫前期保留，后期完全溶入整片光泽
  const hiA=Math.max(0,0.22-0.22*flat);
  if(hiA>0.01){
    ctx.fillStyle='rgba(255,255,255,'+hiA+')';
    ctx.beginPath();
    ctx.ellipse(cx-R*0.20, cy-R*0.28, R*(0.10+0.08*flat), R*(0.055+0.04*flat), -0.55, 0, Math.PI*2);
    ctx.fill();
  }
}

// 熨烫后期：整片作品表面的柔和反光（模拟熔融塑料的光泽，而非颗颗发光）
function drawIronSheen(t){
  if(t<0.45)return;
  const a=(t-0.45)/0.55;
  const i0=Math.max(4,pad-6), i1=boardPx-i0*2;
  ctx.save();
  ctx.beginPath();roundRect(ctx,i0,i0,i1,i1,10);ctx.clip();
  // 熨烫片的光泽：柔和、连续、偏暖，不像颗颗独立的高光
  const sg=ctx.createLinearGradient(pad,pad,pad+cell*n,pad+cell*n);
  sg.addColorStop(0,   'rgba(255,250,235,'+(0.16*a)+')');
  sg.addColorStop(0.28,'rgba(255,250,235,'+(0.04*a)+')');
  sg.addColorStop(0.52,'rgba(255,250,235,'+(0.18*a)+')');
  sg.addColorStop(0.76,'rgba(255,250,235,'+(0.03*a)+')');
  sg.addColorStop(1,   'rgba(255,250,235,0)');
  ctx.fillStyle=sg;
  ctx.fillRect(i0,i0,i1,i1);
  ctx.restore();
}

// 提示高亮：脉动光环 + 外扩波 + 内部辉光 + 四角准星（由 hint() 里的 rAF 持续重绘驱动）
function drawHint(){
  if(!hintCells.length)return;
  const phase=(Date.now()%1100)/1100;
  const pulse=0.5+0.5*Math.sin(phase*Math.PI*2);   // 0..1
  const r0=cell*0.42, r1=r0+cell*0.26*pulse;
  ctx.save();
  for(const hc of hintCells){
    const i=hc%n,j=hc/n|0;
    const cx=pad+i*cell+cell/2, cy=pad+j*cell+cell/2;
    // 1) 向外扩散的波
    ctx.globalAlpha=0.5*(1-pulse);
    ctx.strokeStyle=varGold; ctx.lineWidth=Math.max(2,cell*0.09);
    ctx.beginPath();ctx.arc(cx,cy,r1,0,Math.PI*2);ctx.stroke();
    // 2) 主环
    ctx.globalAlpha=0.6+0.4*pulse;
    ctx.lineWidth=Math.max(2.5,cell*0.13);
    ctx.beginPath();ctx.arc(cx,cy,r0,0,Math.PI*2);ctx.stroke();
    // 3) 内部辉光
    ctx.globalAlpha=1;
    const gg=ctx.createRadialGradient(cx,cy,0,cx,cy,r0);
    gg.addColorStop(0,'rgba(235,205,110,'+(0.28+0.26*pulse)+')');
    gg.addColorStop(0.65,'rgba(235,205,110,'+(0.10+0.10*pulse)+')');
    gg.addColorStop(1,'rgba(235,205,110,0)');
    ctx.fillStyle=gg;
    ctx.beginPath();ctx.arc(cx,cy,r0,0,Math.PI*2);ctx.fill();
    // 4) 四角准星，指向明确
    ctx.globalAlpha=0.55+0.45*pulse;
    ctx.strokeStyle=varGold; ctx.lineWidth=Math.max(2,cell*0.10);
    const R=cell*0.66, L=cell*0.22;
    for(let k=0;k<4;k++){
      const ang=k*Math.PI/2+Math.PI/4;
      const ux=Math.cos(ang),uy=Math.sin(ang);
      ctx.beginPath();
      ctx.moveTo(cx+ux*(R-L),cy+uy*(R-L));
      ctx.lineTo(cx+ux*R,cy+uy*R);
      ctx.stroke();
    }
  }
  ctx.restore();
}

let varGold='#D4AF37';
function render(){
  ctx.clearRect(0,0,boardPx,boardPx);
  drawBoardBg();
  // 1) 所有格子先画钉。拼豆是穿在钉上的短管，孔洞会透出钉柱顶部。
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    drawPeg(i,j);
  }
  // 2) 参照色块半透明叠在钉子之上
  if(showRef){
    ctx.globalAlpha=0.30;
    for(let j=0;j<n;j++)for(let i=0;i<n;i++){
      const k=j*n+i;
      if(target[k] && !state[k]) drawBeadAt(i,j,target[k]);
    }
    ctx.globalAlpha=1;
  }
  // 3) 已放的豆画在最上层
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const c=state[j*n+i];
    if(c) drawBeadAt(i,j,c,ironT);
  }
  drawIronSheen(ironT);
  drawHint();
}

function renderRefThumb(){
  const sz=refThumb.width,c=sz/n,g=refThumb.getContext('2d');
  g.clearRect(0,0,sz,sz);g.fillStyle='#101627';g.fillRect(0,0,sz,sz);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const code=target[j*n+i]; if(!code)continue;
    g.fillStyle=PAL[code];g.beginPath();g.arc(i*c+c/2,j*c+c/2,c*0.46,0,Math.PI*2);g.fill();
  }
}

function selectPattern(i){
  curPattern=i;
  const p=PATTERNS[i];
  n=p.n;
  target=new Array(n*n).fill(null);
  for(let j=0;j<n;j++)for(let ii=0;ii<n;ii++){
    const ch=p.grid[j][ii];
    if(ch!=='.') target[j*n+ii]=ch;
  }
  // 恢复该图纸的独立进度（每幅图各自保存，切走再回来不丢）
  lastRestored=false;
  const saved=progress[p.id];
  const st=saved?unpackState(saved.g,n):null;
  if(st){
    state=st; elapsed=saved.t||0; moves=saved.m||0; mistakes=saved.k||0;
    lastRestored=state.some(c=>c!=null);
    // 防御：旧存档可能停留在完成态，直接清掉重来，避免一进来就弹庆祝
    if(isSolved()){
      state=new Array(n*n).fill(null); elapsed=0; moves=0; mistakes=0;
      lastRestored=false;
      clearProgress(p.id);
    }
  }else{
    state=new Array(n*n).fill(null); elapsed=0; moves=0; mistakes=0;
  }
  celebrated=false; ironT=0; stopHint(); hints=0;
  startTime=Date.now()-elapsed*1000; stopTimer();
  let beads=0; for(let k=0;k<n*n;k++) if(target[k]) beads++;
  patNameEl.textContent=p.name;
  timerEl.textContent=formatTime(elapsed);
  // 过滤色板
  usedColors=[];
  const counts={};
  target.forEach(c=>{if(c){counts[c]=(counts[c]||0)+1;}});
  usedColors=Object.keys(counts).sort((a,b)=>counts[b]-counts[a]);
  patMetaEl.textContent=p.cat+' · '+n+'×'+n+' · '+beads+' 豆 · '+usedColors.length+' 色';
  const first=usedColors[0];
  if(first) selectColor(first);
  renderPalette();
  renderRefThumb();
  computeLayout();
  updatePct();
}

function renderPalette(){
  paletteEl.innerHTML='';
  usedColors.forEach(code=>{
    const info=PALETTE.find(p=>p.code===code);
    const btn=document.createElement('button');
    btn.className='swab';btn.dataset.code=code;btn.title=info.name;
    btn.style.background='linear-gradient(145deg,'+lighten(info.hex,0.35)+','+info.hex+')';
    btn.innerHTML='<span class="hole"></span><span class="cnt">0/'+(countsInTarget(code))+'</span>';
    if(code===curColor) btn.classList.add('sel');
    btn.addEventListener('click',()=>selectColor(code));
    paletteEl.appendChild(btn);
  });
  updateMaterialCounts();
}

function countsInTarget(code){let c=0; target.forEach(x=>{if(x===code)c++}); return c;}
function countsInState(code){let c=0; state.forEach(x=>{if(x===code)c++}); return c;}

function updateMaterialCounts(){
  paletteEl.querySelectorAll('.swab').forEach(b=>{
    const code=b.dataset.code;
    const el=b.querySelector('.cnt');
    if(el)el.textContent=countsInState(code)+'/'+countsInTarget(code);
  });
}

function selectColor(code){
  curColor=code; tool='pen';
  SFX.select();
  setTool('pen');
  paletteEl.querySelectorAll('.swab').forEach(b=>b.classList.toggle('sel',b.dataset.code===code));
}

function setTool(t){
  tool=t;
  document.querySelectorAll('.tool').forEach(el=>el.classList.toggle('on',el.dataset.tool===t));
}

function setMode(m){
  mode=m; modeLabel.textContent=MODES[m];
  showRef=(mode!=='challenge');
  syncThumb();
  render();
}

function cellFromEvent(e){
  const r=board.getBoundingClientRect();
  const i=Math.floor((e.clientX-r.left-pad)/cell),j=Math.floor((e.clientY-r.top-pad)/cell);
  if(i<0||i>=n||j<0||j>=n)return null;
  return j*n+i;
}

function applyAt(e){
  if(celebrated)return;              // 拼成后锁盘，不能再加/擦豆
  const idx=cellFromEvent(e); if(idx==null)return;
  if(tool==='pen'){
    if(state[idx]!==curColor){state[idx]=curColor;moves++;SFX.place();render();updateMaterialCounts();updatePct();}
  }else if(tool==='erase'){
    if(state[idx]!=null){state[idx]=null;moves++;SFX.erase();render();updateMaterialCounts();updatePct();}
  }
}

function applyPointer(e){
  if(celebrated)return;              // 拼成后不再进入绘制状态
  painting=true;
  if(e.pointerId!=null){try{board.setPointerCapture(e.pointerId);}catch(_){}}
  applyAt(e);}
function onBoardMove(e){if(painting)applyAt(e);}
function endPaint(){
  if(!painting)return;
  painting=false;
  if(celebrated){render();return;}   // 已完成：不重算进度、不回写存档
  updatePct();saveProgress();
}
// Pointer Events（Chrome 55+）始终绑定；安卓 9 以前未升级的老 WebView 不支持时，
// 再补 Touch/Mouse 兜底监听，保证棋盘可拖动填豆（两套监听不会同时生效）。
board.addEventListener('pointerdown',applyPointer);
board.addEventListener('pointermove',onBoardMove);
board.addEventListener('pointerup',endPaint);
board.addEventListener('pointercancel',endPaint);
if(!window.PointerEvent){
  board.addEventListener('mousedown',applyPointer);
  board.addEventListener('mousemove',onBoardMove);
  document.addEventListener('mouseup',endPaint);
  board.addEventListener('touchstart',function(e){if(e.touches.length)applyPointer(e.touches[0]);},{passive:true});
  board.addEventListener('touchmove',function(e){if(painting&&e.touches.length){applyAt(e.touches[0]);e.preventDefault();}},{passive:false});
  board.addEventListener('touchend',endPaint);
  board.addEventListener('touchcancel',endPaint);
}

function updatePct(){
  let tot=0,ok=0;
  for(let k=0;k<n*n;k++){if(target[k]!=null){tot++;if(state[k]===target[k])ok++;}}
  const pct=tot?Math.round(ok/tot*100):0;
  const circum=106.8;
  pctRing.style.strokeDashoffset=String(circum-pct/100*circum);
  if(pct>=100&&tot>0&&!celebrated) celebrate();
  updateStars();
}

function formatTime(sec){
  const m=Math.floor(sec/60),s=sec%60;
  return pad2(m)+':'+pad2(s);
}
function startTimer(){if(timerId)clearInterval(timerId);timerId=setInterval(()=>{elapsed=Math.floor((Date.now()-startTime)/1000);timerEl.textContent=formatTime(elapsed);updateStars();},1000);}
function stopTimer(){clearInterval(timerId);timerId=null;}

function starCount(){
  const total=target.filter(x=>x!=null).length;
  if(!total)return 0;
  const timeScore=Math.max(0,1-elapsed/(total*18+60));
  const errorScore=Math.max(0,1-(mistakes*1.5)/total);
  const score=timeScore*0.4+errorScore*0.6;
  return score>0.78?3:score>0.45?2:1;
}
function updateStars(){
  if(!PATTERNS[curPattern])return;
  const s=starCount();
  starsEl.textContent=s?('★'.repeat(s)+(3-s?'☆'.repeat(3-s):'')):'☆☆☆';
}

function celebrate(){
  if(celebrated)return; celebrated=true; stopTimer();
  stopHint();                       // 完成时清掉提示，避免两个 rAF 打架
  saveCompletion();
  ironT=0;
  SFX.iron();
  let start=performance.now();
  ironAnim=requestAnimationFrame(function frame(now){
    const t=(now-start)/1600;
    ironT=Math.min(1,t);
    render();
    if(t<1) requestAnimationFrame(frame);
    else{
      stamp.classList.add('show');
      setTimeout(()=>stamp.classList.remove('show'),2400);
      spawnPetals();
      SFX.win();
      showToast('月圆拼成！中秋快乐 ✦');
      openWin();
    }
  });
}

function spawnPetals(){
  // 桂花飘落：金黄小瓣，与背景星尘同色系
  const c=petals,d=Math.min(window.devicePixelRatio||1,2);
  c.width=window.innerWidth*d;c.height=window.innerHeight*d;
  c.style.width=window.innerWidth+'px';c.style.height=window.innerHeight+'px';
  const g=c.getContext('2d');g.setTransform(d,0,0,d,0,0);
  const W=window.innerWidth,H=window.innerHeight;
  const cols=['#FFD45E','#E6C65C','#FBF6E9','#A87A1E'];
  const ps=[];
  for(let i=0;i<40;i++)ps.push({x:Math.random()*W,y:Math.random()*-H,vy:1.2+Math.random()*2.0,vr:(Math.random()-0.5)*0.18,ph:Math.random()*6,sz:5+Math.random()*7,col:cols[(Math.random()*cols.length)|0]});
  const start=performance.now();
  function frame(now){
    const el=now-start;g.clearRect(0,0,W,H);
    for(const p of ps){p.y+=p.vy;p.x+=Math.sin(el/600+p.ph)*0.6;p.rot=(p.rot||0)+p.vr;
      g.save();g.translate(p.x,p.y);g.rotate(p.rot);g.fillStyle=p.col;g.globalAlpha=0.9;
      g.beginPath();g.ellipse(0,0,p.sz,p.sz*0.55,0,0,Math.PI*2);g.fill();g.restore();
      if(p.y>H+20){p.y=-20;p.x=Math.random()*W;}}
    if(el<3000)requestAnimationFrame(frame);else g.clearRect(0,0,W,H);
  }
  requestAnimationFrame(frame);
}

let toastTimer=null;
function showToast(msg){
  toastEl.textContent=msg;toastEl.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('show'),1800);
}

let hintCells=[],hintTimer=null,hintRAF=null;
function stopHint(){
  if(hintTimer){clearTimeout(hintTimer);hintTimer=null;}
  if(hintRAF){cancelAnimationFrame(hintRAF);hintRAF=null;}
  hintCells=[];
}
function hint(){
  if(celebrated){showToast('已经拼好啦，不能再提示');return;}
  const extra=[],wrong=[],wrongCur=[],needCur=[],needOther=[];
  for(let k=0;k<n*n;k++){
    if(state[k]!=null && target[k]==null){extra.push(k);}          // 拼多了：豆放在图案之外
    else if(state[k]!=null && state[k]!==target[k]){
      wrong.push(k);                                              // 放错色：图案内但颜色不对
      if(state[k]===curColor) wrongCur.push(k);
    }else if(target[k]!=null && state[k]==null){
      if(target[k]===curColor) needCur.push(k);                   // 当前颜色还缺的位置
      else needOther.push(k);                                     // 其他颜色还缺的位置
    }
  }
  let cells,msg;
  if(extra.length){                                               // 1) 拼多了 → 指出图案外的多余豆
    cells=extra;
    msg='有 '+extra.length+' 颗豆拼多了（图案外），已高亮，用橡皮擦掉';
  }else if(needCur.length){                                       // 2) 当前颜色还缺 → 高亮所有可放位置
    cells=needCur;
    msg='高亮了「'+PALETTE.find(p=>p.code===curColor).name+'」还可放的 '+needCur.length+' 处';
  }else if(wrongCur.length){                                      // 3) 当前颜色放错了位置
    cells=wrongCur;
    msg='「'+PALETTE.find(p=>p.code===curColor).name+'」有 '+wrongCur.length+' 处放错了，已高亮';
  }else if(wrong.length){                                         // 4) 当前颜色没问题但有其他放错
    cells=wrong;
    msg='当前颜色没问题；另有 '+wrong.length+' 处放错了，已高亮';
  }else if(needOther.length){                                     // 5) 当前颜色全部拼对 → 指出剩余待拼
    cells=needOther;
    msg='当前颜色已全部拼对，剩余 '+needOther.length+' 处待拼已高亮';
  }else{
    showToast('已经完美啦');return;
  }
  stopHint();
  hintCells=cells;
  hints++; mistakes++; // 提示计一次失误参考
  SFX.hint();
  // render() 不是常驻循环，这里必须自己跑 rAF，否则脉动只画一帧静止画面
  (function loop(){
    if(!hintCells.length){hintRAF=null;return;}
    render();
    hintRAF=requestAnimationFrame(loop);
  })();
  hintTimer=setTimeout(()=>{stopHint();render();},3200);
  saveProgress();
  showToast(msg);
}

function clearBoard(){
  state=new Array(n*n).fill(null); moves=0; mistakes=0; elapsed=0; startTime=Date.now();
  celebrated=false; ironT=0; stopHint();   // 解锁画盘，清掉熨烫态与提示
  render();updateMaterialCounts();updatePct();
  clearProgress(PATTERNS[curPattern].id);
  SFX.clear();
  showToast('已清空');
}

// 清空需二次确认
let clearArmed=false,clearTimer=null;
function requestClear(btn){
  if(clearArmed){
    clearArmed=false;clearTimeout(clearTimer);
    btn.classList.remove('confirm');
    if(btn.querySelector('span'))btn.querySelector('span').textContent='清空';
    clearBoard();
    return;
  }
  clearArmed=true;
  btn.classList.add('confirm');
  if(btn.querySelector('span'))btn.querySelector('span').textContent='再点确认';
  showToast('再点一次「清空」确认擦掉全部');
  clearTimer=setTimeout(()=>{
    clearArmed=false;btn.classList.remove('confirm');
    if(btn.querySelector('span'))btn.querySelector('span').textContent='清空';
  },3000);
}

// 参照缩略图为纯展示：临摹清晰，挑战模式虚化只留轮廓（不再提供手动开关）
function syncThumb(){refThumb.classList.toggle('masked',!showRef);}

// 目标格全部填对 → 完成态
function isSolved(){
  let has=false;
  for(let k=0;k<n*n;k++){
    if(target[k]==null)continue;
    has=true;
    if(state[k]!==target[k])return false;
  }
  return has;
}

// 每幅图纸的独立进度：pma_progress = {图纸id:{g:压缩棋盘,t:已用时,m:步数,k:失误}}
function loadProgress(){
  try{progress=JSON.parse(localStorage.getItem('pma_progress')||'{}')||{};}catch(e){progress={};}
}
function packState(){return state.map(c=>c||'.').join('');}
function unpackState(s,nn){
  if(!s||s.length!==nn*nn)return null;
  const a=new Array(nn*nn).fill(null);
  for(let i=0;i<nn*nn;i++){const ch=s[i];if(ch!=='.')a[i]=ch;}
  return a;
}
function saveProgress(){
  if(!PATTERNS[curPattern])return;
  if(celebrated)return;              // 已完成不回写进度，避免下次进来直接判完成
  const id=PATTERNS[curPattern].id;
  if(state.some(c=>c!=null)) progress[id]={g:packState(),t:elapsed,m:moves,k:mistakes};
  else delete progress[id];
  try{localStorage.setItem('pma_progress',JSON.stringify(progress));}catch(e){}
}
function clearProgress(id){
  if(!(id in progress))return;
  delete progress[id];
  try{localStorage.setItem('pma_progress',JSON.stringify(progress));}catch(e){}
}

// 本地存档：pma_records = {图纸id:{t用时秒,s星级,m步数}}
function loadRecords(){
  records={};
  try{
    const raw=JSON.parse(localStorage.getItem('pma_records')||'null');
    if(raw&&typeof raw==='object'&&!Array.isArray(raw)) records=raw;
  }catch(e){records={};}
  updateGalCount();
}
function updateGalCount(){
  const n=Object.keys(records).length;
  const a=document.getElementById('galCount');
  if(a)a.textContent=n+' 幅';
}
function saveCompletion(){
  const id=PATTERNS[curPattern].id;
  const cur={t:elapsed,s:starCount(),m:moves};
  const prev=records[id];
  if(!prev||cur.s>prev.s||(cur.s===prev.s&&(!prev.t||cur.t<prev.t))) records[id]=cur;
  try{localStorage.setItem('pma_records',JSON.stringify(records));}catch(e){}
  clearProgress(id); // 拼完即清空该图进度，下次从头开始
  updateGalCount();
  syncRiddle();      // 新完成一幅 → 可能解锁下一盏灯谜
}
function isCompleted(id){return !!records[id];}

// ==================== 猜灯谜：拼成一幅点亮一盏 ====================
let riddleState={solved:[]};
function loadRiddle(){
  try{
    const r=JSON.parse(localStorage.getItem('pma_riddle')||'null');
    if(r&&Array.isArray(r.solved)){
      riddleState.solved=r.solved.filter(id=>RIDDLES.some(x=>x.id===id));
    }
  }catch(e){}
  syncRiddle();
}
function saveRiddle(){
  try{localStorage.setItem('pma_riddle',JSON.stringify(riddleState));}catch(e){}
}
// 同步「已点亮 N/8 盏」两处入口文案
function syncRiddle(){
  const lit=riddleState.solved.length, total=RIDDLES.length;
  const a=document.getElementById('rbState');
  const b=document.getElementById('menuRiddle');
  if(a)a.textContent='已点亮 '+lit+'/'+total+' 盏';
  if(b)b.textContent=lit+'/'+total+' 盏';
}
const LANTERN_SVG='<svg viewBox="0 0 24 24"><path d="M8 2h8v2H8zM7 5h10c2.8 0 5 3.1 5 7s-2.2 7-5 7H7c-2.8 0-5-3.1-5-7s2.2-7 5-7zm4 2v10h2V7h-2zM10 20h4v2h-4z"/></svg>';
function renderRiddleSheet(){
  const body=document.getElementById('riddleBody');
  const solved=riddleState.solved.length;
  syncRiddle();
  if(solved>=RIDDLES.length){
    body.innerHTML='<div class="rd-done"><div class="rd-big">灯火已全亮</div>'+
      '<p>八盏灯谜全部猜中，<br>愿你人月两团圆，中秋快乐。</p></div>';
    return;
  }
  const r=RIDDLES[solved];
  const unlocked=Object.keys(records).length;
  if(solved>=unlocked){
    body.innerHTML='<div class="rd-lock"><div class="rd-big">灯笼还暗着</div>'+
      '<p>拼成一幅图案，即可点亮第 '+(solved+1)+' 盏灯谜。<br>已完成 '+unlocked+' 幅，还差一幅。</p>'+
      '<button class="rd-btn" id="rdGo">去拼豆</button></div>';
    const b=document.getElementById('rdGo');
    if(b)b.addEventListener('click',function(){
      document.getElementById('sheetRiddle').classList.remove('show');
      showHome();
    });
    return;
  }
  let lanterns='';
  RIDDLES.forEach(function(x,i){
    lanterns+=LANTERN_SVG.replace('<svg','<svg class="'+(i<solved?'lit':'')+'"');
  });
  body.innerHTML='<div class="rd-lanterns">'+lanterns+'</div>'+
    '<div class="rd-q">'+(solved+1)+'. '+r.q+'</div>'+
    '<div class="rd-opts">'+r.opts.map((o,i)=>'<button class="rd-opt" data-i="'+i+'">'+String.fromCharCode(65+i)+' · '+o+'</button>').join('')+'</div>'+
    '<div class="rd-note" id="rdNote"></div>';
  body.querySelectorAll('.rd-opt').forEach(function(btn){
    btn.addEventListener('click',function(){
      const i=+btn.dataset.i;
      if(i===r.a){
        btn.classList.add('ok');
        riddleState.solved.push(r.id); saveRiddle(); syncRiddle();
        SFX.win();
        spawnPetals();
        document.getElementById('rdNote').innerHTML='<b>猜中啦，第 '+(solved+1)+' 盏灯点亮！</b>'+r.note+
          (solved+1<RIDDLES.length?'<button class="rd-btn" id="rdNext">下一盏</button>':'');
        const nb=document.getElementById('rdNext');
        if(nb)nb.addEventListener('click',renderRiddleSheet);
      }else{
        btn.classList.add('bad'); SFX.error();
        setTimeout(function(){btn.classList.remove('bad');},600);
      }
    });
  });
}
function openRiddle(){
  renderRiddleSheet();
  document.getElementById('sheetRiddle').classList.add('show');
}

// 图纸库全屏页
let libFilter='全部';
function renderLibrary(){
  const cats=['全部'];
  PATTERNS.forEach(p=>{if(cats.indexOf(p.cat)<0)cats.push(p.cat);});
  const tabs=document.getElementById('libTabs');
  tabs.innerHTML='';
  cats.forEach(c=>{
    const b=document.createElement('button');
    b.className='lib-tab'+(c===libFilter?' sel':'');
    b.textContent=c;
    b.addEventListener('click',()=>{libFilter=c;renderLibrary();});
    tabs.appendChild(b);
  });
  const hd=document.getElementById('homeDone'),ht=document.getElementById('homeTotal');
  if(hd)hd.textContent=Object.keys(records).length;
  if(ht)ht.textContent='共 '+PATTERNS.length+' 幅';
  const grid=document.getElementById('libGrid');
  grid.innerHTML='';
  const list=PATTERNS.filter(p=>libFilter==='全部'||p.cat===libFilter);
  list.forEach(p=>{
    const idx=PATTERNS.indexOf(p);
    const card=document.createElement('button');
    card.className='lib-card'+(idx===curPattern?' cur':'');
    const tw=document.createElement('div');tw.className='lib-thumb';
    const cv=document.createElement('canvas');cv.width=120;cv.height=120;
    const c=cv.getContext('2d');const sc=120/p.n;
    for(let j=0;j<p.n;j++)for(let i=0;i<p.n;i++){
      const code=p.grid[j][i];if(code==='.')continue;
      c.fillStyle=PAL[code];c.beginPath();c.arc(i*sc+sc/2,j*sc+sc/2,sc*0.46,0,Math.PI*2);c.fill();
    }
    tw.appendChild(cv);
    const rec=records[p.id];
    if(rec){
      const badge=document.createElement('div');badge.className='lib-badge';
      badge.textContent=rec.s>0?('★'.repeat(rec.s)):'已完成';
      tw.appendChild(badge);
    }
    let beads=0;const cols={};
    for(let j=0;j<p.n;j++)for(let i=0;i<p.n;i++){
      const ch=p.grid[j][i];if(ch!=='.'){beads++;cols[ch]=1;}
    }
    const colCount=Object.keys(cols).length;
    // 未完成的显示已拼进度
    let progTxt='';
    if(!rec){
      const pv=progress[p.id], pst=pv?unpackState(pv.g,p.n):null;
      if(pst){
        let tot=0,ok=0;
        for(let j=0;j<p.n;j++)for(let i=0;i<p.n;i++){
          const ch=p.grid[j][i]; if(ch==='.')continue;
          tot++; if(pst[j*p.n+i]===ch)ok++;
        }
        if(tot&&ok)progTxt=' · 已拼 '+Math.round(ok/tot*100)+'%';
      }
    }
    const timeStr=(rec&&rec.t)?(' · 上次 '+formatTime(rec.t)):'';
    const info=document.createElement('div');info.className='lib-info';
    info.innerHTML='<div class="lib-name">'+p.name+'</div>'+
      '<div class="lib-meta">'+p.cat+' · '+p.n+'×'+p.n+' · '+beads+' 豆 · '+colCount+' 色'+timeStr+progTxt+'</div>'+
      '<div class="lib-lore">'+p.lore+'</div>';
    card.appendChild(tw);card.appendChild(info);
    card.addEventListener('click',()=>{SFX.click();openPattern(idx);});
    grid.appendChild(card);
  });
  if(!list.length)grid.innerHTML='<div class="lib-empty">该分类暂无图纸</div>';
}

// 视图切换：首页（图纸库）↔ 拼豆台
function showHome(){
  atHome=true; stopTimer(); saveProgress();
  document.getElementById('homeView').classList.remove('hide');
  renderLibrary();
}
function showPlay(){
  atHome=false;
  document.getElementById('homeView').classList.add('hide');
  computeLayout();
}
function openPattern(i){
  selectPattern(i);   // 内部已按存档恢复棋盘/用时/步数，并同步 startTime
  startTimer();
  showPlay();
  showToast(lastRestored?'已恢复上次进度，继续拼':'照参照图选色珠，点棋盘填豆');
}

function openWin(){
  document.getElementById('winTime').textContent=formatTime(elapsed);
  document.getElementById('winMoves').textContent=moves;
  document.getElementById('winMistakes').textContent=mistakes;
  document.getElementById('winStars').textContent=starsEl.textContent;
  document.getElementById('winLore').textContent=PATTERNS[curPattern].lore;
  winModal.classList.add('show');
}
function closeWin(){winModal.classList.remove('show');}
function nextPattern(){closeWin();let i=curPattern+1;if(i>=PATTERNS.length)i=0;openPattern(i);}

function renderGallerySheet(){
  const grid=document.getElementById('galleryGrid');grid.innerHTML='';
  PATTERNS.filter(p=>isCompleted(p.id)).forEach(p=>{
    const item=document.createElement('div');item.className='gal-item';
    const cv=document.createElement('canvas');cv.width=80;cv.height=80;
    const c=cv.getContext('2d');const sc=80/p.n;
    c.fillStyle='#101627';c.fillRect(0,0,80,80);
    for(let j=0;j<p.n;j++)for(let i=0;i<p.n;i++){const code=p.grid[j][i];if(code==='.')continue;c.fillStyle=PAL[code];c.beginPath();c.arc(i*sc+sc/2,j*sc+sc/2,sc*0.46,0,Math.PI*2);c.fill();}
    item.appendChild(cv);
    const name=document.createElement('div');name.className='name';name.textContent=p.name;item.appendChild(name);
    item.addEventListener('click',()=>{document.getElementById('sheetGallery').classList.remove('show');openPattern(PATTERNS.indexOf(p));});
    grid.appendChild(item);
  });
  if(grid.children.length===0)grid.innerHTML='<div style="grid-column:1/-1;text-align:center;color:var(--text-dim);padding:20px 0;">暂无完成作品，快去拼一幅吧</div>';
}

// 背景粒子：星尘缓浮 + 明暗闪烁（夜空）
function initBg(){
  const c=document.getElementById('bgCanvas'),g=c.getContext('2d');
  const d=Math.min(window.devicePixelRatio||1,1.5);
  let W,H,ps=[];
  function resize(){
    W=window.innerWidth;H=window.innerHeight;c.width=W*d;c.height=H*d;c.style.width=W+'px';c.style.height=H+'px';g.setTransform(d,0,0,d,0,0);ps=[];
    for(let i=0;i<42;i++)ps.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-0.5)*0.16,vy:(Math.random()-0.5)*0.12,sz:0.8+Math.random()*1.8,al:0.15+Math.random()*0.4,sp:0.4+Math.random()*1.4,ph:Math.random()*6});
  }
  resize();
  function frame(now){
    g.clearRect(0,0,W,H);
    for(const p of ps){p.x+=p.vx;p.y+=p.vy;if(p.x<0)p.x+=W;if(p.x>W)p.x-=W;if(p.y<0)p.y+=H;if(p.y>H)p.y-=H;
      const a=p.al*(0.55+0.45*Math.sin(now/1000*p.sp+p.ph));
      g.fillStyle='rgba(255,244,214,'+a+')';
      g.beginPath();g.arc(p.x,p.y,p.sz,0,Math.PI*2);g.fill();}
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.addEventListener('resize',resize);
}

// 事件绑定
function bindTools(){
  document.querySelectorAll('.tool').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const t=btn.dataset.tool;
      SFX.click();
      if(t==='clear') requestClear(btn);
      else if(t==='hint') hint();
      else if(t==='home') showHome();
      else if(t==='more'){
        const menu=document.getElementById('moreMenu');
        const on=menu.classList.toggle('show');
        btn.classList.toggle('on',on);
      }
      else setTool(t);
    });
  });
  syncThumb();
  // 底栏「更多」菜单（顶部已无可点按钮）
  const menu=document.getElementById('moreMenu'),btnMore=document.querySelector('[data-tool=more]');
  function closeMenu(){menu.classList.remove('show');if(btnMore)btnMore.classList.remove('on');}
  menu.querySelectorAll('.menu-item').forEach(item=>{
    item.addEventListener('click',()=>{
      const a=item.dataset.act; closeMenu();
      if(a==='sfx'){SFX.setOn(!SFX.isOn());SFX.save();SFX.syncLabels();if(SFX.isOn())SFX.select();}
      else if(a==='bgm'){SFX.setBgm(!SFX.isBgmOn());SFX.save();SFX.syncLabels();if(SFX.isBgmOn())SFX.select();}
      else SFX.click();
      if(a==='riddle'){openRiddle();}
      else if(a==='mode'){const keys=Object.keys(MODES),i=keys.indexOf(mode);setMode(keys[(i+1)%keys.length]);}
      else if(a==='gallery'){renderGallerySheet();document.getElementById('sheetGallery').classList.add('show');}
      else if(a==='info') showToast('选色珠点棋盘填豆；进度自动保存，拼满 100% 即点亮一盏灯谜。');
    });
  });
  document.addEventListener('click',e=>{
    if(!menu.contains(e.target)&&!(btnMore&&btnMore.contains(e.target))) closeMenu();
  });
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('.sheet').classList.remove('show')));
  document.getElementById('winReplay').addEventListener('click',()=>{closeWin();clearBoard();startTime=Date.now();elapsed=0;startTimer();});
  document.getElementById('winNext').addEventListener('click',nextPattern);
  document.getElementById('riddleBanner').addEventListener('click',()=>{SFX.click();openRiddle();});
  document.getElementById('riddleBanner').addEventListener('click',()=>{SFX.click();openRiddle();});
  winModal.addEventListener('click',e=>{if(e.target===winModal)closeWin();});
}

// 小工具容器的导航栏 / 外壳由容器统一控制，包内不自行避让。
// 仅当显式携带 ?inapp=1（嵌入宿主 App WebView 场景）时才额外让出安全区。
function applySafeArea(){
  try{
    const q=new URLSearchParams(location.search);
    if(q.get('inapp')==='1'){
      document.body.classList.add('in-app');
    }
  }catch(e){}
}

function init(){
  applySafeArea();
  SFX.load();
  // 移动端 AudioContext 必须在用户手势内解锁
  ['pointerdown','touchstart','keydown'].forEach(function(ev){
    window.addEventListener(ev,function(){SFX.unlock();},{once:true,passive:true});
  });
  loadRecords();
  loadProgress();
  loadRiddle();
  bindTools();
  initBg();
  selectPattern(0);
  showHome();
  let rz=null;
  window.addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(computeLayout,120);});
  window.addEventListener('orientationchange',()=>setTimeout(computeLayout,280));
}

init();
})();
