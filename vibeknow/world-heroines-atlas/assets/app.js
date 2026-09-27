(function(){
  var cv=document.getElementById('stage');
  var gl=null;try{gl=cv.getContext('webgl2')||cv.getContext('webgl')}catch(e){}
  if(!gl||typeof THREE==='undefined'){document.getElementById('fallback').classList.add('show');document.getElementById('loader').classList.add('hide');return;}
  try{gl.disable(gl.DITHER);}catch(e){}

  var W=innerWidth,H=innerHeight,DPR=Math.min(devicePixelRatio||1,2);
  var renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(DPR);renderer.setSize(W,H,false);
  renderer.outputEncoding=THREE.sRGBEncoding;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.05;

  var scene=new THREE.Scene();
  var camera=new THREE.PerspectiveCamera(50,W/H,0.1,5000);
  var R=1.6;

  /* ===== 背景星空天球（复用 moon-myths / earth-3d 的程序化星空）===== */
  var GALAXY_TILT=1.15;
  function starfieldTex(){
    var w=2048,h=1024,c=document.createElement('canvas');c.width=w;c.height=h;var x=c.getContext('2d'),i;
    var bg=x.createLinearGradient(0,0,0,h);
    bg.addColorStop(0,'#03060e');bg.addColorStop(.5,'#070c19');bg.addColorStop(1,'#03060e');
    x.fillStyle=bg;x.fillRect(0,0,w,h);
    function band(col,spread,peak){
      var g=x.createLinearGradient(0,h/2-spread,0,h/2+spread);
      g.addColorStop(0,'rgba('+col+',0)');g.addColorStop(.2,'rgba('+col+','+(peak*.45)+')');
      g.addColorStop(.5,'rgba('+col+','+peak+')');g.addColorStop(.8,'rgba('+col+','+(peak*.45)+')');
      g.addColorStop(1,'rgba('+col+',0)');
      x.fillStyle=g;x.fillRect(0,h/2-spread,w,spread*2);
    }
    band('118,142,225',h*0.30,0.075);band('138,162,235',h*0.17,0.075);
    band('178,192,230',h*0.075,0.075);band('218,220,235',h*0.028,0.07);
    function blot(px,py,r,col,a){
      var g2=x.createRadialGradient(0,0,0,0,0,r);
      g2.addColorStop(0,'rgba('+col+','+a+')');g2.addColorStop(1,'rgba('+col+',0)');
      for(var k=-1;k<=1;k++){
        if(k&&px>w*.1&&px<w*.9)continue;
        x.save();x.translate(px+k*w,py);x.fillStyle=g2;x.fillRect(-r,-r,r*2,r*2);x.restore();
      }
    }
    for(i=0;i<46;i++){
      blot(Math.random()*w,h/2+(Math.random()-.5)*h*.32,180+Math.random()*240,Math.random()<.5?'150,170,230':'200,196,225',.008+Math.random()*.014);
    }
    for(i=0;i<16;i++)blot(Math.random()*w,Math.random()*h,120+Math.random()*260,Math.random()<.5?'150,170,230':'200,175,140',.010+Math.random()*.018);
    for(i=0;i<120;i++){
      var warm=Math.random()<.45;
      blot(Math.random()*w,h/2+(Math.random()-.5)*h*.36,36+Math.random()*200,warm?'206,176,132':'150,172,232',.02+Math.random()*.045);
    }
    for(i=0;i<34;i++){
      blot(Math.random()*w,h/2+(Math.random()-.5)*h*.20,60+Math.random()*230,'6,9,22',.04+Math.random()*.07);
    }
    var vg=x.createLinearGradient(0,0,0,h);
    vg.addColorStop(0,'rgba(0,0,0,.34)');vg.addColorStop(.34,'rgba(0,0,0,0)');
    vg.addColorStop(.66,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.34)');
    x.fillStyle=vg;x.fillRect(0,0,w,h);
    var c2=document.createElement('canvas');c2.width=w;c2.height=h;
    var x2=c2.getContext('2d');
    x2.filter='blur(2.5px)';
    x2.drawImage(c,-w,0);x2.drawImage(c,0,0);x2.drawImage(c,w,0);
    var t=new THREE.CanvasTexture(c2);t.encoding=THREE.sRGBEncoding;
    t.anisotropy=renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  var sky=new THREE.Mesh(new THREE.SphereGeometry(3500,48,32),new THREE.MeshBasicMaterial({map:starfieldTex(),side:THREE.BackSide,depthWrite:false}));
  sky.rotation.z=GALAXY_TILT;scene.add(sky);

  /* ===== 光照：取真实北京时间（同 moon-myths），但补光偏暖褐契合曙光调 ===== */
  var ambient=new THREE.AmbientLight(0x3a2818,0.5);scene.add(ambient);
  var sunLight=new THREE.DirectionalLight(0xfff2d8,1.75);scene.add(sunLight);
  var fillLight=new THREE.DirectionalLight(0x8a6a4a,0.22);scene.add(fillLight);
  var SUN_DIST=40;
  var OBLIQ=23.44;
  var _sunV=new THREE.Vector3();
  var astro={sunLon:0,sunDec:0,bjH:0,bjM:0};
  function astroUpdate(){
    var d=new Date();
    var utcH=d.getUTCHours()+d.getUTCMinutes()/60+d.getUTCSeconds()/3600;
    var bj=(utcH+8)%24;
    astro.bjH=Math.floor(bj);astro.bjM=d.getUTCMinutes();
    var lon=15*(12-utcH),dec=0;
    if(lon>180)lon-=360;if(lon<=-180)lon+=360;
    var n=Math.floor((Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())-Date.UTC(d.getUTCFullYear(),0,0))/86400000);
    dec=-OBLIQ*Math.cos(2*Math.PI*(n+10)/365.24);
    astro.sunLon=lon;astro.sunDec=dec;
    _sunV.copy(ll2v(dec,lon,1)).normalize();
    sunLight.position.copy(_sunV).multiplyScalar(SUN_DIST);
    fillLight.position.copy(_sunV).multiplyScalar(-SUN_DIST);
  }
  var nowEl=document.getElementById('nowInfo'),nowStr='',nowAt=-1;
  function pad2(n){return (n<10?'0':'')+n;}
  function tickNowInfo(t){
    if(!nowEl||t-nowAt<1)return;
    nowAt=t;
    var lon=astro.sunLon,dec=astro.sunDec;
    var s='<b>'+pad2(astro.bjH)+':'+pad2(astro.bjM)+'</b> 北京时间'+
          '<em>阳光直射 '+Math.abs(lon).toFixed(1)+'°'+(lon>=0?'E':'W')+' · 赤纬 '+(dec>=0?'+':'')+dec.toFixed(1)+'°</em>';
    if(s!==nowStr){nowStr=s;nowEl.innerHTML=s;}
  }

  /* ===== 工具纹理 ===== */
  function radialTex(c0,c1,c2){
    var c=document.createElement('canvas');c.width=c.height=128;var x=c.getContext('2d'),g=x.createRadialGradient(64,64,0,64,64,64);
    g.addColorStop(0,c0);g.addColorStop(.4,c1);g.addColorStop(1,c2);x.fillStyle=g;x.fillRect(0,0,128,128);
    return new THREE.CanvasTexture(c);
  }
  function plainTex(col){var c=document.createElement('canvas');c.width=c.height=4;c.getContext('2d').fillStyle=col;c.getContext('2d').fillRect(0,0,4,4);return new THREE.CanvasTexture(c);}

  /* 经纬度 → 球面坐标（与 three.js SphereGeometry 贴图 UV 对齐，同 earth-3d）*/
  function ll2v(lat,lon,r){
    var th=(90-lat)*Math.PI/180,p=(lon+180)/360*Math.PI*2;
    return new THREE.Vector3(-r*Math.cos(p)*Math.sin(th),r*Math.cos(th),r*Math.sin(p)*Math.sin(th));
  }

  /* ===== 主地球 ===== */
  var mainTilt=new THREE.Group();mainTilt.rotation.z=23.5*Math.PI/180;scene.add(mainTilt);
  var mainSpin=new THREE.Group();mainTilt.add(mainSpin);
  var earthMat=new THREE.MeshStandardMaterial({map:plainTex('#2a1a1e'),roughness:.85,metalness:.04});
  var earthMesh=new THREE.Mesh(new THREE.SphereGeometry(R,48,32),earthMat);mainSpin.add(earthMesh);
  var cloudMat=new THREE.MeshStandardMaterial({map:plainTex('#ffffff'),transparent:true,alphaMap:plainTex('#ffffff'),opacity:.5,roughness:1,depthWrite:false});
  var clouds=new THREE.Mesh(new THREE.SphereGeometry(R*1.012,48,32),cloudMat);mainTilt.add(clouds);
  var atmo=new THREE.Mesh(new THREE.SphereGeometry(R*1.06,48,32),new THREE.MeshBasicMaterial({color:0x8a4a3a,side:THREE.BackSide,transparent:true,opacity:.22,blending:THREE.AdditiveBlending,depthWrite:false}));
  mainTilt.add(atmo);

  /* ===== 女英雄标记点 =====
   * 形制同 moon-myths（实心点 + 光晕 + 描边 + 细环四层），配色按**当前筛选维度**取色：
   *   地域维度 → REG_COL（东亚红/南亚橙/中东金/欧洲蓝/非洲绿/美洲紫/大洋洲青）
   *   年代维度 → ERA_COL（上古/中世纪/近代早期/近现代）
   *   身份维度 → ROLE_COL（将帅/君主/革命/信仰）
   * 切换维度时所有标记点重新着色，这是与 moon-myths 的核心差异化之一。 */
  var markerGroup=new THREE.Group();mainSpin.add(markerGroup);
  function radialStops(stops){
    var s=128,c=document.createElement('canvas');c.width=c.height=s;var x=c.getContext('2d');
    var g=x.createRadialGradient(64,64,0,64,64,64),i;
    for(i=0;i<stops.length;i++)g.addColorStop(stops[i][0],stops[i][1]);
    x.fillStyle=g;x.fillRect(0,0,s,s);
    var t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;
  }
  var haloTex=radialStops([
    [0,'rgba(255,255,255,.96)'],[.16,'rgba(248,251,255,.78)'],[.34,'rgba(224,234,252,.4)'],
    [.56,'rgba(198,215,246,.12)'],[.8,'rgba(180,200,240,.02)'],[1,'rgba(170,196,240,0)']
  ]);
  var coreTex=radialStops([
    [0,'rgba(255,255,255,1)'],[.7,'rgba(255,255,255,1)'],[.84,'rgba(255,255,255,.5)'],
    [1,'rgba(255,255,255,0)']
  ]);
  var contourTex=radialStops([
    [0,'rgba(4,8,18,0)'],[.46,'rgba(4,8,18,0)'],[.56,'rgba(4,8,18,.3)'],
    [.68,'rgba(4,8,18,.44)'],[.8,'rgba(4,8,18,.2)'],[.92,'rgba(4,8,18,.04)'],[1,'rgba(4,8,18,0)']
  ]);
  var ringLineTex=radialStops([
    [0,'rgba(255,255,255,0)'],[.6,'rgba(255,255,255,0)'],[.64,'rgba(255,255,255,.45)'],
    [.7,'rgba(255,255,255,1)'],[.74,'rgba(255,255,255,.45)'],[.78,'rgba(255,255,255,0)'],[1,'rgba(255,255,255,0)']
  ]);
  var MK_HALO=0.24,MK_CORE=0.085,MK_CONTOUR=0.13,MK_RING=0.24,MK_RING_SEL=0.3;
  var REF_DIST=9.7;
  var DAWN_COL=new THREE.Color('#f4e4c1');
  var GOLD_COL=new THREE.Color('#e8a04a');
  var DIM_COL=new THREE.Color('#8a6a5a');
  var WHITE_COL=new THREE.Color('#ffffff');
  /* 地域色表：与 heroines.js 的 REGIONS.color 同源
   * 标记点按地域取色（东亚红/南亚橙/中东金/欧洲蓝/非洲绿/美洲紫/大洋洲青） */
  var REG_COL={};
  (function(){
    for(var i=0;i<REGIONS.length;i++)REG_COL[REGIONS[i].id]=new THREE.Color(REGIONS[i].color||'#f4e4c1');
  })();
  /* 当前筛选地域 id */
  var curRegion='all';
  var markers=[];
  (function buildMarkers(){
    for(var i=0;i<HEROINES.length;i++){
      var m=HEROINES[i];
      var grp=new THREE.Group();
      grp.position.copy(ll2v(m.lat,m.lon,R*1.012));
      grp.lookAt(0,0,0);grp.rotateX(Math.PI);
      var cReg=REG_COL[m.region]||DAWN_COL;
      var cHalo=cReg.clone(),cCore=cReg.clone().lerp(WHITE_COL,.18),cRing=cReg.clone();
      var contour=new THREE.Sprite(new THREE.SpriteMaterial({map:contourTex,transparent:true,depthWrite:false,depthTest:false,toneMapped:false,opacity:.85}));
      contour.scale.set(MK_CONTOUR,MK_CONTOUR,1);
      var halo=new THREE.Sprite(new THREE.SpriteMaterial({map:haloTex,transparent:true,depthWrite:false,depthTest:false,toneMapped:false,color:cHalo.clone(),opacity:.5}));
      halo.scale.set(MK_HALO,MK_HALO,1);
      var core=new THREE.Sprite(new THREE.SpriteMaterial({map:coreTex,transparent:true,depthWrite:false,depthTest:false,toneMapped:false,color:cCore.clone(),opacity:1}));
      core.scale.set(MK_CORE,MK_CORE,1);
      var ring=new THREE.Sprite(new THREE.SpriteMaterial({map:ringLineTex,transparent:true,depthWrite:false,depthTest:false,toneMapped:false,color:cRing.clone(),opacity:.42}));
      ring.scale.set(MK_RING,MK_RING,1);
      var hit=new THREE.Mesh(new THREE.SphereGeometry(0.16,10,10),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,depthTest:false}));
      contour.renderOrder=10;halo.renderOrder=11;ring.renderOrder=12;core.renderOrder=13;
      grp.add(contour);grp.add(halo);grp.add(ring);grp.add(core);grp.add(hit);
      markerGroup.add(grp);
      markers.push({hero:m,grp:grp,contour:contour,halo:halo,core:core,ring:ring,hit:hit,
        cHalo:cHalo,cCore:cCore,cRing:cRing,fade:1,sel:false,dim:false,front:false});
    }
  })();
  var ping=new THREE.Sprite(new THREE.SpriteMaterial({map:ringLineTex,transparent:true,depthWrite:false,depthTest:false,toneMapped:false,color:DAWN_COL.clone(),opacity:0}));
  ping.visible=false;ping.renderOrder=14;markerGroup.add(ping);

  /* ===== 星空点（复用 moon-myths 的程序化星点）===== */
  function gaussRand(){var u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(6.2832*v);}
  function starTex(spike){
    var s=64,c=document.createElement('canvas');c.width=c.height=s;var x=c.getContext('2d'),i;
    var g=x.createRadialGradient(32,32,0,32,32,32);
    g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.2,'rgba(255,255,255,.88)');
    g.addColorStop(.38,'rgba(255,255,255,.3)');g.addColorStop(.62,'rgba(255,255,255,.07)');
    g.addColorStop(1,'rgba(255,255,255,0)');
    x.fillStyle=g;x.fillRect(0,0,s,s);
    if(spike){
      var bars=[[1,0],[0,1],[.7,.7],[-.7,.7]];
      for(i=0;i<4;i++){
        x.save();x.translate(32,32);x.rotate(Math.atan2(bars[i][1],bars[i][0]));
        var lg=x.createLinearGradient(0,0,31,0);
        lg.addColorStop(0,'rgba(255,255,255,.5)');lg.addColorStop(.3,'rgba(255,255,255,.12)');lg.addColorStop(1,'rgba(255,255,255,0)');
        x.fillStyle=lg;x.fillRect(0,-.7,31,1.4);x.restore();
      }
    }
    var t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;
  }
  function dotCoreTex(){
    var s=32,c=document.createElement('canvas');c.width=c.height=s;var x=c.getContext('2d');
    var g=x.createRadialGradient(16,16,0,16,16,16);
    g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.16,'rgba(255,255,255,.94)');
    g.addColorStop(.32,'rgba(255,255,255,.46)');g.addColorStop(.55,'rgba(255,255,255,.1)');
    g.addColorStop(.78,'rgba(255,255,255,.02)');g.addColorStop(1,'rgba(255,255,255,0)');
    x.fillStyle=g;x.fillRect(0,0,s,s);
    var t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;
  }
  var stars=new THREE.Group();stars.rotation.z=GALAXY_TILT;scene.add(stars);
  (function buildStars(){
    var dot=dotCoreTex(),soft=starTex(false),flare=starTex(true);
    var tiers=[{n:5600,size:1.5,tex:dot,op:.9,bandP:.8,maxB:.72},
               {n:3000,size:2.2,tex:dot,op:.92,bandP:.7,maxB:.82},
               {n:1000,size:3.3,tex:soft,op:.96,bandP:.55,maxB:.95},
               {n:160,size:5.2,tex:flare,op:1,bandP:.38,maxB:1}];
    for(var k=0;k<tiers.length;k++){
      var T=tiers[k],n=T.n,pos=new Float32Array(n*3),col=new Float32Array(n*3);
      for(var i=0;i<n;i++){
        var u=Math.random()*2-1,v=Math.random()*6.2832,sp=Math.sqrt(1-u*u);
        var dx=sp*Math.cos(v),dy=u,dz=sp*Math.sin(v);
        if(Math.random()<T.bandP)dy*=Math.abs(gaussRand())*.28;
        var L=Math.sqrt(dx*dx+dy*dy+dz*dz)||1,rad=1000+Math.random()*600;
        pos[i*3]=dx/L*rad;pos[i*3+1]=dy/L*rad;pos[i*3+2]=dz/L*rad;
        var b=T.maxB*(.34+Math.pow(Math.random(),2)*.66),ct=Math.random();
        if(ct<.6){col[i*3]=b*.86;col[i*3+1]=b*.92;col[i*3+2]=b;}
        else if(ct<.88){col[i*3]=b;col[i*3+1]=b;col[i*3+2]=b*.99;}
        else{col[i*3]=b;col[i*3+1]=b*.88;col[i*3+2]=b*.7;}
      }
      var geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
      geo.setAttribute('color',new THREE.BufferAttribute(col,3));
      stars.add(new THREE.Points(geo,new THREE.PointsMaterial({map:T.tex,size:T.size*DPR,sizeAttenuation:false,vertexColors:true,transparent:true,opacity:T.op,depthWrite:false,blending:THREE.AdditiveBlending})));
    }
  })();

  /* ===== 纹理加载（容错）===== */
  var loader=new THREE.TextureLoader();loader.setCrossOrigin('anonymous');
  var maxA=renderer.capabilities.getMaxAnisotropy();
  function load(u,ok){loader.load(u,ok,undefined,function(){});}
  load('./assets/earth.jpg',function(t){t.encoding=THREE.sRGBEncoding;t.anisotropy=maxA;earthMat.map=t;earthMat.needsUpdate=true;});
  load('./assets/clouds.png',function(t){t.anisotropy=maxA;cloudMat.map=t;cloudMat.alphaMap=t;cloudMat.needsUpdate=true;});

  /* ===== 相机 =====
   * 取景系数 2.0（比 moon-myths 的 2.2 略小）：地球初始占视场更大，主体更突出。 */
  function fitR(){var vFov=camera.fov*Math.PI/180;var hFov=2*Math.atan(Math.tan(vFov/2)*camera.aspect);return Math.max(4,2.0*R/Math.tan(hFov/2));}
  var theta=0.6,phi=1.15,radius=fitR();
  var thetaG=theta,phiG=phi,radiusG=radius,userZoomed=false;
  var R_MIN=2.2,R_MAX=26;
  var PAN_CARD=0.14,panG=0,pan=0;
  function camPos(){var sp=Math.sin(phi);
    camera.position.set(radius*sp*Math.sin(theta),radius*Math.cos(phi),radius*sp*Math.cos(theta));
    camera.lookAt(0,-pan*radius,0);
  }
  /* 开场视角正对的点：中国·花木兰 */
  var HOME_LAT=40.1,HOME_LON=113.3;
  (function(){
    for(var i=0;i<HEROINES.length;i++){
      if(HEROINES[i].civ==='中国'&&HEROINES[i].name==='花木兰'){HOME_LAT=HEROINES[i].lat;HOME_LON=HEROINES[i].lon;return;}
    }
  })();
  var _aim=new THREE.Vector3();
  function aimLatLon(lat,lon){
    _aim.copy(ll2v(lat,lon,1));
    mainTilt.updateMatrixWorld(true);
    _aim.applyMatrix4(mainSpin.matrixWorld);
    var len=_aim.length()||1;
    phiG=Math.acos(Math.max(-1,Math.min(1,_aim.y/len)));
    thetaG=shortAngle(theta,Math.atan2(_aim.x,_aim.z));
  }

  /* ===== 手势：单指旋转 / 双指缩放，区分点击与拖动 ===== */
  var pointers={},dragId=null,pinch=0,lx=0,ly=0;
  var downX=0,downY=0,downT=0,moved=false;
  function pCount(){var n=0,k;for(k in pointers)if(pointers[k])n++;return n;}
  function stopDrag(){dragId=null;}
  function tdist(t){return Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);}
  cv.addEventListener('pointerdown',function(e){
    pointers[e.pointerId]={x:e.clientX,y:e.clientY};
    if(pCount()>1){stopDrag();return;}
    dragId=e.pointerId;lx=e.clientX;ly=e.clientY;
    downX=e.clientX;downY=e.clientY;downT=performance.now();moved=false;
    try{cv.setPointerCapture(e.pointerId);}catch(_){}
  });
  function onPointerEnd(e){
    var isMain=(e.pointerId===dragId);
    delete pointers[e.pointerId];
    if(dragId===e.pointerId)stopDrag();
    try{cv.releasePointerCapture(e.pointerId)}catch(_){}
    if(isMain&&!moved){
      var dt=performance.now()-downT;
      var dx=e.clientX-downX,dy=e.clientY-downY;
      if(dt<400&&Math.hypot(dx,dy)<10){handleClick(e.clientX,e.clientY);}
    }
    var n=pCount();
    if(n===1){for(var id in pointers)if(pointers[id]){dragId=Number(id);lx=pointers[id].x;ly=pointers[id].y;break;}}
  }
  cv.addEventListener('pointerup',onPointerEnd);
  cv.addEventListener('pointercancel',onPointerEnd);
  cv.addEventListener('pointermove',function(e){
    var p=pointers[e.pointerId];if(!p)return;
    p.x=e.clientX;p.y=e.clientY;
    if(e.pointerId!==dragId||pCount()>1)return;
    var dx=e.clientX-lx,dy=e.clientY-ly;
    if(Math.abs(dx)+Math.abs(dy)>2)moved=true;
    lx=e.clientX;ly=e.clientY;
    thetaG-=dx*0.005;phiG-=dy*0.005;phiG=Math.max(0.08,Math.min(Math.PI-0.08,phiG));
  });
  cv.addEventListener('wheel',function(e){e.preventDefault();radiusG*=1+Math.sign(e.deltaY)*0.08;radiusG=Math.max(R_MIN,Math.min(R_MAX,radiusG));userZoomed=true;},{passive:false});
  cv.addEventListener('touchstart',function(e){if(e.touches.length===2){stopDrag();pinch=tdist(e.touches);}},{passive:true});
  cv.addEventListener('touchend',function(e){if(e.touches.length<2)pinch=0;},{passive:true});
  cv.addEventListener('touchcancel',function(){pinch=0;},{passive:true});
  cv.addEventListener('touchmove',function(e){if(e.touches.length!==2)return;e.preventDefault();var d=tdist(e.touches);if(pinch>12&&d>12){radiusG*=pinch/d;radiusG=Math.max(R_MIN,Math.min(R_MAX,radiusG));userZoomed=true;}pinch=d;},{passive:false});

  /* ===== Raycaster：点击标记点 ===== */
  var raycaster=new THREE.Raycaster();
  var ndc=new THREE.Vector2();
  function handleClick(cx,cy){
    ndc.x=(cx/W)*2-1;ndc.y=-(cy/H)*2+1;
    raycaster.setFromCamera(ndc,camera);
    var targets=[];
    for(var i=0;i<markers.length;i++){
      var m=markers[i];
      if(!m.front)continue;
      targets.push(m.hit);
    }
    if(targets.length===0)return;
    var hits=raycaster.intersectObjects(targets,false);
    if(hits.length>0){
      var hitMesh=hits[0].object;
      for(var j=0;j<markers.length;j++){
        if(markers[j].hit===hitMesh){selectMarker(j);return;}
      }
    }
  }

  /* ===== 选中标记：停转 + 飞到正面 + 展开卡片 ===== */
  var selIdx=-1;
  function shortAngle(from,to){
    var d=(to-from)%(Math.PI*2);
    if(d>Math.PI)d-=Math.PI*2;
    if(d<-Math.PI)d+=Math.PI*2;
    return from+d;
  }
  function selectMarker(i){
    selIdx=i;
    aimLatLon(markers[i].hero.lat,markers[i].hero.lon);
    if(!userZoomed)radiusG=fitR()*0.82;
    showCard(i);
  }
  function clearSelection(){
    selIdx=-1;
    if(!userZoomed)radiusG=fitR();
    hideCard();
  }

  /* ===== 女英雄卡片 ===== */
  var cardEl=document.getElementById('card');
  var picEl=document.getElementById('cPic');
  var picFileEl=document.getElementById('cPicFile');
  var metaEl=document.getElementById('cMeta');
  var IMG_OK={};
  HEROINES.forEach(function(m,i){
    if(!m.img){IMG_OK[i]=false;return;}
    IMG_OK[i]=null;
    var im=new Image();
    im.onload=function(){IMG_OK[i]=true;if(selIdx===i)showCard(i);};
    im.onerror=function(){IMG_OK[i]=false;};
    im.src=m.img;
  });
  setTimeout(function(){
    for(var i=0;i<HEROINES.length;i++)if(HEROINES[i].img&&IMG_OK[i]===null){IMG_OK[i]=false;if(selIdx===i)showCard(i);}
  },2600);
  function applyPic(m,i){
    var ok=!!(m.img&&IMG_OK[i]===true);
    picEl.className=ok?'pic has':'pic';
    if(ok)picEl.style.backgroundImage="url('"+m.img+"')";else picEl.style.backgroundImage='';
    picFileEl.textContent=m.slug?m.slug+'.webp':'';
  }
  function eraName(id){for(var i=0;i<ERAS.length;i++)if(ERAS[i].id===id)return ERAS[i].name;return '';}
  function roleName(id){for(var i=0;i<ROLES.length;i++)if(ROLES[i].id===id)return ROLES[i].name;return '';}
  function regionName(id){for(var i=0;i<REGIONS.length;i++)if(REGIONS[i].id===id)return REGIONS[i].name;return '';}
  function showCard(i){
    var m=HEROINES[i];
    document.getElementById('cCiv').textContent=m.civ+' · '+regionName(m.region);
    document.getElementById('cName').textContent=m.name;
    /* 年代/身份行：曙光卡片特有的字段 */
    metaEl.innerHTML='<span>'+eraName(m.era)+'</span><span>'+roleName(m.role)+'</span>';
    applyPic(m,i);
    document.getElementById('cStory').textContent=m.story;
    document.getElementById('cTags').innerHTML=m.tags.map(function(t){return '<span>'+t+'</span>';}).join('');
    document.getElementById('cLoc').textContent='纬度 '+m.lat.toFixed(1)+'°  经度 '+m.lon.toFixed(1)+'°';
    cardEl.classList.add('show');
    panG=PAN_CARD;
  }
  function hideCard(){cardEl.classList.remove('show');panG=0;}
  document.getElementById('cClose').addEventListener('click',clearSelection);

  /* ===== 分享到小红书 ===== */
  var cShareBtn=document.getElementById('cShare');
  function drawShareCard(idx,m,onDone){
    var sw=1080,sh=1440;
    var c=document.createElement('canvas');c.width=sw;c.height=sh;
    var x=c.getContext('2d');
    var bg=x.createLinearGradient(0,0,0,sh);
    bg.addColorStop(0,'#1a0a14');bg.addColorStop(.5,'#2a1020');bg.addColorStop(1,'#1a0a14');
    x.fillStyle=bg;x.fillRect(0,0,sw,sh);
    x.fillStyle='rgba(255,236,200,.85)';
    for(var i=0;i<140;i++){
      x.globalAlpha=Math.random()*0.6+0.2;
      x.beginPath();x.arc(Math.random()*sw,Math.random()*sh*0.45,Math.random()*1.6+0.3,0,Math.PI*2);x.fill();
    }
    x.globalAlpha=1;
    var mx=sw/2,my=200,mr=72;
    var mg=x.createRadialGradient(mx,my,0,mx,my,mr*2.4);
    mg.addColorStop(0,'rgba(244,196,120,.45)');mg.addColorStop(1,'rgba(244,196,120,0)');
    x.fillStyle=mg;x.fillRect(mx-mr*2.4,my-mr*2.4,mr*4.8,mr*4.8);
    var mgrad=x.createRadialGradient(mx-mr*0.3,my-mr*0.3,0,mx,my,mr);
    mgrad.addColorStop(0,'#fff4e0');mgrad.addColorStop(.6,'#f4c478');mgrad.addColorStop(1,'#b8722c');
    x.fillStyle=mgrad;x.beginPath();x.arc(mx,my,mr,0,Math.PI*2);x.fill();
    var y=340;
    function drawText(){
      x.textAlign='center';
      x.fillStyle='#f4e4c1';x.font='600 66px Georgia,"Songti SC","Noto Serif SC",serif';
      x.fillText(m.name,sw/2,y);y+=70;
      x.fillStyle='#e8a04a';x.font='28px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
      x.fillText(m.civ+' · '+regionName(m.region)+' · '+eraName(m.era)+' · '+roleName(m.role),sw/2,y);y+=60;
      x.textAlign='left';x.fillStyle='#f4e4c1';x.font='30px Georgia,"Songti SC","Noto Serif SC",serif';
      var chars=m.story.split(''),line='',maxW=sw-120,lines=[];
      for(var k=0;k<chars.length;k++){
        var t=line+chars[k];
        if(x.measureText(t).width>maxW){lines.push(line);line=chars[k];}else line=t;
      }
      if(line)lines.push(line);
      var lh=46;
      for(var li=0;li<lines.length&&y+lh<sh-220;li++){x.fillText(lines[li],60,y);y+=lh;}
      y+=24;
      x.font='24px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
      var tx=60;
      for(var ti=0;ti<m.tags.length;ti++){
        var tag=m.tags[ti],tw=x.measureText(tag).width+28;
        if(tx+tw>sw-60){tx=60;y+=46;}
        x.fillStyle='rgba(232,160,74,.14)';x.fillRect(tx,y-26,tw,38);
        x.strokeStyle='rgba(232,160,74,.55)';x.lineWidth=1;x.strokeRect(tx,y-26,tw,38);
        x.fillStyle='#e8a04a';x.fillText(tag,tx+14,y);tx+=tw+14;
      }
      y+=56;
      x.fillStyle='#c9a98e';x.font='22px -apple-system,"PingFang SC",sans-serif';
      x.fillText('纬度 '+m.lat.toFixed(1)+'°   经度 '+m.lon.toFixed(1)+'°',60,y);
      x.textAlign='center';
      x.fillStyle='#e8a04a';x.font='600 30px Georgia,serif';x.fillText('世界女英雄图鉴',sw/2,sh-58);
      x.fillStyle='#c9a98e';x.font='18px -apple-system,sans-serif';x.fillText('WORLD HEROINES ATLAS',sw/2,sh-28);
      onDone(c.toDataURL('image/jpeg',0.92));
    }
    if(m.img&&IMG_OK[idx]===true){
      var im=new Image();
      im.onload=function(){
        var ph=360,py=y;
        var s=Math.max(sw/im.width,ph/im.height),dw=im.width*s,dh=im.height*s;
        x.drawImage(im,(sw-dw)/2,py+(ph-dh)/2,dw,dh);
        y=py+ph+40;drawText();
      };
      im.onerror=function(){drawText();};
      im.src=m.img;
    }else drawText();
  }
  function shareToXhs(idx){
    var m=HEROINES[idx];
    var miniTool=window.xhs&&window.xhs.miniTool;
    if(!miniTool){
      drawShareCard(idx,m,function(){
        alert('当前环境未注入小红书端能力，请在小红书 App 内打开本工具使用分享功能。');
      });
      return;
    }
    var orig=cShareBtn.textContent;
    cShareBtn.textContent='生成中…';cShareBtn.disabled=true;
    drawShareCard(idx,m,function(dataUrl){
      var content='【'+m.civ+'·'+m.name+'】\n'+m.story+'\n\n';
      content+='纬度 '+m.lat.toFixed(1)+'°  经度 '+m.lon.toFixed(1)+'°';
      content+='\n—— 世界女英雄图鉴 · WORLD HEROINES ATLAS';
      if(content.length>1000)content=content.slice(0,997)+'…';
      var title=(m.name+' · '+m.civ).slice(0,20);
      miniTool.writeTempFile({data:dataUrl}).then(function(r){
        return miniTool.postNote({title:title,content:content,pageType:'photo_publish',mediaInfo:{image_resources:[{url:r.filePath}]}});
      }).then(function(){
        cShareBtn.textContent=orig;cShareBtn.disabled=false;
      }).catch(function(err){
        cShareBtn.textContent=orig;cShareBtn.disabled=false;
        alert('分享失败：'+(err&&err.errMsg||'未知错误'));
      });
    });
  }
  cShareBtn.addEventListener('click',function(){if(selIdx>=0)shareToXhs(selIdx);});

  /* ===== 地域筛选 tabs ===== */
  var tabsEl=document.getElementById('tabs');
  var dDragged=false;
  function buildTabs(){
    tabsEl.innerHTML='';
    for(var i=0;i<REGIONS.length;i++){
      var r=REGIONS[i];
      var b=document.createElement('button');
      var dot=document.createElement('span');
      dot.className='dot';dot.style.background=r.color||'#f4e4c1';
      b.appendChild(dot);
      b.appendChild(document.createTextNode(r.name));
      b.setAttribute('data-r',r.id);
      if(r.id==='all')b.classList.add('on');
      b.addEventListener('click',function(rid,rlat,rlon,btn){return function(){
        if(dDragged){dDragged=false;return;}
        curRegion=rid;
        var btns=tabsEl.querySelectorAll('button');
        for(var k=0;k<btns.length;k++)btns[k].classList.toggle('on',btns[k].getAttribute('data-r')===rid);
        try{btn.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'});}catch(_){btn.scrollIntoView(true);}
        if(rid!=='all')aimLatLon(rlat,rlon);
        clearSelection();
      };}(r.id,r.lat,r.lon,b));
      tabsEl.appendChild(b);
    }
    tabsFade();
  }
  buildTabs();
  tabsEl.addEventListener('wheel',function(e){
    if(Math.abs(e.deltaX)>Math.abs(e.deltaY))return;
    e.preventDefault();
    tabsEl.scrollLeft+=e.deltaY;
  },{passive:false});
  var tDown=false,tX=0;
  tabsEl.addEventListener('pointerdown',function(e){
    if(e.pointerType!=='mouse')return;
    tDown=true;tX=e.clientX;dDragged=false;
  });
  tabsEl.addEventListener('pointermove',function(e){
    if(!tDown)return;
    var dx=e.clientX-tX;
    if(Math.abs(dx)>4){dDragged=true;tabsEl.setPointerCapture(e.pointerId);}
    if(dDragged){tabsEl.scrollLeft-=dx;tX=e.clientX;}
  });
  function tEnd(){tDown=false;}
  tabsEl.addEventListener('pointerup',tEnd);
  tabsEl.addEventListener('pointercancel',tEnd);
  function tabsFade(){tabsEl.classList.toggle('scrollable',tabsEl.scrollWidth>tabsEl.clientWidth+1);}
  tabsEl.addEventListener('scroll',function(){tabsEl.classList.add('scrollable');});
  addEventListener('resize',tabsFade);setTimeout(tabsFade,400);

  /* ===== 设置 ===== */
  var autoSpin=true,showStars=true,showClouds=true,showLabel=true;
  function bind(id,fn){var el=document.getElementById(id);el.addEventListener('click',function(){el.classList.toggle('on');fn(el.classList.contains('on'));});}
  bind('swSpin',function(v){autoSpin=v;});
  bind('swStars',function(v){showStars=v;stars.visible=v;sky.visible=v;});
  bind('swClouds',function(v){showClouds=v;clouds.visible=v;});
  bind('swLabel',function(v){showLabel=v;});
  document.getElementById('bReset').addEventListener('click',function(){aimLatLon(HOME_LAT,HOME_LON);radiusG=fitR();userZoomed=false;clearSelection();});
  document.getElementById('bTop').addEventListener('click',function(){phiG=0.02;});
  var sheet=document.getElementById('sheet'),scrim=document.getElementById('scrim');
  function openSheet(v){sheet.classList.toggle('show',v);scrim.classList.toggle('show',v);}
  document.getElementById('gear').addEventListener('click',function(){openSheet(true);});
  document.getElementById('sClose').addEventListener('click',function(){openSheet(false);});
  scrim.addEventListener('click',function(){openSheet(false);});

  /* ===== 标记点显隐、呼吸与脉冲 ===== */
  var _v=new THREE.Vector3(),_n=new THREE.Vector3(),_d=new THREE.Vector3();
  function refreshMarkers(t){
    var mkScale=Math.max(0.6,Math.min(2.2,radius/REF_DIST));
    for(var i=0;i<markers.length;i++){
      var m=markers[i];
      m.grp.scale.setScalar(mkScale);
      var sel=(i===selIdx);
      var inVal=(curRegion==='all'||m.hero.region===curRegion);
      var dim=(!sel&&!inVal);
      m.sel=sel;m.dim=dim;
      _v.setFromMatrixPosition(m.grp.matrixWorld);_v.project(camera);
      m.grp.getWorldPosition(_n);
      _d.copy(camera.position).sub(_n).normalize();_n.normalize();
      var facing=_n.dot(_d);
      var front=(_v.z<1)&&(facing>=0.16);
      m.front=front;
      var show=front&&(sel||inVal);
      m.contour.visible=show;m.halo.visible=show;m.core.visible=show;m.ring.visible=show;
      var fade=front?Math.max(0,Math.min(1,(facing-0.16)/0.24)):0;
      m.fade=fade;
      if(!show)continue;
      var pulse=0.5+0.5*Math.sin(t*2.4+i*0.7);
      if(sel){
        m.halo.material.color.copy(GOLD_COL);
        m.core.material.color.copy(GOLD_COL);
        m.ring.material.color.copy(GOLD_COL);
        m.halo.scale.set(0.3*(1+.08*pulse),0.3*(1+.08*pulse),1);
        m.core.scale.set(0.115,0.115,1);
        m.contour.scale.set(0.26,0.26,1);
        m.ring.scale.set(MK_RING_SEL,MK_RING_SEL,1);
        m.halo.material.opacity=(.62+.14*pulse)*fade;
        m.core.material.opacity=1*fade;
        m.contour.material.opacity=.9*fade;
        m.ring.material.opacity=1*fade;
      }else if(dim){
        m.halo.material.color.copy(DIM_COL);
        m.core.material.color.copy(DIM_COL);
        m.ring.material.color.copy(DIM_COL);
        m.halo.scale.set(0.14,0.14,1);
        m.core.scale.set(0.05,0.05,1);
        m.contour.scale.set(0.13,0.13,1);
        m.ring.scale.set(0.14,0.14,1);
        m.halo.material.opacity=.26*fade;
        m.core.material.opacity=.7*fade;
        m.contour.material.opacity=.4*fade;
        m.ring.material.opacity=.22*fade;
      }else{
        m.halo.material.color.copy(m.cHalo);
        m.core.material.color.copy(m.cCore);
        m.ring.material.color.copy(m.cRing);
        m.halo.scale.set(MK_HALO*(1+.12*pulse),MK_HALO*(1+.12*pulse),1);
        m.core.scale.set(MK_CORE*(1+.06*pulse),MK_CORE*(1+.06*pulse),1);
        m.contour.scale.set(MK_CONTOUR,MK_CONTOUR,1);
        m.ring.scale.set(MK_RING,MK_RING,1);
        m.halo.material.opacity=(.5+.16*pulse)*fade;
        m.core.material.opacity=1*fade;
        m.contour.material.opacity=.6*fade;
        m.ring.material.opacity=.5*fade;
      }
    }
    var sm=(selIdx>=0)?markers[selIdx]:null;
    if(sm&&sm.front&&sm.ring.visible){
      var k=(t%1.8)/1.8,ps=MK_RING_SEL*(1+k*1.7)*mkScale;
      ping.position.copy(sm.grp.position);
      ping.scale.set(ps,ps,1);
      ping.material.color.copy(GOLD_COL);
      ping.material.opacity=(1-k)*(1-k)*.75*sm.fade;
      ping.visible=true;
    }else ping.visible=false;
  }

  /* ===== 标签投影：所有朝向镜头的标记都挂名牌 ===== */
  var tagPool=[],tagCand=[];
  (function initTags(){
    for(var i=0;i<HEROINES.length;i++){
      var el=document.createElement('div');el.className='tag';el.style.opacity='0';
      var cs=(REG_COL[HEROINES[i].region]||DAWN_COL).getStyle();
      var d=document.createElement('i');
      d.style.background=cs;
      el.style.borderColor=cs.replace('rgb(','rgba(').replace(')',',.5)');
      el.appendChild(d);
      el.appendChild(document.createTextNode(HEROINES[i].civ+'·'+HEROINES[i].name));
      (function(idx){
        el.addEventListener('click',function(){
          if(!tagPool[idx].on)return;
          selectMarker(idx);
        });
      })(i);
      document.body.appendChild(el);
      tagPool.push({el:el,w:0,h:0,on:false,o:0});
    }
  })();
  function updateTags(){
    var i,show=showLabel;
    tagCand.length=0;
    if(show){
      for(i=0;i<markers.length;i++){
        var m=markers[i];
        if(!m.front||m.dim||!m.core.visible)continue;
        _v.setFromMatrixPosition(m.grp.matrixWorld);_v.project(camera);
        tagCand.push({i:i,x:(_v.x*0.5+0.5)*W,y:(-_v.y*0.5+0.5)*H,f:m.fade,sel:m.sel});
      }
      tagCand.sort(function(a,b){return (b.sel?1:0)-(a.sel?1:0)||(b.f-a.f);});
    }
    for(i=0;i<tagPool.length;i++)tagPool[i].on=false;
    var placed=[];
    for(i=0;i<tagCand.length;i++){
      var c=tagCand[i],t=tagPool[c.i],el=t.el;
      if(!t.w){t.w=el.offsetWidth||96;t.h=el.offsetHeight||22;}
      var rx=c.x-t.w/2-3,ry=c.y-t.h*1.4-3,rw=t.w+6,rh=t.h+6,ok=true;
      for(var j=0;j<placed.length;j++){
        var p=placed[j];
        if(rx<p.x+p.w&&p.x<rx+rw&&ry<p.y+p.h&&p.y<ry+rh){ok=false;break;}
      }
      if(!ok)continue;
      placed.push({x:rx,y:ry,w:rw,h:rh});
      t.on=true;
      var o=c.sel?1:Math.min(1,c.f*1.15);
      el.style.left=c.x.toFixed(1)+'px';el.style.top=c.y.toFixed(1)+'px';
      if(Math.abs(o-t.o)>0.02){el.style.opacity=o.toFixed(2);t.o=o;}
      if(c.sel!==(el.className.indexOf('on')>=0))el.className=c.sel?'tag on':'tag';
    }
    for(i=0;i<tagPool.length;i++){
      var q=tagPool[i];
      if(!q.on&&q.o!==0){q.el.style.opacity='0';q.o=0;q.el.className='tag';}
      q.el.style.pointerEvents=q.on?'auto':'none';
    }
  }

  /* ===== 动画 ===== */
  var clock=new THREE.Clock();
  var running=true,perfAccum=0,perfCount=0,dprStep=DPR;
  var eSpin=0.3;
  var EARTH_SPIN=0.06;
  mainSpin.rotation.y=eSpin;
  aimLatLon(HOME_LAT,HOME_LON);
  theta=thetaG;phi=phiG;
  function animate(){
    if(!running)return;
    requestAnimationFrame(animate);
    var dt=clock.getDelta(),t=performance.now()*0.001;
    if(autoSpin && selIdx<0 && curRegion==='all'){
      eSpin+=dt*EARTH_SPIN;
      mainSpin.rotation.y=eSpin;
      clouds.rotation.y=eSpin*1.1;
    }
    stars.rotation.y+=dt*0.0016;sky.rotation.y+=dt*0.0016;
    theta+=(thetaG-theta)*0.12;phi+=(phiG-phi)*0.12;radius+=(radiusG-radius)*0.1;pan+=(panG-pan)*0.12;
    camPos();
    astroUpdate();
    refreshMarkers(t);
    renderer.render(scene,camera);
    updateTags();
    tickNowInfo(t);
    perfAccum+=dt;perfCount++;
    if(perfCount>=30){var avg=perfAccum/perfCount;perfAccum=0;perfCount=0;if(avg>0.04&&dprStep>1){dprStep=Math.max(1,dprStep-0.25);renderer.setPixelRatio(dprStep);renderer.setSize(W,H,false);}}
  }
  addEventListener('resize',function(){
    W=innerWidth;H=innerHeight;camera.aspect=W/H;camera.updateProjectionMatrix();renderer.setSize(W,H,false);
    if(!userZoomed)radiusG=fitR();
    for(var i=0;i<tagPool.length;i++){tagPool[i].w=0;tagPool[i].h=0;}
  });
  addEventListener('visibilitychange',function(){if(document.hidden){running=false;}else if(!running){running=true;clock.getDelta();animate();}});
  cv.addEventListener('webglcontextlost',function(e){e.preventDefault();running=false;document.getElementById('loader').classList.add('hide');document.getElementById('fallback').classList.add('show');},false);

  animate();
  setTimeout(function(){document.getElementById('loader').classList.add('hide');},600);
  setTimeout(function(){var tp=document.getElementById('tip');tp.classList.add('show');setTimeout(function(){tp.classList.remove('show');},3800);},1400);
})();
