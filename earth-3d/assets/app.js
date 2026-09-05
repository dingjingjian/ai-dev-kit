(function(){
  var cv=document.getElementById('stage');
  var gl=null;try{gl=cv.getContext('webgl2')||cv.getContext('webgl')}catch(e){}
  if(!gl||typeof THREE==='undefined'){document.getElementById('fallback').classList.add('show');document.getElementById('loader').classList.add('hide');return;}

  var W=innerWidth,H=innerHeight,DPR=Math.min(devicePixelRatio||1,1.5);
  var renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(DPR);renderer.setSize(W,H,false);
  renderer.outputEncoding=THREE.sRGBEncoding;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.08;

  var scene=new THREE.Scene();
  var camera=new THREE.PerspectiveCamera(52,W/H,0.1,5000);

  var R=1.6,SUN_R=7,ORBIT=26;

  // ===== 背景星空天球（程序化银河贴图）=====
  function starfieldTex(){
    var w=2048,h=1024,c=document.createElement('canvas');c.width=w;c.height=h;var x=c.getContext('2d');
    var bg=x.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#04050c');bg.addColorStop(.5,'#080a1a');bg.addColorStop(1,'#04050c');
    x.fillStyle=bg;x.fillRect(0,0,w,h);
    x.save();x.translate(w/2,h/2);x.rotate(-0.5);x.translate(-w/2,-h/2);
    for(var i=0;i<24;i++){var px=Math.random()*w,py=h/2+(Math.random()-0.5)*h*0.3,r=90+Math.random()*200;
      var gg=x.createRadialGradient(px,py,0,px,py,r),hue=Math.random(),c1=hue<.4?'rgba(150,120,220,':(hue<.7?'rgba(90,130,210,':'rgba(200,120,150,');
      gg.addColorStop(0,c1+(0.05+Math.random()*.06)+')');gg.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=gg;x.fillRect(0,0,w,h);}
    for(var i=0;i<4400;i++){var px=Math.random()*w,py=h/2+(Math.random()-0.5)*h*0.32;
      var d=Math.abs(py-h/2)/(h*0.16),b=(1-d*d)*(.3+Math.random()*.6);if(b<=0)continue;
      x.fillStyle='rgba(255,255,255,'+b+')';x.fillRect(px,py,1,1);}
    x.restore();
    for(var i=0;i<4200;i++){var px=Math.random()*w,py=Math.random()*h,b=.15+Math.random()*.5;
      x.fillStyle='rgba(255,255,255,'+b+')';x.fillRect(px,py,1,1);}
    for(var i=0;i<220;i++){var px=Math.random()*w,py=Math.random()*h,b=.82+Math.random()*.18;
      x.fillStyle='rgba(255,255,255,'+b+')';x.fillRect(px,py,1,1);}
    var t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;
  }
  var sky=new THREE.Mesh(new THREE.SphereGeometry(3500,48,32),new THREE.MeshBasicMaterial({map:starfieldTex(),side:THREE.BackSide,depthWrite:false}));
  scene.add(sky);

  // ===== 光照 =====
  var ambient=new THREE.AmbientLight(0x223044,0.5);scene.add(ambient);
  var sunLight=new THREE.PointLight(0xfff2d0,2.4,0,1.3);sunLight.position.set(38,12,22);scene.add(sunLight);

  // ===== 工具纹理 =====
  function radialTex(c0,c1,c2){
    var c=document.createElement('canvas');c.width=c.height=128;var x=c.getContext('2d'),g=x.createRadialGradient(64,64,0,64,64,64);
    g.addColorStop(0,c0);g.addColorStop(.4,c1);g.addColorStop(1,c2);x.fillStyle=g;x.fillRect(0,0,128,128);
    return new THREE.CanvasTexture(c);
  }
  function sunTex(){
    var c=document.createElement('canvas');c.width=c.height=512;var x=c.getContext('2d');
    x.fillStyle='#ff7a14';x.fillRect(0,0,512,512);
    for(var i=0;i<5200;i++){var px=Math.random()*512,py=Math.random()*512,r=1.5+Math.random()*7;
      x.fillStyle='rgba(255,'+(170+Math.random()*80|0)+','+(30+Math.random()*90|0)+','+(Math.random()*.45)+')';
      x.beginPath();x.arc(px,py,r,0,6.283);x.fill();}
    for(var j=0;j<90;j++){var px=Math.random()*512,py=Math.random()*512,r=8+Math.random()*36;
      var g=x.createRadialGradient(px,py,0,px,py,r);g.addColorStop(0,'rgba(255,245,205,.85)');g.addColorStop(1,'rgba(255,245,205,0)');
      x.fillStyle=g;x.beginPath();x.arc(px,py,r,0,6.283);x.fill();}
    return new THREE.CanvasTexture(c);
  }
  function plainTex(col){var c=document.createElement('canvas');c.width=c.height=4;c.getContext('2d').fillStyle=col;c.getContext('2d').fillRect(0,0,4,4);return new THREE.CanvasTexture(c);}

  // 经纬度 → 球面坐标（与 three.js SphereGeometry 贴图 UV 对齐）
  function ll2v(lat,lon,r){
    var th=(90-lat)*Math.PI/180,p=(lon+180)/360*Math.PI*2;
    return new THREE.Vector3(-r*Math.cos(p)*Math.sin(th),r*Math.cos(th),r*Math.sin(p)*Math.sin(th));
  }

  // ===== 主地球（星球 / 昼夜 / 经纬模式共用）=====
  var mainTilt=new THREE.Group();mainTilt.rotation.z=23.5*Math.PI/180;scene.add(mainTilt);
  var mainSpin=new THREE.Group();mainTilt.add(mainSpin);
  var earthMat=new THREE.MeshStandardMaterial({map:plainTex('#2a5a9a'),roughness:.82,metalness:.06});
  var earthMesh=new THREE.Mesh(new THREE.SphereGeometry(R,48,32),earthMat);mainSpin.add(earthMesh);
  var cloudMat=new THREE.MeshStandardMaterial({map:plainTex('#ffffff'),transparent:true,alphaMap:plainTex('#ffffff'),opacity:.55,roughness:1,depthWrite:false});
  var clouds=new THREE.Mesh(new THREE.SphereGeometry(R*1.012,48,32),cloudMat);mainTilt.add(clouds);
  var atmo=new THREE.Mesh(new THREE.SphereGeometry(R*1.06,48,32),new THREE.MeshBasicMaterial({color:0x3a86d8,side:THREE.BackSide,transparent:true,opacity:.28,blending:THREE.AdditiveBlending,depthWrite:false}));
  mainTilt.add(atmo);

  // ===== 经纬网 =====
  var gridGroup=new THREE.Group();mainSpin.add(gridGroup);
  function latRing(lat,r,color,op){
    var pts=[];for(var i=0;i<=160;i++){pts.push(ll2v(lat,i/160*360-180,r));}
    return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:color,transparent:true,opacity:op}));
  }
  function meridian(lon,r,color,op){
    var pts=[],p=(lon+180)/360*Math.PI*2;
    for(var i=0;i<=160;i++){var th=i/160*Math.PI*2;pts.push(new THREE.Vector3(-r*Math.cos(p)*Math.sin(th),r*Math.cos(th),r*Math.sin(p)*Math.sin(th)));}
    return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:color,transparent:true,opacity:op}));
  }
  (function buildGrid(){
    var gR=R*1.004,lats=[-75,-60,-45,-30,-15,15,30,45,60,75],i;
    for(i=0;i<lats.length;i++)gridGroup.add(latRing(lats[i],gR,0x9fc4e8,.22));
    for(i=0;i<12;i++)gridGroup.add(meridian(i*15,gR,0x9fc4e8,.18));
    gridGroup.add(latRing(0,gR,0xff8080,.85));
    gridGroup.add(latRing(23.5,gR,0xffd166,.75));gridGroup.add(latRing(-23.5,gR,0xffd166,.75));
    gridGroup.add(latRing(66.5,gR,0x8ad0ff,.8));gridGroup.add(latRing(-66.5,gR,0x8ad0ff,.8));
    gridGroup.add(meridian(0,gR,0x86e3a0,.85));
  })();
  gridGroup.visible=false;

  // （昼夜模式北京标记已移除）

  // ===== 地球内部结构（剖切模型）=====
  var layersGroup=new THREE.Group();layersGroup.visible=false;scene.add(layersGroup);
  var PHI0=0.6981,PHIL=4.8869; // 挖掉以 -X 为中心的 80° 楔形
  function wedgeGeo(r,fixUv){
    var g=new THREE.SphereGeometry(r,48,32,PHI0,PHIL);
    if(fixUv){var uv=g.attributes.uv;for(var i=0;i<uv.count;i++)uv.setX(i,(PHI0+uv.getX(i)*PHIL)/(Math.PI*2));}
    return g;
  }
  var crustMat=new THREE.MeshStandardMaterial({map:plainTex('#2a5a9a'),roughness:.85});
  var mantleMat=new THREE.MeshStandardMaterial({color:0xb5472e,roughness:.9,emissive:0x2a0d06});
  var outerMat=new THREE.MeshStandardMaterial({color:0xff8a3c,roughness:.6,emissive:0x8a3200,emissiveIntensity:.8});
  var innerMat=new THREE.MeshStandardMaterial({color:0xffd98a,roughness:.5,emissive:0xcc7a1e,emissiveIntensity:.9});
  layersGroup.add(new THREE.Mesh(wedgeGeo(R,true),crustMat));
  layersGroup.add(new THREE.Mesh(wedgeGeo(R*0.97),mantleMat));
  layersGroup.add(new THREE.Mesh(wedgeGeo(R*0.55),outerMat));
  layersGroup.add(new THREE.Mesh(new THREE.SphereGeometry(R*0.19,32,24),innerMat));
  // 剖面贴图：同心环
  function sectionTex(){
    var c=document.createElement('canvas');c.width=c.height=512;var x=c.getContext('2d');
    function band(r,col){x.fillStyle=col;x.beginPath();x.arc(256,256,r,0,6.283);x.fill();}
    band(256,'#476b8f');band(248,'#b5472e');band(141,'#ff8a3c');band(49,'#ffd98a');
    x.strokeStyle='rgba(0,0,0,.35)';x.lineWidth=2;
    [248,141,49].forEach(function(r){x.beginPath();x.arc(256,256,r,0,6.283);x.stroke();});
    return new THREE.CanvasTexture(c);
  }
  var secMat=new THREE.MeshStandardMaterial({map:sectionTex(),side:THREE.DoubleSide,roughness:.75});
  function cutFace(dx,dz){
    var m=new THREE.Mesh(new THREE.CircleGeometry(R,72,0,Math.PI),secMat);
    var xA=new THREE.Vector3(0,1,0),yA=new THREE.Vector3(dx,0,dz).normalize(),zA=new THREE.Vector3().crossVectors(xA,yA);
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xA,yA,zA));
    return m;
  }
  var c40=Math.cos(PHI0),s40=Math.sin(PHI0);
  layersGroup.add(cutFace(-c40,s40));
  layersGroup.add(cutFace(-c40,-s40));
  function layerAnchor(r){var o=new THREE.Object3D();o.position.set(-r*0.9781,r*0.2079,0);layersGroup.add(o);return o;}

  // ===== 四季（太阳 + 公转地球）=====
  var seasonsGroup=new THREE.Group();seasonsGroup.visible=false;scene.add(seasonsGroup);
  var sun=new THREE.Mesh(new THREE.SphereGeometry(SUN_R,48,48),new THREE.MeshBasicMaterial({map:sunTex()}));
  seasonsGroup.add(sun);
  var glowA=new THREE.Sprite(new THREE.SpriteMaterial({map:radialTex('rgba(255,225,150,.95)','rgba(255,150,40,.4)','rgba(255,120,20,0)'),blending:THREE.AdditiveBlending,transparent:true,depthWrite:false}));
  glowA.scale.set(SUN_R*3.8,SUN_R*3.8,1);seasonsGroup.add(glowA);
  var glowB=new THREE.Sprite(new THREE.SpriteMaterial({map:radialTex('rgba(255,180,80,.5)','rgba(255,120,30,.16)','rgba(255,100,20,0)'),blending:THREE.AdditiveBlending,transparent:true,depthWrite:false}));
  glowB.scale.set(SUN_R*5.5,SUN_R*5.5,1);seasonsGroup.add(glowB);
  function orbitLine(r,col){
    var pts=[];for(var i=0;i<=160;i++){var a=i/160*6.2832;pts.push(new THREE.Vector3(Math.cos(a)*r,0,Math.sin(a)*r));}
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:col,transparent:true,opacity:.28}));
  }
  seasonsGroup.add(orbitLine(ORBIT,0x4a7fb5));
  // 公转组只平移不旋转 → 地轴指向在空间中保持不变
  var orbitGroup=new THREE.Group();seasonsGroup.add(orbitGroup);
  var tiltG=new THREE.Group();tiltG.rotation.z=23.5*Math.PI/180;orbitGroup.add(tiltG);
  var seasonSpin=new THREE.Group();tiltG.add(seasonSpin);
  var sEarth=new THREE.Mesh(new THREE.SphereGeometry(R,40,28),earthMat);seasonSpin.add(sEarth);
  var sgR=R*1.005;
  tiltG.add(latRing(0,sgR,0xffffff,.3));
  tiltG.add(latRing(23.5,sgR,0xffd166,.7));tiltG.add(latRing(-23.5,sgR,0xffd166,.7));
  tiltG.add(latRing(66.5,sgR,0x8ad0ff,.8));tiltG.add(latRing(-66.5,sgR,0x8ad0ff,.8));
  // 太阳直射点
  var zhi=new THREE.Group();
  var zhiDot=new THREE.Mesh(new THREE.SphereGeometry(0.055,12,12),new THREE.MeshBasicMaterial({color:0xffee88}));
  zhi.add(zhiDot);
  var zhiGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:radialTex('rgba(255,240,150,.95)','rgba(255,200,60,.35)','rgba(255,180,40,0)'),blending:THREE.AdditiveBlending,transparent:true,depthWrite:false}));
  zhiGlow.scale.set(.6,.6,1);zhi.add(zhiGlow);
  orbitGroup.add(zhi);
  function seasonAnchor(x,z){var o=new THREE.Object3D();o.position.set(x,0,z);seasonsGroup.add(o);return o;}

  // （昼夜晨昏线锚点已移除）

  // ===== 星空点 =====
  var stars=(function(){
    var n=4200,geo=new THREE.BufferGeometry(),pos=new Float32Array(n*3),col=new Float32Array(n*3);
    for(var i=0;i<n;i++){var u=Math.random()*2-1,v=Math.random()*6.2832,s=Math.sqrt(1-u*u),Rr=1100+Math.random()*700;
      pos[i*3]=Rr*s*Math.cos(v);pos[i*3+1]=Rr*u;pos[i*3+2]=Rr*s*Math.sin(v);
      var b=.25+Math.random()*.75,t=Math.random();
      if(t<.15){col[i*3]=b*.7;col[i*3+1]=b*.8;col[i*3+2]=b;}
      else if(t<.25){col[i*3]=b;col[i*3+1]=b*.85;col[i*3+2]=b*.7;}
      else{col[i*3]=b;col[i*3+1]=b;col[i*3+2]=b;}}
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    geo.setAttribute('color',new THREE.BufferAttribute(col,3));
    var m=new THREE.PointsMaterial({size:0.55,sizeAttenuation:true,vertexColors:true,transparent:true,opacity:.9,depthWrite:false});
    var p=new THREE.Points(geo,m);scene.add(p);return p;
  })();

  // ===== 纹理加载（容错）=====
  var loader=new THREE.TextureLoader();loader.setCrossOrigin('anonymous');
  var maxA=renderer.capabilities.getMaxAnisotropy();
  function load(u,ok){loader.load(u,ok,undefined,function(){});}
  load('./assets/earth.jpg',function(t){t.encoding=THREE.sRGBEncoding;t.anisotropy=maxA;earthMat.map=t;earthMat.needsUpdate=true;
    var t2=t.clone();t2.needsUpdate=true;crustMat.map=t2;crustMat.needsUpdate=true;});
  load('./assets/clouds.png',function(t){t.anisotropy=maxA;cloudMat.map=t;cloudMat.alphaMap=t;cloudMat.needsUpdate=true;});

  // ===== 相机 =====
  function fitR(minD){var vFov=camera.fov*Math.PI/180;var hFov=2*Math.atan(Math.tan(vFov/2)*camera.aspect);return Math.max(minD,4.2*R/Math.tan(hFov/2));}
  function seasonR(){var vFov=camera.fov*Math.PI/180;var hFov=2*Math.atan(Math.tan(vFov/2)*camera.aspect);return Math.max(56,(ORBIT+7)/Math.tan(hFov/2));}
  var PRESETS={
    overview:function(){return[0.9,1.22,fitR(6)];},
    seasons:function(){return[0.9,0.62,seasonR()];},
    layers:function(){return[-1.5708,1.22,fitR(6)];},
    grid:function(){return[0.6,1.15,fitR(6)];}
  };
  var theta=0.9,phi=1.22,radius=fitR(6);
  var thetaG=theta,phiG=phi,radiusG=radius,userZoomed=false;
  var R_MIN=2.8,R_MAX=230;
  // 底部卡片让位：用视口偏移把地球整体上移，避免被知识卡片遮挡
  var cardK=0,cardKT=0;
  function cardShift(){return Math.max(56,Math.min(100,H*0.11));}
  function setCardMode(min){cardKT=min?cardShift()*0.35:cardShift();}
  function camPos(){var sp=Math.sin(phi);
    camera.position.set(radius*sp*Math.sin(theta),radius*Math.cos(phi),radius*sp*Math.cos(theta));
    camera.lookAt(0,0,0);
    cardK+=(cardKT-cardK)*0.12;
    if(cardK>0.5)camera.setViewOffset(W,H,0,cardK,W,H);else camera.clearViewOffset();
  }

  var dragging=false,lx=0,ly=0,pinch=0;
  cv.addEventListener('pointerdown',function(e){dragging=true;lx=e.clientX;ly=e.clientY;cv.setPointerCapture(e.pointerId);});
  cv.addEventListener('pointerup',function(e){dragging=false;try{cv.releasePointerCapture(e.pointerId)}catch(_){}});
  cv.addEventListener('pointermove',function(e){
    if(!dragging)return;
    var dx=e.clientX-lx,dy=e.clientY-ly;lx=e.clientX;ly=e.clientY;
    thetaG-=dx*0.005;phiG-=dy*0.005;phiG=Math.max(0.08,Math.min(Math.PI-0.08,phiG));
  });
  cv.addEventListener('wheel',function(e){e.preventDefault();radiusG*=1+Math.sign(e.deltaY)*0.08;radiusG=Math.max(R_MIN,Math.min(R_MAX,radiusG));userZoomed=true;},{passive:false});
  cv.addEventListener('touchstart',function(e){if(e.touches.length===2){pinch=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);}},{passive:true});
  cv.addEventListener('touchmove',function(e){if(e.touches.length===2){e.preventDefault();var d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);if(pinch){radiusG*=pinch/d;radiusG=Math.max(R_MIN,Math.min(R_MAX,radiusG));userZoomed=true;}pinch=d;}},{passive:false});

  // ===== 科普内容 =====
  var MODES={
    overview:{name:'蓝色星球',color:'#4a90e2',
      desc:'地球是目前已知唯一存在生命的行星。表面约 71% 被海洋覆盖，大气层与适宜的温度让液态水得以留存，也孕育了丰富的生命。',
      meta:['半径 6371 km','年龄 ≈46 亿年','海洋覆盖 71%','日地距离 1.5 亿 km']},
    seasons:{name:'四季成因',color:'#7ec850',
      desc:'地轴倾斜约 23.5°，且公转过程中地轴指向保持不变，使太阳直射点在南北回归线之间周年移动，于是有了四季更替。注意黄色直射点的位置变化。',
      meta:['地轴倾角 23.5°','公转周期 365.25 天','夏至 直射北回归线','冬至 直射南回归线']},
    layers:{name:'地球内部',color:'#ff7a3c',
      desc:'把地球切开看一看：薄薄的地壳之下是近 2900 km 厚的地幔，再往下是液态的外核与固态的内核。越往深处，温度和压力越高。',
      meta:['地壳 平均约 17 km','地幔 至 2900 km','外核 液态铁镍','内核 ≈5500°C 固态']},
    grid:{name:'经纬网格',color:'#5cc8ff',
      desc:'人们在地球表面编织经纬网来确定位置：赤道是 0° 纬线，本初子午线是 0° 经线。回归线与极圈标记着太阳直射和极昼极夜的边界。',
      meta:['赤道 0° 纬线','回归线 南北纬 23.5°','极圈 南北纬 66.5°','本初子午线 0° 经线']}
  };

  // ===== 标签 =====
  var tags=[];
  function addTag(obj,text,mode,nrm,ctr){
    var el=document.createElement('div');el.className='tag';el.textContent=text;el.style.opacity='0';
    document.body.appendChild(el);
    tags.push({obj:obj,el:el,mode:mode,nrm:nrm||null,ctr:ctr||null});
  }
  (function(){
    var defs=[['赤道',0,-30],['北回归线',23.5,55],['南回归线',-23.5,120],['北极圈',66.5,-70],['南极圈',-66.5,-120],['本初子午线',52,0]];
    defs.forEach(function(d){var o=new THREE.Object3D();o.position.copy(ll2v(d[1],d[2],R*1.03));gridGroup.add(o);addTag(o,d[0],'grid','self');});
  })();
  (function(){
    var n=new THREE.Vector3(-1,0,0);
    addTag(layerAnchor(R*0.19),'内核 · 5150–6371 km','layers',n);
    addTag(layerAnchor(R*0.55),'外核 · 2900–5150 km','layers',n);
    addTag(layerAnchor(R*0.97),'地幔 · 17–2900 km','layers',n);
    addTag(layerAnchor(R*1.17),'地壳 · 0–17 km','layers',n);
  })();
  addTag(seasonAnchor(0,-ORBIT),'春分 · 3月21日前后','seasons');
  addTag(seasonAnchor(ORBIT,0),'夏至 · 6月21日前后','seasons');
  addTag(seasonAnchor(0,ORBIT),'秋分 · 9月23日前后','seasons');
  addTag(seasonAnchor(-ORBIT,0),'冬至 · 12月22日前后','seasons');
  addTag(zhi,'太阳直射点','seasons','self',orbitGroup);

  // ===== 模式切换 =====
  var cur='overview';
  var playing=true,showLabel=true,showStars=true,showClouds=true,speedMul=1;
  function setMode(m){
    cur=m;userZoomed=false;
    var p=PRESETS[m]();thetaG=p[0];phiG=p[1];radiusG=p[2];
    mainTilt.visible=(m==='overview'||m==='grid');
    layersGroup.visible=(m==='layers');
    seasonsGroup.visible=(m==='seasons');
    gridGroup.visible=(m==='grid');
    clouds.visible=showClouds&&(m==='overview');
    mainTilt.rotation.z=23.5*Math.PI/180;
    if(m==='seasons'){ambient.intensity=0.35;sunLight.intensity=2.6;sunLight.position.set(0,0,0);}
    else if(m==='layers'){ambient.intensity=0.75;sunLight.intensity=2.0;sunLight.position.set(-26,14,6);}
    else{ambient.intensity=0.5;sunLight.intensity=2.4;sunLight.position.set(38,12,22);}
    var d=MODES[m],card=document.getElementById('card');
    card.classList.add('show');
    document.getElementById('cName').textContent=d.name;
    document.getElementById('cDot').style.background=d.color;
    document.getElementById('cDesc').textContent=d.desc;
    document.getElementById('cMeta').innerHTML=d.meta.map(function(t){return '<span>'+t+'</span>';}).join('');
    var btns=document.querySelectorAll('#dock button');
    for(var i=0;i<btns.length;i++)btns[i].classList.toggle('on',btns[i].getAttribute('data-m')===m);
  }
  document.querySelectorAll('#dock button').forEach(function(b){
    b.addEventListener('click',function(){setMode(b.getAttribute('data-m'));});
  });

  // ===== 设置 =====
  function bind(id,fn){var el=document.getElementById(id);el.addEventListener('click',function(){el.classList.toggle('on');fn(el.classList.contains('on'));});}
  bind('swPlay',function(v){playing=v;});
  bind('swLabel',function(v){showLabel=v;});
  bind('swStars',function(v){showStars=v;stars.visible=v;sky.visible=v;});
  bind('swClouds',function(v){showClouds=v;clouds.visible=v&&(cur==='overview');});
  var spEl=document.getElementById('speed'),vSp=document.getElementById('vSpeed');
  spEl.addEventListener('input',function(){speedMul=spEl.value/100;vSp.textContent=speedMul.toFixed(1)+'×';});
  document.getElementById('bReset').addEventListener('click',function(){var p=PRESETS[cur]();thetaG=p[0];phiG=p[1];radiusG=p[2];userZoomed=false;});
  document.getElementById('bTop').addEventListener('click',function(){phiG=0.02;});
  var sheet=document.getElementById('sheet'),scrim=document.getElementById('scrim');
  function openSheet(v){sheet.classList.toggle('show',v);scrim.classList.toggle('show',v);}
  document.getElementById('gear').addEventListener('click',function(){openSheet(true);});
  document.getElementById('sClose').addEventListener('click',function(){openSheet(false);});
  scrim.addEventListener('click',function(){openSheet(false);});

  // 知识卡片常驻展开（折叠功能已移除）

  // ===== 标签投影 =====
  var _v=new THREE.Vector3(),_c=new THREE.Vector3(),_n=new THREE.Vector3(),_d=new THREE.Vector3();
  function updateTags(){
    for(var i=0;i<tags.length;i++){
      var tg=tags[i],el=tg.el;
      if(tg.mode!==cur||!showLabel){el.style.opacity='0';continue;}
      _v.setFromMatrixPosition(tg.obj.matrixWorld);_v.project(camera);
      if(_v.z>=1){el.style.opacity='0';continue;}
      if(tg.nrm){
        if(tg.nrm==='self'){
          tg.obj.getWorldPosition(_n);
          if(tg.ctr){tg.ctr.getWorldPosition(_c);_n.sub(_c);}
          _n.normalize();
        }else{_n.copy(tg.nrm);}
        if(tg.ctr){tg.ctr.getWorldPosition(_c);_d.copy(camera.position).sub(_c).normalize();}
        else{_d.copy(camera.position).normalize();}
        if(_n.dot(_d)<0.12){el.style.opacity='0';continue;}
      }
      var x=(_v.x*0.5+0.5)*W,y=(-_v.y*0.5+0.5)*H;
      el.style.left=x+'px';el.style.top=y+'px';el.style.opacity='1';
    }
  }

  // ===== 动画 =====
  var clock=new THREE.Clock();
  var running=true,perfAccum=0,perfCount=0,dprStep=DPR;
  var eSpin=2.68; // 初始让北京朝向默认相机
  var now=new Date(),doy=Math.floor((now-new Date(now.getFullYear(),0,0))/864e5);
  var seasonAng=((doy-172)/365.25)*Math.PI*2; // 按今天日期定位公转位置
  var EARTH_SPIN=0.7,SEASON_REV=0.07;
  function animate(){
    if(!running)return;
    requestAnimationFrame(animate);
    var dt=clock.getDelta(),t=performance.now()*0.001;
    if(playing){
      var s=dt*speedMul;
      eSpin+=s*EARTH_SPIN;seasonAng+=s*SEASON_REV;
      mainSpin.rotation.y=eSpin;clouds.rotation.y=eSpin*1.12;
      seasonSpin.rotation.y=eSpin*2.2;
      orbitGroup.position.set(Math.cos(seasonAng)*ORBIT,0,Math.sin(seasonAng)*ORBIT);
      sun.rotation.y+=s*0.05;
      stars.rotation.y+=s*0.003;sky.rotation.y+=s*0.001;
    }
    zhi.position.set(-Math.cos(seasonAng)*R*1.03,0,-Math.sin(seasonAng)*R*1.03);
    zhiDot.scale.setScalar(1+0.25*Math.sin(t*3.2));
    theta+=(thetaG-theta)*0.12;phi+=(phiG-phi)*0.12;radius+=(radiusG-radius)*0.1;
    camPos();
    renderer.render(scene,camera);
    updateTags();
    perfAccum+=dt;perfCount++;
    if(perfCount>=30){var avg=perfAccum/perfCount;perfAccum=0;perfCount=0;if(avg>0.04&&dprStep>1){dprStep=Math.max(1,dprStep-0.25);renderer.setPixelRatio(dprStep);renderer.setSize(W,H,false);}}
  }
  addEventListener('resize',function(){
    W=innerWidth;H=innerHeight;camera.aspect=W/H;camera.updateProjectionMatrix();renderer.setSize(W,H,false);
    if(!userZoomed){radiusG=PRESETS[cur]()[2];}
    setCardMode(false);
  });
  addEventListener('visibilitychange',function(){if(document.hidden){running=false;}else if(!running){running=true;clock.getDelta();animate();}});
  cv.addEventListener('webglcontextlost',function(e){e.preventDefault();running=false;document.getElementById('loader').classList.add('hide');document.getElementById('fallback').classList.add('show');},false);

  setMode('overview');
  setCardMode(false);
  animate();
  setTimeout(function(){document.getElementById('loader').classList.add('hide');},600);
  setTimeout(function(){var tp=document.getElementById('tip');tp.classList.add('show');setTimeout(function(){tp.classList.remove('show');},3400);},1400);
})();
