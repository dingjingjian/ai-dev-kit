/*
 * defcon — src/audio.js
 * 程序化音频：10 个音效 + 三段落 BGM，全部用 WebAudio 现场合成，不引入任何音频文件。
 *
 * 为什么不用 mp3/wav：
 *   1) 小工具红线禁止外部资源，音频文件要随包走；
 *   2) 本作只需要十来个一秒以内的短音，采样文件换来的是几百 KB 包体与一次额外解码；
 *   3) 合成音可以按参数变化（DEFCON 越低音越急），这是采样文件做不到的。
 *
 * 为什么默认开启（2026-09-09 改）：
 *   早期默认静音是怕手机外放惊吓，但实测发现玩家根本注意不到顶栏那个小喇叭，
 *   绝大多数人全程无声地打完一局 —— 合成音效是本作演出的一半，等于白做。
 *   现改为默认开启；且 AudioContext 必须等用户手势才能出声（自动播放策略），本作的第一声
 *   天然在「选定阵营」的那次点击之后 —— 不存在网页一打开就轰炸外放的情况。
 *   底部指令条的开关仍然一指可达，想静音随时可以关。
 *
 * 自动播放策略：AudioContext 在用户手势之外创建时会停在 suspended，
 * 因此 unlock() 必须从真实点击事件里调用（音效开关按钮 / 开局的阵营选择）。
 *
 * ── 2026-09-10 响度重做 ────────────────────────────────────────────────
 * 旧版实测「偏弱」，三个原因叠加，只调音量治不好：
 *
 *   (1) 电平保守 —— 各音峰值 0.09~0.42 再乘 master 0.5，实际出声只有 0.065~0.21，
 *       比常规游戏音效（0.5~0.8）低约 12~14 dB。现改为 master 0.8 + 峰值上调。
 *
 *   (2) 频谱错位 —— 核爆（nuke）原本的能量全压在 26~58 Hz，而手机扬声器的频响下限
 *       普遍在 500~800 Hz，这个频段物理上就放不出来：音量开到最大只会破音，不会更震撼。
 *       补一层中低频噪声体能解决，但补过头会毁音色（见 nuke 注释里的二改记录）：
 *       第一版补到 2600 Hz 又加了高频瞬态，实测把核爆做成了鞭炮，已回退。
 *       正确做法是补 200~800 Hz 这一段，亮度一律不加。
 *
 *   (3) 去抖吞音 —— 旧版在最小间隔内直接 return false 丢弃。战争期一秒内十几次拦截，
 *       绝大部分被丢掉，结果是「越热闹越安静」。现改为叠加升调：密集触发时不再丢弃，
 *       而是升高音高、略降音量，最多叠 MAX_STACK 层 —— 越密越急，符合直觉。
 *       **核爆是唯一例外**（MAX_STACK.nuke = 0，六改加的）：低频轰鸣没有音高，
 *       叠上两个升调的自己只会产生拍频与三连击，把「远处沉下去」变成「近处砸三下」。
 *
 * ── 2026-09-11 音效外放补偿（BGM 三改之后补做）────────────────────────
 * BGM 重做时用「500 Hz 高通后的电平」量出过一轮，但只补了 BGM，音效漏掉了。
 * 事后核查发现同一个病在音效上更严重，而且恰恰集中在最该响的三个音：
 * 核爆外放损失 12 dB（与战争段警报的手机信掩比只剩 1.8 dB，全场最响的音和背景分不出来）、
 * 终局落败 13 dB（500 Hz 以上只剩 0%）、终局夺冠 8 dB —— 都劣于它们所垫的 BGM（8 dB）。
 * 另有两处：deny 是已被否决的 launch 旧版同款配方（下滑 + 强谐波 + 全低频），
 * tap 有一半能量白扔在手机放不出的频段。
 *
 * 补层机制 octaveFill()：只补「跨进手机有效段 520~2600 Hz 的那一级八度」，叠一层纯正弦，
 * 音量给到主干的五成半，并跟着主干一起扫频（否则主干下潜、补层停在原处，收尾多一条嗡声）。
 * 用于**有音高**的音效（end / deny / tap）—— 把音高照原样搬上去，音程与调性都不动。
 *
 * 一条界限（五改用一次翻车换来的）：**频段补偿的手法要匹配素材类型**。
 *   乐音型（end 的定音长音）→ 叠八度正弦。音高本身就是信息，必须原样保住。
 *   噪声型（核弹、发射、喷射）→ 只能用噪声。叠正弦会凭空造出一个音高 ——
 *     四改就给核爆叠了 960→384 Hz 的纯正弦，实测听感是一个清清楚楚的「咻」声，
 *     用户复听立刻判定「没有之前效果好」。噪声型音效没有音高，补偿必须也是噪声，
 *     改用带通（把能量锁在频段里）而不是「低通抬终点」（那会把中频一路带上来变成嘶声）。
 *
 * 实施结果：end / deny / tap 三处按上述改法落地；**核爆退回原样**。
 * 四改曾试图给核爆补外放可听度，用户复听判定「没有之前效果好」，已完整还原。
 * 核爆的外放损失（−12 dB）留作已知取舍 —— 它的「沉」正是它好在哪儿，
 * 不该为了外放达标去动它。教训：**不是所有指标不达标都该修，先确认那个指标代表的东西
 * 是不是这个音效想要的东西。**
 *
 * ── 2026-09-11 七改：核爆的主次关系（用户「核弹爆炸的声音比较小，相对于其他音效」）──
 * 先量后改，量出来的事实（tools/sfx-probe.py 单音工况，改前）：
 *   核爆 单发峰值 0.324 / 手机冲击 0.022 —— 峰值在全场排第六，
 *   手机冲击是全场最低的一个（连 35 ms 的界面音 tap 都有 0.036）。
 *   压在它上面的：终局 0.64（不同期，不参与）、发射 0.53、DEFCON 告警 0.51（不同期）、
 *   己方城市被毁 0.41、拦截 0.33。其中「发射 0.53」正是六改末尾记下的那条残留。
 *
 * **但绝不能抬核爆**：六改已经量清楚，核爆的电平一抬就变「打鼓」
 * （0.31 → 0.52 就是用户判定线），那是它自身音色 + 小喇叭失真的属性，不是混音问题。
 * 所以这一改**从头到尾不动核爆一个字节**，只把「核爆应该是全场最响的音效」拿回来：
 *
 *   ① 压住与它同期竞争的三个事件音（只降电平，音色 / 时长 / 滤波器一律不动）：
 *      launch    0.529 → 0.251（各层 ×0.40），正式处理六改记下的残留（本来该动的就是它）
 *      cityLost  0.413 → 0.204（×0.53），它与核爆**同时落地**，手机冲击是核爆的 8.6 倍，是直接的掩蔽源
 *      intercept 0.334 → 0.257（×0.78），战争期触发最密的音，全频 100% 落在手机最有效的 500~2k
 *      坑：launch 走 sfxBus 经压缩器，**音量换算不能线性外推** —— 第一版 ×0.56 实测仍有 0.357，
 *      与核爆齐平（输入降一半，压缩量也同比变小，实际只掉 3 dB）。改压缩器上游的电平必须复测。
 *      口径：核爆不照搬 v1 的「发射的 2.1 倍」（v1 的 launch 是那版被否决的锯齿下滑音），
 *      只要求它明确在竞争音之上（+2~3 dB），同时不把 launch 压到界面音的量级。
 *
 *   ② 让背景让路（duck）：核爆 90% 的能量在 200 Hz 以下、56% 以上落在 26~58 Hz，
 *      而战争段警报恰好压在它上面 —— 实测共存手机信掩比 −0.5 dB，
 *      按本探针自己的判据（< 6 dB 即被垫底盖住），它是全部音效里唯一的负值。
 *      修法仍不是抬核爆，而是核爆爆发时将 BGM 总线短暂压低再放回（快下 / 短保持 / 慢回），
 *      专用一个 `duck` 节点：**不能直接动 bgmBus.gain** —— 那条 gain 正被换段交叉淡入淡出占用，
 *      复用会让「换段」与「让路」两条斜坡互相 cancel。
 *      实测（探针「①-b 让路实测」）：警报手机段 RMS 0.0240 → 0.0159（−3.5 dB），
 *      duck 增益最低 0.45、1041 ms 回到 1。
 *      注意信掩比这个指标量不出让路的收益（它算的是「混合信号比 BGM 高多少」，
 *      让路降低的是分母，只会让比值更负：−0.5 → −2.0 dB）——
 *      让路要看的指标是「事件期间背景掉了多少」，两把尺子各量各的东西。
 *
 * 这一改守住的边界：**核爆的音色、电平、触发行为三条轴全部零改动**（六改查明的三条轴一条没碰），
 * 改变的只有「它周围有多吵」。教训是六改的延伸：
 * **先分清是它自己的问题，还是它周围的问题** —— 前五轮一直在改它自己，
 * 而这次量出来的是「周围太吵」，改法自然完全不同。
 *
 * ── 2026-09-11 八改：三个音效的语义 + siren 的手机可辨识度 ──────────────────
 * 用户：「SAM 拦截、核爆、导弹发射 音效需要优化，一个是和语义有出入，不像对应的音效。
 *      BGM siren，在电脑上还好，手机上基本听不到防空警报的声音。」
 * 四个对象其实同一个病根：**它们的「身份特征」都写在了手机扬声器放不出的频段里**，
 * 于是外放上要么听不见，要么听成了别的东西。全部按探针实测数据改，不靠听感猜。
 *
 *   launch    89% 能量 <200 Hz、主导 70 Hz、信掩比仅 +4.6 dB（战争期最弱的常规音）
 *             → 三层噪声重建：点火 bandpass 1000→2000、推力 highpass 700→1600、
 *               尾音 highpass 800→500。信掩比 +4.6 → **+8.0 dB**，手机保留 −6 → **−1 dB**。
 *   intercept 两声纯正弦 ping，外放上就是「嘀—嘀」两声电子提示音，不像拦截
 *             → 前置 35 ms 中频噪声瞬态（近炸起爆）+ ping 由 sine 换 triangle 拿金属谐波。
 *   nuke      B 层尘柱 lowpass 900→120 把能量全压在 200 Hz 以下，手机冲击 0.021（全场最低）
 *             → 改 bandpass 900→300（**五改写下的正解：噪声型用带通，不抬低通终点**），
 *               手机冲击 0.021 → **0.029（+2.8 dB）**、谱心 108 → 128 Hz。
 *               低频核心（A 层 58→26 Hz / 0.42）、触发行为、走线**一个字节没动**。
 *   siren     警报旋回 A4(440)↔D5(587) 压在手机低截止边缘，外放上被滚降吃掉
 *             → 给警报叠一层升八度 triangle（880↔1174 Hz，SIREN_OCT=0.70）+ 警报电平 0.050 → 0.062。
 *               手机 RMS 0.0204 → **0.0241（+1.4 dB）**，500-2k 占比 16% → **23%**，
 *               新增探针指标「升八度层 800-1400 Hz 占比」= 5.6%。
 *
 * 这一改的两条新教训（都写进了对应函数的注释）：
 *   ① **「抬进手机段」要求扫频的最低点整个落在截止之上。** launch 第一版把带通起点从 260 抬到 420，
 *      实测反而更差（手机保留 −6 → −9 dB）—— 420 Hz 起点的带通，前半段仍在手机段外，
 *      能量重心根本没被抬起来。
 *   ② **宽频主体不能用带通。** 第三版把推力层也改带通，谱心是降下来了，
 *      但手机保留掉回 −7 dB —— 带通带宽太窄，把 500~2k 的能量本身也削掉了。
 *      正确做法是**分工**：宽频主体用高通保可听度，亮度由点火层的上限单独管。
 *
 * ── 2026-09-11 九改：三个音效完全重构（方向推翻八改及此前各版）────────────────
 * 用户：「SAM 拦截、核爆、导弹发射 现在的完全不行，建议完全重构，也不用看以前的修改记录。」
 *
 * 八改（以及更早的各版）一直**在同一个维度里打转**：调频段、换滤波器、抬压电平，
 * 想让「短促的一声」在手机上也听得见。但用户反复说「不像」，说明问题不在频段 ——
 * 在**声音的物理结构**。真实的爆炸与发射从来不是「一声」，而是一段时间过程：
 *
 *     起爆瞬态（几十毫秒）→ 持续身体（一秒上下）→ 长尾回响（一到两秒）
 *
 * 旧版三者都把「身体」压得极短（发射 0.9 s、核爆 0.95 s 且快衰减），
 * 于是无论频段怎么调，听起来都只是「一下」，而不是「一次发射 / 一次爆炸」。
 * 这一版按上述三段结构重搭 —— 与前八次改动是**不同维度**的改动：
 *
 *   launch     ①点火 0.10 s ②推力 1.60 s（600→1800 Hz 上扫）③低频重量 1.40 s ④尾焰远去 1.10 s
 *              总长 0.9 s → **1.6 s**，「起爆 → 持续推力 → 远去」的完整过程。
 *   intercept  ①近炸爆响 0.04 s ②炸开身体 0.22 s ③金属碎片 —— 仍短促，但第一次有了「身体」。
 *   nuke       ①起爆 0.12 s ②主轰鸣 1.75 s ③撕裂层 0.60 s ④长尾回响 2.40 s
 *              总长 1.1 s → **2.55 s**。
 *
 * **核爆最关键的一处：② 用慢衰减（1.7 s）而不是快衰减。**
 *   慢衰减的听感是「轰鸣」，快衰减才会变成「一记打击」——
 *   历次被判「像在打鼓」的根因就在这里；而此前各版一直在改音色与电平，
 *   从头到尾没有动过包络长度。这一版把包络拉到 1.7 s，直接离开了「打击」的听感区。
 *
 * 实测（重构后 / 单音工况）：launch 手机保留 −4 dB、信掩比 +6.1 dB、谱心 374 Hz；
 * intercept 手机保留 0 dB、信掩比 +6.0 dB、手机冲击 0.048；
 * nuke 手机冲击 0.034（原 0.021，+4.2 dB）、谱心 185 Hz。
 * 齐射最坏情况峰值 0.657、**0 削波**。
 *
 * siren 段（八改加的升八度层）本次保留不动 —— 用户只点名了这三个音效。
 *
 * 另加总线压缩器（DynamicsCompressor）：齐射落地时四五个音同时响，
 * 没有压缩器就只能靠压低单音避免削波（这正是旧版保守的根因），
 * 有了压缩器才敢把单音峰值提上来。
 *
 * ── 2026-09-12 十一改：核爆全噪声重构（用户「核爆音效完全不像」）────────
 * 九改按「瞬态→身体→长尾」的时间结构重建，方向对，但用户复听仍判「完全不像」。
 * 复盘九改的三个材料级错误 —— 之前八轮一直调频段 / 电平 / 包络，从没怀疑过材料：
 *
 *   (1) ②主轰鸣用锯齿波 90→30 Hz 下滑。周期性波形 + 音高下滑是合成器 bass drop
 *       的配方，不是爆炸 —— 真实爆炸的主体是湍流噪声：非周期、无音高、宽带。
 *       只要身体还是「一个有音高且在跑的振荡器」，滤波器怎么调都是电子味。
 *   (2) ①起爆 300→2200 Hz 上扫。能量向上爬是 riser（铺垫→释放的「释放前兆」），
 *       爆炸的能量只会向下散 —— 高频最先死，低频最后走。上扫的爆炸在物理方向上就反了。
 *   (3) 总长 2.55 s 撑不起「核」。常规爆炸 1~2 s，核爆要「久到开始不合常理」才像。
 *
 * 新版五层，全身换成噪声（只有 ③ 留一记 0.9 s 的正弦压力坠）：
 *   ① 裂响瞬态 0.05 s 宽带噪声 3200→1100 —— 真实录音里最先到达的冲击波前沿
 *   ② 主体轰鸣 2.40 s 噪声 → tanh 轻失真 → 低通 1500→140 —— 咆哮的身体。
 *      tanh 是关键：干净的过滤噪声像风，过一层轻波形失真才像火球 —
 *      失真给噪声添上粗糙的谐波（「咆哮感」的来源），低通再把刺耳的部分收掉
 *   ③ 胸腔压力 0.90 s 正弦 58→32 Hz —— 被捶一拳的重量感；短促，不拖成嗡声
 *   ④ 喉咙撕扯 1.70 s 带通噪声 750→220 —— 粗糙破坏质感，也是手机外放唯一抓得住的识别层
 *   ⑤ 长尾回响 3.60 s 低通噪声 320→60 —— 「这玩意儿有多大」全靠这一层
 *   总长 ~3.8 s（齐射 MIN_GAP.nuke = 0.35 s，叠不上）。
 *
 * 历史教训守住：噪声型不叠正弦补层（五改）；电平与九改同档不抬 ——
 * 「打鼓」线是电平 × 快衰减叠加出来的（六改），这一版衰减更慢、电平不动；
 * 走 nukeBus 绕压缩器、MAX_STACK.nuke = 0、BGM 让路（duck）三条全不动。
 *
 * BGM（2026-09-10 三改）：三个段落各有一段。
 *   tension   简报 / 危机   D 小调 i–VI–iv–V 走 16 小节，随 DEFCON 加厚提速
 *   siren     热核战争      空袭警报旋回 + 推进音型（二改时这一段是静默的）
 *   epilogue  终局          胜负两版
 *   为什么推翻二改、这一版守哪三条规矩，见文件末尾 BGM 段开头的完整记录。
 */
