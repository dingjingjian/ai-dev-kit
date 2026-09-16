'use strict';
(function(){
var Q=function(id){return document.getElementById(id);};
var R=1.6;
var LS_KEY='catglobe.hearts';
var st={page:'atlas',hearts:[],flyIdx:0,flying:false,flyFrom:-1,flyTo:-1,arrived:false};

/* ===== 存档 ===== */
function loadHearts(){
  try{var s=localStorage.getItem(LS_KEY);if(s){var a=JSON.parse(s);if(Array.isArray(a))st.hearts=a.filter(function(i){return i>=0&&i<CATS.length;});}}catch(e){}
}
function saveHearts(){try{localStorage.setItem(LS_KEY,JSON.stringify(st.hearts));}catch(e){}}

/* ===== 图片加载/占位 ===== */
function setImg(el,src,onFail){
  if(!src){onFail();return;}
  var im=new Image();
  im.onload=function(){el.src=src;};
  im.onerror=function(){onFail();};
  im.src=src;
}
function thumbHTML(cat,i){
  var hearted=st.hearts.indexOf(i)>=0;
  return '<div class="cat-card" data-i="'+i+'">'
    +'<div class="cat-thumb" data-thumb="'+i+'">'
    +'<span class="ph"></span>'
    +'<button class="heart-btn'+(hearted?' on':'')+'" data-heart="'+i+'" aria-label="心动">'+(hearted?'♥':'♡')+'</button>'
    +'</div>'
    +'<div class="cat-info">'
    +'<div class="cat-name">'+cat.name+'</div>'
    +'<div class="cat-origin">'+cat.country+' · '+cat.city+'</div>'
    +'<div class="cat-traits">'+cat.traits.map(function(t){return '<span>'+t+'</span>';}).join('')+'</div>'
    +'</div></div>';
}

/* ===== 图鉴页 ===== */
function renderAtlas(){
  var grid=Q('atlasGrid');
  var html='';
  REGION_ORDER.forEach(function(reg){
    var list=CATS.map(function(c,i){return {c:c,i:i};}).filter(function(x){return x.c.region===reg;});
    if(!list.length)return;
    html+='<div class="region-section"><div class="region-head"><h3>'+REGION_LABEL[reg]+'</h3><span class="count">'+list.length+' 种</span></div><div class="cat-grid">';
    list.forEach(function(x){html+=thumbHTML(x.c,x.i);});
    html+='</div></div>';
  });
  grid.innerHTML=html;
  grid.querySelectorAll('[data-thumb]').forEach(function(el){
    var i=+el.getAttribute('data-thumb');
    var img=document.createElement('img');
    img.alt=CATS[i].name;
    setImg(img,CATS[i].img,function(){img.style.display='none';});
    el.insertBefore(img,el.firstChild);
  });
  updateAtlasActions();
}
function updateAtlasActions(){
  var n=st.hearts.length;
  var startBtn=Q('startFlyBtn');
  var geneBtn=Q('geneFromAtlasBtn');
  if(n>0){
    startBtn.disabled=false; startBtn.textContent='去见 '+n+' 只心动小猫 ♥';
    geneBtn.disabled=false;
  }else{
    startBtn.disabled=true; startBtn.textContent='先心动一只小猫 ♥';
    geneBtn.disabled=true;
  }
}
function toggleHeart(i){
  var p=st.hearts.indexOf(i);
  if(p>=0)st.hearts.splice(p,1); else st.hearts.push(i);
  saveHearts();
  var btn=document.querySelector('[data-heart="'+i+'"]');
  if(btn){
    var on=st.hearts.indexOf(i)>=0;
    btn.classList.toggle('on',on); btn.textContent=on?'♥':'♡';
  }
  updateAtlasActions();
}

/* ===== 页面切换 ===== */
function setPage(p){
  st.page=p;
  document.body.className='mode-'+p;
}

/* ===== 飞行场景（Three.js 第一视角） ===== */
var F=null;
function initFlyScene(){
  if(F)return F;
  var canvas=Q('flyCanvas');
  var gl=null;
  try{gl=canvas.getContext('webgl2')||canvas.getContext('webgl');}catch(e){}
  if(!gl || typeof THREE==='undefined'){document.body.classList.add('no-webgl');return null;}
  try{
    F=(function(){
      var renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true,alpha:true});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
      var scene=new THREE.Scene();
      scene.background=new THREE.Color(0xb8d4e8);
      var camera=new THREE.PerspectiveCamera(62,1,0.01,200);
      var R0=1.6;

      /* 真实地球/云层贴图（base64 data URI 内联，规避 file:// WebGL CORS） */
      function loadTexFromData(uri, cb) {
        if (!uri) { cb(null); return; }
        var img = new Image();
        img.onload = function() {
          var tex = new THREE.Texture(img);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.needsUpdate = true;
          cb(tex);
        };
        img.onerror = function() { cb(null); };
        img.src = uri;
      }

      /* 地球（MeshBasicMaterial 贴图原色直显，不受光照影响，永远明亮不黑） */
      var earthMat = new THREE.MeshBasicMaterial({color:0xffffff});
      loadTexFromData(typeof EARTH_TEX_URI!=='undefined'?EARTH_TEX_URI:null, function(t){ if(t){earthMat.map=t; earthMat.needsUpdate=true;} });
      var earth = new THREE.Mesh(
        new THREE.SphereGeometry(R0,64,44),
        earthMat
      );
      scene.add(earth);
      /* 云层 */
      var cloudsMat = new THREE.MeshBasicMaterial({transparent:true, opacity:.55, depthWrite:false});
      loadTexFromData(typeof CLOUDS_TEX_URI!=='undefined'?CLOUDS_TEX_URI:null, function(t){ if(t){cloudsMat.map=t; cloudsMat.needsUpdate=true;} });
      var clouds = new THREE.Mesh(
        new THREE.SphereGeometry(R0*1.012,48,32),
        cloudsMat
      );
      scene.add(clouds);
      /* 大气 */
      var atmo=new THREE.Mesh(
        new THREE.SphereGeometry(R0*1.06,48,32),
        new THREE.MeshBasicMaterial({color:0x88ccee,transparent:true,opacity:.12,side:THREE.BackSide,depthWrite:false})
      );
      scene.add(atmo);
      /* 光（sun 在 frame 里跟随相机，确保地球朝相机面始终被照亮，不出现黑黑夜半球） */
      var sun=new THREE.DirectionalLight(0xffffff,1.0); sun.position.set(5,3,5); scene.add(sun);
      scene.add(new THREE.AmbientLight(0xffffff,1.4));
      /* 星空天球 */
      var skyC=document.createElement('canvas'); skyC.width=512; skyC.height=512;
      var sctx=skyC.getContext('2d');
      var sg=sctx.createLinearGradient(0,0,0,512);
      sg.addColorStop(0,'#6a9ac4'); sg.addColorStop(.4,'#9ac4e0'); sg.addColorStop(.7,'#c8e0ec'); sg.addColorStop(1,'#e8f0f4');
      sctx.fillStyle=sg; sctx.fillRect(0,0,512,512);
      for(var k=0;k<400;k++){var x=Math.random()*512,y=Math.random()*256;sctx.fillStyle='rgba(255,255,255,'+(Math.random()*.6+.2)+')';sctx.fillRect(x,y,1,1);}
      var skyTex=new THREE.CanvasTexture(skyC);
      var sky=new THREE.Mesh(new THREE.SphereGeometry(80,32,16),new THREE.MeshBasicMaterial({map:skyTex,side:THREE.BackSide,depthWrite:false}));
      scene.add(sky);

      /* 经纬→球面坐标（与 three.js SphereGeometry 默认 UV 对齐：贴图 u=0 在 -X，需 lon+180 偏移 + X 负号） */
      function ll2v(lat,lon,r){
        var th=(90-lat)*Math.PI/180, p=(lon+180)/360*Math.PI*2;
        return new THREE.Vector3(-r*Math.cos(p)*Math.sin(th), r*Math.cos(th), r*Math.sin(p)*Math.sin(th));
      }
      /* 球面线性插值（大圆航线） */
      function slerp(a,b,t){
        var d=THREE.MathUtils.clamp(a.clone().normalize().dot(b.clone().normalize()),-1,1);
        if(d>0.99995)return a.clone().lerp(b,t).normalize();
        if(d<-0.99995){var perp=new THREE.Vector3(1,0,0);if(Math.abs(a.x)>.9)perp.set(0,1,0);perp.crossVectors(a,perp).normalize();var th=Math.PI*t;return a.clone().multiplyScalar(Math.cos(th)).add(perp.multiplyScalar(Math.sin(th)));}
        var th=Math.acos(d)*t; var rel=b.clone().sub(a.clone().multiplyScalar(d)).normalize();
        return a.clone().multiplyScalar(Math.cos(th)).add(rel.multiplyScalar(Math.sin(th)));
      }

      /* 标记点（出发地绿 / 目的地橙红） */
      function makeMarker(lat,lon,color){
        var pos=ll2v(lat,lon,R0*1.01);
        var g=new THREE.Group();
        var dot=new THREE.Mesh(new THREE.SphereGeometry(0.024,12,8),new THREE.MeshBasicMaterial({color:color}));
        dot.position.copy(pos); g.add(dot);
        var glow=new THREE.Sprite(new THREE.SpriteMaterial({color:color,transparent:true,opacity:.6,blending:THREE.AdditiveBlending,depthWrite:false}));
        glow.scale.set(0.16,0.16,1); glow.position.copy(pos); g.add(glow);
        g.userData.glow=glow; return g;
      }
      /* 大圆航线弧线 */
      function makeRouteLine(av,bv){
        var pts=[];
        for(var i=0;i<=72;i++){pts.push(slerp(av,bv,i/72).multiplyScalar(R0*1.018));}
        var geo=new THREE.BufferGeometry().setFromPoints(pts);
        return new THREE.Line(geo,new THREE.LineBasicMaterial({color:0xe8755a,transparent:true,opacity:.75}));
      }
      /* 飞机当前位置标记 */
      function makePlaneMarker(){
        var m=new THREE.Mesh(new THREE.SphereGeometry(0.02,10,6),new THREE.MeshBasicMaterial({color:0xffffff}));
        var glow=new THREE.Sprite(new THREE.SpriteMaterial({color:0xffffff,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false}));
        glow.scale.set(0.11,0.11,1); m.add(glow); return m;
      }
      var routeObjs={from:null,to:null,line:null,plane:null};
      function clearRoute(){
        for(var k in routeObjs){if(routeObjs[k]){scene.remove(routeObjs[k]);routeObjs[k]=null;}}
      }
      function pulseTo(now){
        if(routeObjs.to&&routeObjs.to.userData.glow){
          var s=0.16+0.05*Math.sin(now*0.006);
          routeObjs.to.userData.glow.scale.set(s,s,1);
        }
      }

      var animId=null,flyStart=0,flyDur=3200,fromV=null,toV=null,onArrive=null,curAlt=0.22;
      var arrivedRot=null,lastW=0,lastH=0;

      function resize(){
        var w=canvas.clientWidth||canvas.offsetWidth||1, h=canvas.clientHeight||canvas.offsetHeight||1;
        renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); lastW=w; lastH=h;
      }

      function frame(now){
        var cw=canvas.clientWidth||1, ch=canvas.clientHeight||1;
        if(cw!==lastW||ch!==lastH)resize();
        if(st.flying){
          var t=Math.min(1,(now-flyStart)/flyDur);
          var ease=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
          var p=slerp(fromV,toV,ease);
          /* 第一人称飞行：前方地平线+下方地表+上方天空，高度适中可见航线 */
          var alt=0.35+0.15*Math.sin(Math.PI*ease);
          curAlt=alt;
          var pos=p.clone().multiplyScalar(R0+alt);
          /* 前方略低点（看前方地平线偏下，地表占视野主体） */
          var fwdT=Math.min(1,ease+0.07);
          var fwdP=slerp(fromV,toV,fwdT).multiplyScalar(R0+alt*0.7);
          camera.position.copy(pos);
          camera.up.copy(p).normalize();
          camera.lookAt(fwdP);
          /* 轻微颠簸 */
          camera.position.y+=Math.sin(now*0.012)*0.004;
          /* 飞机标记位置 */
          if(routeObjs.plane){routeObjs.plane.position.copy(p.clone().multiplyScalar(R0*1.02));}
          /* HUD */
          Q('flyProgress').textContent=Math.round(t*100)+'%';
          if(t<.15)Q('flyStatus').textContent='起飞';
          else if(t>.85)Q('flyStatus').textContent='降落';
          else Q('flyStatus').textContent='巡航中';
          if(t>=1){st.flying=false;document.body.classList.remove('flying');arrive();}
        } else if(arrivedRot){
          camera.position.copy(arrivedRot.camPos);
          camera.up.set(0,1,0);
          camera.lookAt(0,0,0);
        }
        /* sun 跟随相机：从相机方向照射地球，确保朝相机面始终被照亮 */
        sun.position.copy(camera.position).multiplyScalar(1.5);
        pulseTo(now);
        clouds.rotation.y+=0.0003;
        renderer.render(scene,camera);
        animId=requestAnimationFrame(frame);
      }

      function fly(fromIdx,toIdx,cb){
        var a=CATS[fromIdx], b=CATS[toIdx];
        fromV=ll2v(a.lat,a.lon,1); toV=ll2v(b.lat,b.lon,1);
        onArrive=cb; st.flying=true; st.arrived=false;
        document.body.classList.add('flying');
        document.body.classList.remove('fly-arrived');
        Q('flyRoute').innerHTML=a.city+' <span class="arrow">✈</span> '+b.city;
        /* 标记 + 航线 */
        clearRoute();
        routeObjs.from=makeMarker(a.lat,a.lon,0x44cc66);
        routeObjs.to=makeMarker(b.lat,b.lon,0xe8755a);
        routeObjs.line=makeRouteLine(fromV,toV);
        routeObjs.plane=makePlaneMarker();
        scene.add(routeObjs.from); scene.add(routeObjs.to); scene.add(routeObjs.line); scene.add(routeObjs.plane);
        flyStart=performance.now();
        if(!animId){resize();animId=requestAnimationFrame(frame);}
      }
      function arrive(){
        st.arrived=true;
        var b=CATS[st.flyTo];
        var center=ll2v(b.lat,b.lon,1);
        arrivedRot={camPos:center.clone().multiplyScalar(R0+2.2)};
        /* 抵达后清除航线和飞机标记，保留目的地标记脉动 */
        if(routeObjs.line){scene.remove(routeObjs.line);routeObjs.line=null;}
        if(routeObjs.plane){scene.remove(routeObjs.plane);routeObjs.plane=null;}
        if(routeObjs.from){scene.remove(routeObjs.from);routeObjs.from=null;}
        if(onArrive)onArrive(st.flyTo);
      }
      function goto(idx, cb){
        st.flyTo=idx; st.flying=false; st.arrived=true;
        document.body.classList.remove('flying');
        var b=CATS[idx];
        var center=ll2v(b.lat,b.lon,1);
        arrivedRot={camPos:center.clone().multiplyScalar(R0+2.2)};
        Q('flyRoute').innerHTML='已抵达 <span class="arrow">✈</span> '+b.city;
        Q('flyProgress').textContent='100%';
        /* 只显示目的地标记 */
        clearRoute();
        routeObjs.to=makeMarker(b.lat,b.lon,0xe8755a);
        scene.add(routeObjs.to);
        if(!animId){resize();animId=requestAnimationFrame(frame);}
        if(cb)cb(idx);
      }
      function stop(){if(animId){cancelAnimationFrame(animId);animId=null;}st.flying=false;clearRoute();}
      function start(){if(!animId){resize();animId=requestAnimationFrame(frame);}}

      return {resize:resize,fly:fly,goto:goto,stop:stop,start:start};
    })();
  }catch(e){F=null;document.body.classList.add('no-webgl');}
  return F;
}

