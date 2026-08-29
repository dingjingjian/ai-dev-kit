# -*- coding: utf-8 -*-
"""给拼豆游戏加音效：Web Audio 程序化合成国风音色 + 五声音阶背景音乐。"""
import io

path = r"C:\Users\dingj\Documents\git\ai-dev-kit\perler-bead-game\_dev\build.py"
with io.open(path, "r", encoding="utf-8") as f:
    text = f.read()

# ---------------------------------------------------------------- 1) 音频引擎
AUDIO = r'''
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
'''

anchor1 = "const MODES = {copy:'临摹',challenge:'挑战'};"
assert anchor1 in text, "anchor1 not found"
text = text.replace(anchor1, anchor1 + "\n" + AUDIO, 1)

# ---------------------------------------------------------------- 2) 菜单项
anchor2 = '      <button class="menu-item" data-act="info"><span>玩法说明</span><b>›</b></button>'
assert anchor2 in text, "anchor2 not found"
menu_add = (
    '      <button class="menu-item" data-act="sfx"><span>音效</span><b id="sfxLabel">开</b></button>\n'
    '      <button class="menu-item" data-act="bgm"><span>背景音乐</span><b id="bgmLabel">开</b></button>\n'
)
text = text.replace(anchor2, menu_add + anchor2, 1)

# ---------------------------------------------------------------- 3) 调用点
reps = [
    # 选色珠
    ("""function selectColor(code){
  curColor=code; tool='pen';
  setTool('pen');""",
     """function selectColor(code){
  curColor=code; tool='pen';
  SFX.select();
  setTool('pen');"""),
    # 放豆
    ("""    if(state[idx]!==curColor){state[idx]=curColor;moves++;spawnSparkle(idx);render();updateMaterialCounts();updatePct();}""",
     """    if(state[idx]!==curColor){state[idx]=curColor;moves++;spawnSparkle(idx);SFX.place();render();updateMaterialCounts();updatePct();}"""),
    # 擦除
    ("""    if(state[idx]!=null){state[idx]=null;moves++;render();updateMaterialCounts();updatePct();}""",
     """    if(state[idx]!=null){state[idx]=null;moves++;SFX.erase();render();updateMaterialCounts();updatePct();}"""),
    # 提示
    ("""  hints++; mistakes++; // 提示计一次失误参考""",
     """  hints++; mistakes++; // 提示计一次失误参考
  SFX.hint();"""),
    # 清空
    ("""  clearProgress(PATTERNS[curPattern].id);
  showToast('已清空');""",
     """  clearProgress(PATTERNS[curPattern].id);
  SFX.clear();
  showToast('已清空');"""),
    # 熨烫开始
    ("""  ironT=0;
  let start=performance.now();""",
     """  ironT=0;
  SFX.iron();
  let start=performance.now();"""),
    # 通关
    ("""      spawnPetals();
      showToast('拼成啦！国风佳作 ✦');""",
     """      spawnPetals();
      SFX.win();
      showToast('拼成啦！国风佳作 ✦');"""),
    # 底栏工具按钮
    ("""      const t=btn.dataset.tool;
      if(t==='clear') requestClear(btn);""",
     """      const t=btn.dataset.tool;
      SFX.click();
      if(t==='clear') requestClear(btn);"""),
    # 菜单项
    ("""      const a=item.dataset.act; closeMenu();
      if(a==='mode'){const keys=Object.keys(MODES),i=keys.indexOf(mode);setMode(keys[(i+1)%keys.length]);}""",
     """      const a=item.dataset.act; closeMenu();
      if(a==='sfx'){SFX.setOn(!SFX.isOn());SFX.save();SFX.syncLabels();if(SFX.isOn())SFX.select();}
      else if(a==='bgm'){SFX.setBgm(!SFX.isBgmOn());SFX.save();SFX.syncLabels();if(SFX.isBgmOn())SFX.select();}
      else SFX.click();
      if(a==='mode'){const keys=Object.keys(MODES),i=keys.indexOf(mode);setMode(keys[(i+1)%keys.length]);}"""),
    # 首页图纸卡片
    ("""    card.addEventListener('click',()=>openPattern(idx));""",
     """    card.addEventListener('click',()=>{SFX.click();openPattern(idx);});"""),
    # init：读取音效设置 + 首次手势解锁 AudioContext
    ("""function init(){
  applySafeArea();
  loadRecords();""",
     """function init(){
  applySafeArea();
  SFX.load();
  // 移动端 AudioContext 必须在用户手势内解锁
  ['pointerdown','touchstart','keydown'].forEach(function(ev){
    window.addEventListener(ev,function(){SFX.unlock();},{once:true,passive:true});
  });
  loadRecords();"""),
]

for old, new in reps:
    assert old in text, "call site not found: " + old[:70]
    text = text.replace(old, new, 1)

with io.open(path, "w", encoding="utf-8") as f:
    f.write(text)

print("audio engine injected")
