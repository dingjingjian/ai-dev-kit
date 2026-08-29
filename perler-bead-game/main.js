(function(){
"use strict";
const PATTERNS = [
 {
  "id": "taiji",
  "name": "太极",
  "diff": 1,
  "cat": "入门",
  "lore": "阴阳相生，万物之始。",
  "n": 13,
  "grid": [
   ".............",
   "...kewwwek...",
   "..kkwwkwwwk..",
   ".kkkwkkkwwwk.",
   ".ekkwwkwwwwe.",
   ".kkkwwwwwwww.",
   ".kkkkkwwwwww.",
   ".kkkkkkkkwww.",
   ".ekkkkwkkwwe.",
   ".kkkkwwwkwwk.",
   "..kkkkwkkwk..",
   "...kekkkek...",
   "............."
  ]
 },
 {
  "id": "coin",
  "name": "铜钱",
  "diff": 1,
  "cat": "入门",
  "lore": "天圆地方，招财进宝。",
  "n": 13,
  "grid": [
   ".....yyy.....",
   "...kyyyyyk...",
   "..kyddddddk..",
   ".kyddddddddk.",
   ".yddoooooddo.",
   "yyddo...oddoo",
   "yyddo...oddoo",
   "yyddo...oddoo",
   ".yddoooooddo.",
   ".kddddddddok.",
   "..kddddddok..",
   "...koooook...",
   ".....ooo....."
  ]
 },
 {
  "id": "plum",
  "name": "梅花",
  "diff": 1,
  "cat": "入门",
  "lore": "凌寒独自开，报春第一枝。",
  "n": 13,
  "grid": [
   ".............",
   ".............",
   ".....vvv.....",
   "....ppppp....",
   "..vpyylylpv..",
   "..vplyyylpv..",
   "..vpyyyyypv..",
   "...lyyyyyp...",
   "..mpplylpp...",
   "..mvpplppv...",
   ".mmmvvmvv....",
   "mmm...m......",
   "m............"
  ]
 },
 {
  "id": "peach",
  "name": "寿桃",
  "diff": 1,
  "cat": "入门",
  "lore": "三千年结实，祝寿绵长春。",
  "n": 13,
  "grid": [
   ".......m.....",
   "......mm...nn",
   ".....lmm..ggg",
   "....llplgggn.",
   "...lllplnnn..",
   "..llwwpllll..",
   "..llllpllll..",
   ".llpppplppll.",
   ".lppppplppll.",
   ".llpppplllll.",
   "..llllpllll..",
   ".lllllplllll.",
   "..lllllllll.."
  ]
 },
 {
  "id": "lantern",
  "name": "红灯笼",
  "diff": 2,
  "cat": "进阶",
  "lore": "一夜鱼龙舞，灯明照岁寒。",
  "n": 17,
  "grid": [
   "........k........",
   "........k........",
   ".....dyyyyyd.....",
   ".....dvvvvvd.....",
   ".....ddddddd.....",
   "....vvvrvrvvv....",
   "...vvvvrvrvvvv...",
   "...vvvvryrvvvv...",
   "...vvvvyyyvvvv...",
   "...vvvvrkrvvvv...",
   "...vvvvrvrvvvv...",
   "....vvvrvrvvv....",
   ".....vvvvvvv.....",
   "......vdddv......",
   ".....ddddddd.....",
   ".....ddyyydd.....",
   "......yyyyy......"
  ]
 },
 {
  "id": "bamboo",
  "name": "墨竹",
  "diff": 2,
  "cat": "进阶",
  "lore": "未出土时先有节，及凌云处尚虚心。",
  "n": 17,
  "grid": [
   ".........g.......",
   ".....gngg........",
   ".....ggnnn.......",
   "....wgnn...g...g.",
   ".....nn....g.gg..",
   "....nnn....gg....",
   ".....gn....kk....",
   "...w.gn.gg.gg....",
   ".....kk.ggggg....",
   ".....gngg..ggg...",
   ".....gg....kk.g..",
   "...w.g......g....",
   "....kkk.nn..g....",
   ".....g....nng....",
   "...w.g......k....",
   "....kkk.....g....",
   "....gn......g...."
  ]
 },
 {
  "id": "koi",
  "name": "锦鲤",
  "diff": 2,
  "cat": "进阶",
  "lore": "锦鲤跃浪，年年有余。",
  "n": 17,
  "grid": [
   ".................",
   ".................",
   ".................",
   ".................",
   ".......pp......v.",
   ".....vvppp...vvv.",
   "..weerveeerrvvrr.",
   ".wkwerrvwwrrw.r..",
   ".wkwerrwwrrww.r..",
   ".kkwewwwrrrww.r..",
   "...eewwwrrrwvvrr.",
   "...e.llllrl..vvv.",
   ".......ll.l....v.",
   "......lcc........",
   "ccccccccccccccccc",
   "cccccccc.cccccccc",
   "ccccccccccccccccc"
  ]
 },
 {
  "id": "vase",
  "name": "青花瓶",
  "diff": 2,
  "cat": "进阶",
  "lore": "素瓷雪色缥沫香，青花半隐见天光。",
  "n": 17,
  "grid": [
   ".................",
   "......bbbbb......",
   ".......bbb.......",
   ".......bbb.......",
   ".......cwe.......",
   ".......cwe.......",
   "......bbbbb......",
   "...bbbwbbbwbbb...",
   "....bbbwwwbbb....",
   "....cbbbbbwbe....",
   "...bbbwbbbbbbb...",
   "...bbwbwwwbwbb...",
   ".....wwbbbww.....",
   ".....bbbbbbb.....",
   ".....cwwwwwe.....",
   ".....wwwwwww.....",
   ".....bbbbbbb....."
  ]
 },
 {
  "id": "lotus",
  "name": "荷花",
  "diff": 2,
  "cat": "进阶",
  "lore": "出淤泥而不染，濯清涟而不妖。",
  "n": 17,
  "grid": [
   ".................",
   ".................",
   ".................",
   "........p........",
   "....pp.ppp.pp....",
   "....pplwplwpp....",
   ".....plwwlwp.....",
   "...pwwlyyylllp...",
   "...plllynnwwwp...",
   "....pplynnlpp....",
   "....ppwllwlpp....",
   "....ppllpwwpp....",
   ".......ppp.......",
   "ggggnnn.....nn...",
   "nnggggg..ngggggg.",
   "..nnntttttttnnnn.",
   "....ttttttttt...."
  ]
 },
 {
  "id": "cloud",
  "name": "祥云",
  "diff": 2,
  "cat": "进阶",
  "lore": "青云直上，瑞气东来。",
  "n": 17,
  "grid": [
   ".................",
   ".................",
   ".................",
   ".................",
   "......ccc..c.....",
   ".....ccccccccc...",
   "....tttttttttt...",
   "..cccctttttttcc..",
   "..ccccctttbtcccc.",
   "..tttttttcttbbtt.",
   "..ttttbtcctttttb.",
   "..tttbbtctttttbt.",
   "..bbbbbbcccbccct.",
   ".........tccctt..",
   ".................",
   ".................",
   "................."
  ]
 },
 {
  "id": "knot",
  "name": "中国结",
  "diff": 2,
  "cat": "进阶",
  "lore": "一根丝线，千回百转，同心永结。",
  "n": 17,
  "grid": [
   "........y........",
   "........y........",
   ".......rrr.......",
   ".......r.r.......",
   "......vr.rv......",
   ".....yyrrr.v.....",
   "....vyyrrr..v....",
   "..rrrrrryrrrrrr..",
   "..r..rryyyrr..r..",
   "..rrrrrryrrrrrr..",
   "....v..rrryyv....",
   ".....v.rrryy.....",
   "......vr.rv......",
   ".......r.r.......",
   ".......rrr.......",
   ".......ydy.......",
   "......yyyyy......"
  ]
 },
 {
  "id": "crane",
  "name": "仙鹤",
  "diff": 2,
  "cat": "进阶",
  "lore": "丹顶鹤唳，一品鸟也。",
  "n": 17,
  "grid": [
   ".....r...........",
   "....wrr..........",
   "...dwkw..........",
   "....ww...........",
   "...www...........",
   "...www...........",
   "...www...........",
   "....wkkwwww...ee.",
   "....wkkwwwwweeee.",
   "....wkkewwwwkkk..",
   "....wwkeeweekkkk.",
   "....wwweeeee.kkk.",
   ".....wekkkk......",
   ".......kkkk......",
   ".......kkkk......",
   ".......kkkkk.....",
   "....nnnnnnnnnn..."
  ]
 },
 {
  "id": "fu",
  "name": "福字斗方",
  "diff": 3,
  "cat": "精工",
  "lore": "福到万家，新春纳祥。",
  "n": 21,
  "grid": [
   ".....................",
   ".ddddddddddddddddddd.",
   ".drrrrrrrrrrrrrrrrrd.",
   ".drrrrrrrrrrrrrrrrrd.",
   ".drrrrrrrrrrrrrrrrrd.",
   ".ddddddrrrddddddddrd.",
   ".ddrddrrrrrrrrrrrrrd.",
   ".ddrddrrrrdddddddrrd.",
   ".dddddrrrrd.....drrd.",
   ".dddddrrrrd.....drrd.",
   ".drdddrddrdddddddrrd.",
   ".drdddrrrrrrrrrrrrrd.",
   ".drrddrrrrdddddddrrd.",
   ".drrddrrrrd..d..drrd.",
   ".drrddrrrrdddddddrrd.",
   ".drrddrrrrd..d..drrd.",
   ".drrddrrrrdddddddrrd.",
   ".drrddrrrrdddddddrrd.",
   ".drrrrrrrrrrrrrrrrrd.",
   ".ddddddddddddddddddd.",
   "....................."
  ]
 },
 {
  "id": "peony",
  "name": "牡丹",
  "diff": 3,
  "cat": "精工",
  "lore": "唯有牡丹真国色，花开时节动京城。",
  "n": 21,
  "grid": [
   ".....................",
   ".....................",
   ".........vv..v.......",
   "......vvvvvvvvv......",
   "......vvvvvpvvvvv....",
   "...vvvvppppppvvvv....",
   "....vvvplpplpppvv....",
   "...vvpppllllpppvvvv..",
   "..vvvpplllylllppvvv..",
   "...vvplllyoollpppv...",
   "...vpppllyoolllpvv...",
   "..vvvppllloollppvvv..",
   "..vvvvpppllllpppvv...",
   "....vvppplpplpvvv....",
   "....vvvvppppppvvvv...",
   "...nvvvvvpvvvvvnnn...",
   ".mnnnnvvvvvvvvvnnnnm.",
   "mnnnn..v..vv....nnnnm",
   "mm.................mm",
   ".....................",
   "....................."
  ]
 },
 {
  "id": "goldfish",
  "name": "金鱼",
  "diff": 3,
  "cat": "精工",
  "lore": "金玉满堂，连年有余。",
  "n": 21,
  "grid": [
   ".....................",
   ".....................",
   ".....................",
   "...................r.",
   ".........pp......vv..",
   "........ppp.....vvv..",
   ".....rrrpppp..vvvrr..",
   "....rrrrreeeevvvrrr..",
   "...kwrrrrwwwrrrrrr...",
   "..wkwwrrrwwwrrrwrr...",
   "..kkwwrrrwrrrwwwrr...",
   ".kkkwwwwrrrrrrvwrr...",
   ".....wwrrrrrrrvrrr...",
   ".......lrrrrrvvvvrr..",
   "........ll..llvvvrr..",
   ".......lll.ll...vvv..",
   ".......lcccl.....vvcc",
   "cccccclcccccccccccccc",
   "ccccccccc..ccccccccc.",
   "ccccccccccccccccccccc",
   "ccccccccccccccccccccc"
  ]
 },
 {
  "id": "butterfly",
  "name": "蝴蝶",
  "diff": 3,
  "cat": "精工",
  "lore": "庄周晓梦迷蝶，梁祝化蝶双飞。",
  "n": 21,
  "grid": [
   "........kk.kk........",
   ".........k.k.........",
   ".........kmk.........",
   ".........kmk.........",
   ".....ddd..y..ddd.....",
   "..dbbbbbbdmdbbbbbbd..",
   ".dcbbbkkkkdkkkkbbbcd.",
   "dccbbdbbbbdbbbbdbbccd",
   "dccbbdbbbbdbbbbdbbccd",
   "dcccbbbbbdmdbbbbbcccd",
   ".dccbbbbd.k.dbbbbccd.",
   "...ddd.p..k..p.ddd...",
   ".....ppppkmkpppp.....",
   "....ppwpkpmpkpwpp....",
   "...llldwklmlkwdlll...",
   "...llllkl.m.lkllll...",
   "....llll.mmm.llll....",
   "..........m..........",
   ".....................",
   ".....................",
   "....................."
  ]
 },
 {
  "id": "fan",
  "name": "团扇",
  "diff": 3,
  "cat": "精工",
  "lore": "轻罗小扇扑流萤，古典闺阁之雅。",
  "n": 21,
  "grid": [
   "......mwwwmwwwm......",
   ".....wwmwwmwwmww.....",
   "...wwwwmwwmwwmwwww...",
   "...mmwwmmwmwmmwwmm...",
   "..mwwmwwmwmwmwwmwwm..",
   "..cwwwmwmmppmwmwwww..",
   ".mcwwwwmwmpkmmwwwwwm.",
   ".mcwwwwwpmmmmmmwwwwm.",
   ".ccwwwwpypmmwpymwwww.",
   ".ccwwwmmpkmwwpykwwww.",
   ".mcwwwmmwwwwwwwmmwwm.",
   ".mcwwwwwwwwwyymmwwwm.",
   "..cwwwwwwwwwwkmwwww..",
   "..mwwwwwwwwwwwwwwwm..",
   "...wwwwwwwwwwwwwww...",
   "...eeeeeeeeeeeeeee...",
   ".....eeeeeeeeeee.....",
   "......meeeeeeem......",
   ".........ddd.........",
   ".........mmm.........",
   ".........mym........."
  ]
 },
 {
  "id": "landscape",
  "name": "山水",
  "diff": 3,
  "cat": "精工",
  "lore": "远山如黛，落日熔金，一叶扁舟。",
  "n": 21,
  "grid": [
   ".....................",
   "bbbbbbbbbbbbbbbbbbbbb",
   "bbbbbbbbbbbbbbbyybbbb",
   "bbbbbbbbbbbbbbyyyybbb",
   "ccccccccccccccyyyyccc",
   "ccccccccccccccooooccc",
   "cckkcccccckccccoocccc",
   "wkkkbwwwwkkkwwwwwwwwk",
   "kkkbbbwwkkkkkbbwwwwkk",
   "kkbbbbbkkkkkbbbb.kkkk",
   "kbbbbbbkkkkbbbbbbbkkk",
   "bbbbbnnbkkbbbbbbbbbkk",
   "bbbnnnnnbbbbbbbbbbbbn",
   "bnnnnnnnnbbbbbbbbbnnn",
   "nnnnnnnnnnbbbbwwwwwwn",
   "nnwwwwwwwwnbbnwwwwwwn",
   "nnwwwwwwwwnnnnmmmmnnn",
   "nnnnnnnnnnnnnnnmmnnnn",
   "ccccccwwwccccccwwwccc",
   "wwwwwwwccwwwwwwwccwww",
   "wwwwwccwwwwwwwccwwwww"
  ]
 },
 {
  "id": "medallion",
  "name": "宝相花",
  "diff": 4,
  "cat": "传世",
  "lore": "敦煌华盖，宝相庄严。",
  "n": 25,
  "grid": [
   "........vvpppvv...v......",
   "....vv..vpppppv.vvvv.....",
   "...vvvv.vpppypvvvppvv....",
   "..vvppvvvpppppvvppppvv...",
   ".vvppppvvpppypvppppppvv..",
   "vvpppyppvvlllvvppppypvv..",
   ".vppppypvllddlllppypvv...",
   ".vvpppplllddddlllppvv....",
   "..vvpplllddddddllvvvvvvvv",
   "vvvvvvllddddddddllvppppvv",
   "vppppvldddyyrydddllpppppv",
   "ppppplddddyrorddddlpppppv",
   "ppypylddddrooyrdddlpypypv",
   "ppppplldddyryrdddlvppppvv",
   "vppppvllddddrdddllvvvvvvv",
   "vvvvvvvllddddddlllppvv...",
   "...vvpplllddddlllppppvv..",
   "..vvpppplllddllvppppppv..",
   ".vvpppyppvvlllvvppypppvv.",
   ".vvppypppvpppppvvppypvv..",
   "..vvppppvvppyppvvvppvv...",
   "...vvppvvvpppppv.vvvv....",
   "....vvvv.vppyppv..vv.....",
   ".....v...vvpppvv.........",
   ".........vvvvvvv........."
  ]
 },
 {
  "id": "magpie",
  "name": "喜鹊登梅",
  "diff": 4,
  "cat": "传世",
  "lore": "喜鹊登梅梢，喜上眉梢来。",
  "n": 25,
  "grid": [
   "...................llm...",
   ".mm...............pyyp...",
   ".mmm..............pykp...",
   "..mll..............pp....",
   "..pyrp............mm.....",
   "..pyrwwww....ll..mmm.....",
   "...pwwwkkw..pyyp.mm......",
   "...wwwwkkk..pykpmll......",
   "....wkkkkkrw.ppmpyypmm...",
   "......kkmwkwkkkepykpmmm..",
   ".......kmpwwkwwkwpkkkmm..",
   "........mpwwwkkkwkkk.....",
   ".......mmmwwkwkww........",
   "......mmmmmkkkkk.........",
   ".....llmmm..k.k..........",
   "....pyypm................",
   "...mpykp.................",
   "..mmmpp..................",
   ".mmmm....................",
   "mllm.....................",
   "pyyp.....................",
   "pykp.....................",
   "mpp......................",
   ".........................",
   "........................."
  ]
 }
];

const PALETTE = [
  {code:'w',name:'月白',hex:'#F3EDE0'},{code:'e',name:'银灰',hex:'#BDB6A8'},
  {code:'k',name:'墨黑',hex:'#221E1B'},{code:'m',name:'栗棕',hex:'#7A4A2E'},
  {code:'o',name:'赭石',hex:'#B0763C'},{code:'r',name:'朱砂',hex:'#C8382F'},
  {code:'v',name:'绛紫',hex:'#7E2B3A'},{code:'p',name:'胭脂',hex:'#C95F7C'},
  {code:'l',name:'藕荷',hex:'#DCACBB'},{code:'y',name:'藤黄',hex:'#E9B23C'},
  {code:'d',name:'描金',hex:'#C9A34B'},{code:'g',name:'豆绿',hex:'#86A95C'},
  {code:'n',name:'松绿',hex:'#3D6B4E'},{code:'t',name:'青碧',hex:'#3FA79B'},
  {code:'b',name:'青花',hex:'#2F5D8C'},{code:'c',name:'天青',hex:'#86AECB'}
];
const PAL = {}; PALETTE.forEach(p=>PAL[p.code]=p.hex);
const MODES = {copy:'临摹',challenge:'挑战'};

// ==================== 音效引擎：Web Audio 程序化合成（零外部文件）====================
// 音色全部实时合成：木鱼/梆子（放豆）、编钟（通关）、古筝拨弦（背景音乐）、带通噪声（擦除/熨烫）
const SFX=(function(){
  let ctx=null, master=null, sfxBus=null, bgmBus=null, noiseBuf=null;
  let on=true, bgmOn=true, unlocked=false;
  let bgmTimer=null, bgmIdx=4, lastPlace=0;
  // C 宫五声音阶（宫商角徵羽），跨两个八度
  const PENTA=[261.63,293.66,329.63,392.00,440.00,523.25,587.33,659.25,783.99,880.00];

  function ensure(){
    if(ctx) return ctx;
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC) return null;
    try{ ctx=new AC(); }catch(e){ return null; }
    master=ctx.createGain(); master.gain.value=on?0.85:0; master.connect(ctx.destination);
    sfxBus=ctx.createGain(); sfxBus.gain.value=0.95; sfxBus.connect(master);
    bgmBus=ctx.createGain(); bgmBus.gain.value=0.55; bgmBus.connect(master);
    return ctx;
  }
  function live(){ return on && ctx; }
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
  function pluck(freq,t,dur,amp,dest){
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

  // --- 背景音乐：五声音阶随机游走 ---
  function bgmTick(){
    bgmTimer=null;
    if(!on||!bgmOn||!ctx) return;
    const t=ctx.currentTime+0.03;
    const step=(Math.random()<0.5?-1:1)*(Math.random()<0.72?1:2);
    bgmIdx+=step;
    if(bgmIdx<2) bgmIdx=3+((2-bgmIdx)%3);
    if(bgmIdx>=PENTA.length) bgmIdx=PENTA.length-1-((bgmIdx-PENTA.length+1)%4);
    pluck(PENTA[bgmIdx],t,1.7,0.13,bgmBus);
    if(Math.random()<0.32) pluck(PENTA[bgmIdx%5]/2,t,2.4,0.09,bgmBus);      // 低八度衬底
    if(Math.random()<0.18) pluck(PENTA[Math.min(PENTA.length-1,bgmIdx+2)],t+0.28,1.2,0.07,bgmBus); // 高音点缀
    bgmTimer=setTimeout(bgmTick,1000+Math.random()*800);
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
        var a=JSON.parse(localStorage.getItem('pbg_audio')||'null');
        if(a){ on=a.s!==0; bgmOn=a.b!==0; }
      }catch(e){}
      api.syncLabels();
    },
    save:function(){
      try{ localStorage.setItem('pbg_audio',JSON.stringify({s:on?1:0,b:bgmOn?1:0})); }catch(e){}
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
function rgbToHex(r,g,b){return '#'+[r,g,b].map(x=>clamp(x).toString(16).padStart(2,'0')).join('');}
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
  g.fillStyle='rgba(82,72,62,0.96)';
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
    ctx.fillStyle='rgba(82,72,62,'+(0.96*(1-grow))+')';
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
  if(hintCell==null)return;
  const i=hintCell%n,j=hintCell/n|0;
  const cx=pad+i*cell+cell/2, cy=pad+j*cell+cell/2;
  const phase=(Date.now()%1100)/1100;
  const pulse=0.5+0.5*Math.sin(phase*Math.PI*2);   // 0..1
  const r0=cell*0.42, r1=r0+cell*0.26*pulse;
  ctx.save();
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
  g.clearRect(0,0,sz,sz);g.fillStyle='#211a13';g.fillRect(0,0,sz,sz);
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
    if(state[idx]!==curColor){state[idx]=curColor;moves++;spawnSparkle(idx);SFX.place();render();updateMaterialCounts();updatePct();}
  }else if(tool==='erase'){
    if(state[idx]!=null){state[idx]=null;moves++;SFX.erase();render();updateMaterialCounts();updatePct();}
  }
}

function applyPointer(e){
  if(celebrated)return;              // 拼成后不再进入绘制状态
  painting=true;try{board.setPointerCapture(e.pointerId);}catch(_){}applyAt(e);}
board.addEventListener('pointerdown',applyPointer);
board.addEventListener('pointermove',e=>{if(painting)applyAt(e);});
function endPaint(){
  if(!painting)return;
  painting=false;
  if(celebrated){render();return;}   // 已完成：不重算进度、不回写存档
  updatePct();saveProgress();
}
board.addEventListener('pointerup',endPaint);
board.addEventListener('pointercancel',endPaint);

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
  return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
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
      showToast('拼成啦！国风佳作 ✦');
      openWin();
    }
  });
}

