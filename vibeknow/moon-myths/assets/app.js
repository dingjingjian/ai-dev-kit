(function(){
  var cv=document.getElementById('stage');
  var gl=null;try{gl=cv.getContext('webgl2')||cv.getContext('webgl')}catch(e){}
  if(!gl||typeof THREE==='undefined'){document.getElementById('fallback').classList.add('show');document.getElementById('loader').classList.add('hide');return;}
  /* 关掉 GL 的抖动（DITHER 默认是开的！）。GPU 把 float 结果写进 8bit 缓冲时会做有序抖动，
   * 在近黑的夜空里就变成一层肉眼可见的斜纹/方格网——"星空背景是方格子"多半就是它。
   * 关掉后靠贴图自身足够多的层次来避免色阶带。*/
  try{gl.disable(gl.DITHER);}catch(e){}

  /* DPR 上限 2（原 1.5）：手机上 canvas 按 1.5 倍渲染再被系统放大，星点/光圈边缘会发糊发方；
   * 放到 2 倍清爽很多，性能由末尾的自适应降采样兜底（帧时间超 40ms 就逐步降回 1）。*/
  var W=innerWidth,H=innerHeight,DPR=Math.min(devicePixelRatio||1,2);
  var renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(DPR);renderer.setSize(W,H,false);
  renderer.outputEncoding=THREE.sRGBEncoding;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.05;

  var scene=new THREE.Scene();
  var camera=new THREE.PerspectiveCamera(50,W/H,0.1,5000);
  var R=1.6;

  /* ===== 背景星空天球（深空底色 + 银河带贴图）=====
   * 贴图只画"连续的大面积亮雾"（底色 + 银河带 + 冷暖尘埃 + 极点压暗），一颗硬点都不画；
   * 具体星星全部交给下面的 Points 软点层，这样星星不再是贴图里被放大成方块的 1px 白点。
   * 银河带在贴图里画成水平带（左右边界天然连续、不会在球面接缝露馅），再由 GALAXY_TILT
   * 把天球整体绕 Z 倾斜成一条大圆；星点层的银道面用同一个倾角，两者才对得上。
   */
  var GALAXY_TILT=1.15;
  function starfieldTex(){
    var w=2048,h=1024,c=document.createElement('canvas');c.width=w;c.height=h;var x=c.getContext('2d'),i;
    var bg=x.createLinearGradient(0,0,0,h);
    bg.addColorStop(0,'#03060e');bg.addColorStop(.5,'#070c19');bg.addColorStop(1,'#03060e');
    x.fillStyle=bg;x.fillRect(0,0,w,h);
    // 银河主体：以赤道线为中心叠几层软渐变，越靠中心越亮（合起来接近高斯剖面）
    function band(col,spread,peak){
      var g=x.createLinearGradient(0,h/2-spread,0,h/2+spread);
      g.addColorStop(0,'rgba('+col+',0)');g.addColorStop(.2,'rgba('+col+','+(peak*.45)+')');
      g.addColorStop(.5,'rgba('+col+','+peak+')');g.addColorStop(.8,'rgba('+col+','+(peak*.45)+')');
      g.addColorStop(1,'rgba('+col+',0)');
      x.fillStyle=g;x.fillRect(0,h/2-spread,w,spread*2);
    }
    band('118,142,225',h*0.30,0.075);band('138,162,235',h*0.17,0.075);
    band('178,192,230',h*0.075,0.075);band('218,220,235',h*0.028,0.07);
    // 斑块工具：软斑只填各自包围盒（整幅 fill 太慢）；贴近左右边界的多画一份，跨贴图接缝不露边
    function blot(px,py,r,col,a){
      var g2=x.createRadialGradient(0,0,0,0,0,r);
      g2.addColorStop(0,'rgba('+col+','+a+')');g2.addColorStop(1,'rgba('+col+',0)');
      for(var k=-1;k<=1;k++){
        if(k&&px>w*.1&&px<w*.9)continue;
        x.save();x.translate(px+k*w,py);x.fillStyle=g2;x.fillRect(-r,-r,r*2,r*2);x.restore();
      }
    }
    // 带内宽幅软云：银河的过渡尽量由"云"来完成，而不是靠一层层平滑渐变 —— 渐变的色阶台阶
    // 只能靠噪点打散，而噪点会在天球上被放大成格子，所以这里先减少对渐变的依赖
    for(i=0;i<46;i++){
      blot(Math.random()*w,h/2+(Math.random()-.5)*h*.32,180+Math.random()*240,Math.random()<.5?'150,170,230':'200,196,225',.008+Math.random()*.014);
    }
    // 全天空极淡的星云底噪，避免背景死平
    for(i=0;i<16;i++)blot(Math.random()*w,Math.random()*h,120+Math.random()*260,Math.random()<.5?'150,170,230':'200,175,140',.010+Math.random()*.018);
    // 带内亮云（偏冷）与暖尘（偏黄）交错，做出银河的明暗层次
    for(i=0;i<120;i++){
      var warm=Math.random()<.45;
      blot(Math.random()*w,h/2+(Math.random()-.5)*h*.36,36+Math.random()*200,warm?'206,176,132':'150,172,232',.02+Math.random()*.045);
    }
    // 暗尘带：压在亮云上，银河才有"沟壑"而不是一片均匀亮雾
    for(i=0;i<34;i++){
      blot(Math.random()*w,h/2+(Math.random()-.5)*h*.20,60+Math.random()*230,'6,9,22',.04+Math.random()*.07);
    }
    // 银极压暗：带外更暗，纵深更足（同时避开球面两极的贴图畸变）
    var vg=x.createLinearGradient(0,0,0,h);
    vg.addColorStop(0,'rgba(0,0,0,.34)');vg.addColorStop(.34,'rgba(0,0,0,0)');
    vg.addColorStop(.66,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.34)');
    x.fillStyle=vg;x.fillRect(0,0,w,h);
    /* 这里不再铺任何"逐像素噪点"。
     * 天球贴图在屏幕上是被放大的（默认取景约 2.6 倍），贴图里 1 纹素的噪点会被放大成
     * 2~3px 的方块颗粒，在近黑的暗部看着就是一格一格的"方格子"——这正是要避免的。
     * 色阶台阶改由上面的云团来打散（云团的边界是不规则形状，不会看成网格）。 */
    var t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;
  }
  var sky=new THREE.Mesh(new THREE.SphereGeometry(3500,48,32),new THREE.MeshBasicMaterial({map:starfieldTex(),side:THREE.BackSide,depthWrite:false}));
  sky.rotation.z=GALAXY_TILT;scene.add(sky);

  /* ===== 光照 =====
   * 阳光跟随相机：方向光的方位始终与视线保持约 35° 夹角，
   * 这样飞到任何一个大洲，朝向我们的这一面都是白天（不会再"前面总是黑的"），
   * 同时保留一条晨昏线，昼夜交界仍在。
   */
  var ambient=new THREE.AmbientLight(0x2a3458,0.55);scene.add(ambient);
  var sunLight=new THREE.DirectionalLight(0xfff2d8,1.75);scene.add(sunLight);
  var fillLight=new THREE.DirectionalLight(0x6a7fb0,0.32);scene.add(fillLight);
  var SUN_YAW=0.62,SUN_LIFT=0.2,SUN_DIST=40;
  function updateSun(){
    var p=camera.position,len=p.length()||1;
    var ux=p.x/len,uy=p.y/len,uz=p.z/len;
    var c=Math.cos(SUN_YAW),s=Math.sin(SUN_YAW);
    var dx=ux*c-uz*s,dz=ux*s+uz*c;
    var dy=Math.max(-0.5,Math.min(0.75,uy+SUN_LIFT));
    sunLight.position.set(dx*SUN_DIST,dy*SUN_DIST,dz*SUN_DIST);
    fillLight.position.set(-dx*SUN_DIST,(-dy+0.12)*SUN_DIST,-dz*SUN_DIST);
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
  var earthMat=new THREE.MeshStandardMaterial({map:plainTex('#1a2a4a'),roughness:.85,metalness:.04});
  var earthMesh=new THREE.Mesh(new THREE.SphereGeometry(R,48,32),earthMat);mainSpin.add(earthMesh);
  var cloudMat=new THREE.MeshStandardMaterial({map:plainTex('#ffffff'),transparent:true,alphaMap:plainTex('#ffffff'),opacity:.5,roughness:1,depthWrite:false});
  var clouds=new THREE.Mesh(new THREE.SphereGeometry(R*1.012,48,32),cloudMat);mainTilt.add(clouds);
  var atmo=new THREE.Mesh(new THREE.SphereGeometry(R*1.06,48,32),new THREE.MeshBasicMaterial({color:0x4a6db5,side:THREE.BackSide,transparent:true,opacity:.22,blending:THREE.AdditiveBlending,depthWrite:false}));
  mainTilt.add(atmo);

  /* ===== 月亮（参考 earth-3d 的地月系统：贴图月球 + 公转轨道）=====
   * 半径：按真实地月半径比取值（月球 1737.4km / 地球 6371km ≈ 0.2727）→ R*0.2727 ≈ 0.436。
   * 轨道面：取 y=0 即黄道面，环心落在地心，与地球 23.5° 自转轴倾角分开表达 —— 真实月球轨道相对
   *       黄道只倾 5.1°（不跟着赤道走），所以既不挂进 mainTilt、也不另加倾斜（5.1° 在这个尺度近似为平）。
   * 轨道半径 3.0：为与地球同框做了大幅压缩（真实 384400km ≈ 60.3 个地球半径，此处仅 1.875 个），
   *       属示意；正圆、偏心率 0.055 未体现，地心当焦点（真实是地月质心，但质心在地球内部，可忽略）。
   * 公转周期：真实为地球自转的 27.32 倍（恒星月 27.32 天 vs 地球 1 天）。照抄则 24 分钟才绕一圈、
   *       画面里几乎钉住不动，故取 8 倍（EARTH_SPIN 0.12 / 8 = 0.015，约 7 分钟一圈）：是刻意加速，
   *       但保证"月球必须比地球自转慢"这个方向没错。要严格等比，把下面 /8 换成 /27.32。
   */
  var MOON_R=R*0.2727,MOON_ORBIT=3.0,MOON_SPEED=0.12/8;
  var moonSys=new THREE.Group();scene.add(moonSys);
  var moonOrbit=new THREE.Group();moonSys.add(moonOrbit);
  var moonMat=new THREE.MeshStandardMaterial({map:plainTex('#c9c9c6'),roughness:.95,metalness:0});
  var moon=new THREE.Mesh(new THREE.SphereGeometry(MOON_R,32,32),moonMat);
  moon.position.set(MOON_ORBIT,0,0);moonOrbit.add(moon);
  /* 潮汐锁定：月球公转一周恰好自转一周，永远以同一面朝地球。这里由 moonOrbit 连带月面同步旋转。
   * 但 SphereGeometry 把贴图 u=0.5 贴在局部 +X，而 moon.jpg 是「近地面居中」的全月图（u=0.5 即近地面），
   * 月球又正好停在 moonOrbit 的 +X 上 —— 不处理就会把背面锁给地球，故整体绕 Y 预旋 π。
   * （同 earth-3d 的 moon.rotation.y=mAng+Math.PI，那边因为月球不在旋转父级里才写成角度相加。）*/
  moon.rotation.y=Math.PI;
  var moonGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:radialTex('rgba(226,232,245,.18)','rgba(170,185,215,.05)','rgba(170,185,215,0)'),blending:THREE.AdditiveBlending,transparent:true,depthWrite:false}));
  moonGlow.scale.set(MOON_R*5.2,MOON_R*5.2,1);moon.add(moonGlow);
  var moonOrbitLine=(function(){
    var n=160,pos=new Float32Array((n+1)*3);
    for(var i=0;i<=n;i++){var a=i/n*Math.PI*2;pos[i*3]=Math.cos(a)*MOON_ORBIT;pos[i*3+1]=0;pos[i*3+2]=-Math.sin(a)*MOON_ORBIT;}
    var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));
    return new THREE.Line(g,new THREE.LineBasicMaterial({color:0x8fa4c0,transparent:true,opacity:.35}));
  })();
  moonSys.add(moonOrbitLine);
  var moonAngle=Math.PI*0.35;

  /* ===== 神话标记点 ===== */
  var markerGroup=new THREE.Group();mainSpin.add(markerGroup);
  var glowTex=radialTex('rgba(232,236,245,.95)','rgba(180,200,240,.4)','rgba(160,180,220,0)');
  var ringTex=radialTex('rgba(232,236,245,.7)','rgba(180,200,240,.22)','rgba(160,180,220,0)');
  var goldGlowTex=radialTex('rgba(255,235,170,.98)','rgba(212,182,106,.5)','rgba(180,150,80,0)');
  var goldRingTex=radialTex('rgba(255,225,150,.8)','rgba(212,182,106,.3)','rgba(180,150,80,0)');
  /* 光圈样式：细环描边 + 压暗底盘。
   * 原来每个标记只有两张"软白圆盘"，落在雪地、冰川、云这类亮地表上就跟背景糊成一片；
   * 现在多加两层：一层压暗底盘（中心轻压、光圈半径处压得更重，等于给光圈描一圈暗中边），
   * 一张细环把光圈的边界定住 —— 亮地表靠"暗底 + 亮环"的反差看清，
   * 深色海面上依旧是一片干净的月光。 */
  function thinRingTex(){
    var s=128,c=document.createElement('canvas');c.width=c.height=s;var x=c.getContext('2d');
    var g=x.createRadialGradient(64,64,0,64,64,64);
    g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.44,'rgba(255,255,255,0)');
    g.addColorStop(.482,'rgba(255,255,255,.45)');g.addColorStop(.5,'rgba(255,255,255,1)');
    g.addColorStop(.518,'rgba(255,255,255,.45)');g.addColorStop(.56,'rgba(255,255,255,0)');
    g.addColorStop(1,'rgba(255,255,255,0)');
    x.fillStyle=g;x.fillRect(0,0,s,s);
    var t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;
  }
  var ringLineTex=thinRingTex();
  var shadeTex=(function(){
    var s=128,c=document.createElement('canvas');c.width=c.height=s;var x=c.getContext('2d');
    var g=x.createRadialGradient(64,64,0,64,64,64);
    g.addColorStop(0,'rgba(3,6,15,.36)');g.addColorStop(.3,'rgba(3,6,15,.3)');
    g.addColorStop(.45,'rgba(3,6,15,.54)');g.addColorStop(.62,'rgba(3,6,15,.5)');
    g.addColorStop(.78,'rgba(3,6,15,.15)');g.addColorStop(1,'rgba(3,6,15,0)');
    x.fillStyle=g;x.fillRect(0,0,s,s);
    return new THREE.CanvasTexture(c);
  })();
  var MOON_COL=new THREE.Color('#e8ecf5');
  var GOLD_COL=new THREE.Color('#d4b66a');
  var DIM_COL=new THREE.Color('#5a6a8a');
  var markers=[];
  (function buildMarkers(){
    for(var i=0;i<MYTHS.length;i++){
      var m=MYTHS[i];
      var grp=new THREE.Group();
      grp.position.copy(ll2v(m.lat,m.lon,R*1.012));
      grp.lookAt(0,0,0);grp.rotateX(Math.PI);
      var dot=new THREE.Mesh(new THREE.SphereGeometry(0.05,14,14),new THREE.MeshBasicMaterial({color:MOON_COL.clone(),transparent:true,opacity:.95}));
      var shade=new THREE.Sprite(new THREE.SpriteMaterial({map:shadeTex,transparent:true,depthWrite:false,depthTest:false,opacity:.92}));
      shade.scale.set(0.68,0.68,1);
      var glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,depthTest:false,color:MOON_COL.clone(),opacity:.6}));
      glow.scale.set(0.42,0.42,1);
      var ring=new THREE.Sprite(new THREE.SpriteMaterial({map:ringTex,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,depthTest:false,color:MOON_COL.clone(),opacity:.7}));
      ring.scale.set(0.66,0.66,1);
      var line=new THREE.Sprite(new THREE.SpriteMaterial({map:ringLineTex,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,depthTest:false,color:MOON_COL.clone(),opacity:.9}));
      line.scale.set(0.66,0.66,1);
      var hit=new THREE.Mesh(new THREE.SphereGeometry(0.16,10,10),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,depthTest:false}));
      // depthTest 全关，靠 renderOrder 手动定层序：暗底盘 → 光晕 → 软晕 → 细环 → 中心点
      shade.renderOrder=10;glow.renderOrder=11;ring.renderOrder=12;line.renderOrder=13;dot.renderOrder=14;
      grp.add(shade);grp.add(glow);grp.add(ring);grp.add(line);grp.add(dot);grp.add(hit);
      markerGroup.add(grp);
      markers.push({myth:m,grp:grp,dot:dot,glow:glow,ring:ring,line:line,shade:shade,hit:hit,sel:false,dim:false,front:false});
    }
  })();

  /* ===== 星空点 =====
   * 星星用软圆点精灵（Points）画，不再依赖贴图里的 1px 方块：
   * 分 4 档大小 + 每颗独立亮度/色温 + 银道面聚集，最亮的一档带十字星芒。
   * 关掉 sizeAttenuation：星星尺寸只跟屏幕有关，拉近拉远不会被放大成方块；
   * size 单位是设备像素，故乘 DPR（脚本开头已把 DPR 上限压到 1.5）。
   */
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
  /* 小尺寸星点专用：亮核更集中。1~2px 的星点会被缩到亚像素、等于对整张精灵做平均，
   * 光晕摊得越开越暗，所以这一档不能用上面那张大光晕。*/
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
    // bandP：这一档有多大比例收拢到银道面附近；maxB：这一档亮度的上限
    var tiers=[{n:5600,size:1.5,tex:dot,op:.9,bandP:.8,maxB:.72},
               {n:3000,size:2.2,tex:dot,op:.92,bandP:.7,maxB:.82},
               {n:1000,size:3.3,tex:soft,op:.96,bandP:.55,maxB:.95},
               {n:160,size:5.2,tex:flare,op:1,bandP:.38,maxB:1}];
    for(var k=0;k<tiers.length;k++){
      var T=tiers[k],n=T.n,pos=new Float32Array(n*3),col=new Float32Array(n*3);
      for(var i=0;i<n;i++){
        var u=Math.random()*2-1,v=Math.random()*6.2832,sp=Math.sqrt(1-u*u);
        var dx=sp*Math.cos(v),dy=u,dz=sp*Math.sin(v);
        if(Math.random()<T.bandP)dy*=Math.abs(gaussRand())*.28; // 压向银道面
        var L=Math.sqrt(dx*dx+dy*dy+dz*dz)||1,rad=1000+Math.random()*600;
        pos[i*3]=dx/L*rad;pos[i*3+1]=dy/L*rad;pos[i*3+2]=dz/L*rad;
        var b=T.maxB*(.34+Math.pow(Math.random(),2)*.66),ct=Math.random();
        if(ct<.6){col[i*3]=b*.86;col[i*3+1]=b*.92;col[i*3+2]=b;}     // 偏冷白
        else if(ct<.88){col[i*3]=b;col[i*3+1]=b;col[i*3+2]=b*.99;}   // 白
        else{col[i*3]=b;col[i*3+1]=b*.88;col[i*3+2]=b*.7;}           // 暖黄
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
  load('./assets/moon.jpg',function(t){t.encoding=THREE.sRGBEncoding;t.anisotropy=maxA;moonMat.map=t;moonMat.needsUpdate=true;});

  /* ===== 相机 =====
   * 取景系数 2.2（原 1.9）：略微拉远，让月球轨道也落在画面内，地月同框。
   */
  function fitR(){var vFov=camera.fov*Math.PI/180;var hFov=2*Math.atan(Math.tan(vFov/2)*camera.aspect);return Math.max(4,2.2*R/Math.tan(hFov/2));}
  var theta=0.6,phi=1.15,radius=fitR();
  var thetaG=theta,phiG=phi,radiusG=radius,userZoomed=false;
  var R_MIN=2.2,R_MAX=26;
  function camPos(){var sp=Math.sin(phi);
    camera.position.set(radius*sp*Math.sin(theta),radius*Math.cos(phi),radius*sp*Math.cos(theta));
    camera.lookAt(0,0,0);
    updateSun();
  }
  /* 开场视角（也是"重置视角"）正对的那个点：中国·嫦娥奔月 */
  var HOME_LAT=35,HOME_LON=105;
  (function(){
    for(var i=0;i<MYTHS.length;i++){
      if(MYTHS[i].civ==='中国'){HOME_LAT=MYTHS[i].lat;HOME_LON=MYTHS[i].lon;return;}
    }
  })();
  /* 把相机方位对到某个经纬度（即"正对该点"所需的角度）。
   * 别自己手写"自转 + 地轴倾角"的矩阵：这里漏过 mainTilt 的 23.5°，
   * 飞过去横向没事、纵向会偏十几度。直接取标记的世界变换最稳。 */
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
    aimLatLon(markers[i].myth.lat,markers[i].myth.lon);
    if(!userZoomed)radiusG=fitR()*0.82;
    showCard(i);
  }
  function clearSelection(){
    selIdx=-1;
    if(!userZoomed)radiusG=fitR();
    hideCard();
  }

  /* ===== 神话卡片 ===== */
  var cardEl=document.getElementById('card');
  var picEl=document.getElementById('cPic');
  var picFileEl=document.getElementById('cPicFile');
  /* 配图预检：IMG_OK[i] true 有图 / false 无图或加载失败 / null 检测中。
   * 缺图一律回退到 index.html 里 .pic 的程序化占位，不出现空白块、不改动卡片尺寸，
   * 因此配图可以分批补，不必等 14 张齐了再上线（契约见 docs/配图提示词.md）。 */
  var IMG_OK={};
  MYTHS.forEach(function(m,i){
    if(!m.img){IMG_OK[i]=false;return;}
    IMG_OK[i]=null;
    var im=new Image();
    im.onload=function(){IMG_OK[i]=true;if(selIdx===i)showCard(i);};
    im.onerror=function(){IMG_OK[i]=false;};
    im.src=m.img;
  });
  // 2.6s 仍未就绪的按缺图处理：先给占位，不让卡片空等
  setTimeout(function(){
    for(var i=0;i<MYTHS.length;i++)if(MYTHS[i].img&&IMG_OK[i]===null){IMG_OK[i]=false;if(selIdx===i)showCard(i);}
  },2600);
  function applyPic(m,i){
    var ok=!!(m.img&&IMG_OK[i]===true);
    picEl.className=ok?'pic has':'pic';
    if(ok)picEl.style.backgroundImage="url('"+m.img+"')";else picEl.style.backgroundImage='';
    picFileEl.textContent=m.slug?m.slug+'.webp':'';
  }
  function showCard(i){
    var m=MYTHS[i];
    document.getElementById('cCiv').textContent=m.civ+' · '+regionName(m.region);
    document.getElementById('cName').textContent=m.name;
    applyPic(m,i);
    document.getElementById('cStory').textContent=m.story;
    document.getElementById('cTags').innerHTML=m.tags.map(function(t){return '<span>'+t+'</span>';}).join('');
    document.getElementById('cLoc').textContent='纬度 '+m.lat.toFixed(1)+'°  经度 '+m.lon.toFixed(1)+'°';
    cardEl.classList.add('show');
  }
  function hideCard(){cardEl.classList.remove('show');}
  document.getElementById('cClose').addEventListener('click',clearSelection);

  function regionName(id){
    for(var i=0;i<REGIONS.length;i++)if(REGIONS[i].id===id)return REGIONS[i].name;
    return '';
  }

  /* ===== 区域筛选 tabs ===== */
  var curRegion='all';
  var tabsEl=document.getElementById('tabs');
  var dDragged=false;
  (function buildTabs(){
    for(var i=0;i<REGIONS.length;i++){
      var r=REGIONS[i];
      var b=document.createElement('button');
      // 各大洲前的彩色提示点（同 solar-system-3d dock 的圆点）
      var dot=document.createElement('span');
      dot.className='dot';dot.style.background=r.color||'#e8ecf5';
      b.appendChild(dot);
      b.appendChild(document.createTextNode(r.name));
      b.setAttribute('data-r',r.id);
      if(r.id==='all')b.classList.add('on');
      b.addEventListener('click',function(rid,rlat,rlon,btn){return function(){
        if(dDragged){dDragged=false;return;}
        curRegion=rid;
        var btns=tabsEl.querySelectorAll('button');
        for(var k=0;k<btns.length;k++)btns[k].classList.toggle('on',btns[k].getAttribute('data-r')===rid);
        // 选中后把当前 tab 滚到可视区域居中（同 solar-system-3d dock 逻辑）
        try{btn.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'});}catch(_){btn.scrollIntoView(true);}
        if(rid!=='all')aimLatLon(rlat,rlon);
        clearSelection();
      };}(r.id,r.lat,r.lon,b));
      tabsEl.appendChild(b);
    }
  })();
  // tabs 滚动：触摸端原生横滑（CSS touch-action:pan-x），桌面端滚轮横滚 + 鼠标拖拽
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
  addEventListener('resize',tabsFade);tabsFade();setTimeout(tabsFade,400);

  /* ===== 设置 ===== */
  var autoSpin=true,showStars=true,showClouds=true,showLabel=true,showMoon=true;
  function bind(id,fn){var el=document.getElementById(id);el.addEventListener('click',function(){el.classList.toggle('on');fn(el.classList.contains('on'));});}
  bind('swSpin',function(v){autoSpin=v;});
  bind('swStars',function(v){showStars=v;stars.visible=v;sky.visible=v;});
  bind('swClouds',function(v){showClouds=v;clouds.visible=v;});
  bind('swMoon',function(v){showMoon=v;moonSys.visible=v;});
  bind('swLabel',function(v){showLabel=v;});
  document.getElementById('bReset').addEventListener('click',function(){aimLatLon(HOME_LAT,HOME_LON);radiusG=fitR();userZoomed=false;clearSelection();});
  document.getElementById('bTop').addEventListener('click',function(){phiG=0.02;});
  var sheet=document.getElementById('sheet'),scrim=document.getElementById('scrim');
  function openSheet(v){sheet.classList.toggle('show',v);scrim.classList.toggle('show',v);}
  document.getElementById('gear').addEventListener('click',function(){openSheet(true);});
  document.getElementById('sClose').addEventListener('click',function(){openSheet(false);});
  scrim.addEventListener('click',function(){openSheet(false);});

  /* ===== 标记点显隐与脉动 ===== */
  var _v=new THREE.Vector3(),_n=new THREE.Vector3(),_d=new THREE.Vector3();
  function refreshMarkers(t){
    for(var i=0;i<markers.length;i++){
      var m=markers[i];
      var sel=(i===selIdx);
      var inReg=(curRegion==='all'||m.myth.region===curRegion);
      var dim=(!sel&&!inReg);
      m.sel=sel;m.dim=dim;
      _v.setFromMatrixPosition(m.grp.matrixWorld);_v.project(camera);
      m.grp.getWorldPosition(_n);
      _d.copy(camera.position).sub(_n).normalize();_n.normalize();
      var front=(_v.z<1)&&(_n.dot(_d)>=0.18);
      m.front=front;
      m.glow.visible=front&&(sel||inReg);
      m.ring.visible=front&&(sel||inReg);
      m.line.visible=front&&(sel||inReg);
      m.shade.visible=front&&(sel||inReg);
      m.dot.visible=front&&(sel||inReg);
      if(!front){continue;}
      var pulse=0.5+0.5*Math.sin(t*2.4+i*0.7);
      if(sel){
        var g=0.5*(1+0.4*pulse),r=0.78*(1+0.45*pulse);
        m.glow.material.color.copy(GOLD_COL);
        m.ring.material.color.copy(GOLD_COL);
        m.line.material.color.copy(GOLD_COL);
        m.glow.material.map=goldGlowTex;m.ring.material.map=goldRingTex;
        m.glow.material.opacity=.85;m.ring.material.opacity=.95;m.line.material.opacity=1;
        m.glow.scale.set(g,g,1);m.ring.scale.set(r,r,1);m.line.scale.set(r,r,1);
        m.shade.scale.set(r*1.04,r*1.04,1);m.shade.material.opacity=.95;
        m.dot.material.color.copy(GOLD_COL);
        m.dot.scale.setScalar(1.15);
      }else if(dim){
        m.glow.material.color.copy(DIM_COL);
        m.ring.material.color.copy(DIM_COL);
        m.line.material.color.copy(DIM_COL);
        m.glow.material.map=glowTex;m.ring.material.map=ringTex;
        m.glow.scale.set(0.22,0.22,1);m.ring.scale.set(0.34,0.34,1);m.line.scale.set(0.34,0.34,1);
        m.shade.scale.set(0.35,0.35,1);m.shade.material.opacity=.5;
        m.dot.material.color.copy(DIM_COL);
        m.dot.scale.setScalar(0.5);
      }else{
        m.glow.material.color.copy(MOON_COL);
        m.ring.material.color.copy(MOON_COL);
        m.line.material.color.copy(MOON_COL);
        m.glow.material.map=glowTex;m.ring.material.map=ringTex;
        var g2=0.36*(1+0.22*pulse),r2=0.58*(1+0.28*pulse);
        m.glow.scale.set(g2,g2,1);m.ring.scale.set(r2,r2,1);m.line.scale.set(r2,r2,1);
        m.shade.scale.set(r2*1.04,r2*1.04,1);m.shade.material.opacity=.92;
        m.dot.material.color.copy(MOON_COL);
        m.dot.scale.setScalar(0.85);
      }
    }
  }

  /* ===== 标签投影（选中或悬浮标记的名称）===== */
  var tagPool=[];
  function ensureTags(n){
    while(tagPool.length<n){
      var el=document.createElement('div');el.className='tag';el.style.opacity='0';
      document.body.appendChild(el);tagPool.push(el);
    }
  }
  function updateTags(){
    var need=showLabel?(selIdx>=0?1:0):0;
    ensureTags(1);
    var el=tagPool[0];
    if(need<1){el.style.opacity='0';return;}
    if(selIdx<0){el.style.opacity='0';return;}
    var m=markers[selIdx];
    if(!m.front){el.style.opacity='0';return;}
    _v.setFromMatrixPosition(m.grp.matrixWorld);_v.project(camera);
    el.style.left=((_v.x*0.5+0.5)*W).toFixed(1)+'px';
    el.style.top=((-_v.y*0.5+0.5)*H).toFixed(1)+'px';
    el.textContent=m.myth.civ+'·'+m.myth.name;
    el.style.opacity='1';
  }

  /* ===== 动画 ===== */
  var clock=new THREE.Clock();
  var running=true,perfAccum=0,perfCount=0,dprStep=DPR;
  var eSpin=0.3;
  var EARTH_SPIN=0.12;
  /* 开场视角：先把初始自转落到 mainSpin 上（否则算出来的是"还没转"的中国位置），
   * 再把相机方位对准中国·嫦娥奔月；theta/thetaG 一起赋值，避免开场先甩一下。 */
  mainSpin.rotation.y=eSpin;
  aimLatLon(HOME_LAT,HOME_LON);
  theta=thetaG;phi=phiG;
  function animate(){
    if(!running)return;
    requestAnimationFrame(animate);
    var dt=clock.getDelta(),t=performance.now()*0.001;
    // 自转：选中某个神话点、或已切换到具体大洲时停转，方便细看
    if(autoSpin && selIdx<0 && curRegion==='all'){
      eSpin+=dt*EARTH_SPIN;
      mainSpin.rotation.y=eSpin;
      clouds.rotation.y=eSpin*1.1;
    }
    moonAngle+=dt*MOON_SPEED;
    moonOrbit.rotation.y=moonAngle;
    // 天球与星点同一转速：银河带与星星是同一片天，转速不同会互相错位
    stars.rotation.y+=dt*0.0016;sky.rotation.y+=dt*0.0016;
    theta+=(thetaG-theta)*0.12;phi+=(phiG-phi)*0.12;radius+=(radiusG-radius)*0.1;
    camPos();
    refreshMarkers(t);
    renderer.render(scene,camera);
    updateTags();
    perfAccum+=dt;perfCount++;
    if(perfCount>=30){var avg=perfAccum/perfCount;perfAccum=0;perfCount=0;if(avg>0.04&&dprStep>1){dprStep=Math.max(1,dprStep-0.25);renderer.setPixelRatio(dprStep);renderer.setSize(W,H,false);}}
  }
  addEventListener('resize',function(){
    W=innerWidth;H=innerHeight;camera.aspect=W/H;camera.updateProjectionMatrix();renderer.setSize(W,H,false);
    if(!userZoomed)radiusG=fitR();
  });
  addEventListener('visibilitychange',function(){if(document.hidden){running=false;}else if(!running){running=true;clock.getDelta();animate();}});
  cv.addEventListener('webglcontextlost',function(e){e.preventDefault();running=false;document.getElementById('loader').classList.add('hide');document.getElementById('fallback').classList.add('show');},false);

  animate();
  setTimeout(function(){document.getElementById('loader').classList.add('hide');},600);
  setTimeout(function(){var tp=document.getElementById('tip');tp.classList.add('show');setTimeout(function(){tp.classList.remove('show');},3800);},1400);
})();