/* ===== 见小猫模式 ===== */
function enterFly(){
  if(st.hearts.length===0)return;
  st.flyIdx=0;
  setPage('fly');
  document.body.classList.remove('fly-arrived');
  updateFlyHud();
  var sc=initFlyScene();
  if(sc){sc.resize(); sc.start();}
  /* 第一只：直接到达，不飞行 */
  st.flyFrom=st.hearts[0]; st.flyTo=st.hearts[0];
  if(sc){
    sc.goto(st.hearts[0], showCatPanel);
  } else {
    showCatPanel(st.hearts[0]);
  }
}
function showCatPanel(i){
  var cat=CATS[i];
  Q('panelName').textContent=cat.name;
  Q('panelMeta').textContent=cat.country+' · '+cat.city;
  Q('panelIntro').textContent=cat.intro;
  Q('panelTags').innerHTML=cat.traits.map(function(t){return '<span>'+t+'</span>';}).join('');
  var img=Q('panelImg'); img.src='';
  setImg(img,cat.img,function(){img.style.display='none';});
  img.style.display='';
  document.body.classList.add('fly-arrived');
  Q('flyStatus').textContent='已到达 · '+cat.city;
  updateFlyHud();
}
function updateFlyHud(){
  var n=st.hearts.length;
  Q('flyMid').textContent=(st.flyIdx+1)+' / '+n;
}
function flyNext(){
  var n=st.hearts.length;
  if(n<2)return;
  var from=st.hearts[st.flyIdx];
  st.flyIdx=(st.flyIdx+1)%n;
  var to=st.hearts[st.flyIdx];
  st.flyFrom=from; st.flyTo=to;
  document.body.classList.remove('fly-arrived');
  updateFlyHud();
  if(F){F.fly(from,to,showCatPanel);} else {showCatPanel(to);}
}
function flyPrev(){
  var n=st.hearts.length;
  if(n<2)return;
  var from=st.hearts[st.flyIdx];
  st.flyIdx=(st.flyIdx-1+n)%n;
  var to=st.hearts[st.flyIdx];
  st.flyFrom=from; st.flyTo=to;
  document.body.classList.remove('fly-arrived');
  updateFlyHud();
  if(F){F.fly(from,to,showCatPanel);} else {showCatPanel(to);}
}