function spawnSparkle(idx){
  // 简单在对应位置画一个闪光圈，由 renderHint 机制或单独实现
}

function spawnPetals(){
  const c=petals,d=Math.min(window.devicePixelRatio||1,2);
  c.width=window.innerWidth*d;c.height=window.innerHeight*d;
  c.style.width=window.innerWidth+'px';c.style.height=window.innerHeight+'px';
  const g=c.getContext('2d');g.setTransform(d,0,0,d,0,0);
  const W=window.innerWidth,H=window.innerHeight;
  const cols=['#C8362B','#D4AF37','#E6C65C','#C9A0B4','#C95F7C'];
  const ps=[];
  for(let i=0;i<40;i++)ps.push({x:Math.random()*W,y:Math.random()*-H,vy:1.2+Math.random()*2.0,vr:(Math.random()-0.5)*0.18,ph:Math.random()*6,sz:6+Math.random()*8,col:cols[(Math.random()*cols.length)|0]});
  const start=performance.now();
  function frame(now){
    const el=now-start;g.clearRect(0,0,W,H);
    for(const p of ps){p.y+=p.vy;p.x+=Math.sin(el/600+p.ph)*0.6;p.rot=(p.rot||0)+p.vr;
      g.save();g.translate(p.x,p.y);g.rotate(p.rot);g.fillStyle=p.col;
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

let hintCell=null,hintTimer=null,hintRAF=null;
function stopHint(){
  if(hintTimer){clearTimeout(hintTimer);hintTimer=null;}
  if(hintRAF){cancelAnimationFrame(hintRAF);hintRAF=null;}
  hintCell=null;
}
function hint(){
  if(celebrated){showToast('已经拼好啦，不能再提示');return;}
  const candidates=[];
  for(let k=0;k<n*n;k++){
    if(target[k]!=null && state[k]!==target[k]) candidates.push(k);
  }
  if(candidates.length===0){showToast('已经完美啦');return;}
  stopHint();
  hintCell=candidates[(Math.random()*candidates.length)|0];
  hints++; mistakes++; // 提示计一次失误参考
  SFX.hint();
  // render() 不是常驻循环，这里必须自己跑 rAF，否则脉动只画一帧静止画面
  (function loop(){
    if(hintCell==null){hintRAF=null;return;}
    render();
    hintRAF=requestAnimationFrame(loop);
  })();
  hintTimer=setTimeout(()=>{stopHint();render();},3200);
  saveProgress();
  showToast('已高亮一处，快补上');
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

// 每幅图纸的独立进度：pbg_progress = {图纸id:{g:压缩棋盘,t:已用时,m:步数,k:失误}}
function loadProgress(){
  try{progress=JSON.parse(localStorage.getItem('pbg_progress')||'{}')||{};}catch(e){progress={};}
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
  try{localStorage.setItem('pbg_progress',JSON.stringify(progress));}catch(e){}
}
function clearProgress(id){
  if(!(id in progress))return;
  delete progress[id];
  try{localStorage.setItem('pbg_progress',JSON.stringify(progress));}catch(e){}
}

// 本地存档：pbg_records = {图纸id:{t用时秒,s星级,m步数}}（兼容旧版 pbg_completed 数组）
function loadRecords(){
  records={};
  try{
    const raw=JSON.parse(localStorage.getItem('pbg_records')||'null');
    if(raw&&typeof raw==='object'&&!Array.isArray(raw)) records=raw;
    else{
      const old=JSON.parse(localStorage.getItem('pbg_completed')||'[]');
      if(Array.isArray(old)) old.forEach(id=>{records[id]={t:0,s:0,m:0};});
    }
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
  try{localStorage.setItem('pbg_records',JSON.stringify(records));}catch(e){}
  clearProgress(id); // 拼完即清空该图进度，下次从头开始
  updateGalCount();
}
function isCompleted(id){return !!records[id];}

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
    c.fillStyle='#211a13';c.fillRect(0,0,80,80);
    for(let j=0;j<p.n;j++)for(let i=0;i<p.n;i++){const code=p.grid[j][i];if(code==='.')continue;c.fillStyle=PAL[code];c.beginPath();c.arc(i*sc+sc/2,j*sc+sc/2,sc*0.46,0,Math.PI*2);c.fill();}
    item.appendChild(cv);
    const name=document.createElement('div');name.className='name';name.textContent=p.name;item.appendChild(name);
    item.addEventListener('click',()=>{document.getElementById('sheetGallery').classList.remove('show');openPattern(PATTERNS.indexOf(p));});
    grid.appendChild(item);
  });
  if(grid.children.length===0)grid.innerHTML='<div style="grid-column:1/-1;text-align:center;color:var(--text-dim);padding:20px 0;">暂无完成作品，快去拼一幅吧</div>';
}

// 背景粒子
function initBg(){
  const c=document.getElementById('bgCanvas'),g=c.getContext('2d');
  const d=Math.min(window.devicePixelRatio||1,1.5);
  let W,H,ps=[];
  function resize(){
    W=window.innerWidth;H=window.innerHeight;c.width=W*d;c.height=H*d;c.style.width=W+'px';c.style.height=H+'px';g.setTransform(d,0,0,d,0,0);ps=[];
    for(let i=0;i<36;i++)ps.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-0.5)*0.25,vy:(Math.random()-0.5)*0.18,sz:1+Math.random()*2,al:0.15+Math.random()*0.35});
  }
  resize();
  function frame(){
    g.clearRect(0,0,W,H);
    for(const p of ps){p.x+=p.vx;p.y+=p.vy;if(p.x<0)p.x+=W;if(p.x>W)p.x-=W;if(p.y<0)p.y+=H;if(p.y>H)p.y-=H;
      g.fillStyle='rgba(212,175,55,'+p.al+')';g.beginPath();g.arc(p.x,p.y,p.sz,0,Math.PI*2);g.fill();}
    requestAnimationFrame(frame);
  }
  frame();window.addEventListener('resize',resize);
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
      if(a==='mode'){const keys=Object.keys(MODES),i=keys.indexOf(mode);setMode(keys[(i+1)%keys.length]);}
      else if(a==='gallery'){renderGallerySheet();document.getElementById('sheetGallery').classList.add('show');}
      else if(a==='info') showToast('选色珠点棋盘填豆；每幅图进度会自动保存，拼满 100% 即完成。');
    });
  });
  document.addEventListener('click',e=>{
    if(!menu.contains(e.target)&&!(btnMore&&btnMore.contains(e.target))) closeMenu();
  });
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('.sheet').classList.remove('show')));
  document.getElementById('winReplay').addEventListener('click',()=>{closeWin();clearBoard();startTime=Date.now();elapsed=0;startTimer();});
  document.getElementById('winNext').addEventListener('click',nextPattern);
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
