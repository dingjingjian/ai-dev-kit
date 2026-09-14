(function(){
  'use strict';

  var FOODS=window.FOODS||[];
  var slot=document.getElementById('globeSlot');
  var canvas=document.getElementById('stage');
  var tagsLayer=document.getElementById('globeTags');
  var capName=document.getElementById('capName');
  var capCoord=document.getElementById('capCoord');
  var crumb=document.getElementById('crumb');
  var dName=document.getElementById('dName');
  var dLoc=document.getElementById('dLoc');
  var dIntro=document.getElementById('dIntro');
  var dIng=document.getElementById('dIng');
  var dTags=document.getElementById('dTags');
  var dThumb=document.getElementById('dThumb');
  var dNext=document.getElementById('dNext');
  var dAdd=document.getElementById('dAdd');
  var dishBody=document.getElementById('dishBody');
  var menuList=document.getElementById('menuList');
  var tabsEl=document.getElementById('tabs');
  var svImg=document.getElementById('svImg');
  var svName=document.getElementById('svName');
  var svLoc=document.getElementById('svLoc');
  var svIntro=document.getElementById('svIntro');
  var svProg=document.getElementById('svProg');
  var sumProg=document.getElementById('sumProg');
  var svNext=document.getElementById('svNext');
  var svCrumb=document.getElementById('svCrumb');
  var sumBars=document.getElementById('sumBars');
  var sumDishes=document.getElementById('sumDishes');
  var sumCount=document.getElementById('sumCount');
  var sumCont=document.getElementById('sumCont');
  var sumCountry=document.getElementById('sumCountry');
  var sumVerdict=document.getElementById('sumVerdict');
  var sumBody=document.getElementById('sumBody');
  var orderCountEl=document.getElementById('orderCount');
  var orderBtn=document.getElementById('orderBtn');
  var orderClear=document.getElementById('orderClear');
  var hintEl=document.getElementById('hint');
  var menuTtl=document.getElementById('menuTtl');
  var menuSub=document.getElementById('menuSub');
  var menuStat=document.getElementById('menuStat');
  var sumKcal=document.getElementById('sumKcal');

  /* ================= 数据与状态 ================= */
  var CONT_ORDER=['asia','europe','africa','nam','sam','oce'];
  var CONT_LABEL={asia:'亚洲',europe:'欧洲',africa:'非洲',nam:'北美洲',sam:'南美洲',oce:'大洋洲'};
  var TASTE_DIMS=['甜','辣','酸','咸','鲜','香'];   // 顺序须与 foods.js 的 taste 数组一致
  var st={page:'menu',continent:'all',sel:0,order:[],serving:false,serveIdx:0};

  /* ===== 大洲主题：配色在 index.html 的 body[data-ctn] 里，这里只管横幅上的字 ===== */
  var THEME={
    all:   {ttl:'菜　单',tag:'寰宇小馆 · 世界美食大百科'},
    asia:  {ttl:'亚洲',  tag:'稻米、汤面与炭火'},
    europe:{ttl:'欧洲',  tag:'麦香、乳酪与慢炖'},
    africa:{ttl:'非洲',  tag:'香料、陶釜与共享'},
    nam:   {ttl:'北美洲',tag:'炭烤、玉米与街角'},
    sam:   {ttl:'南美洲',tag:'火、盐与太平洋'},
    oce:   {ttl:'大洋洲',tag:'海洋、地炉与牧场'}
  };
  /* ===== 热量口径（总结页用）=====
     kcal 写在 foods.js 每条记录里，为「成品一份」的估算值；
     DAILY 取成人日均参考摄入 2000 千卡；WALK 为 60 公斤成人快走 6 公里/小时的
     代谢当量折算（MET 5 × 3.5 × 60 / 200 ≈ 5.2 千卡/分钟）。 */
  var KCAL_DAY=2000, WALK_PER_MIN=5.2;
  function kcalOf(f){return (f&&typeof f.kcal==='number')?f.kcal:0;}
  function fmtK(v){return String(v).replace(/\B(?=(\d{3})+(?!\d))/g,',');}
  function kcRow(k,w,v,over){
    return '<div class="kc-row'+(over?' over':'')+'">'+
      '<span class="kc-k">'+k+'</span>'+
      '<span class="kc-t"><i style="width:'+Math.max(0,Math.min(100,Math.round(w)))+'%"></i></span>'+
      '<span class="kc-v">'+v+'</span></div>';
  }

  /* ================= 颜色与菜品图（图可缺，回退色卡）================= */
  function hex2rgb(h){h=String(h).replace('#','');return [parseInt(h.substr(0,2),16),parseInt(h.substr(2,2),16),parseInt(h.substr(4,2),16)];}
  function rgb2hex(r){function f(v){v=Math.max(0,Math.min(255,Math.round(v)));return ('0'+v.toString(16)).slice(-2);}return '#'+f(r[0])+f(r[1])+f(r[2]);}
  function lighten(h,a){var r=hex2rgb(h);return rgb2hex([r[0]+(255-r[0])*a,r[1]+(255-r[1])*a,r[2]+(255-r[2])*a]);}
  function darken(h,a){var r=hex2rgb(h);return rgb2hex([r[0]*(1-a),r[1]*(1-a),r[2]*(1-a)]);}
  function plateGrad(c){return 'radial-gradient(circle at 32% 26%,'+lighten(c,.3)+','+c+' 56%,'+darken(c,.36)+' 100%)';}
  // IMG_OK[name]: true 图可用 / false 无图或加载失败 / null 检测中 —— 结果决定走图还是走色卡
  var IMG_OK={};
  FOODS.forEach(function(f,i){
    if(!f.img){IMG_OK[f.name]=false;return;}
    IMG_OK[f.name]=null;
    var im=new Image();
    im.onload=function(){IMG_OK[f.name]=true;repaintThumbs(i);};
    im.onerror=function(){IMG_OK[f.name]=false;};
    im.src=f.img;
  });
  function thumbStyle(f){
    if(f.img&&IMG_OK[f.name]===true)
      return "background-image:url('"+f.img+"');background-size:cover;background-position:center";
    return 'background:'+plateGrad(f.color||'#a52a1f');
  }
  function repaintThumbs(i){
    var f=FOODS[i];
    var m=menuList.querySelector('.mrow[data-idx="'+i+'"] .mthumb');
    if(m)m.setAttribute('style',thumbStyle(f));
    if(i===st.sel){
      dThumb.setAttribute('style',thumbStyle(f));
      if(st.page==='serve')svImg.setAttribute('style',thumbStyle(f));
    }
  }
  function up(el,cls){
    while(el&&el!==document){
      if(el.className&&String(el.className).split(/\s+/).indexOf(cls)>=0)return el;
      el=el.parentNode;
    }
    return null;
  }

  /* ================= 3D 地球组件（可降级）=================
     三层能力检测，任一不过就降级 —— 地球在这里只是「标产地」的组件，
     它跑不起来不该连累整页（菜单 / 菜品 / 点单 / 品鉴 / 总结全部照常）：
       ① 拿得到 WebGL 上下文吗（webgl2 或 webgl）；
       ② three.min.js 加载上了吗（typeof THREE）；
       ③ 建场景这一段会不会抛异常（外面用 try/catch 兜住）。
     任一不过 → G 为 null → 地球槽内显示 .globe-down，页面其余部分不受影响。
     （旧写法是直接 show 一张全屏「无法启动 3D 场景」盖住整页并 return，
      等于把「球转不起来」判成「整页不可用」—— 本末倒置。） */
  var gl=null;try{gl=canvas.getContext('webgl2')||canvas.getContext('webgl');}catch(e){}
  var HAS3D=!!(gl&&typeof THREE!=='undefined');
  var G=null;
  if(HAS3D){try{G=(function(){

  var renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
  renderer.outputEncoding=THREE.sRGBEncoding;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.08;

  var scene=new THREE.Scene();
  var camera=new THREE.PerspectiveCamera(52,1,0.1,5000);
  var W=2,H=2,sizeDirty=true;
  var R=1.6;

  // 背景星空天球（程序化，暖调 —— 与馆内枣木/铜一色，不用冷黑紫）
  function starfieldTex(){
    var w=2048,h=1024,c=document.createElement('canvas');c.width=w;c.height=h;var x=c.getContext('2d');
    var bg=x.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#160a05');bg.addColorStop(.5,'#22110a');bg.addColorStop(1,'#160a05');
    x.fillStyle=bg;x.fillRect(0,0,w,h);
    x.save();x.translate(w/2,h/2);x.rotate(-0.4);x.translate(-w/2,-h/2);
    for(var i=0;i<22;i++){var px=Math.random()*w,py=h/2+(Math.random()-0.5)*h*0.3,r=90+Math.random()*220;
      var gg=x.createRadialGradient(px,py,0,px,py,r),hue=Math.random(),c1=hue<.45?'rgba(216,150,86,':(hue<.75?'rgba(196,124,70,':'rgba(176,104,96,');
      gg.addColorStop(0,c1+(0.05+Math.random()*.06)+')');gg.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=gg;x.fillRect(0,0,w,h);}
    x.restore();
    for(var i2=0;i2<4200;i2++){var qx=Math.random()*w,qy=Math.random()*h,b=.15+Math.random()*.5;
      x.fillStyle='rgba(255,226,190,'+b+')';x.fillRect(qx,qy,1,1);}
    for(var i3=0;i3<220;i3++){var rx=Math.random()*w,ry=Math.random()*h,b2=.82+Math.random()*.18;
      x.fillStyle='rgba(255,236,210,'+b2+')';x.fillRect(rx,ry,1,1);}
    var t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;
  }
  var sky=new THREE.Mesh(new THREE.SphereGeometry(2600,48,32),
    new THREE.MeshBasicMaterial({map:starfieldTex(),side:THREE.BackSide,depthWrite:false}));
  scene.add(sky);

  var ambient=new THREE.AmbientLight(0x6a4a30,1.0);scene.add(ambient);
  var lampLight=new THREE.PointLight(0xffd8a8,2.2,0,1.3);lampLight.position.set(18,7,14);scene.add(lampLight);
  var fillLight=new THREE.PointLight(0x8a6a40,0.8,0,1.3);fillLight.position.set(-16,-6,-12);scene.add(fillLight);
  var candleLight=new THREE.PointLight(0xff9a52,0.7,300,1.6);candleLight.position.set(-26,-30,18);scene.add(candleLight);

  function radialTex(c0,c1,c2){
    var c=document.createElement('canvas');c.width=c.height=128;var x=c.getContext('2d'),g=x.createRadialGradient(64,64,0,64,64,64);
    g.addColorStop(0,c0);g.addColorStop(.4,c1);g.addColorStop(1,c2);x.fillStyle=g;x.fillRect(0,0,128,128);
    return new THREE.CanvasTexture(c);
  }
  function plainTex(col){var c=document.createElement('canvas');c.width=c.height=4;var x=c.getContext('2d');x.fillStyle=col;x.fillRect(0,0,4,4);return new THREE.CanvasTexture(c);}

  // 经纬度 → 球面坐标（与 SphereGeometry 贴图 UV 对齐）
  function ll2v(lat,lon,r){
    var th=(90-lat)*Math.PI/180,p=(lon+180)/360*Math.PI*2;
    return new THREE.Vector3(-r*Math.cos(p)*Math.sin(th),r*Math.cos(th),r*Math.sin(p)*Math.sin(th));
  }

  // ===== 地球本体 =====
  var earthTilt=new THREE.Group();earthTilt.rotation.z=23.5*Math.PI/180;scene.add(earthTilt);
  var earthGroup=new THREE.Group();earthTilt.add(earthGroup);          // 不再自转，保留分组便于后续加动画
  // 地球贴图乘一层暖棕 tint，海洋的冷蓝压成旧地图的沉色调，贴合馆内木铜色系
  var earthMat=new THREE.MeshStandardMaterial({map:plainTex('#2a5a9a'),color:0xd8c2a4,roughness:.82,metalness:.06});
  var earthMesh=new THREE.Mesh(new THREE.SphereGeometry(R,64,44),earthMat);earthGroup.add(earthMesh);
  var cloudMat=new THREE.MeshStandardMaterial({map:plainTex('#ffffff'),transparent:true,alphaMap:plainTex('#ffffff'),opacity:.34,roughness:1,depthWrite:false});
  var clouds=new THREE.Mesh(new THREE.SphereGeometry(R*1.012,48,32),cloudMat);earthTilt.add(clouds);
  var atmo=new THREE.Mesh(new THREE.SphereGeometry(R*1.06,48,32),
    new THREE.MeshBasicMaterial({color:0xc9883c,side:THREE.BackSide,transparent:true,opacity:.18,blending:THREE.AdditiveBlending,depthWrite:false}));
  earthTilt.add(atmo);

  // ===== 标记点：全部建好，按选中状态决定显隐（选中实心光晕，同菜系压暗）=====
  var markerGroup=new THREE.Group();earthGroup.add(markerGroup);
  var glowTex=radialTex('rgba(255,220,180,.95)','rgba(255,140,60,.45)','rgba(255,100,30,0)');
  var ringTex=radialTex('rgba(255,200,140,.7)','rgba(255,140,60,.25)','rgba(255,100,30,0)');
  var markers=[];
  (function buildMarkers(){
    for(var i=0;i<FOODS.length;i++){
      var f=FOODS[i];
      var grp=new THREE.Group();
      grp.position.copy(ll2v(f.lat,f.lon,R*1.012));
      grp.lookAt(0,0,0);grp.rotateX(Math.PI);            // 让标记点 +Z 朝球面外法线
      var col=new THREE.Color(f.color);
      var dot=new THREE.Mesh(new THREE.SphereGeometry(0.052,14,14),new THREE.MeshBasicMaterial({color:col}));
      var glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,depthTest:false,color:col}));
      glow.scale.set(0.46,0.46,1);
      var ring=new THREE.Sprite(new THREE.SpriteMaterial({map:ringTex,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,depthTest:false,color:col,opacity:.8}));
      ring.scale.set(0.72,0.72,1);
      grp.add(dot);grp.add(glow);grp.add(ring);
      markerGroup.add(grp);
      markers.push({food:f,grp:grp,dot:dot,glow:glow,ring:ring,dim:false,visible:false});
    }
  })();

  var stars=(function(){
    var n=2600,geo=new THREE.BufferGeometry(),pos=new Float32Array(n*3),col=new Float32Array(n*3);
    for(var i=0;i<n;i++){var u=Math.random()*2-1,v=Math.random()*6.2832,s=Math.sqrt(1-u*u),rr=900+Math.random()*560;
      pos[i*3]=rr*s*Math.cos(v);pos[i*3+1]=rr*u;pos[i*3+2]=rr*s*Math.sin(v);
      var b=.25+Math.random()*.75,t=Math.random();
      if(t<.2){col[i*3]=b;col[i*3+1]=b*.85;col[i*3+2]=b*.7;}
      else{col[i*3]=b;col[i*3+1]=b*.96;col[i*3+2]=b*.9;}}
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    geo.setAttribute('color',new THREE.BufferAttribute(col,3));
    var p=new THREE.Points(geo,new THREE.PointsMaterial({size:0.5,sizeAttenuation:true,vertexColors:true,transparent:true,opacity:.9,depthWrite:false}));
    scene.add(p);return p;
  })();

  var texLoader=new THREE.TextureLoader();texLoader.setCrossOrigin('anonymous');
  var maxA=renderer.capabilities.getMaxAnisotropy();
  function loadTex(u,ok){texLoader.load(u,ok,undefined,function(){});}
  loadTex('./assets/earth.jpg',function(t){t.encoding=THREE.sRGBEncoding;t.anisotropy=maxA;earthMat.map=t;earthMat.needsUpdate=true;});
  loadTex('./assets/clouds.png',function(t){t.anisotropy=maxA;cloudMat.map=t;cloudMat.alphaMap=t;cloudMat.needsUpdate=true;});

  /* ================= 相机：始终对准当前菜品 ================= */
  var baseT=0,baseP=1.2;                 // 用户拖动后的基准朝向
  var camT=0,camP=1.2,camR=5;            // 当前值
  var camTG=0,camPG=1.2,camRG=5;         // 目标值
  var fitR=5,R_MIN=3,R_MAX=12,userZoomed=false,playing=false;

  function fitDist(){
    var vF=camera.fov*Math.PI/180;
    var hF=2*Math.atan(Math.tan(vF/2)*camera.aspect);
    var lim=Math.min(vF,hF);
    return R/Math.sin(0.38*lim);         // 球体角直径约占限制视场的 76%
  }
  function resize(){
    var r=slot.getBoundingClientRect();
    var w=Math.round(r.width),h=Math.round(r.height);
    if(w<10||h<10){sizeDirty=true;return;}
    sizeDirty=false;W=w;H=h;
    camera.aspect=W/H;camera.updateProjectionMatrix();
    renderer.setSize(W,H,false);
    fitR=fitDist();
    R_MIN=fitR*0.6;R_MAX=fitR*2.6;
    if(!userZoomed)camRG=fitR;
    camR=Math.min(R_MAX,Math.max(R_MIN,camR));
  }
  function aimDish(instant){
    var f=FOODS[st.sel];if(!f)return;
    var local=ll2v(f.lat,f.lon,1);
    var e=earthGroup.rotation.y,cs=Math.cos(e),sn=Math.sin(e);
    var wx=local.x*cs+local.z*sn,wy=local.y,wz=-local.x*sn+local.z*cs;
    baseP=Math.acos(Math.max(-1,Math.min(1,wy)));
    baseT=Math.atan2(wx,wz);
    if(instant){camT=baseT;camP=baseP;camTG=baseT;camPG=baseP;}
  }
  function camPos(){
    var sp=Math.sin(camP);
    camera.position.set(camR*sp*Math.sin(camT),camR*Math.cos(camP),camR*sp*Math.cos(camT));
    camera.lookAt(0,0,0);
  }

  /* ================= 手势：拖动转动、滚轮 / 双指缩放 ================= */
  var pointers={},dragId=null,pinch=0,lx=0,ly=0;
  function pCount(){var n=0,k;for(k in pointers)if(pointers[k])n++;return n;}
  function stopDrag(){dragId=null;}
  function tdist(t){return Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);}
  canvas.addEventListener('pointerdown',function(e){
    pointers[e.pointerId]={x:e.clientX,y:e.clientY};
    if(pCount()>1){stopDrag();return;}
    dragId=e.pointerId;lx=e.clientX;ly=e.clientY;
    try{canvas.setPointerCapture(e.pointerId);}catch(_){}
  });
  function onPointerEnd(e){
    delete pointers[e.pointerId];
    if(dragId===e.pointerId)stopDrag();
    try{canvas.releasePointerCapture(e.pointerId);}catch(_){}
    if(pCount()===1){for(var id in pointers)if(pointers[id]){dragId=Number(id);lx=pointers[id].x;ly=pointers[id].y;break;}}
  }
  canvas.addEventListener('pointerup',onPointerEnd);
  canvas.addEventListener('pointercancel',onPointerEnd);
  canvas.addEventListener('pointermove',function(e){
    var p=pointers[e.pointerId];if(!p)return;
    var nx=e.clientX,ny=e.clientY;
    p.x=nx;p.y=ny;
    if(e.pointerId!==dragId||pCount()>1)return;
    baseT-=(nx-lx)*0.006;baseP-=(ny-ly)*0.006;
    baseP=Math.max(0.08,Math.min(Math.PI-0.08,baseP));
    lx=nx;ly=ny;
  });
  canvas.addEventListener('wheel',function(e){
    e.preventDefault();
    camRG*=1+Math.sign(e.deltaY)*0.08;
    camRG=Math.max(R_MIN,Math.min(R_MAX,camRG));
    userZoomed=true;
  },{passive:false});
  canvas.addEventListener('touchstart',function(e){if(e.touches.length===2){stopDrag();pinch=tdist(e.touches);}},{passive:true});
  canvas.addEventListener('touchend',function(e){if(e.touches.length<2)pinch=0;},{passive:true});
  canvas.addEventListener('touchcancel',function(){pinch=0;},{passive:true});
  canvas.addEventListener('touchmove',function(e){
    if(e.touches.length!==2)return;e.preventDefault();
    var d=tdist(e.touches);
    if(pinch>12&&d>12){camRG*=pinch/d;camRG=Math.max(R_MIN,Math.min(R_MAX,camRG));userZoomed=true;}
    pinch=d;
  },{passive:false});

  /* ================= 城市竹签牌：只标当前菜品 ================= */
  var tagEl=document.createElement('div');tagEl.className='tag';tagsLayer.appendChild(tagEl);
  var _v=new THREE.Vector3(),_n=new THREE.Vector3(),_d=new THREE.Vector3();
  function updateTag(){
    var m=markers[st.sel];
    if(!m||!m.visible){tagEl.style.opacity='0';return;}
    _v.setFromMatrixPosition(m.grp.matrixWorld);_v.project(camera);
    m.grp.getWorldPosition(_n);
    _d.copy(camera.position).sub(_n).normalize();_n.normalize();
    var front=(_v.z<1)&&(_n.dot(_d)>=0.2);            // 背面剔除：光圈 depthTest=false 须手动遮挡
    m.glow.visible=front;m.ring.visible=front;
    if(!front){tagEl.style.opacity='0';return;}
    tagEl.style.left=((_v.x*0.5+0.5)*W).toFixed(1)+'px';
    tagEl.style.top=((-_v.y*0.5+0.5)*H).toFixed(1)+'px';
    tagEl.style.opacity='1';
  }

  /* ================= 标记点显隐与脉动 ================= */
  function refreshMarkers(){
    var cur=FOODS[st.sel];
    for(var i=0;i<markers.length;i++){
      var m=markers[i];
      var sel=(i===st.sel);
      var dim=(!sel&&cur&&m.food.continent===cur.continent);
      m.visible=sel||dim;m.dim=dim;
      m.grp.visible=m.visible;
      m.glow.visible=sel;m.ring.visible=sel;
      m.dot.scale.setScalar(sel?1:0.66);
      m.dot.material.color.set(sel?'#ffffff':dim?'#f0d9b0':'#ffffff');
      m.dot.visible=sel||dim;
    }
  }
  function pulseMarkers(t){
    var m=markers[st.sel];
    if(!m||!m.visible)return;
    var p=0.5+0.5*Math.sin(t*2.6);
    var f=1+focusFlash*1.6;                          // 定位到本菜时闪一下，给出可见反馈
    var g=0.46*(1+0.3*p)*f,r=0.72*(1+0.36*p)*f;
    m.glow.scale.set(g,g,1);m.ring.scale.set(r,r,1);
  }

  /* ================= 视图初始化 ================= */
  var showStars=true,showClouds=true;
  var focusFlash=0;                                 // 定位后的标记点高亮，动画里衰减
  function fitView(keepZoom){
    aimDish(false);
    if(!keepZoom)userZoomed=false;
    camRG=userZoomed?camRG:fitR;
  }

  /* ================= 动画 ================= */
  var clock=new THREE.Clock();
  var running=true,perfAcc=0,perfN=0,dprStep=Math.min(devicePixelRatio||1,2);
  function globeVisible(){return st.page==='dish';}
  function animate(){
    if(!running)return;
    requestAnimationFrame(animate);
    var dt=clock.getDelta(),t=performance.now()*0.001;
    if(sizeDirty)resize();
    if(!globeVisible())return;
    if(playing){
      // 以菜品朝向为基准缓慢摆头，地理位置始终留在视野中央。
      // 幅度 ±0.42 rad / 周期约 39s —— 原 ±0.17 rad 实测两帧像素差仅 0.12，
      // 肉眼读成静止，等于开关没作用；放大到可辨但仍属"缓慢"。
      camTG=baseT+0.42*Math.sin(t*0.16);
      camPG=baseP+0.09*Math.sin(t*0.16+1.2);
      camPG=Math.max(0.08,Math.min(Math.PI-0.08,camPG));
      clouds.rotation.y+=dt*0.02;
      stars.rotation.y+=dt*0.003;
    }else{
      camTG=baseT;camPG=baseP;
    }
    if(focusFlash>0)focusFlash=Math.max(0,focusFlash-dt*0.55);
    camT+=(camTG-camT)*0.09;camP+=(camPG-camP)*0.09;camR+=(camRG-camR)*0.1;
    camPos();
    lampLight.position.copy(camera.position);lampLight.position.y+=3;   // 主光跟随镜头，正面始终被照亮
    renderer.render(scene,camera);
    pulseMarkers(t);
    updateTag();
    perfAcc+=dt;perfN++;
    if(perfN>=30){
      var avg=perfAcc/perfN;perfAcc=0;perfN=0;
      if(avg>0.045&&dprStep>1){dprStep=Math.max(1,dprStep-0.25);renderer.setPixelRatio(dprStep);resize();}
    }
  }
  window.addEventListener('resize',function(){sizeDirty=true;resize();});
  window.addEventListener('orientationchange',function(){setTimeout(function(){sizeDirty=true;resize();},220);});
  document.addEventListener('visibilitychange',function(){
    if(document.hidden){running=false;}
    else if(!running){running=true;clock.getDelta();animate();}
  });
  /* 上下文丢失（切换后台、显存回收）不再全屏报错：停掉渲染循环、
     在地球槽内挂降级层，页面其余部分继续可用。 */
  canvas.addEventListener('webglcontextlost',function(e){
    e.preventDefault();running=false;
    var gd=document.getElementById('globeDown');
    if(gd)gd.className='globe-down show';
  },false);

  /* 对外只暴露 UI 层需要的这几个入口 —— 没有 3D 时调用方拿不到 G，自然不会调 */
  return {
    resize:resize,
    markDirty:function(){sizeDirty=true;},
    aimDish:aimDish,
    fitView:fitView,
    refreshMarkers:refreshMarkers,
    setTag:function(t){tagEl.textContent=t;},
    start:animate
  };
  })();}catch(e){G=null;}}
  if(!G){
    var gd=document.getElementById('globeDown');
    if(gd)gd.className='globe-down show';
  }

  /* ================= 大洲主题与横幅文案 ================= */
  // 配色本身在 index.html（body[data-ctn] 下的一整套 CSS 变量），这里只切属性 + 换横幅上的字。
  // 归属规则：菜单页跟页签（st.continent），菜品页 / 品鉴页跟当前这道菜所属大洲，
  // 总结页是整席结论（可能跨洲）故回到 all。这样在「全部」下按「下一道」跨洲翻菜时，
  // 配色随菜换装；回菜单时由 showMenu() 还原成页签主题。
  function countStat(c){
    var d=0,cs={};
    for(var i=0;i<FOODS.length;i++){
      var f=FOODS[i];
      if(c!=='all'&&f.continent!==c)continue;
      d++;cs[f.country]=1;
    }
    return {dishes:d,countries:Object.keys(cs).length};
  }
  function applyTheme(c){
    document.body.setAttribute('data-ctn',c);
    var t=THEME[c]||THEME.all,s=countStat(c);
    menuTtl.textContent=t.ttl;
    menuSub.textContent=t.tag;
    menuStat.textContent=s.dishes+' 道菜 · '+s.countries+' 国'+(c==='all'?' · 6 大洲':'');
  }

  /* ================= 菜单渲染 ================= */
  function thumbOf(f){return '<div class="mthumb" style="'+thumbStyle(f)+'"></div>';}
  function renderMenu(){
    var groups=st.continent==='all'?CONT_ORDER:[st.continent];
    var html='';
    for(var gi=0;gi<groups.length;gi++){
      var c=groups[gi],items=[];
      for(var i=0;i<FOODS.length;i++)if(FOODS[i].continent===c)items.push(i);
      if(!items.length)continue;
      html+='<div class="sec">'+CONT_LABEL[c]+'</div>';
      for(var k=0;k<items.length;k++){
        var idx=items[k],f=FOODS[idx],added=st.order.indexOf(idx)>=0;
        html+='<div class="mrow'+(added?' added':'')+'" data-idx="'+idx+'">'+
          thumbOf(f)+
          '<div class="mname">'+f.name+'</div>'+
          '<div class="mlead"></div>'+
          '<div class="mmeta">'+f.country+' · '+f.city+'</div>'+
          '<button class="madd" data-add="'+idx+'">'+(added?'✓':'+')+'</button>'+
        '</div>';
      }
    }
    var sc=menuList.scrollTop;
    menuList.innerHTML=html;
    menuList.scrollTop=sc;
  }
  tabsEl.addEventListener('click',function(e){
    // 注意：up() 按 className 匹配，页签按钮没有固定 class，必须按标签名找
    var b=e.target;
    while(b&&b!==tabsEl&&b.tagName!=='BUTTON')b=b.parentNode;
    if(!b||b===tabsEl||b.tagName!=='BUTTON')return;
    st.continent=b.getAttribute('data-c');
    var all=tabsEl.querySelectorAll('button');
    for(var i=0;i<all.length;i++)all[i].className=(all[i]===b?'on':'');
    applyTheme(st.continent);
    renderMenu();
  });
  menuList.addEventListener('click',function(e){
    var add=up(e.target,'madd');
    if(add){toggleOrder(parseInt(add.getAttribute('data-add'),10));return;}
    var row=up(e.target,'mrow');
    if(row)openDish(parseInt(row.getAttribute('data-idx'),10));
  });

  /* ================= 点单与上菜 ================= */
  function toggleOrder(idx){
    var p=st.order.indexOf(idx);
    if(p>=0)st.order.splice(p,1);else st.order.push(idx);
    if(!st.order.length){st.serving=false;}
    syncOrder();renderMenu();
    if(st.page==='dish')syncDishOrderState();
  }
  function syncOrder(){
    orderCountEl.textContent=st.order.length;
    orderBtn.disabled=st.order.length===0;
    orderBtn.textContent=st.order.length===0?'请先点单':'开始上菜 ('+st.order.length+')';
    orderClear.style.display=st.order.length?'inline-block':'none';
  }
  function syncDishOrderState(){
    var added=st.order.indexOf(st.sel)>=0;
    dAdd.className='obtn ghost'+(added?' on':'');
    dAdd.textContent=added?'已点 ✓':'加入点单';
  }
  function visibleIdx(){
    var r=[];
    for(var i=0;i<FOODS.length;i++)if(st.continent==='all'||FOODS[i].continent===st.continent)r.push(i);
    return r;
  }
  /* 上菜走独立的品鉴页（大图欣赏），不复用菜品详情页 */
  function startServing(){
    if(!st.order.length)return;
    st.serving=true;st.serveIdx=0;
    openCourse(st.order[0]);
  }
  function openCourse(idx){
    if(isNaN(idx))return;
    st.sel=idx;st.page='serve';
    document.body.className='mode-serve';
    var f=FOODS[idx];
    applyTheme(f.continent);
    svImg.setAttribute('style',thumbStyle(f));
    svName.textContent=f.name;
    svLoc.textContent=f.country+' · '+f.city;
    svIntro.textContent=f.intro;
    capName.textContent=f.name;
    capCoord.textContent=fmtCoord(f.lat,f.lon);
    svCrumb.textContent=CONT_LABEL[f.continent]+' · '+f.name;
    if(G)G.setTag(f.city);
    svProg.innerHTML='第 <b>'+(st.serveIdx+1)+'</b> / '+st.order.length+' 道';
    svNext.textContent=(st.serveIdx+1>=st.order.length)?'风味总结 ›':'下一道 ›';
    if(G){G.refreshMarkers();G.aimDish(false);G.fitView(false);G.markDirty();}
  }
  function nextCourse(){                            // 品鉴页「下一道」
    if(st.serveIdx+1>=st.order.length){showSummary();return;}
    st.serveIdx++;openCourse(st.order[st.serveIdx]);
  }
  function quitServing(){                           // 中途退出：结束品鉴回菜单
    st.serving=false;st.serveIdx=0;
    showMenu();
  }
  /* 热量合计：本席总热量 / 日均占比 / 每道均值 / 最重与最轻 / 快走折算。
     口径与常量见上方的 KCAL_DAY、WALK_PER_MIN */
  function renderKcal(){
    var n=st.order.length;
    if(!n){sumKcal.innerHTML='<div class="kc-note">本席尚无菜品。</div>';return;}
    var total=0,max=-1,min=Infinity,maxF=null,minF=null,i,f,k;
    for(i=0;i<n;i++){
      f=FOODS[st.order[i]];k=kcalOf(f);total+=k;
      if(k>=max){max=k;maxF=f;}
      if(k<=min){min=k;minF=f;}
    }
    var avg=Math.round(total/n),pct=Math.round(total/KCAL_DAY*100);
    var h='<div class="kc-total"><b>'+fmtK(total)+'</b><span>千卡 · 本席 '+n+' 道合计</span></div>';
    h+=kcRow('占日均',pct,pct+'%',pct>100);
    h+=kcRow('每道均值',avg/9,avg+' 千卡',false);            // 满格按 900 千卡/道
    h+=kcRow('最重',100,maxF.name+' · '+max+' 千卡',false);
    h+=kcRow('最轻',max?min/max*100:0,minF.name+' · '+min+' 千卡',false);
    h+='<div class="kc-note">以 60 公斤成人计，快走（6 公里 / 小时）约 '+
       fmtK(Math.round(total/WALK_PER_MIN))+' 分钟可消耗。热量为成品一份的估算值，实际随分量与做法浮动。</div>';
    sumKcal.innerHTML=h;
  }

  /* ===== 六维口味图谱：雷达图（内联 SVG，零依赖）=====
     顶点自正上方起顺时针排布，顺序与 TASTE_DIMS 一致；网格取自 --line / --line-2、
     数据面取自 --red，故随大洲主题一起换色。每条轴端标维度的 Mean 值（一位小数）。
     换成雷达图的缘由：条图把六味排成六行，读的是"谁最长"；雷达图直接给出本席的味型轮廓，
     是"鲜香为主、偏三角形"还是"六味均衡、接近正六边形"，一眼成形。 */
  var RADAR={n:6,cx:136,cy:124,r:80,pad:18};                     // pad：轴端到文字的余量
  function radarXY(ratio,k){
    var a=-Math.PI/2+k*2*Math.PI/RADAR.n;
    return [RADAR.cx+RADAR.r*ratio*Math.cos(a),RADAR.cy+RADAR.r*ratio*Math.sin(a)];
  }
  function radarPoints(ratios){
    var t=[];
    for(var k=0;k<RADAR.n;k++){var q=radarXY(ratios[k],k);t.push(q[0].toFixed(1)+','+q[1].toFixed(1));}
    return t.join(' ');
  }
  function tasteRadar(avg,peak){
    var rings=[.2,.4,.6,.8,1],face=[],i,a,s='';
    for(i=0;i<RADAR.n;i++)face.push(Math.max(0,Math.min(1,avg[i]/5)));
    s='<svg class="radar" viewBox="0 0 280 250" role="img" aria-label="六维口味图谱">';
    for(i=0;i<rings.length;i++){
      var even=[rings[i],rings[i],rings[i],rings[i],rings[i],rings[i]];
      s+='<polygon class="grid'+(i===rings.length-1?' edge':'')+'" points="'+radarPoints(even)+'"/>';
    }
    for(i=0;i<RADAR.n;i++){
      var e=radarXY(1,i);
      s+='<line class="axis" x1="'+RADAR.cx+'" y1="'+RADAR.cy+'" x2="'+e[0].toFixed(1)+'" y2="'+e[1].toFixed(1)+'"/>';
    }
    s+='<polygon class="face" points="'+radarPoints(face)+'"/>';
    for(i=0;i<RADAR.n;i++){
      var p=radarXY(face[i],i);
      s+='<circle class="dot" cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="3.2"/>';
    }
    /* 名称与数值同行排放（dx 横向留出间隔），不再换行到第二行 ——
       原来的第二行向内伸进了本轴顶点与数据面的地盘，满分时会糊在一起。 */
    for(i=0;i<RADAR.n;i++){
      a=-Math.PI/2+i*2*Math.PI/RADAR.n;
      var ca=Math.cos(a),sa=Math.sin(a);
      var lx=RADAR.cx+(RADAR.r+RADAR.pad)*ca;
      var ly=RADAR.cy+(RADAR.r+RADAR.pad)*sa+4;
      if(sa<-0.25)ly-=7; else if(sa>0.25)ly+=7;      // 正上 / 正下两轴再往外推，让开顶点
      var anchor=ca>0.25?'start':(ca<-0.25?'end':'middle');
      s+='<text class="lab'+(i===peak?' peak':'')+'" x="'+lx.toFixed(1)+'" y="'+ly.toFixed(1)+'" text-anchor="'+anchor+'">'+
         TASTE_DIMS[i]+'<tspan class="val" dx="5">'+avg[i].toFixed(1)+'</tspan></text>';
    }
    return s+'</svg>';
  }

  /* 品鉴完毕 → 本席风味总结：六维口味图谱 + 一句定评 + 每道菜的两味 + 覆盖统计 + 热量 */
  function showSummary(){
    st.serving=false;st.page='sum';
    document.body.className='mode-sum';
    applyTheme('all');                             // 总结跨洲，回到寰宇小馆本体色
    var n=st.order.length,i,k;
    var avg=[0,0,0,0,0,0];
    for(i=0;i<n;i++){
      var f=FOODS[st.order[i]];
      for(k=0;k<6;k++)avg[k]+=(f.taste?f.taste[k]:0);
    }
    for(k=0;k<6;k++)avg[k]=avg[k]/Math.max(1,n);
    // 六维图谱：峰位标红，其余随常规字色
    var peak=-1,pv=-1,low=-1,lv=9;
    for(k=0;k<6;k++){if(avg[k]>pv){pv=avg[k];peak=k;}if(avg[k]<lv){lv=avg[k];low=k;}}
    sumBars.innerHTML=tasteRadar(avg,peak);
    sumVerdict.innerHTML='本席以<em>'+TASTE_DIMS[peak]+'</em>味为主，'+
      (lv<1.5?'<em>'+TASTE_DIMS[low]+'</em>味几乎不显':'<em>'+TASTE_DIMS[low]+'</em>味最为克制');
    // 每道菜一行：色点 + 菜名 + 产地 + 该菜最突出的两味
    var dh='';
    for(i=0;i<n;i++){
      var d=FOODS[st.order[i]],t=d.taste||[0,0,0,0,0,0];
      var ord=[0,1,2,3,4,5].sort(function(a,b){return t[b]-t[a];}).slice(0,2);
      var tp=ord.map(function(j){return TASTE_DIMS[j]+t[j];}).join(' · ');
      dh+='<div class="sum-dish">'+
        '<span class="sum-dot" style="background:'+(d.color||'#a52a1f')+'"></span>'+
        '<span class="sum-dname">'+d.name+'</span>'+
        '<span class="sum-dmeta">'+d.country+' · '+d.city+'</span>'+
        '<span class="sum-dtags">'+tp+'</span>'+
      '</div>';
    }
    sumDishes.innerHTML=dh;
    sumCount.textContent=n;
    var conts={},cns={};
    for(i=0;i<n;i++){var g=FOODS[st.order[i]];conts[g.continent]=1;cns[g.country]=1;}
    sumCont.textContent=Object.keys(conts).length;
    sumCountry.textContent=Object.keys(cns).length;
    sumProg.innerHTML='本席 <b>'+n+'</b> 道 · <b>'+Object.keys(conts).length+'</b> 大洲';
    renderKcal();
    sumBody.scrollTop=0;
    if(G)G.markDirty();
  }
  function browseNext(){                            // 详情页「下一道」：当前菜系内顺次浏览
    var list=visibleIdx(),p=list.indexOf(st.sel);
    openDish(list[(p+1)%list.length]);
  }
  orderBtn.addEventListener('click',startServing);
  orderClear.addEventListener('click',function(){st.order.length=0;st.serving=false;syncOrder();renderMenu();});

  /* ================= 页面切换 ================= */
  function openDish(idx){
    if(isNaN(idx))return;
    st.sel=idx;st.page='dish';
    document.body.className='mode-dish';
    var f=FOODS[idx];
    applyTheme(f.continent);
    dName.textContent=f.name;
    dLoc.textContent=f.country+' · '+f.city;
    dIntro.textContent=f.intro;
    dThumb.setAttribute('style',thumbStyle(f));
    dIng.innerHTML=f.ingredients.map(function(t){return '<span>'+t+'</span>';}).join('');
    dTags.innerHTML=f.tags.map(function(t){return '<span>'+t+'</span>';}).join('');
    capName.textContent=f.name;
    capCoord.textContent=fmtCoord(f.lat,f.lon);
    crumb.textContent=CONT_LABEL[f.continent]+' · '+f.name;
    if(G)G.setTag(f.city);
    syncDishOrderState();
    hintGlobe();                                 // 地球只在这一页，介绍手势也留到这一页说
    if(G){G.refreshMarkers();G.aimDish(false);G.fitView(false);G.markDirty();}
    dishBody.scrollTop=0;
  }
  function showMenu(){
    st.page='menu';
    document.body.className='mode-menu';
    applyTheme(st.continent);
    renderMenu();syncOrder();
    if(G)G.markDirty();
  }
  document.getElementById('backBtn').addEventListener('click',showMenu);
  dNext.addEventListener('click',browseNext);
  dAdd.addEventListener('click',function(){toggleOrder(st.sel);});
  document.getElementById('svQuit').addEventListener('click',quitServing);
  svNext.addEventListener('click',nextCourse);
  document.getElementById('sumBack').addEventListener('click',showMenu);
  window.addEventListener('keydown',function(e){
    if(e.key==='Escape'){
      if(st.page==='serve')quitServing();
      else if(st.page==='dish'||st.page==='sum')showMenu();
    }
  });

  function fmtCoord(lat,lon){
    return Math.abs(lat).toFixed(1)+'°'+(lat>=0?'N':'S')+' '+Math.abs(lon).toFixed(1)+'°'+(lon>=0?'E':'W');
  }
  var toastT=null;
  /* 停留时长：一字一顿读下来约需 3 秒，原来 2 秒刚找准位置就淡出了。
     TOAST_MS 单独抽出来，嫌快嫌慢只改这一处。 */
  var TOAST_MS=3600;
  function toast(msg){
    hintEl.textContent=msg;hintEl.classList.add('show');
    clearTimeout(toastT);toastT=setTimeout(function(){hintEl.classList.remove('show');},TOAST_MS);
  }
  /* 地球只在菜品页出现，手势铺垫也只在该页首进时说一次 ——
     写在菜单页的启动 toast 里会指到本页不存在的东西上。 */
  var globeHinted=false;
  function hintGlobe(){
    if(globeHinted)return;
    globeHinted=true;
    // 没有 3D 时不说手势（地球槽里挂着降级层），改说"产地在哪儿读"
    toast(G?'拖动地球可转动 · 滚轮 / 双指缩放':'地球不可用 · 产地见下方文字');
  }

  /* ================= 启动 ================= */
  imgFallbackTimer();
  if(G){G.refreshMarkers();G.aimDish(true);}
  applyTheme(st.continent);
  showMenu();
  syncOrder();
  toast('点菜名看详情 · ＋ 加入点单');          // 菜单页没有地球，提示只说本页能做的事
  setTimeout(function(){if(G)G.markDirty();document.getElementById('loader').classList.add('hide');},520);
  if(G)G.start();

  // 首屏若图未就绪，等预检结束后统一重绘一次缩略图
  function imgFallbackTimer(){
    setTimeout(function(){
      for(var i=0;i<FOODS.length;i++)if(FOODS[i].img&&IMG_OK[FOODS[i].name]===null){IMG_OK[FOODS[i].name]=false;repaintThumbs(i);}
      renderMenu();
    },2600);
  }
})();
