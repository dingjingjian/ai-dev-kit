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
  renderer.toneMappingExposure=1.2;

  var scene=new THREE.Scene();
  var camera=new THREE.PerspectiveCamera(50,W/H,0.1,5000);
  var R=1.6;

  /* ===== 背景星空天球（复用 moon-myths / earth-3d 的程序化星空）===== */
  var GALAXY_TILT=1.15;
  function starfieldTex(){
    var w=2048,h=1024,c=document.createElement('canvas');c.width=w;c.height=h;var x=c.getContext('2d'),i;
    var bg=x.createLinearGradient(0,0,0,h);
    bg.addColorStop(0,'#05080f');bg.addColorStop(.5,'#080d1b');bg.addColorStop(1,'#05080f');
    x.fillStyle=bg;x.fillRect(0,0,w,h);
    function band(col,spread,peak){
      var g=x.createLinearGradient(0,h/2-spread,0,h/2+spread);
      g.addColorStop(0,'rgba('+col+',0)');g.addColorStop(.2,'rgba('+col+','+(peak*.45)+')');
      g.addColorStop(.5,'rgba('+col+','+peak+')');g.addColorStop(.8,'rgba('+col+','+(peak*.45)+')');
      g.addColorStop(1,'rgba('+col+',0)');
      x.fillStyle=g;x.fillRect(0,h/2-spread,w,spread*2);
    }
    band('164,178,206',h*0.30,0.062);band('184,196,222',h*0.17,0.058);
    band('204,214,236',h*0.075,0.056);band('228,236,250',h*0.028,0.056);
    function blot(px,py,r,col,a){
      var g2=x.createRadialGradient(0,0,0,0,0,r);
      g2.addColorStop(0,'rgba('+col+','+a+')');g2.addColorStop(1,'rgba('+col+',0)');
      for(var k=-1;k<=1;k++){
        if(k&&px>w*.1&&px<w*.9)continue;
        x.save();x.translate(px+k*w,py);x.fillStyle=g2;x.fillRect(-r,-r,r*2,r*2);x.restore();
      }
    }
    /* 云气一律走冷灰蓝，只在极少数处掺一点奖章金的暖——金是留给标记点、辉光与
       标题的强调色，一旦在整片背景上铺开，深蓝底就会被染成浑浊的紫褐。 */
    for(i=0;i<22;i++){
      blot(Math.random()*w,h/2+(Math.random()-.5)*h*.30,200+Math.random()*220,Math.random()<.62?'146,158,186':'178,190,216',.007+Math.random()*.012);
    }
    for(i=0;i<9;i++)blot(Math.random()*w,Math.random()*h,160+Math.random()*280,Math.random()<.55?'148,160,190':'186,196,220',.008+Math.random()*.014);
    for(i=0;i<90;i++){
      var warm=Math.random()<.22;
      blot(Math.random()*w,h/2+(Math.random()-.5)*h*.34,36+Math.random()*190,warm?'226,196,142':'166,176,204',.016+Math.random()*.032);
    }
    for(i=0;i<30;i++){
      blot(Math.random()*w,h/2+(Math.random()-.5)*h*.20,60+Math.random()*230,'3,5,10',.04+Math.random()*.07);
    }
    var vg=x.createLinearGradient(0,0,0,h);
    vg.addColorStop(0,'rgba(0,0,0,.30)');vg.addColorStop(.34,'rgba(0,0,0,0)');
    vg.addColorStop(.66,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.30)');
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

  /* ===== 光照：取真实北京时间。
     深夜蓝主调下环境光走冷蓝灰，让地球的暗面与页面底色连成一体；
     太阳光只留一点点暖（正午的白），与奖章金呼应。 ===== */
  var ambient=new THREE.AmbientLight(0x2b3550,0.36);scene.add(ambient);
  var sunLight=new THREE.DirectionalLight(0xfff2dc,2.25);scene.add(sunLight);
  var fillLight=new THREE.DirectionalLight(0x4a6a92,0.3);scene.add(fillLight);
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
  function radialStops(stops){
    var s=128,c=document.createElement('canvas');c.width=c.height=s;var x=c.getContext('2d');
    var g=x.createRadialGradient(64,64,0,64,64,64),i;
    for(i=0;i<stops.length;i++)g.addColorStop(stops[i][0],stops[i][1]);
    x.fillStyle=g;x.fillRect(0,0,s,s);
    var t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;
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
  var earthMat=new THREE.MeshStandardMaterial({map:plainTex('#0c1322'),color:new THREE.Color('#eaf0fa'),roughness:.9,metalness:.02});
  var earthMesh=new THREE.Mesh(new THREE.SphereGeometry(R,48,32),earthMat);mainSpin.add(earthMesh);
  var cloudMat=new THREE.MeshStandardMaterial({map:plainTex('#ffffff'),transparent:true,alphaMap:plainTex('#ffffff'),opacity:.34,roughness:1,depthWrite:false});
  var clouds=new THREE.Mesh(new THREE.SphereGeometry(R*1.012,48,32),cloudMat);mainTilt.add(clouds);
  /* 大气辉光：不用 BackSide 空壳——壳背面的可见部分是一圈等宽环带，
     外缘硬切、宽度只由半径差决定，收窄了照样像给地球套了个土星环。
     改用「贴在地心的加性光晕 sprite」：峰值落在地球轮廓上，向外柔和衰减，
     被地球自身的正面挡掉中心（depthTest 保留），于是只剩一圈自然的边缘辉光。
     峰值半径 = 光晕半径 × 0.67，取 2.4 × 0.67 ≈ 1.6 = R。 */
  var atmo=new THREE.Sprite(new THREE.SpriteMaterial({
    map:radialStops([
      [0,'rgba(232,206,140,0)'],[.52,'rgba(232,206,140,0)'],[.615,'rgba(226,190,110,.46)'],
      [.67,'rgba(217,178,106,.56)'],[.78,'rgba(198,156,82,.2)'],[.9,'rgba(186,142,68,.05)'],[1,'rgba(178,134,62,0)']
    ]),
    transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,opacity:.62
  }));
  atmo.scale.set(4.8,4.8,1);
  mainTilt.add(atmo);

  /* ===== 标记点 =====
   * 形制同 world-heroines-atlas（实心点 + 光晕 + 描边 + 细环四层），配色按当前维度的分类取色。
   * 两个维度共用这一套标记逻辑：切换维度时清空重建（见 buildMarkers / switchDim）。 */
  var markerGroup=new THREE.Group();mainSpin.add(markerGroup);
  var haloTex=radialStops([
    [0,'rgba(255,252,246,.96)'],[.16,'rgba(255,246,230,.78)'],[.34,'rgba(250,232,204,.4)'],
    [.56,'rgba(244,214,168,.12)'],[.8,'rgba(238,204,150,.02)'],[1,'rgba(236,200,146,0)']
  ]);
  var coreTex=radialStops([
    [0,'rgba(255,255,255,1)'],[.7,'rgba(255,255,255,1)'],[.84,'rgba(255,255,255,.5)'],
    [1,'rgba(255,255,255,0)']
  ]);
  var contourTex=radialStops([
    [0,'rgba(3,6,13,0)'],[.46,'rgba(3,6,13,0)'],[.56,'rgba(3,6,13,.3)'],
    [.68,'rgba(3,6,13,.44)'],[.8,'rgba(3,6,13,.2)'],[.92,'rgba(3,6,13,.04)'],[1,'rgba(3,6,13,0)']
  ]);
  /* 外圈：canvas 直绘的虚线圆环。radialStops 只能画径向渐变的实线环，
     带角度的虚线段必须画出来；配合 SpriteMaterial.rotation 每帧转一点，
     就是缓慢自转的「扫描环」（见 refreshMarkers）。ping 选中涟漪共用这张纹理。 */
  function makeRingTex(){
    var s=128,c=document.createElement('canvas');c.width=c.height=s;var x=c.getContext('2d');
    x.strokeStyle='rgba(255,255,255,1)';x.lineWidth=7;
    x.setLineDash([13,8]);
    x.beginPath();x.arc(64,64,45,0,Math.PI*2);x.stroke();
    return new THREE.CanvasTexture(c);
  }
  var ringTex=makeRingTex();
  /* 光点整体收小到约 7 折（原 0.24/0.085/0.13/0.24/0.3）：点击判定球不随之缩小，
     手指可点范围不受影响。 */
  var MK_HALO=0.17,MK_CORE=0.06,MK_CONTOUR=0.095,MK_RING=0.17,MK_RING_SEL=0.21;
  var REF_DIST=9.7;
  /* 色彩管理：本文件带的 three 仍是 legacy 模式（ColorManagement.legacyMode=true）。
     这种模式下 new Color('#hex') 给材质时颜色被当作线性值，再经 outputEncoding=sRGB 回写，
     屏幕上等于白提亮一档——分类色会被洗成同一片粉白（#e2604a 会显示成 #f1a696）。
     所以凡是交给材质的颜色都要 convertSRGBToLinear() 过一遍；
     交给 CSS 的（名牌圆点）保持 sRGB 原色，因此 REG_COL / DAWN_COL 不转换。 */
  var DAWN_COL=new THREE.Color('#f2f6fe');
  var GOLD_COL=new THREE.Color('#d9b26a').convertSRGBToLinear();
  var DIM_COL=new THREE.Color('#7d8aa3').convertSRGBToLinear();
  var WHITE_COL=new THREE.Color('#ffffff');
  /* 当前维度：DIM 是 DIMENSIONS 里的一项，CATS / ACTS 随维度切换而变 */
  var DIM=DIMENSIONS[0],CATS=DIM.cats,ACTS=DIM.items;
  /* 分类色表：与 data.js 各 CATS[].color 同源（保留 sRGB，取材质色时再转线性） */
  var REG_COL={};
  function rebuildRegColors(){
    REG_COL={};
    for(var i=0;i<CATS.length;i++)REG_COL[CATS[i].id]=new THREE.Color(CATS[i].color||'#f2f6fe');
  }
  rebuildRegColors();
  /* 当前筛选分类 id */
  var curCat='all';
  var markers=[];
  function clearMarkers(){
    for(var i=0;i<markers.length;i++)markerGroup.remove(markers[i].grp);
    markers.length=0;
  }
  function buildMarkers(){
    clearMarkers();
    for(var i=0;i<ACTS.length;i++){
      var m=ACTS[i];
      var grp=new THREE.Group();
      grp.position.copy(ll2v(m.lat,m.lon,R*1.012));
      grp.lookAt(0,0,0);grp.rotateX(Math.PI);
      var cReg=(REG_COL[m.cat]||DAWN_COL).clone().convertSRGBToLinear();
      /* cCore 只往白里提 7%：提太多会把分类色洗成同一个粉白点，颜色编码就废了 */
      var cHalo=cReg.clone(),cCore=cReg.clone().lerp(WHITE_COL,.07),cRing=cReg.clone();
      var contour=new THREE.Sprite(new THREE.SpriteMaterial({map:contourTex,transparent:true,depthWrite:false,depthTest:false,toneMapped:false,opacity:.85}));
      contour.scale.set(MK_CONTOUR,MK_CONTOUR,1);
      var halo=new THREE.Sprite(new THREE.SpriteMaterial({map:haloTex,transparent:true,depthWrite:false,depthTest:false,toneMapped:false,color:cHalo.clone(),opacity:.5}));
      halo.scale.set(MK_HALO,MK_HALO,1);
      var core=new THREE.Sprite(new THREE.SpriteMaterial({map:coreTex,transparent:true,depthWrite:false,depthTest:false,toneMapped:false,color:cCore.clone(),opacity:1}));
      core.scale.set(MK_CORE,MK_CORE,1);
      var ring=new THREE.Sprite(new THREE.SpriteMaterial({map:ringTex,transparent:true,depthWrite:false,depthTest:false,toneMapped:false,color:cRing.clone(),opacity:.42}));
      ring.scale.set(MK_RING,MK_RING,1);
      var hit=new THREE.Mesh(new THREE.SphereGeometry(0.16,10,10),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,depthTest:false}));
      contour.renderOrder=10;halo.renderOrder=11;ring.renderOrder=12;core.renderOrder=13;
      grp.add(contour);grp.add(halo);grp.add(ring);grp.add(core);grp.add(hit);
      markerGroup.add(grp);
      markers.push({item:m,grp:grp,contour:contour,halo:halo,core:core,ring:ring,hit:hit,
        cHalo:cHalo,cCore:cCore,cRing:cRing,fade:1,sel:false,dim:false,front:false});
    }
  }
  buildMarkers();
  var ping=new THREE.Sprite(new THREE.SpriteMaterial({map:ringTex,transparent:true,depthWrite:false,depthTest:false,toneMapped:false,color:DAWN_COL.clone(),opacity:0}));
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

  /* ===== 相机 ===== */
  function fitR(){var vFov=camera.fov*Math.PI/180;var hFov=2*Math.atan(Math.tan(vFov/2)*camera.aspect);return Math.max(4,2.0*R/Math.tan(hFov/2));}
  var theta=0.6,phi=1.15,radius=fitR();
  var thetaG=theta,phiG=phi,radiusG=radius,userZoomed=false;
  /* R_MIN 放宽到 1.75（原 2.2）：地表上方最近 0.15，密集簇（美国东北部 / 伦敦）
     能被拉得很开；大气光晕峰值半径的投影仍在视野外，光晕纹理中心区全透明，最近距离不糊屏。
     相机近平面 0.1 < 0.15，云层 / 地表 / 标记点都不会被裁切。 */
  var R_MIN=1.75,R_MAX=26;
  var PAN_CARD=0.14,panG=0,pan=0;
  function camPos(){var sp=Math.sin(phi);
    camera.position.set(radius*sp*Math.sin(theta),radius*Math.cos(phi),radius*sp*Math.cos(theta));
    camera.lookAt(0,-pan*radius,0);
  }
  /* 开场视角正对的点：由当前维度的 DIM.home 给出（成果维度对维尔茨堡的 X 射线，人物维度对宁波的屠呦呦） */
  var HOME_LAT=DIM.home.lat,HOME_LON=DIM.home.lon;
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
    /* 灵敏度随缩放自适应：旋转角增量 ∝ 当前距离 / 默认距离（下限 0.08）。
       拉得越近，同样的手指滑动转过的角度越小——贴近看细节时地球不会一蹭就转飞。 */
    var rotK=Math.max(0.08,Math.min(1,radius/fitR()));
    thetaG-=dx*0.005*rotK;phiG-=dy*0.005*rotK;phiG=Math.max(0.08,Math.min(Math.PI-0.08,phiG));
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
        if(markers[j].hit===hitMesh){
          /* 密集处几个标记的判定球本来就是一个团，点中的那个属于哪一条并无意义：
             统一落到该簇的列首（名牌外的引线最短的那条），与看到的列首一致。 */
          var pick=clusTop[j];
          selectMarker((pick==null)?j:pick);return;
        }
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
    aimLatLon(markers[i].item.lat,markers[i].item.lon);
    if(!userZoomed)radiusG=fitR()*0.82;
    showCard(i);
    syncList();
  }
  function clearSelection(){
    selIdx=-1;
    if(!userZoomed)radiusG=fitR();
    hideCard();
    syncList();
  }

  /* ===== 卡片 =====
   * 两个维度共用同一张卡片，字段语义由 data.js 统一约定：
   *   civ 行 = 分类名 · 地点；meta = 奖项行；story = 正文；extra = 落点行（标签由 DIM.extraLabel 给） */
  var cardEl=document.getElementById('card');
  var picEl=document.getElementById('cPic');
  var picFileEl=document.getElementById('cPicFile');
  var metaEl=document.getElementById('cMeta');
  var extraEl=document.getElementById('cExtra');
  /* ===== 配图来源：只有成果维度出图 =====
   * 成果 30 张（assets/illus/<成果 slug>.webp，横向 2:1）；人物不出图，
   * 按 pair 复用对应成果的图——所以调整配对不需要重出图，图也少一半。
   * 表在启动时建一次（slides 以成果维度的 slug 为键），两个维度共用。 */
  var WORK_IMG={};
  (function(){
    var w=DIMENSIONS[0].items;
    for(var i=0;i<w.length;i++)if(w[i].img)WORK_IMG[w[i].slug]=w[i].img;
  })();
  function itemImg(m){return m.img||WORK_IMG[m.pair]||'';}
  var IMG_OK={};
  /* 配图预检：数据声明路径（或配对成果的路径）+ 预检 + 程序化占位；切换维度时对新维度的条目重跑一遍 */
  function precheckImages(){
    IMG_OK={};
    var i;
    for(i=0;i<ACTS.length;i++)(function(k){
      var m=ACTS[k],src=itemImg(m);
      if(!src){IMG_OK[k]=false;return;}
      IMG_OK[k]=null;
      var im=new Image();
      im.onload=function(){IMG_OK[k]=true;if(selIdx===k)showCard(k);};
      im.onerror=function(){IMG_OK[k]=false;};
      im.src=src;
    })(i);
    setTimeout(function(){
      for(var k=0;k<ACTS.length;k++)if(itemImg(ACTS[k])&&IMG_OK[k]===null){IMG_OK[k]=false;if(selIdx===k)showCard(k);}
    },2600);
  }
  precheckImages();
  function applyPic(m,i){
    var src=itemImg(m);
    var ok=!!(src&&IMG_OK[i]===true);
    picEl.className=ok?'pic has':'pic';
    if(ok)picEl.style.backgroundImage="url('"+src+"')";else picEl.style.backgroundImage='';
    /* 占位时标注的是「实际用哪张图」：人物条目显示其成果图文件名 */
    picFileEl.textContent=src?src.split('/').pop():'';
  }
  function catName(id){for(var i=0;i<CATS.length;i++)if(CATS[i].id===id)return CATS[i].name;return '';}
  function showCard(i){
    var m=ACTS[i];
    document.getElementById('cCiv').textContent=catName(m.cat)+' · '+m.place;
    document.getElementById('cName').textContent=m.name;
    /* 奖项行：成果＝获奖年份 + 得主；人物＝奖项年份 + 生卒年 */
    metaEl.innerHTML=(m.meta||[]).map(function(s){return '<span>'+s+'</span>';}).join('');
    applyPic(m,i);
    document.getElementById('cStory').textContent=m.story;
    /* 落点行：成果＝今天用在哪；人物＝留下了什么 */
    if(m.extra){
      extraEl.innerHTML='<b>'+DIM.extraLabel+'</b>'+m.extra;
      extraEl.style.display='';
    }else extraEl.style.display='none';
    document.getElementById('cTags').innerHTML=m.tags.map(function(t){return '<span>'+t+'</span>';}).join('');
    document.getElementById('cLoc').textContent='纬度 '+m.lat.toFixed(1)+'°  经度 '+m.lon.toFixed(1)+'°';
    cardEl.classList.add('show');
    cardEl.scrollTop=0;
    panG=PAN_CARD;
  }
  function hideCard(){cardEl.classList.remove('show');panG=0;}
  document.getElementById('cClose').addEventListener('click',clearSelection);

  /* ===== 分享到小红书 ===== */
  var cShareBtn=document.getElementById('cShare');
  /* 分享图版式：顶部通栏配图 → 下方深夜蓝底上的「分类行 / 名称 / 奖项 / 正文 / 落点 / 标签」→ 页脚品牌。
     整块文字都落在纯底色上，不与照片交叠，确保任何一张图上都清晰可读。 */
  function drawShareCard(idx,m,onDone){
    var sw=1080,sh=1440,P=80,HERO=820,W=sw-P*2;
    var SERIF='Georgia,"Songti SC","Noto Serif SC","STSong","SimSun",serif';
    var SANS='-apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    var BG='#070b16';                       /* 文字区底色，与顶部图下缘的渐隐色一致 */
    var c=document.createElement('canvas');c.width=sw;c.height=sh;
    var x=c.getContext('2d');
    var NO_START='，。、；：？！）』」》〉”’…—·%';
    function wrap(str,font,maxW){
      x.font=font;var chars=str.split(''),line='',out=[];
      for(var i=0;i<chars.length;i++){
        var ch=chars[i],t=line+ch;
        if(x.measureText(t).width>maxW&&line){
          /* 中文禁则：标点不另起一行，挂在上行行尾之后再换行 */
          if(NO_START.indexOf(ch)>=0){out.push(t);line='';}
          else{out.push(line);line=ch;}
        }else line=t;
      }
      if(line)out.push(line);return out;
    }
    function drawBg(){
      var bg=x.createLinearGradient(0,0,0,sh);
      bg.addColorStop(0,'#0d1526');bg.addColorStop(.62,BG);bg.addColorStop(1,'#05080f');
      x.fillStyle=bg;x.fillRect(0,0,sw,sh);
      var vg=x.createRadialGradient(sw/2,sh*0.72,0,sw/2,sh*0.72,sw*0.78);
      vg.addColorStop(0,'rgba(217,178,106,.06)');vg.addColorStop(1,'rgba(217,178,106,0)');
      x.fillStyle=vg;x.fillRect(0,HERO,sw,sh-HERO);
      x.fillStyle='rgba(232,240,255,.55)';
      for(var i=0;i<46;i++){
        x.globalAlpha=Math.random()*0.24+0.06;
        x.beginPath();x.arc(Math.random()*sw,HERO+40+Math.random()*(sh-HERO-140),Math.random()*1.5+0.4,0,Math.PI*2);x.fill();
      }
      x.globalAlpha=1;
    }
    function heroFade(){
      var fg=x.createLinearGradient(0,HERO-170,0,HERO);
      fg.addColorStop(0,'rgba(7,11,22,0)');fg.addColorStop(1,'rgba(7,11,22,1)');
      x.fillStyle=fg;x.fillRect(0,HERO-170,sw,170);
    }
    /* 无图回退：深夜蓝底 + 奖章圆盘 + 文件名，与卡片里的占位保持一致 */
    function drawPlaceholder(){
      var pg=x.createLinearGradient(0,0,0,HERO);
      pg.addColorStop(0,'#111c33');pg.addColorStop(1,'#080d1b');
      x.fillStyle=pg;x.fillRect(0,0,sw,HERO);
      var rg=x.createRadialGradient(sw/2,HERO*0.5,0,sw/2,HERO*0.5,520);
      rg.addColorStop(0,'rgba(217,178,106,.18)');rg.addColorStop(1,'rgba(217,178,106,0)');
      x.fillStyle=rg;x.fillRect(0,0,sw,HERO);
      var cy=HERO*0.46;
      x.strokeStyle='rgba(238,212,154,.42)';x.lineWidth=2;
      x.beginPath();x.arc(sw/2,cy,86,0,Math.PI*2);x.stroke();
      x.strokeStyle='rgba(238,212,154,.2)';x.lineWidth=1;
      x.beginPath();x.arc(sw/2,cy,112,0,Math.PI*2);x.stroke();
      var og=x.createRadialGradient(sw/2-8,cy-8,0,sw/2,cy,30);
      og.addColorStop(0,'#fff8e6');og.addColorStop(.6,'#eed49a');og.addColorStop(1,'#b8863a');
      x.fillStyle=og;x.beginPath();x.arc(sw/2,cy,30,0,Math.PI*2);x.fill();
      x.textAlign='center';
      x.fillStyle='#94a3bd';x.font='500 28px '+SANS;
      x.fillText('配图待生成',sw/2,cy+190);
      x.fillStyle='rgba(126,139,163,.75)';x.font='400 22px '+SANS;
      x.fillText(heroSrc?heroSrc.split('/').pop():'',sw/2,cy+228);
      x.textAlign='left';
      heroFade();
    }
    function drawText(){
      var TOP=HERO+40;
      x.textAlign='left';
      x.shadowColor='rgba(0,0,0,.55)';x.shadowBlur=8;x.shadowOffsetY=2;
      /* 分类行：左「分类 · 地点」，右「经纬度」 */
      x.fillStyle='#d9b26a';x.font='600 27px '+SANS;
      x.fillText(catName(m.cat)+' · '+m.place,P,TOP);
      x.textAlign='right';
      x.fillStyle='#7e8ba3';x.font='400 23px '+SANS;
      x.fillText('纬度 '+m.lat.toFixed(1)+'°  经度 '+m.lon.toFixed(1)+'°',sw-P,TOP);
      /* 名称 */
      x.textAlign='left';
      x.fillStyle='#f5f8ff';x.font='600 72px '+SERIF;
      x.fillText(m.name,P,TOP+74);
      /* 奖项行：成果＝获奖年份 + 得主；人物＝奖项年份 + 生卒年 */
      x.fillStyle='#c9b183';x.font='500 27px '+SANS;
      x.fillText((m.meta||[]).join('　·　'),P,TOP+126);
      /* 正文：最多三行，超出截断加省略号 */
      x.fillStyle='#dfe6f3';x.font='32px '+SERIF;
      var lines=wrap(m.story,'32px '+SERIF,W);
      if(lines.length>3){lines=lines.slice(0,3);lines[2]=lines[2].slice(0,-1)+'…';}
      var y=TOP+184,lh=44;
      for(var i=0;i<lines.length;i++){x.fillText(lines[i],P,y);y+=lh;}
      var lastBaseline=y-lh;
      /* 落点行：标签金 + 内容（最多两行） */
      if(m.extra){
        var nx=lastBaseline+52;
        x.font='500 26px '+SANS;
        x.fillStyle='#d9b26a';x.fillText(DIM.extraLabel,P,nx);
        var lw=x.measureText(DIM.extraLabel).width;
        var ex=wrap(m.extra,'27px '+SANS,W-lw-16);
        if(ex.length>2){ex=ex.slice(0,2);ex[1]=ex[1].slice(0,-1)+'…';}
        x.font='27px '+SANS;x.fillStyle='#a9b6cc';
        if(ex[0])x.fillText(ex[0],P+lw+16,nx);
        if(ex[1])x.fillText(ex[1],P,nx+38);
        lastBaseline=nx+(ex[1]?38:0);
      }
      /* 标签：一行胶囊，超出换行 */
      x.shadowBlur=0;x.shadowOffsetY=0;
      x.font='500 24px '+SANS;
      var tx=P,ty=lastBaseline+32;
      for(var ti=0;ti<m.tags.length;ti++){
        var tag=m.tags[ti],tw=x.measureText(tag).width+32;
        if(tx+tw>sw-P&&tx>P){tx=P;ty+=44+12;}
        x.fillStyle='rgba(217,178,106,.13)';x.fillRect(tx,ty,tw,44);
        x.strokeStyle='rgba(217,178,106,.45)';x.lineWidth=1.5;x.strokeRect(tx+0.75,ty+0.75,tw-1.5,42.5);
        x.fillStyle='#d9b26a';x.fillText(tag,tx+16,ty+30);
        tx+=tw+14;
      }
      /* 页脚：分隔线 + 左中文品牌 / 右英文品牌 */
      x.strokeStyle='rgba(217,178,106,.22)';x.lineWidth=1;
      x.beginPath();x.moveTo(P,1352);x.lineTo(sw-P,1352);x.stroke();
      x.fillStyle='#d9b26a';x.font='600 27px '+SERIF;
      x.fillText('诺奖图鉴',P,1398);
      x.textAlign='right';
      x.fillStyle='#7e8ba3';x.font='500 20px '+SANS;
      x.fillText('NOBEL ATLAS',sw-P,1397);
      x.textAlign='left';
      onDone(c.toDataURL('image/jpeg',0.92));
    }
    drawBg();
    var heroSrc=itemImg(m);
    if(heroSrc&&IMG_OK[idx]===true){
      var im=new Image();
      im.onload=function(){
        var s=Math.max(sw/im.width,HERO/im.height),dw=im.width*s,dh=im.height*s;
        x.save();x.beginPath();x.rect(0,0,sw,HERO);x.clip();
        x.drawImage(im,(sw-dw)/2,(HERO-dh)/2,dw,dh);
        x.restore();
        heroFade();drawText();
      };
      im.onerror=function(){drawPlaceholder();drawText();};
      im.src=heroSrc;
    }else{drawPlaceholder();drawText();}
  }
  function shareToXhs(idx){
    var m=ACTS[idx];
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
      var content='【'+m.name+'】'+catName(m.cat)+' · '+m.place+'\n'+m.story+'\n\n';
      if(m.extra)content+=DIM.extraLabel+'：'+m.extra+'\n\n';
      content+=(m.meta||[]).join('　·　')+'\n';
      content+='纬度 '+m.lat.toFixed(1)+'°  经度 '+m.lon.toFixed(1)+'°';
      content+='\n—— 诺奖图鉴 · NOBEL ATLAS\n#不硬核诺奖指南 #生活中的诺奖';
      if(content.length>1000)content=content.slice(0,997)+'…';
      var title=(m.name+' · '+catName(m.cat)).slice(0,20);
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

  /* ===== 分类筛选 tabs（内容随维度重建）===== */
  var tabsEl=document.getElementById('tabs');
  var dDragged=false;
  function buildTabs(){
    tabsEl.innerHTML='';
    for(var i=0;i<CATS.length;i++){
      var r=CATS[i];
      if(r.id!=='all'){
        var n=0;
        for(var t=0;t<ACTS.length;t++)if(ACTS[t].cat===r.id)n++;
        if(!n)continue;   /* 没有条目的奖项不出标签（成果维度暂无文学 / 经济学） */
      }
      var b=document.createElement('button');
      var dot=document.createElement('span');
      dot.className='dot';dot.style.background=r.color||'#f2f6fe';
      b.appendChild(dot);
      b.appendChild(document.createTextNode(r.name));
      b.setAttribute('data-r',r.id);
      if(r.id===curCat)b.classList.add('on');
      b.addEventListener('click',function(rid,rlat,rlon,btn){return function(){
        if(dDragged){dDragged=false;return;}
        curCat=rid;
        var btns=tabsEl.querySelectorAll('button');
        for(var k=0;k<btns.length;k++)btns[k].classList.toggle('on',btns[k].getAttribute('data-r')===rid);
        try{btn.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'});}catch(_){btn.scrollIntoView(true);}
        if(rid!=='all')aimLatLon(rlat,rlon);
        clearSelection();
      };}(r.id,r.lat,r.lon,b));
      tabsEl.appendChild(b);
    }
    tabsEl.scrollLeft=0;
    tabsFade();
  }
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

  /* ===== 完整名录：当前维度的全部条目，按分类分列（左上按钮开合）===== */
  var listWrap=document.getElementById('listWrap');
  var listScroll=document.getElementById('listScroll');
  var listRows=[];
  var listOpen=false;
  function mkEl(tag,cls,txt){var e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.appendChild(document.createTextNode(txt));return e;}
  function buildList(){
    listScroll.innerHTML='';
    listRows=[];
    var total=0,r,i;
    for(r=0;r<CATS.length;r++){
      var reg=CATS[r];
      if(reg.id==='all')continue;
      var idxs=[];
      for(i=0;i<ACTS.length;i++)if(ACTS[i].cat===reg.id)idxs.push(i);
      if(!idxs.length)continue;
      var grp=mkEl('div','grp');
      grp.setAttribute('data-r',reg.id);
      var h=mkEl('h4'),di=mkEl('i');
      di.style.background=reg.color||'#f2f6fe';
      h.appendChild(di);
      h.appendChild(document.createTextNode(reg.name));
      h.appendChild(mkEl('em',null,idxs.length+' '+DIM.listUnit));
      grp.appendChild(h);
      for(i=0;i<idxs.length;i++){
        var idx=idxs[i],m=ACTS[idx];
        var it=document.createElement('button');
        it.type='button';it.className='item';
        var th=mkEl('div','th');
        var tsrc=itemImg(m);
        if(tsrc){
          var im=document.createElement('img');
          im.alt='';
          (function(cell,img){img.onerror=function(){img.style.display='none';cell.className='th bad';};})(th,im);
          im.src=tsrc;
          th.appendChild(im);
        }else th.className='th bad';
        th.appendChild(mkEl('b'));
        it.appendChild(th);
        var tx=mkEl('div','tx');
        tx.appendChild(mkEl('div','nm',m.name));
        var mt=mkEl('div','mt');
        mt.appendChild(document.createTextNode(m.place+' · '));
        mt.appendChild(mkEl('span','k',(m.meta&&m.meta[0])||''));
        tx.appendChild(mt);
        it.appendChild(tx);
        it.addEventListener('click',(function(x){return function(){openList(false);selectMarker(x);};})(idx));
        grp.appendChild(it);
        listRows[idx]=it;
        total++;
      }
      listScroll.appendChild(grp);
    }
    var cnt=document.getElementById('listCnt');
    if(cnt)cnt.textContent=total+' '+DIM.listUnit;
    var ttl=document.querySelector('.listtitle');
    if(ttl&&ttl.firstChild)ttl.firstChild.nodeValue=DIM.listTitle;
    syncList();
  }
  function syncList(){
    for(var i=0;i<ACTS.length;i++){
      var el=listRows[i];if(!el)continue;
      var cls='item';
      if(i===selIdx)cls+=' on';
      if(curCat!=='all'&&ACTS[i].cat!==curCat)cls+=' dim';
      if(el.className!==cls)el.className=cls;
    }
  }
  function openList(v){
    listOpen=!!v;
    if(v){syncList();openSheet(false);}
    listWrap.className=v?'listwrap show':'listwrap';
    listWrap.setAttribute('aria-hidden',v?'false':'true');
  }
  document.getElementById('listBtn').addEventListener('click',function(){openList(!listOpen);});
  document.getElementById('lClose').addEventListener('click',function(){openList(false);});
  addEventListener('keydown',function(e){if(listOpen&&(e.key==='Escape'||e.keyCode===27))openList(false);});
  buildTabs();
  buildList();

  /* ===== 维度切换：成果 / 人物（移进卡片顶部，地图底部不再占位）=====
   * 切维度 = 换一套 CATS / ACTS，再按顺序重建：分类色表 → 标记点 → 名牌池 → 筛选条 → 清单 → 配图预检。
   * 从地图上切（传参为空）：关卡片、回该维度默认视角；
   * 从卡片内切（fromCard=true）：卡片不关，优先跳到当前条目的跨维度配对（pair 字段，
   * 成果↔人物一一对应）；没有配对就找同奖项、奖项年份最接近的一条；再没有回开场落点。 */
  /* 两处切换器：卡片顶部（fromCard=true：切完落到配对条目、卡片不关）与清单顶部
     （fromCard=false：切完清单留在原地，相机回该维度开场落点）。 */
  var dimSwHosts=[
    {el:document.getElementById('dimSw'),fromCard:true},
    {el:document.getElementById('dimSwList'),fromCard:false}
  ];
  function buildDims(){
    for(var s=0;s<dimSwHosts.length;s++){
      var host=dimSwHosts[s];
      if(!host.el)continue;
      host.el.innerHTML='';
      for(var i=0;i<DIMENSIONS.length;i++){
        var d=DIMENSIONS[i];
        var b=document.createElement('button');
        b.appendChild(document.createTextNode(d.tabName));
        b.setAttribute('data-d',d.id);
        b.title=d.name+' · '+d.sub;
        if(d.id===DIM.id)b.classList.add('on');
        b.addEventListener('click',(function(id,fc){return function(){switchDim(id,fc);};})(d.id,host.fromCard));
        host.el.appendChild(b);
      }
    }
  }
  /* 新维度里离开场落点最近的条目 */
  function homeIdx(){
    var best=0,bd=1e9;
    for(var i=0;i<ACTS.length;i++){
      var d=Math.pow(ACTS[i].lat-DIM.home.lat,2)+Math.pow((ACTS[i].lon-DIM.home.lon)*0.7,2);
      if(d<bd){bd=d;best=i;}
    }
    return best;
  }
  /* 跨维度配对落点：pair 精确匹配（X 射线↔伦琴）→ 同奖项最近年份 → -1（交给调用方退回开场落点）。
     注意必须在 CATS/ACTS 还没换之前调用（cur 是旧维度里的条目）。 */
  function twinIdx(cur){
    if(cur&&cur.pair){
      for(var i=0;i<ACTS.length;i++)if(ACTS[i].slug===cur.pair)return i;
    }
    var best=-1,bd=1e9,cat=cur?cur.cat:'',yr=cur?parseInt((cur.meta&&cur.meta[0])||'',10):NaN;
    if(!isNaN(yr)){
      for(i=0;i<ACTS.length;i++){
        var it=ACTS[i];
        if(it.cat!==cat)continue;
        var iy=parseInt((it.meta&&it.meta[0])||'',10);
        if(isNaN(iy))continue;
        var d=Math.abs(iy-yr);
        if(d<bd){bd=d;best=i;}
      }
    }
    return best;
  }
  function switchDim(id,fromCard){
    if(id===DIM.id)return;
    var cur=(fromCard&&selIdx>=0)?ACTS[selIdx]:null;   /* 先抓旧维度的当前条目，ACTS 马上要换 */
    var i;
    for(i=0;i<DIMENSIONS.length;i++)if(DIMENSIONS[i].id===id)DIM=DIMENSIONS[i];
    CATS=DIM.cats;ACTS=DIM.items;
    curCat='all';
    selIdx=-1;userZoomed=false;
    rebuildRegColors();
    buildMarkers();
    buildTags();
    buildTabs();
    buildList();
    precheckImages();
    HOME_LAT=DIM.home.lat;HOME_LON=DIM.home.lon;
    if(fromCard){
      var ti=twinIdx(cur);
      selectMarker(ti>=0?ti:homeIdx());
    }else{
      hideCard();
      aimLatLon(HOME_LAT,HOME_LON);
      radiusG=fitR();
    }
    for(i=0;i<dimSwHosts.length;i++){
      if(!dimSwHosts[i].el)continue;
      var bs=dimSwHosts[i].el.querySelectorAll('button');
      for(var q=0;q<bs.length;q++)bs[q].classList.toggle('on',bs[q].getAttribute('data-d')===DIM.id);
    }
    var tp=document.getElementById('tip');
    tp.textContent=DIM.tip;
    tp.classList.add('show');
    setTimeout(function(){tp.classList.remove('show');},3200);
  }
  buildDims();

  /* ===== 设置 ===== */
  /* 自动旋转默认关：默认视角是静态的，想看转动的再去设置里开 */
  var autoSpin=false,showStars=true,showClouds=true,showLabel=true;
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
    var mkScale=Math.max(0.45,Math.min(2.2,radius/REF_DIST));
    for(var i=0;i<markers.length;i++){
      var m=markers[i];
      m.grp.scale.setScalar(mkScale);
      var sel=(i===selIdx);
      var inVal=(curCat==='all'||m.item.cat===curCat);
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
      /* 外圈动效：虚线环缓慢自转，选中态转快一倍；相位随序号错开，全场不齐步走 */
      m.ring.material.rotation=t*(sel?1.3:0.55)+i*0.7;
      if(sel){
        m.halo.material.color.copy(GOLD_COL);
        m.core.material.color.copy(GOLD_COL);
        m.ring.material.color.copy(GOLD_COL);
        m.halo.scale.set(0.21*(1+.08*pulse),0.21*(1+.08*pulse),1);
        m.core.scale.set(0.08,0.08,1);
        m.contour.scale.set(0.185,0.185,1);
        m.ring.scale.set(MK_RING_SEL,MK_RING_SEL,1);
        m.halo.material.opacity=(.62+.14*pulse)*fade;
        m.core.material.opacity=1*fade;
        m.contour.material.opacity=.9*fade;
        m.ring.material.opacity=1*fade;
      }else if(dim){
        m.halo.material.color.copy(DIM_COL);
        m.core.material.color.copy(DIM_COL);
        m.ring.material.color.copy(DIM_COL);
        m.halo.scale.set(0.10,0.10,1);
        m.core.scale.set(0.036,0.036,1);
        m.contour.scale.set(0.095,0.095,1);
        m.ring.scale.set(0.10,0.10,1);
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
        m.halo.material.opacity=(.42+.14*pulse)*fade;
        m.core.material.opacity=1*fade;
        m.contour.material.opacity=.6*fade;
        m.ring.material.opacity=.46*fade;
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

  /* ===== 标签投影：名牌按需出现，密集区成列外挂（切换维度时重建）=====
   * 密度全按缩放走（防堆叠）：默认视角一条名牌都不挂（只留光点看分布），额度随拉近从 0 增长，
   * 成簇判定距离随拉近收紧；密集处成列外挂，超出列上限的成员由列首「N 项」徽标代表。
   * 密集区在球面上只差几个像素：成果维度的美国东北部 7 项（石溪 / 默里山 / 霍姆德尔 / 纽约 /
   * 约克镇高地 / 费城 / 普林斯顿）挤在十来个像素里，伦敦 3 项（青霉素 / CT / 光纤通信）也一样；
   * 人物维度的「纽约 + 哈特福德」与「芝加哥」两处同理。
   * 挤在一起的改成屏幕空间的「成列外挂」：彼此太近的名牌在光点上方叠成一列
   * （上方放不下则挂下方），每条用细引线连回自己的光点；挤了 3 项以上的地方，
   * 列首旁再挂一个数字徽标说明压着几项。
   * 判定全在屏幕空间做，所以转动、拉近拉远都自然跟随；名牌本身可点，密集处照样点得准。 */
  var tagPool=[],tagCand=[],badgePool=[];
  /* CLUSTER_PX 是判定「挤在一处」的屏幕距离；窄屏用更小的值，让本可分开的点各自挂名牌。
     COL_MAX 是密集处一列最多挂几行名牌（手机只留两行，其余交给「N 项」徽标），
     —— 窄屏纵向空间紧，长列会把半屏糊住。 */
  var CLUSTER_PX=30,CLUSTER_PX_SMALL=22,COL_MAX=3,COL_MAX_SMALL=2;
  var TAG_PITCH_GAP=9,LEAD_MIN=14,BADGE_MIN=3;
  /* 名牌总额度从 0 起算：默认视角一条都不挂，只留光点——那是「看分布」的状态；
     拉近后才开始逐条出现，额度 ≈ 系数 ×(z-1)^1.3（z = fitR()/radius，默认视角 z=1）：
     手机拉近 1.25×→2 条、1.7×→6 条、2.2×→18 条，拉到最近等于不限量。
     嫌多/嫌少就调这两个系数。选中项与「筛了某一类」不受这条曲线限制。 */
  var LABEL_GROW=20,LABEL_GROW_SMALL=14;
  var leadCv=document.getElementById('leaders');
  var leadCtx=leadCv?leadCv.getContext('2d'):null,leadDpr=1,leadDirty=false;
  function sizeLeaders(){
    if(!leadCv)return;
    leadDpr=Math.min(devicePixelRatio||1,2);
    leadCv.width=Math.max(1,Math.round(W*leadDpr));leadCv.height=Math.max(1,Math.round(H*leadDpr));
  }
  sizeLeaders();
  /* 引线画在 2D 画布上，颜色只能取 sRGB 原值：GOLD_COL 之类的材质色已 convertSRGBToLinear，
     拿来当 CSS 色会暗一档（同文件顶部关于颜色管理的说明）。 */
  function rgbaOf(cs,a){return cs.replace('rgb(','rgba(').replace(')',','+a+')');}
  function clampX(x,w){return Math.max(8,Math.min(W-8-w,x));}
  function measure(t){if(!t.w){t.w=t.el.offsetWidth||96;t.h=t.el.offsetHeight||22;}}
  function badgeAt(k){
    while(badgePool.length<=k){
      var el=document.createElement('div');el.className='cnum';el.style.opacity='0';
      document.body.appendChild(el);
      badgePool.push({el:el,on:false,o:0});
    }
    return badgePool[k];
  }
  function buildTags(){
    var i;
    for(i=0;i<tagPool.length;i++){
      var old=tagPool[i].el;
      if(old&&old.parentNode)old.parentNode.removeChild(old);
    }
    tagPool=[];
    for(i=0;i<ACTS.length;i++){
      var el=document.createElement('div');el.className='tag';el.style.opacity='0';
      var cs=(REG_COL[ACTS[i].cat]||DAWN_COL).getStyle();
      var d=document.createElement('i');
      d.style.background=cs;
      el.style.borderColor=cs.replace('rgb(','rgba(').replace(')',',.5)');
      el.appendChild(d);
      /* 名牌一律完整写「地点·名称」：宽屏窄屏同一套文案，不缩写、不截断
         （密度靠额度与成簇外挂控制，不靠砍字）。 */
      el.appendChild(document.createTextNode(ACTS[i].place+'·'+ACTS[i].name));
      (function(idx){
        el.addEventListener('click',function(){
          if(!tagPool[idx].on)return;
          selectMarker(idx);
        });
      })(i);
      document.body.appendChild(el);
      tagPool.push({el:el,w:0,h:0,on:false,o:0,col:cs});
    }
  }
  buildTags();
  /* 同一处的名牌候选位置：成列外挂，列首离光点留一段引线的长度，往上下哪边放得下挂哪边。
     纵向一律以「簇的位置」为准（不是各自的点）：簇内各点本就相差可达 CLUSTER_PX，
     各自为政会让行距忽宽忽窄、极端时互相压掉一格。横向仍取各自的 x，引线才指向自己的点。 */
  function tagSlots(c,t,g,maxRows){
    var out=[],k,idx,y0;
    if(g&&g.n>=2){
      /* 只给前 maxRows 行发槽位：排不上的成员不挂名牌，由列首的「N 项」徽标代表 */
      var rows=Math.min(g.n,maxRows);
      y0=(g.dir<0)?(g.y-34-t.h):(g.y+26);
      for(k=0;k<rows;k++){
        idx=(c.k+k)%g.n;
        out.push({x:clampX(c.x-t.w/2,t.w),y:y0+(g.dir<0?-idx:idx)*g.pitch,w:t.w,h:t.h});
      }
      return out;
    }
    out.push({x:clampX(c.x-t.w/2,t.w),y:c.y-t.h*1.4,w:t.w,h:t.h});
    return out;
  }
  var clusTop={};
  /* 可视范围判定：顶部控件、底部筛选条、已展开的卡片都会挡住名牌，
     被挡住的点降级（排在候选末尾，额度不够就先不给它），屏幕外的点直接不挂。
     每帧重建一次矩形（2~3 个元素量级，开销可忽略），不写死像素值，UI 改了也不用同步。 */
  var occRects=[];
  function collectOcc(){
    occRects.length=0;
    var sel=['.top','.tabs'];
    for(var i=0;i<sel.length;i++){
      var e=document.querySelector(sel[i]);
      if(!e)continue;
      var r=e.getBoundingClientRect();
      if(r.width&&r.height)occRects.push([r.left-8,r.top-8,r.right+8,r.bottom+8]);
    }
    if(cardEl.classList.contains('show')){
      var rc=cardEl.getBoundingClientRect();
      occRects.push([rc.left-8,rc.top-8,rc.right+8,rc.bottom+8]);
    }
  }
  function occluded(x,y){
    for(var i=0;i<occRects.length;i++){
      var r=occRects[i];
      if(x>r[0]&&x<r[2]&&y>r[1]&&y<r[3])return 1;
    }
    return 0;
  }
  function updateTags(){
    var i,j,k,show=showLabel&&!listOpen;   /* 名录浮层开着时整屏被盖住，不必再排名牌 */
    collectOcc();
    /* 名牌密度全部跟着缩放走，三件事一起随 z 变（z = fitR()/radius，默认视角 z=1，越近越大）：
       · 额度 budget：默认只挂最靠中心的一小撮，拉近按 z^1.6 增长到不限量；
       · 成簇距离 cpx：拉近后本可分开的点不再抱团（30 → 下限 14，窄屏 22 → 11）；
       · 窄屏再用更短的文案、每列最多两行兜底。 */
    var small=W<=640;
    var z=Math.max(0.35,fitR()/radius);
    var budget=Math.round((small?LABEL_GROW_SMALL:LABEL_GROW)*Math.pow(Math.max(0,z-1),1.3));
    if(curCat!=='all')budget=Math.max(budget,12);   /* 筛了某一类：这一类应当看得见名牌 */
    if(selIdx>=0)budget++;                          /* 选中项永远保留自己的名牌 */
    var cpx=Math.max(small?11:14,(small?CLUSTER_PX_SMALL:CLUSTER_PX)/z);
    var colMax=small?COL_MAX_SMALL:COL_MAX;
    tagCand.length=0;
    if(show){
      for(i=0;i<markers.length;i++){
        var m=markers[i];
        if(!m.front||m.dim||!m.core.visible)continue;
        _v.setFromMatrixPosition(m.grp.matrixWorld);_v.project(camera);
        var px=(_v.x*0.5+0.5)*W,py=(-_v.y*0.5+0.5)*H;
        if(px<-20||px>W+20||py<-20||py>H+20)continue;   /* 屏幕外：挂了也看不见，不占额度 */
        tagCand.push({i:i,x:px,y:py,f:m.fade,sel:m.sel,occ:occluded(px,py),cl:-1,k:0});
      }
      /* 优先级：选中项 → 露在外面的（未被 UI 遮挡）→ 屏幕可见度高的（越靠镜头中心越优先）；
         额度用完剩下的这一帧就不挂名牌。 */
      tagCand.sort(function(a,b){
        return (b.sel?1:0)-(a.sel?1:0)||(a.occ-b.occ)||(b.f-a.f);
      });
      if(tagCand.length>budget)tagCand.length=budget;
    }
    /* 屏幕上挨得太近的算作「同一处」；簇首是优先级最高的那条，点光点时也优先选它 */
    var clus=[];
    for(i=0;i<tagCand.length;i++){
      var c=tagCand[i],g=-1;
      for(j=0;j<clus.length;j++){
        if(Math.abs(c.x-clus[j].x)<cpx&&Math.abs(c.y-clus[j].y)<cpx){g=j;break;}
      }
      if(g<0){clus.push({x:c.x,y:c.y,n:0,dir:-1,pitch:28,fade:1,placed:0,top:c.i});g=clus.length-1;}
      c.cl=g;c.k=clus[g].n++;
    }
    clusTop={};
    for(i=0;i<tagCand.length;i++){
      var cg=clus[tagCand[i].cl];
      clusTop[tagCand[i].i]=(cg&&cg.n>1)?cg.top:tagCand[i].i;
    }
    /* 列的方向与行距：行距取该列最高的一条名牌 + 间隙，保证相邻两条的判定框不重叠 */
    for(j=0;j<clus.length;j++){
      var g2=clus[j];
      if(g2.n<2)continue;
      var maxH=0,mf=0;
      for(i=0;i<tagCand.length;i++){
        if(tagCand[i].cl!==j)continue;
        var t0=tagPool[tagCand[i].i];measure(t0);
        if(t0.h>maxH)maxH=t0.h;
        if(tagCand[i].f>mf)mf=tagCand[i].f;
      }
      g2.pitch=maxH+TAG_PITCH_GAP;g2.fade=mf;
      var need=(g2.n-1)*g2.pitch+34;
      g2.dir=((g2.y-70>=need)||(g2.y-70>=H-100-g2.y))?-1:1;
    }
    for(i=0;i<tagPool.length;i++)tagPool[i].on=false;
    for(i=0;i<badgePool.length;i++)badgePool[i].on=false;
    var placed=[],lines=[],bi=0;
    for(i=0;i<tagCand.length;i++){
      var c2=tagCand[i],t=tagPool[c2.i],el=t.el;
      measure(t);
      var gc=(c2.cl>=0)?clus[c2.cl]:null;
      var slots=tagSlots(c2,t,gc,colMax),put=null;
      for(k=0;k<slots.length;k++){                       /* 首选自己那一格，挤了就顺延到别格 */
        var b=slots[k],bw=b.w+6,bh=b.h+6,rx=b.x-3,ry=b.y-3,ok=true;
        for(j=0;j<placed.length;j++){
          var p=placed[j];
          if(rx<p.x+p.w&&p.x<rx+bw&&ry<p.y+p.h&&p.y<ry+bh){ok=false;break;}
        }
        if(ok){put=b;placed.push({x:rx,y:ry,w:bw,h:bh});break;}
      }
      if(!put)continue;
      t.on=true;if(gc&&gc.n>1)gc.placed++;
      var o=c2.sel?1:Math.min(1,c2.f*1.15);
      el.style.left=(put.x+put.w/2).toFixed(1)+'px';el.style.top=(put.y+put.h*1.4).toFixed(1)+'px';
      if(Math.abs(o-t.o)>0.02){el.style.opacity=o.toFixed(2);t.o=o;}
      if(c2.sel!==(el.className.indexOf('on')>=0))el.className=c2.sel?'tag on':'tag';
      /* 名牌离自己的光点超过 LEAD_MIN 才牵一条细线（普通名牌本来就贴着光点，不牵） */
      var ax=put.x+put.w/2,ay=(put.y+put.h<=c2.y)?(put.y+put.h):put.y;
      if(Math.hypot(ax-c2.x,ay-c2.y)>LEAD_MIN)lines.push({x1:c2.x,y1:c2.y,x2:ax,y2:ay,a:o,col:t.col,sel:c2.sel});
    }
    /* 数字徽标：贴在光点旁，说明这一处压着几项（真挤到放不下就放弃，不硬塞） */
    for(j=0;j<clus.length;j++){
      var g3=clus[j];
      if(!show||g3.n<BADGE_MIN||!g3.placed)continue;
      var be=badgeAt(bi++),bel=be.el,txt=g3.n+DIM.listUnit;
      if(bel.textContent!==txt)bel.textContent=txt;
      var nw=bel.offsetWidth||26,nh=bel.offsetHeight||18;
      var nx=(g3.x-nw-9>=8)?(g3.x-nw-9):Math.max(8,Math.min(W-8-nw,g3.x+9)),ny=g3.y-nh/2;
      var rx2=nx-3,ry2=ny-3,rw2=nw+6,rh2=nh+6,bad=true;
      for(i=0;i<placed.length;i++){
        var p2=placed[i];
        if(rx2<p2.x+p2.w&&p2.x<rx2+rw2&&ry2<p2.y+p2.h&&p2.y<ry2+rh2){bad=false;break;}
      }
      if(!bad)continue;
      var bo=Math.max(0,Math.min(1,g3.fade*1.15));
      bel.style.left=(nx+nw/2).toFixed(1)+'px';bel.style.top=(ny+nh/2).toFixed(1)+'px';
      if(Math.abs(bo-be.o)>0.02){bel.style.opacity=bo.toFixed(2);be.o=bo;}
      be.on=true;placed.push({x:rx2,y:ry2,w:rw2,h:rh2});
    }
    for(i=0;i<tagPool.length;i++){
      var q=tagPool[i];
      if(!q.on&&q.o!==0){q.el.style.opacity='0';q.o=0;q.el.className='tag';}
      q.el.style.pointerEvents=q.on?'auto':'none';
    }
    for(i=0;i<badgePool.length;i++){
      var q2=badgePool[i];
      if(!q2.on&&q2.o!==0){q2.el.style.opacity='0';q2.o=0;}
    }
    /* 引线画在同一张叠加画布上：每帧重来，地球转起来才跟得住 */
    if(leadCtx&&(lines.length||leadDirty)){
      leadCtx.setTransform(leadDpr,0,0,leadDpr,0,0);
      leadCtx.clearRect(0,0,W,H);
      leadCtx.lineWidth=1;
      for(i=0;i<lines.length;i++){
        var L=lines[i],la=Math.min(L.sel?0.72:0.46,(L.sel?0.7:0.42)*L.a);
        leadCtx.strokeStyle=L.sel?'rgba(238,212,154,'+la.toFixed(2)+')':rgbaOf(L.col,la.toFixed(2));
        leadCtx.beginPath();leadCtx.moveTo(L.x1,L.y1);leadCtx.lineTo(L.x2,L.y2);leadCtx.stroke();
      }
      leadDirty=lines.length>0;
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
    if(autoSpin && selIdx<0 && curCat==='all'){
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
    sizeLeaders();
    if(!userZoomed)radiusG=fitR();
    for(var i=0;i<tagPool.length;i++){tagPool[i].w=0;tagPool[i].h=0;}
  });
  addEventListener('visibilitychange',function(){if(document.hidden){running=false;}else if(!running){running=true;clock.getDelta();animate();}});
  cv.addEventListener('webglcontextlost',function(e){e.preventDefault();running=false;document.getElementById('loader').classList.add('hide');document.getElementById('fallback').classList.add('show');},false);

  animate();
  setTimeout(function(){document.getElementById('loader').classList.add('hide');},600);
  setTimeout(function(){var tp=document.getElementById('tip');tp.classList.add('show');setTimeout(function(){tp.classList.remove('show');},3800);},1400);
})();