(function (global) {
  'use strict';
  var DC = global.DC = global.DC || {};

  var ctx = null, master = null, comp = null, sfxBus = null, bgmBus = null, nukeBus = null, duck = null, failed = false;
  var enabled = true;   // 默认开启；真正出声仍要等首次手势 unlock()（见文件头自动播放策略）

  // 同一音的最小间隔：战争期一秒内可能有十几次拦截，不去抖就是一片噪音
  var MIN_GAP = {
    defcon: 0.30, launch: 0.10, intercept: 0.12, nuke: 0.35, deny: 0.20,
    select: 0.07, cityLost: 0.45, end: 2.00, tap: 0.05, pick: 0.08
  };
  /* 最小间隔内允许叠加几层（0 = 只响第一声）。拦截可以叠成一小串上行 ping，
   * 但**核爆不能叠** —— 见下面 nuke 段里「六改」的记录：
   * 一个低频轰鸣叠上两个升调的自己，16 ms 内三声齐发，听感就是一声鼓点。 */
  var MAX_STACK = {
    defcon: 1, launch: 2, intercept: 3, nuke: 0, deny: 1,
    select: 2, cityLost: 1, end: 0, tap: 1, pick: 1
  };
  var lastAt = {}, stack = {};

  function ensure() {
    if (ctx || failed) return ctx;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) { failed = true; return null; }
    try {
      ctx = new AC();
      /* 总线：sfxBus → comp → master → destination */
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10;    // dB：只削齐射叠加时的尖峰，单音基本不过阈
      comp.knee.value = 10;
      comp.ratio.value = 8;
      comp.attack.value = 0.004;
      comp.release.value = 0.22;

      master = ctx.createGain();
      master.gain.value = 0.8;

      sfxBus = ctx.createGain();
      sfxBus.gain.value = 1;

      sfxBus.connect(comp);
      comp.connect(master);
      master.connect(ctx.destination);

      /* BGM 总线：bgmBus → duck → master，绕过压缩器。
       * 压缩器是为「齐射落地时四五个音同时响」准备的，如果 BGM 也走它，
       * 一段持续的低音会让压缩器长期处在压缩状态 —— 结果是核爆反被 BGM 压下去。
       * duck 是七改加的让路节点（值恒为 1，只在核爆爆发时短暂压低），见下。 */
      bgmBus = ctx.createGain();
      bgmBus.gain.value = 0;

      /* 让路专线：核爆爆发的那一秒背景音乐要退开（见文件头「七改」②）。
       * 单独一个节点，不在 bgmBus.gain 上直接做 —— 那条 gain 被换段交叉淡入淡出占用，
       * 复用会让两条斜坡互相 cancel。 */
      duck = ctx.createGain();
      duck.gain.value = 1;
      bgmBus.connect(duck);
      duck.connect(master);

      /* 核爆专线：同样直接进 master，绕过压缩器。
       * 理由与 BGM 总线一模一样，而且更极端 —— 核爆是一个持续一秒的低频轰鸣，
       * 会让压缩器长时间压在阈值上，把它本该散开的衰减压成一条更平的实体、起音被凸显，
       * 听感就从「远处沉下去」变成「近处砸一下」。
       * 最早那一版（55aba78）的核爆正是直连 master 的，中途重做音频时被接到了压缩器后面。
       * 实测：经压缩器峰均比 20.1 dB，绕开后 21.6 dB，而最早那一版是 20.7~21.1 dB。 */
      nukeBus = ctx.createGain();
      nukeBus.gain.value = 1;
      nukeBus.connect(master);
    } catch (e) { failed = true; ctx = null; }
    return ctx;
  }

  function unlock() {
    var c = ensure();
    if (c && c.state === 'suspended' && c.resume) { try { c.resume(); } catch (e) {} }
  }

  // 指数衰减包络：attack 段避免爆音，decay 段让它自然收尾
  function envelope(t0, attack, decay, peak) {
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    return g;
  }

  function tone(t0, freq, dur, peak, type, freqTo) {
    var o = ctx.createOscillator();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, t0);
    if (freqTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), t0 + dur);
    var g = envelope(t0, 0.008, dur, peak);
    o.connect(g); g.connect(sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.05);
    return o;
  }

  function noiseSrc(dur) {
    var n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    var s = ctx.createBufferSource();
    s.buffer = buf;
    return s;
  }

  /* bus 可选：默认走 sfxBus（经压缩器）。只有核爆会传 nukeBus 绕开压缩器，
   * 理由见 ensure() 里 nukeBus 的注释 —— 一个持续一秒的低频轰鸣不该被压缩器压平。 */
  function filteredNoise(t0, dur, peak, filterType, f0, f1, q, bus) {
    var s = noiseSrc(dur);
    var f = ctx.createBiquadFilter();
    f.type = filterType; f.Q.value = q || 1;
    f.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
    var g = envelope(t0, 0.01, dur, peak);
    s.connect(f); f.connect(g); g.connect(bus || sfxBus);
    s.start(t0); s.stop(t0 + dur);
  }

  // 叠加层的音高/音量系数
  function M(o) { return (o && o.mul) || 1; }
  function G(o) { return (o && o.gain) || 1; }

  /* 核爆让路（七改②）：快下 → 短保持 → 慢回。
   * 用一条线性回升（不是保持满压低再抬）—— dB 刻度上线性斜坡前 40% 就还掉一半，
   * 所以听感是「音乐被顶开一下、随即回来」，而不是「音乐消失了一秒多」。
   * 密集齐射时会被反复调用：先 cancel 再**从当前值**重新起坡，
   * 结果是持续压着而不闪断 —— 轰炸期间音乐本就该让开，这是想要的行为。 */
  var DUCK_GAIN = 0.45;      // 压低后的增益，约 −7 dB
  var DUCK_HOLD = 0.20;      // 保持压低的时长
  var DUCK_RECOVER = 1.30;   // 回升时长，与重构后核爆 2.5 s 的尾巴前段大致齐平
  function duckBgm() {
    var c = ctx; if (!c || !duck) return;
    var t = c.currentTime, g = duck.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(0.0001, g.value), t);
    g.linearRampToValueAtTime(DUCK_GAIN, t + 0.02);
    g.setValueAtTime(DUCK_GAIN, t + DUCK_HOLD);
    g.linearRampToValueAtTime(1, t + DUCK_HOLD + DUCK_RECOVER);
  }

  /* 外放补偿（音效版）—— 与 BGM 的 PHONE_DOUBLE 同一套思路，但音效要按八度补够层数。
   * 手机扬声器低截止在 500~800 Hz，基频给得再足也辐射不出来。
   * BGM 的音都写在 MIDI 53~77，升一个八度就够了；音效里 end / nuke 这类必须「沉」的音，
   * 基频在 24~196 Hz，要连升三四级八度才进得了手机有效段。
   *
   * 关键在于「补哪一层」：不是把每一级八度都轻叠一遍（那样越高的层越轻，
   * 而恰恰最高的那层才落在手机段，实测白补），也不是按层数递减 ——
   * 而是只补**跨进 520~2600 Hz 的那一级**，并把主要补偿音量给它。
   * 用纯正弦：只搬能量、不添谐波、不改音色。 */
  var PHONE_LO = 520, PHONE_HI = 2600, OCT_GAIN = 0.55;
  /* 返回「把 freq 抬进手机有效段所需的最小八度倍数」，已经在该段内则返回 0（不必补）。 */
  function phoneOctave(freq) {
    var m = 1;
    while (freq * m < PHONE_LO && m < 32) m *= 2;
    return (m > 1 && freq * m <= PHONE_HI) ? m : 0;
  }
  /* 按八度补层。freqTo 给上时补层跟着主干一起扫频 ——
   * 否则主干下潜、补层停在原处，收尾会多出一条没跟着走的嗡声。 */
  function octaveFill(t, freq, dur, peak, freqTo, gain) {
    var m = phoneOctave(freq);
    if (!m) return;
    tone(t, freq * m, dur, peak * (gain || OCT_GAIN), 'sine',
         freqTo ? freqTo * m : null);
  }

  var VOICES = {
    /* DEFCON 跃迁：两声短促告警，等级越低音越高越急 —— 用同一段代码靠参数表达紧张度，
     * 这是采样文件做不到的地方。 */
    defcon: function (t, level, o) {
      var lv = Math.max(1, Math.min(5, level || 5));
      var base = (380 + (5 - lv) * 95) * M(o);
      tone(t, base, 0.11, 0.50 * G(o), 'triangle');
      tone(t + 0.15, base * 1.5, 0.13, 0.44 * G(o), 'triangle');
    },
    /* ── 发射 launch（重构版）────────────────────────────────
     * 语义：导弹点火、推力撕开空气、离地升空。
     * 声音结构照真实火箭发射的物理层次搭 —— 「像不像」全在这里：
     *   ① 点火瞬态  0.10 s  中高频宽频（600→2600 Hz）—— 一记清晰的「砰」，给出起点
     *   ② 推力轰鸣  1.60 s  宽带噪声由 300 扫向 1400 Hz —— 持续、有力的「轰——」
     *   ③ 低频重量  1.40 s  正弦 45→90 Hz（叠一层手机八度补偿）—— 离地的推背感
     *   ④ 尾焰远去  1.10 s  噪声渐弱、向低频收 —— 火箭升空、声音被甩在身后
     * 四层叠出「起爆 → 持续推力 → 远去」的完整过程，而不是一声短促的爆响。
     * 手机外放：①②④ 在 500~2k 都有能量，③ 用 octaveFill 把重量搬进手机段。 */
    launch: function (t, _a, o) {
      var g = G(o), m = M(o);
      // ① 点火瞬态：极短、宽频的一记「砰」
      filteredNoise(t, 0.10, 0.30 * g, 'bandpass', 700 * m, 2600 * m, 0.7);
      // ② 推力轰鸣：由中频扫向更高 = 推力加速（上升语义，不是泄气）
      filteredNoise(t + 0.02, 1.60, 0.30 * g, 'bandpass', 600 * m, 1800 * m, 0.6);
      // ③ 低频重量：正弦上升给体积感，octaveFill 让手机也听得到「沉」。
      //    电平一降再降（0.22 → 0.15 → 0.11）：这一层只要「有重量」就够，
      //    给多了整条谱心就被它拽到低频、又变成「闷响」（实测 0.22 时 90% 能量 <200 Hz）。
      //    重量交给它，但「识别」必须留给中频的 ①② 层。
      tone(t, 50 * m, 1.40, 0.11 * g, 'sine', 100 * m);
      octaveFill(t, 50 * m, 1.40, 0.11 * g, 100 * m, 0.30);
      // ④ 尾焰远去：能量向低频收，声音逐渐被甩远
      filteredNoise(t + 0.50, 1.10, 0.16 * g, 'lowpass', 1800, 500, 0.7);
    },
    /* ── 拦截 intercept（重构版）──────────────────────────────
     * 语义：防空导弹在近处炸开 —— 短、脆、带金属碎片。
     *   ① 近炸爆响  0.04 s  高频宽频瞬态（3000→1200 Hz）—— 「啪」，清晰的起点
     *   ② 炸开身体  0.22 s  中频带通噪声（1600→700 Hz）—— 「轰」，拦截的体积感
     *   ③ 金属碎片  两层高频短音 —— 破片的叮当
     * 三层都在 700~3k：不与核爆的低频撞地，也与 select 的雷达 ping 拉开
     * （select 是 1180→1760 的纯上行双音，这边是一记带爆响的炸开）。
     * 本音触发最密（战争期一秒十几次），所以做得最短最干脆 —— 不拖尾、不糊成墙。 */
    intercept: function (t, _a, o) {
      var g = G(o), m = M(o);
      // ① 近炸爆响：宽频瞬态，给出「炸」的起点
      filteredNoise(t, 0.04, 0.30 * g, 'bandpass', 3000 * m, 1200 * m, 0.9);
      // ② 炸开身体：中频噪声，快速衰减
      filteredNoise(t + 0.01, 0.22, 0.22 * g, 'bandpass', 1600 * m, 700 * m, 0.8);
      // ③ 金属碎片
      tone(t, 1800 * m, 0.06, 0.16 * g, 'triangle');
      tone(t + 0.04, 2600 * m, 0.05, 0.12 * g, 'triangle');
    },

    /* ── 核爆 nuke（十一改·全噪声重构）──────────────────────
     * 语义：核爆炸 —— 裂响 → 咆哮 → 压力 → 撕扯 → 久到不合常理的低频余韵。
     *   ① 裂响瞬态  0.05 s  宽带噪声 3200→1100 —— 冲击波前沿最先到达的一记「裂响」
     *   ② 主体轰鸣  2.40 s  噪声 → tanh 轻失真 → 低通 1500→140 —— 咆哮的身体
     *   ③ 胸腔压力  0.90 s  正弦 58→32 Hz —— 被捶一拳的重量感（短促，不拖成嗡声）
     *   ④ 喉咙撕扯  1.70 s  带通噪声 750→220 —— 「核」的粗糙质感，手机识别层
     *   ⑤ 长尾回响  3.60 s  低通噪声 320→60 —— 规模与空间全靠这一层
     *
     * 与九改的本质区别在**材料**：九改②用锯齿波 90→30 Hz 下滑 —— 周期性 + 音高下滑
     * 是合成器 bass drop 的配方，不是爆炸；真实爆炸的主体是湍流噪声，非周期、无音高。
     * ① 的上扫也反了：爆炸的能量只会向下散（高频先死，低频最后走），向上爬是 riser。
     * ② 里的 tanh 轻失真是「咆哮感」的来源：干净的过滤噪声像风，失真的噪声才像火球。
     *
     * 走线：整条走 nukeBus 绕开压缩器（持续几秒的低频被压平就不像爆炸了）。
     * 手机外放：①④ 在 500~2k 有能量，外放抓「这是核爆」靠它们；②⑤ 负责「沉」，
     * 耳机 / 桌面上的重量感全来自它们。 */
    nuke: function (t, _a, o) {
      var g = G(o), m = M(o);   // MAX_STACK.nuke = 0，m 恒为 1；保留形参是为了与其它音效同构
      // ① 裂响瞬态：极短宽带噪声，能量向下散（爆炸是消散，不是爬升）
      filteredNoise(t, 0.05, 0.26 * g, 'bandpass', 3200 * m, 1100 * m, 0.5, nukeBus);
      // ② 主体轰鸣：噪声过 tanh 轻失真（咆哮的粗糙感）再进低通，2.4 s 慢收
      var s2 = noiseSrc(2.40);
      var ws = ctx.createWaveShaper();
      var curve = new Float32Array(257);
      for (var i = 0; i < 257; i++) { var x = i / 128 - 1; curve[i] = Math.tanh(2.2 * x); }
      ws.curve = curve; ws.oversample = '2x';
      var lp2 = ctx.createBiquadFilter();
      lp2.type = 'lowpass'; lp2.Q.value = 0.7;
      lp2.frequency.setValueAtTime(1500, t);
      lp2.frequency.exponentialRampToValueAtTime(140, t + 2.40);
      var g2 = envelope(t, 0.01, 2.40, 0.26 * g);
      s2.connect(ws); ws.connect(lp2); lp2.connect(g2); g2.connect(nukeBus);
      s2.start(t); s2.stop(t + 2.45);
      // ③ 胸腔压力：正弦短促下坠，给「被捶一拳」的重量感
      var o1 = ctx.createOscillator();
      o1.type = 'sine';
      o1.frequency.setValueAtTime(58 * m, t);
      o1.frequency.exponentialRampToValueAtTime(32 * m, t + 0.70);
      var g1 = envelope(t, 0.012, 0.90, 0.22 * g);
      o1.connect(g1); g1.connect(nukeBus);
      o1.start(t); o1.stop(t + 0.95);
      // ④ 喉咙撕扯：中带通噪声下扫 —— 手机外放唯一抓得住的识别层
      filteredNoise(t + 0.02, 1.70, 0.14 * g, 'bandpass', 750, 220, 1.1, nukeBus);
      // ⑤ 长尾回响：低通噪声极慢地收 —— 「这玩意儿有多大」全靠它
      filteredNoise(t + 0.18, 3.60, 0.10 * g, 'lowpass', 320, 60, 0.6, nukeBus);
    },

    /* 指令被拒：两声短促下行，配合发射条的红色抖动。
     * 旧版是方波 190→120 Hz 下滑 —— 与已被否决的 launch 旧版是同一张配方：
     * 下滑 + 强谐波 + 全在低频。实测 77% 能量在 200 Hz 以下、手机外放损失 7 dB，
     * 外放上就是一声含糊的嗡嗡，既听不出「被拒」也听不出方位。
     * 改法：整段搬进手机有效的 500~1k，波形换 triangle（去掉方波的奇次谐波嗡感），
     * 复用 cityLost 的「双声下行」语义但压短 —— 下行 = 否定，这是听觉常识，不该丢。 */
    deny: function (t, _a, o) {
      tone(t, 700 * M(o), 0.075, 0.36 * G(o), 'triangle', 560 * M(o));
      tone(t + 0.085, 560 * M(o), 0.11, 0.30 * G(o), 'triangle', 430 * M(o));
      filteredNoise(t, 0.06, 0.14 * G(o), 'bandpass', 1800, 1000, 1.2);
    },

    /* 通用界面点击：抽屉开合、倍速/齐射切换、城市列表跳转等一切「按下了」的确认。
     * 刻意做得极轻极短（30 ms）—— 它一局里会被按几十次，
     * 任何一点厚度都会在第十次之后变成噪音。中频木质感，不与任何事件音撞色。
     * 三改：基频从 640→480 抬到 860→680 —— 旧版有一半能量落在 500 Hz 以下，
     * 是手机放不出来白扔的；抬上去之后外放更清楚，全频峰值反而更低。 */
    tap: function (t, _a, o) {
      tone(t, 860 * M(o), 0.03, 0.15 * G(o), 'sine', 680 * M(o));
      filteredNoise(t, 0.028, 0.09 * G(o), 'bandpass', 2800, 1500, 1.5);
    },

    /* 决策确认：事件卡选项、阵营选择。比 tap 有分量（两声上行、峰值 0.26），
     * 但比 select 更暖更低 —— select 是「锁定目标」的雷达 ping，pick 是「我决定了」。
     * 三种确认音分在三档音高上，闭着眼也分得出是点了什么。 */
    pick: function (t, _a, o) {
      tone(t, 720 * M(o), 0.05, 0.26 * G(o), 'triangle');
      tone(t + 0.055, 1080 * M(o), 0.09, 0.22 * G(o), 'triangle');
    },

    /* 选中目标：雷达锁定的一声短促上行 ping。
     * 两段式发射的第一段此前是完全无声的 —— 点下去没有任何听觉确认，
     * 在手机上很容易以为没点上而反复戳。 */
    select: function (t, _a, o) {
      tone(t, 1180 * M(o), 0.045, 0.30 * G(o), 'sine');
      tone(t + 0.045, 1760 * M(o), 0.06, 0.24 * G(o), 'sine');
    },

    /* 己方城市被毁：与 nuke 同时响，但走中频的双声下行警报 ——
     * nuke 是「某处爆炸了」（通用、低频、钝），cityLost 是「死的是我的城」（私人、中频、尖）。
     * 只对自己的城市响：每颗核弹都叠一遍只会糊成一团，稀有才有意义。
     *
     * 七改：×0.53（0.34/0.30/0.28 → 0.18/0.16/0.15），层间比例不变。
     *   它是全场唯一与核爆**同一时刻**落地的音，而手机冲击是核爆的 4.8 倍（改前 8.6 倍）——
     *   核爆打在自己城市上时，听到的其实是这一声，不是那一声轰。语义不能丢，
     *   所以只压电平把它放回核爆之下，频率与波形一个没动。 */
    cityLost: function (t, _a, o) {
      tone(t, 520 * M(o), 0.20, 0.18 * G(o), 'square', 390 * M(o));
      tone(t + 0.22, 390 * M(o), 0.26, 0.16 * G(o), 'square', 260 * M(o));
      filteredNoise(t, 0.50, 0.15 * G(o), 'lowpass', 1400, 260, 0.8);
    },

    /* 终局：一局里唯一一次长音。此前终局是完全静默的 —— 排名面板弹出来时一点声音都没有，
     * 情绪在最该落地的那一秒断掉了。夺冠用大三度（天亮），其余用小调色彩更暗。
     *
     * 三改（音效外放实测）：这一版最大的问题是「设计意图正好写在手机放不出的地方」——
     * 胜负的区别就是那个三度（196 / 294 Hz 对 146.8 / 220 Hz），全落在 500 Hz 滚降区，
     * 实测落败版 500 Hz 以上只剩 0%、整条音轨外放损失 13 dB。
     * 外放时两版趋同，等于把「胜负两版」这个设计做废了。
     * 改法：音高骨架一个不动，只补一层八度正弦，把它抬进手机有效段
     * （夺冠 196→784 Hz、落败 146.8→587.2 Hz），音量给到主干的五成半。
     * 外放上终于分得出这是大三度还是小三度 —— 而这正是两版唯一的区别。 */
    end: function (t, rank) {
      var win = (rank === 1);
      var f = win ? 196.0 : 146.8;
      tone(t, f, 1.6, 0.34, 'triangle');
      tone(t, f * 1.5, 1.5, 0.20, 'sine');
      tone(t + 0.35, win ? f * 2 : f * 1.2, 1.2, 0.16, 'triangle');
      octaveFill(t, f, 1.55, 0.34);
      filteredNoise(t, 1.8, 0.14, 'lowpass', 700, 120, 0.6);
    }
  };

  function play(name, arg) {
    if (!enabled) return false;
    var fn = VOICES[name];
    if (!fn) return false;
    var c = ensure();
    if (!c) return false;
    if (c.state === 'closed') return false;
    /* suspended 时不再直接放弃：开局「选定阵营」是整局第一次用户手势，
     * AudioContext 可能还停在 suspended（resume 是异步的，等它 resolve 就错过了这一声）。
     * suspended 下 currentTime 冻结，此刻排进去的音会在 resume 后照常播出，所以照排不误。 */
    if (c.state === 'suspended') { try { c.resume(); } catch (e) {} }
    var now = c.currentTime;
    var gap = MIN_GAP[name] || 0;
    var maxSt = (MAX_STACK[name] != null) ? MAX_STACK[name] : 1;
    var st = 0, opt = { mul: 1, gain: 1 };

    if (lastAt[name] != null && now - lastAt[name] < gap) {
      /* 密集触发：不再丢弃，改为升高音高 + 略降音量（越密越急）。
       * 超过该音的叠加上限才真的放弃 —— 否则齐射会糊成噪音墙。 */
      st = (stack[name] || 0) + 1;
      if (st > maxSt) return false;
      stack[name] = st;
      opt.mul = Math.pow(2, st * 2 / 12);      // 每层 +2 个半音
      opt.gain = Math.pow(0.78, st);
    } else {
      stack[name] = 0;
      lastAt[name] = now;
    }

    /* 核爆让路：背景先退开，再让这一声轰出来（七改②，理由见文件头）。 */
    if (name === 'nuke') duckBgm();

    try { fn(now + 0.01, arg, opt); } catch (e) { return false; }
    return true;
  }

  /* ═════════════════════════ BGM ═════════════════════════
   * 三段落配乐，全部现场合成，不引任何音频文件：
   *   tension   简报 / 危机   D 小调 i–VI–iv–V 走 16 小节，随 DEFCON 加厚提速
   *   siren     热核战争      空袭警报旋回（A4↔D5）+ 推进音型
   *   epilogue  终局          胜负两版：夺冠皮卡迪三度收束、其余空五度悬置
   *
   * ── 三改：推翻二改的整套编曲（2026-09-10 深夜，用户复听后判定「都很奇怪」）──
   * 二改的病根是「用非乐音素材硬凑紧张感」，四层里三层不是乐音：
   *   ① 摩尔斯 1.1 kHz 纯正弦，落在 2.0 / 2.5 / 10.5 这类非整拍位置 —— 不是远处通信，是烟雾报警器；
   *   ② 每拍一次的 4.2 kHz 高通击打 —— 是节拍器，而且是外放中最响的一层；
   *   ③ 小二度摩擦（587.3 / 622.3 Hz 持续 8 拍，拍频 35 Hz）—— 听感就是「两个音走调了」；
   *   ④ 真正的硬错：OST_SHIFT = [0,0,0,-1] 让每第 4 小节所有音型整体下移半音，Ab 落进 D 小调 ——
   *      这是跑调，不是风格。
   * 结构上另错两处：低音全程钉在 D 不动、音型固定 8 个音无限循环，和声纹丝不动。
   *
   * 还有一个物理原因把这些毛病放大成了「设备故障」而不是「配乐难听」：
   * 二改的音乐内容几乎全在 500 Hz 以下，而手机扬声器的低截止普遍在 500~800 Hz ——
   * 外放时真正出来的只剩摩尔斯（1.1 kHz）与击打（4.2 kHz），玩家听到的是坏掉的设备在滴滴响。
   *
   * 这一版三条规矩，一条都不许破：
   *   A 只写乐音。噪声层只留极轻的军鼓与闭合 hi-hat（且只在 DEFCON ≤3），
   *     不再有摩尔斯、不再有每拍击打、不再有任何半音摩擦。
   *   B 和声必须真的在走。低音跟着和弦走，16 小节一循环；唯一的半音变化是 A7 的 C#（和声小调导音），
   *     只出现在循环末尾 —— 整段只有那一次「要解决」，循环感才立得住。
   *   C 音乐主体落在 175~590 Hz。pad 与 arp 都在 MIDI 53~77，正是手机扬声器最有效的一段；
   *     低音压到 MIDI 29~38 只做地基，靠 ×2 / ×4 谐波层把重量带上来。
   *
   * 调度仍是标准 lookahead：setInterval 每 25 ms 醒一次，把未来 0.18 s 内的音全排进去，
   * 时序由 AudioContext 时钟决定，主线程卡顿不会让节奏抖。
   */

  var bgm = {
    playing: false, timer: null, hidden: false,
    cue: null, variant: 0, level: 5,
    beat: 0, nextTime: 0, bpm: 60, bpmTarget: 60
  };

  /* 三段各自的基准电平。音效总线是 1.0、单音峰值 0.3~0.86（核爆 0.86），
   * BGM 必须明显压在下面，否则发射 / 拦截 / 核爆会被糊掉。
   * 终局最低：面板弹出时还有一次 end 音效抢在最前面，BGM 是垫在它下面的。 */
  var CUE_LEVEL = { tension: 0.62, siren: 0.58, epilogue: 0.52 };
  /* 密度补偿：DEFCON 越低声部越多，叠加后的峰值也越高，所以声部越多总线反而压得越低 ——
   * 听感上「更紧张」来自密度与速度，不是总电平，压掉一点不会削弱紧张感，只会少糊一点。 */
  var BGM_DENSITY = [0, 0.86, 0.90, 0.95, 1.00, 1.00];
  var BGM_FADE_IN = 2.0;     // 进场慢：音乐不该「跳出来」
  var BGM_FADE_OUT = 1.2;    // 退场快：开战 / 关声音要果断
  var XFADE_OUT = 0.45;      // 换段：旧段让位
  var XFADE_IN = 1.30;       // 换段：新段进场
  var LOOKAHEAD = 0.18;      // 提前排这么多秒的音
  var TICK_MS = 25;

  function levelGain() {
    var base = CUE_LEVEL[bgm.cue] || 0.6;
    return (bgm.cue === 'tension') ? base * BGM_DENSITY[bgm.level] : base;
  }

  /* 速度：危机段 60→92（DEFCON 5→2，越深越急）；战争段 92 恒定；终局 56（胜）/ 50（负）。 */
  function bpmFor(cue, lv, variant) {
    if (cue === 'siren') return 92;
    if (cue === 'epilogue') return variant === 1 ? 56 : 50;
    return [0, 100, 92, 82, 70, 60][lv] || 60;
  }

  function note(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  /* 节点回收：onended 里断开引用。一局 6 分钟会排出上千个节点，
   * 不显式断开就全挂在 bgmBus 上等 GC。 */
  function autoFree(src, nodes) {
    src.onended = function () {
      for (var i = 0; i < nodes.length; i++) { try { nodes[i].disconnect(); } catch (e) {} }
      try { src.disconnect(); } catch (e) {}
    };
  }

  /* ── 和声表 ───────────────────────────────────────────────
   * 全部 MIDI 音高。bass 是地基（29~38，43~73 Hz），pad 与 arp 是音乐主体（53~77）。
   * D 小调自然音阶；唯一例外是 A7 的 C#（和声小调导音），只出现在 16 小节循环末尾。
   * pad 与 arp 取的是同一组和弦音，arp 多一个高八度 —— 音高相同不会打架，只互相加强。 */
  var CH = {
    Dm: { bass: 38, pad: [62, 65, 69], arp: [62, 65, 69, 74] },   // D2 ｜ D4 F4 A4
    Bb: { bass: 34, pad: [58, 62, 65], arp: [58, 62, 65, 70] },   // Bb1｜ Bb3 D4 F4
    Gm: { bass: 31, pad: [55, 58, 62], arp: [55, 58, 62, 67] },   // G1 ｜ G3 Bb3 D4
    A7: { bass: 33, pad: [57, 61, 64], arp: [57, 61, 64, 69] },   // A1 ｜ A3 C#4 E4
    F:  { bass: 29, pad: [53, 57, 60], arp: [53, 57, 60, 65] },   // F1 ｜ F3 A3 C4
    D:  { bass: 38, pad: [62, 66, 69], arp: [62, 66, 69, 74] },   // D2 ｜ D4 F#4 A4（终局·皮卡迪三度）
    G:  { bass: 31, pad: [59, 62, 67], arp: [59, 62, 67, 71] },   // G1 ｜ B3 D4 G4
    Bm: { bass: 35, pad: [59, 62, 66], arp: [59, 62, 66, 71] }    // B1 ｜ B3 D4 F#4
  };

  /* 危机段：两小节一个和弦，16 小节一循环。第 5 个和弦插一个 F（D 小调的 III 级）——
   * 整段唯一一处「亮」，然后立刻落回 Gm–A7，那一下比全程压着更难受。 */
  var TENSION_PROG = ['Dm', 'Bb', 'Gm', 'A7', 'Dm', 'F', 'Gm', 'A7'];
  /* 音型写成「和弦音下标」而不是半音偏移 —— 这是二改跑调的直接修法：
   * 音型跟着和弦走，和声换到哪都一定协和。A / B 每两小节交替，只做极小的变化，
   * 因为严格重复才是 ostinato 的意义，一变就退回旋律。 */
  var OST_A = [0, 0, 3, 0, 2, 0, 3, 1];
  var OST_B = [0, 0, 3, 0, 1, 0, 3, 2];
  /* 旋律动机（DEFCON ≤3 才进，16 小节里只出现一次）：A–G–F–D 落在 A7 上 ——
   * A 是根音、G 是 b7、F 是 b13、D 是四度（悬置），停在悬置音上不解决。 */
  var MOTIF = [[69, 0, 1.5], [67, 1.5, 1.5], [65, 3, 1], [62, 4, 3]];

  /* 战争段：8 小节一循环，只走 Dm / Gm / A7。选这三个和弦是为了警报 ——
   * 警报扫的是 A4↔D5，A 与 D 在这三个和弦上分别落在五度/根音、九度/五度、根音/四度，
   * 任意组合都协和。所以警报永远「在调上」，不会像自由扫频那样听着像设备坏了。 */
  var WAR_PROG = ['Dm', 'Dm', 'A7', 'A7', 'Dm', 'Gm', 'A7', 'A7'];
  var WAR_OST = [0, 0, 3, 2, 0, 0, 3, 1];

  /* 终局：胜利 D 大调 I–IV–vi–V（皮卡迪三度收束，天亮）；
   * 落败 D 小调 i–VI–iv–i，最后两小节把三度拿掉只剩空五度。 */
  var WIN_PROG = ['D', 'G', 'Bm', 'A'];
  var LOSE_PROG = ['Dm', 'Bb', 'Gm', 'Dm'];
  var WIN_LINE = [[74, 0], [76, 8], [78, 16], [81, 24]];   // D5–E5–F#5–A5，每和弦一个长音
  var EP_ARP = [0, 2, 3, 2];                                // 每拍一个音，四分音符琶音

  /* ── 声部基元 ─────────────────────────────────────────────
   * 三种包络覆盖 BGM 里所有音：padVoice（慢起→保持→慢收，和声与空气）、
   * arpVoice（极快起→指数衰减，音型与旋律）、sub（慢起→保持→收，低音与警报基频）。
   * 波形只用 sine / triangle：triangle 是唯一「有谐波但不刺」的波形 ——
   * 正弦太薄（手机上几乎听不见），锯齿的奇次谐波在 200~400 Hz 会变成嗡嗡声。
   *
   * ── 外放补偿（PHONE_DOUBLE）─────────────────────────────
   * 手机扬声器的低截止普遍在 500~800 Hz，而这套配器的音乐主体写在 175~440 Hz ——
   * 不补的话，外放听到的又是一堆糊在一起的低频。实测第一版：<200 Hz 占 74%，
   * >500 Hz 只剩全频 RMS 的 22%，手机上等于把配乐静音。
   * 二改也遇到了这个问题，但它补错了材料 —— 补的是 1.1 kHz 摩尔斯与 4.2 kHz 击打，
   * 那是噪声，不是音乐，于是「配乐难听」变成了「设备故障」。
   * 正确做法是给每个乐音**升八度叠一层**：外放与耳机听到的是同一段音乐，
   * 只是外放少了低八度。pad / arp / 低音三层都叠，低音另用 ×2/×4/×8（见 bassNote）。 */
  var PHONE_DOUBLE = 0.30;   // 升八度层的相对音量

  function padVoice(t, f, peak, attack, hold, release, type) {
    var o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1300; lp.Q.value = 0.6;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.setValueAtTime(Math.max(0.0002, peak), t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    o.connect(lp); lp.connect(g); g.connect(bgmBus);
    o.start(t); o.stop(t + attack + hold + release + 0.06);
    autoFree(o, [lp, g]);
  }

  function padNote(t, midi, peak, attack, hold, release) {
    var f = note(midi);
    padVoice(t, f, peak, attack, hold, release, 'triangle');
    // 升八度层用正弦：纯音，只搬能量不添谐波，不会把 pad 推亮
    if (PHONE_DOUBLE > 0) padVoice(t, f * 2, peak * PHONE_DOUBLE, attack, hold, release, 'sine');
  }

  function arpVoice(t, f, peak, decay, f0, f1) {
    var o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(f0, t);
    lp.frequency.exponentialRampToValueAtTime(f1, t + decay * 0.9);
    lp.Q.value = 0.8;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(lp); lp.connect(g); g.connect(bgmBus);
    o.start(t); o.stop(t + decay + 0.05);
    autoFree(o, [lp, g]);
  }

  function arpNote(t, midi, peak, decay, bright) {
    var f = note(midi);
    var b = bright || 1;
    arpVoice(t, f, peak, decay, 2000 * b, 650);
    // 升八度层：低通给得更高（否则会被基频那层的 650 Hz 收尾一起闷掉），收得更快
    if (PHONE_DOUBLE > 0) arpVoice(t, f * 2, peak * PHONE_DOUBLE * 0.85, decay * 0.7, 3600 * b, 1300);
  }

  function sub(t, type, f, peak, dur, attack) {
    var a = Math.max(0.006, attack || 0.05);
    var hold = Math.max(0.03, dur - a - 0.22);
    var o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.setValueAtTime(Math.max(0.0002, peak), t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + 0.22);
    o.connect(g); g.connect(bgmBus);
    o.start(t); o.stop(t + a + hold + 0.30);
    autoFree(o, [g]);
  }

  /* 低音：地基。基频压在 MIDI 29~38（43~73 Hz），手机上物理地放不出来，
   * 所以基频只留六成，其余能量分给 ×2 / ×4 / ×8 三层 ——
   * 87~294 Hz 给桌面与耳机听厚度，350~587 Hz 是外放唯一抓得住的那一层。
   * 实测第一版把基频留满：<200 Hz 占 74%，>500 Hz 只剩 22%，手机端基本等于没放。 */
  function bassNote(t, midi, dur, peak) {
    var f = note(midi);
    sub(t, 'sine', f, peak * 0.60, dur, 0.05);
    sub(t, 'sine', f * 2, peak * 0.42, dur, 0.05);
    sub(t, 'triangle', f * 4, peak * 0.30, dur, 0.06);
    sub(t, 'sine', f * 8, peak * 0.12, dur, 0.07);
  }

  /* 底鼓：低频下潜给「咚」的重量，另补一层 300→120 Hz ——
   * 手机上 46 Hz 放不出来，真正听到的是那一层中频的下潜。 */
  function kick(t, amp) {
    var o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.13);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    o.connect(g); g.connect(bgmBus);
    o.start(t); o.stop(t + 0.30);
    autoFree(o, [g]);

    var o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(300, t);
    o2.frequency.exponentialRampToValueAtTime(120, t + 0.08);
    var g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp * 0.40), t + 0.004);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.10);
    o2.connect(g2); g2.connect(bgmBus);
    o2.start(t); o2.stop(t + 0.12);
    autoFree(o2, [g2]);
  }

  // 反拍军鼓：带通噪声，只占 2、4 拍，给的是军事化的骨架而不是舞曲的动感
  function snare(t, amp) {
    var s = noiseSrc(0.09);
    var f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.9;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
    s.connect(f); f.connect(g); g.connect(bgmBus);
    s.start(t); s.stop(t + 0.1);
    autoFree(s, [f, g]);
  }

  /* 闭合 hi-hat：6.5 kHz 高通极短噪声，峰值只有 0.02 上下。
   * 二改那层是 4.2 kHz / 0.09 的「每拍击打」——同一个位置，频率更低、音量大一个量级，
   * 于是变成节拍器。这一层只做齿音质感，不做拍点（拍点交给底鼓与军鼓）。 */
  function hat(t, amp) {
    var s = noiseSrc(0.035);
    var f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 6500; f.Q.value = 0.7;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.042);
    s.connect(f); f.connect(g); g.connect(bgmBus);
    s.start(t); s.stop(t + 0.05);
    autoFree(s, [f, g]);
  }

  /* 空袭警报旋回的一半。机械警报器的音高在一个纯四度之间匀速往返 ——
   * 选 A4(440) ↔ D5(587)：A 是 Dm 的五度、也是 A7 的根音；D 是 Dm 的根音、A7 的四度（悬置）。
   * 战争段只走 Dm / Gm / A7，这两个音在三个和弦上都协和，所以警报永远「准」，
   * 不会像自由扫频那样听着像设备坏了。
   * 音色用锯齿过低通 1500 Hz —— 机械警报器的谐波很密，纯正弦像电子蜂鸣器，锯齿才像喇叭；
   * 再叠一层基频正弦，让锯齿被低通削过之后手机端仍抓得住音高。
   * 八改再加一层升八度正弦（SIREN_OCT）—— 手机外放可辨识度，见函数末尾。
   * fadeIn / fadeOut 只在整次鸣响的头尾给，两段之间不断音，否则折返点会留下机械警报不会有的「咔」。 */
  /* 警报升八度层的相对音量。初版给 0.45（照 PHONE_DOUBLE 的 0.30 量级放了一点），
   * 实测只把手机 RMS 抬高 0.2 dB、用户听不出来 —— 那一档是「理论上在场」而非「听得见」。
   * 提到 0.70：这一层是手机端唯一能抓住警报的部分，宁可它在耳机上稍亮，也要保证外放听得见。 */
  var SIREN_OCT = 0.70;
  function sirenSeg(t, dur, f0, f1, amp, fadeIn, fadeOut) {
    var fi = Math.max(0.03, fadeIn), fo = Math.max(0.03, fadeOut);
    var stop = t + dur + 0.06;
    var holdAt = Math.max(t + fi, t + dur - fo);

    var o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.setValueAtTime(f0, t);
    o1.frequency.linearRampToValueAtTime(f1, t + dur);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1500; lp.Q.value = 0.9;
    var g1 = ctx.createGain();
    g1.gain.setValueAtTime(0.0001, t);
    g1.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), t + fi);
    g1.gain.setValueAtTime(Math.max(0.0002, amp), holdAt);
    g1.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o1.connect(lp); lp.connect(g1); g1.connect(bgmBus);
    o1.start(t); o1.stop(stop);
    autoFree(o1, [lp, g1]);

    var o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(f0, t);
    o2.frequency.linearRampToValueAtTime(f1, t + dur);
    var g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp * 0.5), t + fi);
    g2.gain.setValueAtTime(Math.max(0.0002, amp * 0.5), holdAt);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o2.connect(g2); g2.connect(bgmBus);
    o2.start(t); o2.stop(stop);
    autoFree(o2, [g2]);

    /* 八改：升八度层（手机可辨识度）。
     * 警报旋回 A4(440) ↔ D5(587) 全部压在手机扬声器低截止（500~800 Hz）的边缘：
     * 实测 war 段 BGM 手机保留只有 −8 dB，耳机 / 桌面上「警报在场」，手机外放却几乎被滚降吃掉。
     * 修法与 BGM 的 PHONE_DOUBLE 同一套思路 —— 给警报**升八度叠一层**（880 ↔ 1174 Hz），
     * 音高骨架一个不动，外放与耳机听到的是同一段旋回，只是外放多了这一层能辐射出来的八度。
     * 用 triangle 不用纯正弦：正弦在手机小喇叭上辐射效率太差（实测只把手机 RMS 抬 0.2 dB，聊胜于无），
     * 而这一层的基频已经在 880~1174 Hz、整个落在手机最有效的 500~2k 内，
     * 用 triangle 拿到的少量谐波（1760 / 2640 Hz）不会像锯齿那样把外放推成电子蜂鸣器（二改的老毛病），
     * 却能让手机真正「抓得住」这条旋回 —— 底下的锯齿层继续负责「机械喇叭」的音色。 */
    var o3 = ctx.createOscillator();
    o3.type = 'triangle';
    o3.frequency.setValueAtTime(f0 * 2, t);
    o3.frequency.linearRampToValueAtTime(f1 * 2, t + dur);
    var g3 = ctx.createGain();
    g3.gain.setValueAtTime(0.0001, t);
    g3.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp * SIREN_OCT), t + fi);
    g3.gain.setValueAtTime(Math.max(0.0002, amp * SIREN_OCT), holdAt);
    g3.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o3.connect(g3); g3.connect(bgmBus);
    o3.start(t); o3.stop(stop);
    autoFree(o3, [g3]);
  }

  /* ── 危机段 ─────────────────────────────────────────────
   * 16 小节 × 4 拍 = 64 拍一循环，两小节换一次和弦。
   * 紧张度按 DEFCON 逐级「加乐器 + 提速」，不靠调音量：
   *   DEFCON 5  和弦 + 低音 + 八分音型（弱）          压抑、待命
   *   DEFCON 4  音型加强                              开始推
   *   DEFCON 3  + 底鼓 / 反拍军鼓 / hi-hat + 旋律动机   军事化
   *   DEFCON 2  + 悬置长音 + 十六分幽灵音              最后的警告
   * 玩家能「听出」危机在加深，比读数字直接。 */
  function tensionBeat(i, t) {
    var beatDur = 60 / bgm.bpm;
    var pos = i % 64;
    var bar = Math.floor(pos / 4);
    var inBar = pos % 4;
    var lv = bgm.level;
    var ch = CH[TENSION_PROG[Math.floor(bar / 2) % 8]];

    // 和弦与低音：两小节一次，慢起慢收，换和弦时自然交叠
    if (inBar === 0 && bar % 2 === 0) {
      var hold = Math.max(0.3, beatDur * 8 - 2.4);
      for (var p = 0; p < ch.pad.length; p++) padNote(t, ch.pad[p], 0.038, 1.1, hold, 1.2);
      bassNote(t, ch.bass, beatDur * 8, 0.110);
    }

    /* 音型：八分音符，全程不停 —— DEFCON 5 也留着，否则开局太空。
     * 音量不随等级调（密度补偿已经管了总线），等级只决定「上面还叠了什么」。 */
    var ost = (bar % 4 < 2) ? OST_A : OST_B;
    for (var k = 0; k < 8; k++) {
      var midi = ch.arp[ost[k]];
      var amp = 0.070 * (k % 2 ? 0.62 : 1);
      arpNote(t + k * beatDur * 0.5, midi, amp, 0.16, 1);
      // DEFCON ≤2：补一层十六分幽灵音，只加密度不加音量
      if (lv <= 2 && k < 7) arpNote(t + (k + 0.5) * beatDur * 0.5, midi, amp * 0.40, 0.10, 1.15);
    }

    // 打击：DEFCON ≤3 才进。底鼓在 1、3 拍（3 拍补一记半拍），军鼓在 2、4 拍，hat 只在反拍
    if (lv <= 3) {
      if (inBar === 0) kick(t, 0.13);
      if (inBar === 2) { kick(t, 0.13); kick(t + beatDur * 0.5, 0.07); }
      if (inBar === 1 || inBar === 3) snare(t, 0.045);
      hat(t + beatDur * 0.5, 0.020);
    }

    /* 悬置长音：DEFCON ≤2 加一层比和弦高八度的五度。
     * 「快速音符让人兴奋，长音让人等待」—— 这一层不提供任何节奏，只提供不安。 */
    if (lv <= 2 && inBar === 0 && bar % 2 === 0) {
      padNote(t, ch.pad[2] + 12, 0.024, 1.6, Math.max(0.3, beatDur * 8 - 3.2), 1.6);
    }

    /* 旋律动机：DEFCON ≤3，16 小节里只出现一次（落在 A7 上）。长音，不是又一层节奏。
     * inBar === 0 这个条件是必须的 —— scheduleBeat 每拍调一次，
     * 少了它这段动机会在小节内被重排 4 遍、叠成一个卡农。 */
    if (lv <= 3 && inBar === 0 && bar % 16 === 6) {
      for (var m = 0; m < MOTIF.length; m++) {
        arpNote(t + MOTIF[m][1] * beatDur, MOTIF[m][0], 0.082, MOTIF[m][2] * beatDur, 0.8);
      }
    }
  }

  /* ── 战争段 ─────────────────────────────────────────────
   * 8 小节 × 4 拍 = 32 拍一循环，一小节换一次和弦。 */
  function warBeat(i, t) {
    var beatDur = 60 / bgm.bpm;
    var pos = i % 32;
    var bar = Math.floor(pos / 4);
    var inBar = pos % 4;
    var ch = CH[WAR_PROG[bar % 8]];

    /* 警报：每 16 拍拉响一次，一次 12 拍（92 bpm 下约 7.8 s），升 6 拍降 6 拍，
     * 之后留 4 拍（约 2.6 s）空白。不留空白的话，几分钟不停的警报会把耳朵听木，
     * 也会盖住发射 / 拦截 / 核爆。折返点不断音，所以听感上是一条完整的旋回，
     * 只在空白处「喘一口气」—— 那口气比全程拉满更像真的空袭。 */
    /* 八改：电平 0.050 → 0.062。
     * 加升八度层之后实测手机 RMS 只抬 0.8 dB —— 不够，因为警报本身峰值只有 0.050，
     * 低于底鼓（0.15）与低音（0.095），在手机端被这两层的低频残留主导。
     * 与其继续加大升八度层（那只会让耳机端过亮），不如让警报这一层自己响一点：
     * 0.062 约 +1.9 dB，手机端终于能明确地「听到一条旋回」，耳机端仍在 pad 之上、不刺。 */
    if (pos % 16 === 0) {
      var up = 6 * beatDur;
      sirenSeg(t, up, note(69), note(74), 0.062, 0.8, 0.06);
      sirenSeg(t + up, up, note(74), note(69), 0.062, 0.06, 1.2);
    }

    // 和弦与低音：一小节一次，比危机段紧一档
    if (inBar === 0) {
      var hold = Math.max(0.3, beatDur * 4 - 1.1);
      for (var p = 0; p < ch.pad.length; p++) padNote(t, ch.pad[p], 0.032, 0.5, hold, 0.6);
      bassNote(t, ch.bass, beatDur * 4, 0.095);
    }

    // 推进音型：八分音符不停，战争段的驱动力全在这一层
    for (var k = 0; k < 8; k++) {
      arpNote(t + k * beatDur * 0.5, ch.arp[WAR_OST[k]], 0.066 * (k % 2 ? 0.64 : 1), 0.15, 1.2);
      // 低音脉冲走四分音符（每两格一下），给「行军」的骨架
      if (k % 2 === 0) {
        var base = note(ch.bass + 12);          // 87~147 Hz
        sub(t + k * beatDur * 0.5, 'sine', base, 0.070, 0.17, 0.008);
        sub(t + k * beatDur * 0.5, 'triangle', base * 2, 0.026, 0.15, 0.008);
        sub(t + k * beatDur * 0.5, 'sine', base * 4, 0.012, 0.13, 0.008);   // 外放抓得住的 ×4
      }
    }

    // 打击：比危机段硬一档，但不做十六分墙 —— 那会和拦截音糊在一起
    kick(t, inBar === 0 ? 0.15 : 0.10);
    if (inBar === 1 || inBar === 3) snare(t, 0.052);
    hat(t, 0.024);
    hat(t + beatDur * 0.5, 0.016);
  }

  /* ── 终局 ───────────────────────────────────────────────
   * 两版共用同一套骨架（pad + 低音 + 钟），差别只在调式与「有没有推进感」：
   *   夺冠  D 大调 I–IV–vi–V，四分音符琶音 + 上行长音旋律，皮卡迪三度收束 —— 天亮
   *   落败  D 小调 i–VI–iv–i，不给琶音，最后两小节去掉三度只剩空五度 —— 余烬，且不落地
   * 音量压到三段里最低：面板弹出时还有一次 end 音效抢在最前面，BGM 是垫在它下面的。 */
  function epilogueBeat(i, t) {
    var beatDur = 60 / bgm.bpm;
    var pos = i % 32;
    var bar = Math.floor(pos / 4);
    var inBar = pos % 4;
    var win = (bgm.variant === 1);
    var ch = CH[(win ? WIN_PROG : LOSE_PROG)[Math.floor(bar / 2) % 4]];

    if (inBar === 0 && bar % 2 === 0) {
      var notes = ch.pad;
      // 落败的收尾：Dm 去掉三度（F），只留 D + A 的空五度 —— 悬着，不落地
      if (!win && bar >= 6) notes = [ch.pad[0], ch.pad[2]];
      var hold = Math.max(0.4, beatDur * 8 - 2.6);
      for (var p = 0; p < notes.length; p++) padNote(t, notes[p], 0.044, 1.5, hold, 1.5);
      bassNote(t, ch.bass, beatDur * 8, 0.115);
      // 钟：只落在每个和弦的头一个音上，给终局一个「落地」的触感
      sub(t, 'sine', note(ch.pad[0] + 12), 0.028, 2.2, 0.012);
      sub(t, 'sine', note(ch.pad[0] + 24), 0.011, 1.6, 0.012);
    }

    if (win) {
      /* 四分音符琶音：稳定、开阔。落败版刻意不给 —— 「余烬」不能有推进感。
       * 同样必须带 inBar === 0：scheduleBeat 每拍调一次，少了它这四条琶音会被重排 4 遍，
       * 同一时刻同音高的振荡器相位一致叠加，等于白白多出 12 dB。 */
      if (inBar === 0) {
        for (var k = 0; k < 4; k++) {
          arpNote(t + k * beatDur, ch.arp[EP_ARP[k]], 0.040, Math.max(0.3, beatDur * 0.9), 1.3);
        }
      }
      /* 上行长音旋律：每两小节一个音，D5–E5–F#5–A5，循环回 D。 */
      if (inBar === 0 && bar % 2 === 0) {
        sub(t, 'sine', note(WIN_LINE[bar / 2][0]), 0.048, Math.max(0.6, beatDur * 8 - 0.8), 0.4);
      }
    }
  }

  /* 拍位分发。每个 cue 的循环长度不同（tension 64 拍、siren / epilogue 32 拍），
   * 所以各 cue 的 beat 函数内部自己对拍位取模，这里不做统一处理。 */
  var BEAT_FN = { tension: tensionBeat, siren: warBeat, epilogue: epilogueBeat };

  function scheduleBeat(i, t) {
    var fn = BEAT_FN[bgm.cue];
    if (fn) fn(i, t);
  }

  function bgmSchedule() {
    var c = ctx;
    if (!c || !bgm.playing) return;
    var now = c.currentTime;
    /* suspended 时 currentTime 冻结，下面的 while 会一直满足、每 25 ms 排出整整一轮 ——
     * resume 是异步的，这几十毫秒里必须按兵不动，并把时间轴重新对齐。 */
    if (c.state !== 'running') { bgm.nextTime = now + 0.05; return; }
    /* 切后台时 setInterval 会被节流到 1 s 以上，回来时 nextTime 已经落后一大截 ——
     * 不追平的话会一次性排出几十个音，糊成一声响。 */
    if (bgm.nextTime < now - 0.4) bgm.nextTime = now + 0.05;
    // BPM 平滑逼近目标：DEFCON 跃迁时是「渐渐变急」，不是瞬间变速
    bgm.bpm += (bgm.bpmTarget - bgm.bpm) * 0.08;
    var guard = 0;
    while (bgm.nextTime < now + LOOKAHEAD && guard < 64) {
      scheduleBeat(bgm.beat, bgm.nextTime);
      bgm.nextTime += 60 / bgm.bpm;
      bgm.beat++;
      guard++;
    }
  }

  function rampBgm(target, dur) {
    var c = ctx; if (!c) return;
    var t = c.currentTime;
    var cur = Math.max(0.0001, bgmBus.gain.value);
    bgmBus.gain.cancelScheduledValues(t);
    bgmBus.gain.setValueAtTime(cur, t);
    bgmBus.gain.linearRampToValueAtTime(Math.max(0.0001, target), t + Math.max(0.01, dur));
  }

  /* 换段：先把旧段淡出，再让新段淡入，新段的第一个音排在淡出结束之后 ——
   * 总线只有一条，用「降到 0 → 升到新目标」的两段斜坡完成交叉，两段不会叠在一起。 */
  function bgmSwitch(cue, variant, lv) {
    var c = ctx; if (!c) return;
    var t = c.currentTime;
    bgm.cue = cue;
    bgm.variant = variant;
    bgm.level = lv;
    bgm.bpm = bgm.bpmTarget = bpmFor(cue, lv, variant);
    bgm.beat = 0;
    var g = bgmBus.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(0.0001, g.value), t);
    g.linearRampToValueAtTime(0.0001, t + XFADE_OUT);
    g.linearRampToValueAtTime(levelGain(), t + XFADE_OUT + XFADE_IN);
    bgm.nextTime = t + XFADE_OUT + 0.03;
  }

  function bgmStart(cue, variant, lv) {
    var c = ensure();
    if (!c || bgm.playing) return false;
    if (c.state === 'suspended') { try { c.resume(); } catch (e) {} }
    cue = cue || 'tension';
    bgm.playing = true;
    bgm.cue = cue;
    bgm.variant = variant || 0;
    if (lv) bgm.level = lv;
    bgm.beat = 0;
    bgm.bpm = bgm.bpmTarget = bpmFor(cue, bgm.level, bgm.variant);
    /* 终局的第一个音等 1.5 s 再进 —— 面板弹出时哪一下 end 音效要先落地，
     * 音乐紧接着铺上来，是「落地 + 余韵」而不是两件事一起响。 */
    var lead = (cue === 'epilogue') ? 1.5 : 0.10;
    /* 让路必须复位：换段 / 切后台回来时若还带着上一段的 duck 值，
     * 新一段会整体矮一截而且再也回不来（bgmBus 自己的斜坡会把它当成目标电平）。 */
    duck.gain.cancelScheduledValues(c.currentTime);
    duck.gain.setValueAtTime(1, c.currentTime);
    bgmBus.gain.cancelScheduledValues(c.currentTime);
    bgmBus.gain.setValueAtTime(0.0001, c.currentTime);
    bgm.nextTime = c.currentTime + lead;
    rampBgm(levelGain(), (cue === 'epilogue') ? 2.2 : BGM_FADE_IN);
    if (bgm.timer) clearInterval(bgm.timer);
    bgm.timer = setInterval(bgmSchedule, TICK_MS);
    bgmSchedule();
    return true;
  }

  function bgmStop(fade) {
    if (!bgm.playing) return;
    bgm.playing = false;
    bgm.cue = null;
    if (bgm.timer) { clearInterval(bgm.timer); bgm.timer = null; }
    // 已排进未来的音不会撤销，靠总线淡出一起收掉，不会有断头的残音
    rampBgm(0.0001, (fade == null) ? BGM_FADE_OUT : fade);
  }

  // 切后台即静音：手机上是常识，回前台由下一帧 setScene 自动接回
  function onVisibility() {
    var d = global.document;
    bgm.hidden = !!(d && d.hidden);
    if (bgm.hidden && bgm.playing) bgmStop(0.35);
  }
  if (global.document && global.document.addEventListener) {
    global.document.addEventListener('visibilitychange', onVisibility, false);
  }

  /* 场景同步：game.js 主循环每帧调用，内部做 diff。
   * 三个阶段各有一段配乐，没有静默阶段 —— 二改让核战整段停，是因为当时只有一段音乐，
   * 现在战争与终局各自有专属的一段。 */
  function setScene(phase, defcon, rank) {
    var lv = Math.max(1, Math.min(5, defcon || 5));
    var cue = null;
    if (phase === 'briefing' || phase === 'crisis') cue = 'tension';
    else if (phase === 'war') cue = 'siren';
    else if (phase === 'over') cue = 'epilogue';

    var want = !!cue && enabled && !bgm.hidden;
    if (!want) { if (bgm.playing) bgmStop(); return; }

    var variant = (cue === 'epilogue' && rank === 1) ? 1 : 0;
    if (!bgm.playing) { bgmStart(cue, variant, lv); return; }
    if (bgm.cue !== cue || bgm.variant !== variant) { bgmSwitch(cue, variant, lv); return; }

    bgm.bpmTarget = bpmFor(cue, lv, variant);
    if (bgm.level !== lv) {
      bgm.level = lv;
      if (cue === 'tension') rampBgm(levelGain(), 0.9);   // 跟着等级调整密度补偿，不等下一次启停
    }
  }

  function setEnabled(on) {
    enabled = !!on;
    if (enabled) { unlock(); }
    else if (bgm.playing) bgmStop(0.25);   // 关声音要立刻安静，不留 1.2 s 尾巴
    return enabled;
  }

  DC.audio = {
    play: play,
    unlock: unlock,
    setEnabled: setEnabled,
    toggle: function () { return setEnabled(!enabled); },
    setScene: setScene,          // (phase, defcon, rank)：主循环每帧调用，BGM 随阶段换段
    get enabled() { return enabled; },
    get available() { return !!ensure(); },
    get duck() { return duck ? duck.gain.value : 1; },   // 核爆让路的瞬时增益，供探针断言（七改②）
    bgm: {
      start: bgmStart, stop: bgmStop,
      get playing() { return bgm.playing; },
      get cue() { return bgm.cue; },         // tension / siren / epilogue，供无头断言换段
      get variant() { return bgm.variant; }, // 终局：1 = 夺冠
      get bpm() { return bgm.bpm; }          // 供无头断言「危机越深越快」
    }
  };

})(typeof window !== 'undefined' ? window : globalThis);