/* ===== 基因解析页 ===== */
function enterGene(){
  if(st.hearts.length===0)return;
  setPage('gene');
  renderGene();
}
function renderGene(){
  var hearts=st.hearts.map(function(i){return CATS[i];});
  var n=hearts.length;

  /* 六维均值 */
  var avg=[0,0,0,0,0,0];
  hearts.forEach(function(c){for(var k=0;k<6;k++)avg[k]+=c.stats[k];});
  for(var k=0;k<6;k++)avg[k]=avg[k]/n;
  var peak=0; for(var k=1;k<6;k++)if(avg[k]>avg[peak])peak=k;

  /* 标题 */
  Q('geneTitle').textContent='你的爱猫基因';
  Q('geneSubtitle').textContent='基于你心动的 '+n+' 只小猫生成';

  /* 人格描述 */
  Q('genePersona').innerHTML='<span class="title">爱猫人格</span>'+personaText(avg,peak,hearts);

  /* 雷达图 */
  Q('radarWrap').innerHTML=statsRadar(avg,peak);

  /* 地区构成 */
  var regionCount={};
  hearts.forEach(function(c){regionCount[c.region]=(regionCount[c.region]||0)+1;});
  Q('regionBars').innerHTML=geneBars(regionCount,REGION_LABEL,REGION_ORDER,n);

  /* 特征构成 */
  var traitCount={};
  hearts.forEach(function(c){c.traits.forEach(function(t){traitCount[t]=(traitCount[t]||0)+1;});});
  var traitKeys=Object.keys(traitCount).sort(function(a,b){return traitCount[b]-traitCount[a];}).slice(0,8);
  Q('traitBars').innerHTML=geneBars(traitCount,null,traitKeys,n);

  /* 心动列表 */
  var hl=Q('heartList');
  var hhtml='';
  hearts.forEach(function(c){
    hhtml+='<div class="item"><img alt="'+c.name+'" data-src="'+c.img+'"><div class="nm">'+c.name+'</div></div>';
  });
  hl.innerHTML=hhtml;
  hl.querySelectorAll('img').forEach(function(img){
    setImg(img,img.getAttribute('data-src'),function(){img.style.display='none';});
  });
}
function personaText(avg,peak,hearts){
  var dim=STATS_DIMS[peak];
  var n=hearts.length;
  var regions={};
  hearts.forEach(function(c){regions[c.region]=1;});
  var regionN=Object.keys(regions).length;
  var parts=[];
  parts.push('你最偏爱的基因维度是「'+dim+'」——在 '+n+' 只心动小猫中，这一项平均达到 '+avg[peak].toFixed(1)+' 分。');
  if(avg[1]>=4) parts.push('你是个"吸猫体质"——心动的猫大多亲人黏人，说明你渴望陪伴与回应。');
  else if(avg[3]>=4) parts.push('你偏爱独立自主的猫——说明你尊重边界感，喜欢有距离的温柔。');
  if(avg[0]>=4) parts.push('长毛派——你迷恋蓬松柔软的触感，愿意为打理毛发花时间。');
  else if(avg[0]<=2) parts.push('短毛派——你讲究清爽利落，不爱被浮毛困扰。');
  if(avg[2]>=4) parts.push('你爱活泼好动的猫，家里不会无聊，但也别指望它安静。');
  if(avg[5]>=3.5) parts.push('你心动了不少稀有品种——你是个有品味的猫圈行家。');
  parts.push('你的爱猫足迹跨越 '+regionN+' 个大洲——为了这些小猫，你确实飞遍了全球。');
  return parts.join(' ');
}

