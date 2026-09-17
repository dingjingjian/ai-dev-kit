/* timeline.js —— 剪辑表（唯一真源）
 *
 * 由 _gen_timeline.py 生成，请勿手改 —— 改文案请改生成器的 SHOTS 后重跑。
 * 时长与 kb 都是文案字数的函数：只改文案不改 dur/kb，会得到「文字读不完」
 * 或「画面几乎不动」，两者都不报错、只在成片里看得出来。
 *
 * 文案来自应用自身：assets/mission.js 的 PHASES 与 README.md 的登月流程表。
 */

var FPS = 30;
var W = 1080, H = 1920;
var SRCFPS = 30;

var XFADE = 0.44;                // 总过渡时长（以切点为中心两侧平分，每侧 0.22s）
var FADE_IN = 0.9;
var FADE_OUT = 1.2;

var RISE = 0.30, DROP = 0.45;
var SEG_SPREAD = 0.5;            // 各段出现时刻占窗口的比例（只用前半段）
var SEG_FADE = 0.20;
var TEXT_IN = 0.35, TEXT_OUT = 0.80;

var BASE_ZOOM = 1.06;             // 起点即拉近主体，减少竖屏空场

var CLIPS = [
  {
    clip: '01-show', dur: 6.3, srcFrom: 0.20,
    kb: 0.30, pan: [-60, -90],
    label: '展示',
    sub: '长征十号 · 三级半构型<br>两枚长征十号，两种发射构型',
    big: '奔月<br>中国载人登月全程',
    bigWin: [0.6, 6.3]
  },
  {
    clip: '02-explode', dur: 7.7, srcFrom: 0.30,
    kb: 0.34, pan: [70, -100],
    label: '拆解',
    sub: '逐级铺开，点击标签查看部件说明<br>芯一级 · 芯二级 · 芯三级 · 整流罩',
    big: null, bigWin: null
  },
  {
    clip: '03-launch1', dur: 10.0, srcFrom: 0.10,
    kb: 0.43, pan: [-90, -140],
    label: '第一次发射 · 揽月',
    sub: '三芯并联 21 台发动机点火<br>程序转弯 · 最大动压 · 助推器分离<br>芯三级点火，推入近地停泊轨道',
    big: null, bigWin: null
  },
  {
    clip: '04-transit', dur: 11.2, srcFrom: 0.20,
    kb: 0.51, pan: [90, -150],
    label: '地月转移',
    sub: '芯三级二次点火（TLI），奔赴月球<br>近月制动反推减速，被月球引力捕获<br>着陆器驻留环月轨道，静候飞船',
    big: null, bigWin: null
  },
  {
    clip: '05-launch2', dur: 6.3, srcFrom: 0.20,
    kb: 0.30, pan: [-70, -120],
    label: '第二次发射 · 梦舟',
    sub: '数日后，梦舟载人飞船出发<br>逃逸塔分离，太阳翼展开',
    big: null, bigWin: null
  },
  {
    clip: '06-rendez', dur: 7.9, srcFrom: 0.20,
    kb: 0.30, pan: [80, -130],
    label: '环月交会',
    sub: '飞船沿环月轨道从后方追近着陆器<br>对接帧对齐姿态，航天员转入着陆器',
    big: null, bigWin: null
  },
  {
    clip: '07-descent', dur: 7.5, srcFrom: 0.10,
    kb: 0.30, pan: [-90, 150],
    label: '动力下降',
    sub: '着陆器脱离飞船，转入落月飞行<br>下降发动机反推制动，展开着陆腿',
    big: null, bigWin: null
  },
  {
    clip: '08-land', dur: 5.1, srcFrom: 0.15,
    kb: 0.30, pan: [0, -110],
    label: '月面软着陆',
    sub: '揽月着陆器平稳触月<br>地球悬于漆黑月空',
    big: '登月不是终点<br>是走向星辰大海的第一步',
    bigWin: [0.7, 5.1]
  },
];

var BIG_TITLE = '奔月<br>中国载人登月全程';
var BIG_SUB = '展示 · 拆解 · 双箭发射 · 环月对接 · 月面软着陆';
var BIG_END = '登月不是终点<br>是走向星辰大海的第一步';
var BRAND = '3D 登月全程模拟器';