/* ===== 雷达图（内联 SVG） ===== */
function statsRadar(avg,peak){
  var RAD={n:6,cx:140,cy:124,r:84,pad:18};
  function xy(ratio,k){var a=-Math.PI/2+k*2*Math.PI/RAD.n;return [RAD.cx+RAD.r*ratio*Math.cos(a),RAD.cy+RAD.r*ratio*Math.sin(a)];}
  function pts(ratios){var s='';for(var k=0;k<RAD.n;k++){var p=xy(ratios[k]/5,k);s+=p[0].toFixed(1)+','+p[1].toFixed(1)+' ';}return s.trim();}
  var svg='<svg class="radar" viewBox="0 0 280 248" xmlns="http://www.w3.org/2000/svg">';
  for(var g=1;g<=5;g++){var pg=pts([g,g,g,g,g,g]);svg+='<polygon class="grid'+(g===5?' edge':'')+'" points="'+pg+'"/>';}
  for(var k=0;k<RAD.n;k++){var p=xy(1,k);svg+='<line class="axis" x1="'+RAD.cx+'" y1="'+RAD.cy+'" x2="'+p[0].toFixed(1)+'" y2="'+p[1].toFixed(1)+'"/>';}
  svg+='<polygon class="face" points="'+pts(avg)+'"/>';
  for(var k=0;k<RAD.n;k++){var p=xy(avg[k]/5,k);svg+='<circle class="dot" cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="3"/>';}
  for(var k=0;k<RAD.n;k++){
    var p=xy(1.18,k);
    svg+='<text class="lab'+(k===peak?' peak':'')+'" x="'+p[0].toFixed(1)+'" y="'+p[1].toFixed(1)+'" text-anchor="middle" dy="4">'+STATS_DIMS[k]+'</text>';
    var pv=xy(avg[k]/5+0.18,k);
    svg+='<text class="val" x="'+pv[0].toFixed(1)+'" y="'+pv[1].toFixed(1)+'" text-anchor="middle" dy="3">'+avg[k].toFixed(1)+'</text>';
  }
  svg+='</svg>';
  return svg;
}
function geneBars(count,labelMap,order,total){
  var html='';
  order.forEach(function(key){
    if(!count[key])return;
    var pct=count[key]/total*100;
    var lbl=labelMap?labelMap[key]:key;
    html+='<div class="gene-bar"><div class="lbl">'+lbl+'</div><div class="track"><div class="fill" style="width:'+pct.toFixed(1)+'%"></div></div><div class="num">'+count[key]+'</div></div>';
  });
  return html||'<div class="empty">暂无数据</div>';
}

/* ===== 事件绑定 ===== */
function bind(){
  var grid=Q('atlasGrid');
  grid.addEventListener('click',function(e){
    var hb=e.target.closest('[data-heart]');
    if(hb){toggleHeart(+hb.getAttribute('data-heart'));return;}
  });
  Q('startFlyBtn').addEventListener('click',enterFly);
  Q('geneFromAtlasBtn').addEventListener('click',enterGene);
  Q('flyPrevBtn').addEventListener('click',flyPrev);
  Q('flyNextBtn').addEventListener('click',flyNext);
  Q('flyGeneBtn').addEventListener('click',enterGene);
  Q('geneBackAtlasBtn').addEventListener('click',function(){setPage('atlas');if(F)F.stop();});
  Q('geneReflyBtn').addEventListener('click',enterFly);
  window.addEventListener('resize',function(){if(F&&st.page==='fly')F.resize();});
  window.addEventListener('keydown',function(e){
    if(st.page==='fly'){
      if(e.key==='ArrowRight')flyNext();
      else if(e.key==='ArrowLeft')flyPrev();
      else if(e.key==='Escape'){setPage('atlas');if(F)F.stop();}
    }
  });
}

/* ===== 启动 ===== */
function start(){
  loadHearts();
  renderAtlas();
  bind();
  Q('loader').classList.add('hide');
}
start();
})();
