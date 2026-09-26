(function(){
  var cv=document.getElementById('stage');
  var gl=null;try{gl=cv.getContext('webgl2')||cv.getContext('webgl')}catch(e){}
  if(!gl||typeof THREE==='undefined'){document.getElementById('fallback').classList.add('show');document.getElementById('loader').classList.add('hide');return;}
  /* 顺手关掉 GL 的抖动（DITHER 默认是开的）：GPU 把 float 结果写进 8bit 缓冲时会做有序抖动，
   * 在近黑的夜空里会多出一层细斜纹。注意它**不是**"星空背景有白色网格"的根因
   * （根因在 sky 贴图的逐纹素抖动，见 starfieldTex 末尾的说明），关掉只是顺带干净一点。*/
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
    /* ===== 收尾：整幅模糊一次 —— 这是"星空背景有白色网格"的真正解药 =====
     * Canvas2D 的渐变在 Chrome/Skia 里是**逐像素抖动**着色的：每个纹素带 ±2~5 的随机偏移，
     * 用来打散 8bit 的色阶带。问题在天球上被放大了 2~5 倍（1 纹素 ≈ 2~5 屏幕像素），
     * 于是这层抖动变成一片横竖对齐、一格一格的"白色网格"糊在银河和星云上 —— 就是用户报的那个现象。
     * 三个曾经的误判，别改回去：
     *   · 不是 GL 输出端的 DITHER（那是屏幕空间的有序抖动，关掉与否都还在贴图里）；
     *   · 不是"贴图分辨率不够"（放大贴图只会把网格放大得更明显）；
     *   · 更不能靠"往贴图里撒噪点"去中和（那正是网格的来源）。
     * 唯一有效的办法是把逐纹素的抖动平均掉：blur(2.5px) 一次，抖动细胞只有 1 纹素，
     * 3×3 的核就基本削平；而斑块、银河带本来就是软的，形状损失看不出来（对比测试过 orig / blur 两版贴图）。
     * 左右各多画一份（±w）让跨贴图接缝处也有像素可采样 —— 否则接缝两侧会被模糊成透明的暗边，
     * 球面上会看到一道竖缝（球面 u=0/u=1 是同一个经线，接缝必须自连续）。
     * 开销：3 次 2048×1024 的高斯模糊约 100ms（桌面 CPU），是一次性的开场开销，藏在 #loader 的 600ms 里。
     * 兼容：老 Safari（<16.4）不支持 ctx.filter，赋值会被忽略、drawImage 退化成原样拷贝，
     *       行为与加这行之前完全一致，不会坏（故不需要能力检测分支）。 */
    var c2=document.createElement('canvas');c2.width=w;c2.height=h;
    var x2=c2.getContext('2d');
    x2.filter='blur(2.5px)';
    x2.drawImage(c,-w,0);x2.drawImage(c,0,0);x2.drawImage(c,w,0);
    var t=new THREE.CanvasTexture(c2);t.encoding=THREE.sRGBEncoding;
    /* 球两极的 UV 是被挤成一束的，各向异性过滤能明显减轻极点附近的糊与闪 */
    t.anisotropy=renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  var sky=new THREE.Mesh(new THREE.SphereGeometry(3500,48,32),new THREE.MeshBasicMaterial({map:starfieldTex(),side:THREE.BackSide,depthWrite:false}));
  sky.rotation.z=GALAXY_TILT;scene.add(sky);

  /* ===== 光照与月相：全部取真实北京时间 =====
   * 直射点经度：12:00 UTC 太阳在 0° 经线上，之后每差一小时西移 15°；北京时间 = UTC+8，
   *   于是 λ = 15°×(12 − UTC小时) = 15°×(20 − 北京小时)（北京 12:00 → 120°E，正合）。
   * 直射点纬度（太阳赤纬）随季节走：δ = −23.44°×cos(2π(N+10)/365.24)，N = 一年中的第几天。
   *   于是夏至前后北极是"日不落"、冬至前后是极夜，晨昏线的倾斜也跟着季节变。
   * 太阳在世界系里是**固定**的（只随真实时间慢慢走），地球照旧自转 —— 这才是真的日地关系：
   *   太阳不动、地球转，晨昏线扫过球面，谁在白天由自转决定（不再"跟着相机转"）。
   * 月相：以 2000-01-06 18:14 UTC 的朔为历元，按朔望月 29.530588853 天取小数部分，
   *   0 = 朔，0.25 = 上弦，0.5 = 望，0.75 = 下弦；照亮比 k = (1 − cos(2π·phase))/2。
   * 月亮摆在：与太阳的角距（月龄角）E = phase×360°，方位 = 太阳方位 + E（顺行方向），
   *   赤纬取 δ_月 = δ_日×cos E —— 朔时与太阳同侧（角距 0°）、望时正对（角距 180°），
   *   三维里两者的夹角才恰好等于 E，被照亮的比例和真实月相严丝合缝。
   *   （若把月亮钉死在 y=0 的黄道面上，朔／望的角距最多只能到 180°−|δ|，满月会差成凸月。）
   * 月光也接进来：一盏随盈亏变亮的冷白补光，让夜半球不至于死黑 —— 正好是"月话"的调子。
   * 已知取舍：地球自转仍是 0.12 rad/s（约 52 秒一天，为了看得见它转），所以某一地的昼夜
   *   是被快进了的；真实的是"太阳此刻在哪、月亮此刻什么相、晨昏线怎么倾"。 */
  var ambient=new THREE.AmbientLight(0x2a3458,0.5);scene.add(ambient);
  var sunLight=new THREE.DirectionalLight(0xfff2d8,1.75);scene.add(sunLight);
  var fillLight=new THREE.DirectionalLight(0x6a7fb0,0.22);scene.add(fillLight);
  var moonLight=new THREE.DirectionalLight(0xb9c8ea,0.25);scene.add(moonLight);
  var SUN_DIST=40;
  var SYNODIC=29.530588853,NEW_MOON_MS=Date.UTC(2000,0,6,18,14,0),OBLIQ=23.44;
  var _sunV=new THREE.Vector3(),_moonV=new THREE.Vector3(),_axV=new THREE.Vector3();
  var astro={sunLon:0,sunDec:0,phase:0,illum:0,moonDec:0,bjH:0,bjM:0,name:''};
  /* 月相名：朔／望按"照亮比"判定（它们是瞬间，按月龄卡到 0.02 会说出"盈凸月 · 照亮 100%"），
   * 上下弦与两弦之间的四相才按相位窗口分。 */
  function phaseName(p){
    var k=(1-Math.cos(p*2*Math.PI))/2;
    if(k<0.02)return '朔 · 新月';
    if(k>0.98)return '望 · 满月';
    if(p<0.24)return '蛾眉月';
    if(p<0.26)return '上弦月';
    if(p<0.5)return '盈凸月';
    if(p<0.74)return '亏凸月';
    if(p<0.76)return '下弦月';
    return '残月';
  }
  function astroUpdate(){
    var d=new Date();
    var utcH=d.getUTCHours()+d.getUTCMinutes()/60+d.getUTCSeconds()/3600;
    var bj=(utcH+8)%24;
    astro.bjH=Math.floor(bj);astro.bjM=d.getUTCMinutes();
    /* 直射点：经度跟着真太阳时走，纬度跟着季节走 */
    var lon=15*(12-utcH),dec=0;
    if(lon>180)lon-=360;if(lon<=-180)lon+=360;
    var n=Math.floor((Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())-Date.UTC(d.getUTCFullYear(),0,0))/86400000);
    dec=-OBLIQ*Math.cos(2*Math.PI*(n+10)/365.24);
    astro.sunLon=lon;astro.sunDec=dec;
    _sunV.copy(ll2v(dec,lon,1)).normalize();
    sunLight.position.copy(_sunV).multiplyScalar(SUN_DIST);
    fillLight.position.copy(_sunV).multiplyScalar(-SUN_DIST);
    /* 月相 → 月球方位与赤纬（赤纬带上后，被照亮的比例才等于真实月相） */
    var p=((d.getTime()-NEW_MOON_MS)/86400000/SYNODIC)%1;if(p<0)p+=1;
    astro.phase=p;astro.name=phaseName(p);
    var k=(1-Math.cos(p*2*Math.PI))/2;astro.illum=k;
    var E=p*2*Math.PI;
    var sDec=Math.asin(Math.max(-1,Math.min(1,_sunV.y)));
    var sAz=Math.atan2(-_sunV.z,_sunV.x);
    var mDec=sDec*Math.cos(E),mAz=sAz+E;astro.moonDec=mDec;
    /* moonOrbit 转 mAz：把月球送到「赤纬 0、方位 mAz」处并保持潮汐锁定；
       再绕该方位在赤道面内的垂线抬起 mDec，得到带赤纬的方位 —— 刚体旋转不破坏锁定。 */
    moonOrbit.rotation.y=mAz;
    moonSys.setRotationFromAxisAngle(_axV.set(Math.sin(mAz),0,Math.cos(mAz)),mDec);
    _moonV.set(Math.cos(mDec)*Math.cos(mAz),Math.sin(mDec),-Math.cos(mDec)*Math.sin(mAz));
    moonLight.position.copy(_moonV).multiplyScalar(SUN_DIST);
    moonLight.intensity=0.07+0.34*k;
    /* 月晕随盈亏：朔月不该顶着一圈亮晕（那会看着像满月），望月才给足 */
    moonGlow.material.opacity=0.25+0.75*k;
  }
  /* 抽屉里的"此刻"读数：北京时间、月相、直射点。每秒刷一次，内容没变就不碰 DOM。 */
  var nowEl=document.getElementById('nowInfo'),nowStr='',nowAt=-1;
  function pad2(n){return (n<10?'0':'')+n;}
  function tickNowInfo(t){
    if(!nowEl||t-nowAt<1)return;
    nowAt=t;
    var lon=astro.sunLon,dec=astro.sunDec;
    var s='<b>'+pad2(astro.bjH)+':'+pad2(astro.bjM)+'</b> 北京时间'+
          '<em>月相 '+astro.name+' · 照亮 '+Math.round(astro.illum*100)+'%</em>'+
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
   * 公转：不再"自己按固定角速度绕"—— 方位与赤纬每帧由 astroUpdate() 按真实北京时间算出
   *       （太阳方位 + 月龄角 E、赤纬取 δ_日×cos E），所以月亮在天上几乎不动，而它**什么相**
   *       是真的：蛾眉、上弦、满月、残月都对得上今天。改回匀速绕圈只需在 animate 里
   *       把 moonOrbit.rotation.y 换成 += dt×MOON_SPEED 并去掉 moonSys 的抬赤纬那行。
   */
  var MOON_R=R*0.2727,MOON_ORBIT=3.0;
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

  /* ===== 神话标记点 =====
   * 形制参考 rome-total-war-3d（"实心点 + 光晕 + 细环"三层），配色改成**按大洲取色**
   * （REGIONS 里的色值，和底部筛选条的提示点同源）：东亚红、南亚橙、中东金、欧洲蓝、
   * 非洲绿、美洲紫、大洋洲青 —— 14 个点一眼能分出属于哪片大陆。
   * 一个标记 = 落在地表的一点月光，自下往上 4 层（全部 depthTest:false，靠 renderOrder 定层序）：
   *   ① 描边 contourTex：一圈细细的暗线，紧紧贴在热核外沿（不是暗底盘！）。
   *      存在的唯一理由是亮地表 —— 雪原、冰川、沙漠上浅色光点会被背景吃掉，得有暗线把点定住。
   *   ② 光晕 haloTex：柔光罩，中心接近全色、向外平滑衰减，负责"发光"的观感，取大洲色。
   *   ③ 热核 coreTex：实心小点，取大洲色（只向白提 18%，保持色相），这是"点"的本体。
   *   ④ 细环：大洲色的一圈细线，平时压到 .5 只作"可点"的暗示；选中变暖金并加扩散脉冲。
   * 尺寸（半径 = f×scale/2；R=1.6，默认取景下 1 世界单位 ≈ 106px）：
   *   热核实心半径 .030（3px）、描边半径 .044（4.6px）、光晕亮到 .041、外沿淡到 .06；
   *   整枚标记直径约 13px，选中时带 11px 半径的金环，合计约 22px。
   * 旧版底盘 0.68（R 的 21%、屏幕上 40px+ 的暗圈 + 粗白环）是块糊在地表的灰圆盘，
   * 跟星空、云层的笔触完全不在一个量级，故整体收到"一点光"的尺度。
   * 三个踩过的坑，改这里时别再踩回去：
   *   · 材质一律 toneMapped:false —— 否则纯白被 ACES 压到 ~0.8，在亮地表上反而比背景暗，
   *     变成一颗灰点心（"亮地表上标记发灰"的真正原因）；
   *   · 一律用 alpha 混合，不用叠加混合 —— 叠加在深色海面上好看，但落到雪地／沙漠上时，
   *     所有中间透明度都会被加到 255 溢出，糊成一块边缘生硬的纯白盘子，14 个铺开非常刺眼；
   *     alpha 混合是"向白色插值"，亮地表上只变一点点，过渡自然；
   *   · 光晕别盖到描边上（.041 对 .044），也別做成"紧贴亮环的粗暗圈"，否则就是眼珠／舷窗。 */
  var markerGroup=new THREE.Group();mainSpin.add(markerGroup);
  /* 径向贴图工具：stops 里 offset 是渐变半径的比例（.5 即贴图半宽处），颜色为 canvas 写法 */
  function radialStops(stops){
    var s=128,c=document.createElement('canvas');c.width=c.height=s;var x=c.getContext('2d');
    var g=x.createRadialGradient(64,64,0,64,64,64),i;
    for(i=0;i<stops.length;i++)g.addColorStop(stops[i][0],stops[i][1]);
    x.fillStyle=g;x.fillRect(0,0,s,s);
    var t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;
  }
  /* 光晕：中心接近全白，向外平滑衰减 —— 中心亮、边缘没有硬边 */
  var haloTex=radialStops([
    [0,'rgba(255,255,255,.96)'],[.16,'rgba(248,251,255,.78)'],[.34,'rgba(224,234,252,.4)'],
    [.56,'rgba(198,215,246,.12)'],[.8,'rgba(180,200,240,.02)'],[1,'rgba(170,196,240,0)']
  ]);
  /* 热核：实心圆点 + 一圈抗锯齿软边（f .72 以内都是全白） */
  var coreTex=radialStops([
    [0,'rgba(255,255,255,1)'],[.7,'rgba(255,255,255,1)'],[.84,'rgba(255,255,255,.5)'],
    [1,'rgba(255,255,255,0)']
  ]);
  /* 描边：只有一条窄窄的暗线，紧紧贴在热核外沿，内圈外圈都透明 */
  var contourTex=radialStops([
    [0,'rgba(4,8,18,0)'],[.46,'rgba(4,8,18,0)'],[.56,'rgba(4,8,18,.3)'],
    [.68,'rgba(4,8,18,.44)'],[.8,'rgba(4,8,18,.2)'],[.92,'rgba(4,8,18,.04)'],[1,'rgba(4,8,18,0)']
  ]);
  /* 细环：亮圈落在 f=.70（贴图尺寸的 0.35 半径处），带宽 f=.64~.78 ≈ 屏幕上 2px 的一根线 */
  var ringLineTex=radialStops([
    [0,'rgba(255,255,255,0)'],[.6,'rgba(255,255,255,0)'],[.64,'rgba(255,255,255,.45)'],
    [.7,'rgba(255,255,255,1)'],[.74,'rgba(255,255,255,.45)'],[.78,'rgba(255,255,255,0)'],[1,'rgba(255,255,255,0)']
  ]);
  /* 各层基准尺寸（scale = 精灵边长，世界单位；半径 = f×scale/2）：
   *   热核 0.085 → 实心半径 .35×.085 = .030（屏幕上 3px）
   *   描边 0.13  → 暗线半径 .34×.13  = .044（4.6px），线宽（f .56~.8）约 1.6px
   *   光晕 0.24  → 亮到 .34×.12    = .041，外沿淡到 .06（6px）
   *   细环 0.24  → 环半径 .35×.24   = .084（8.9px），整枚直径约 18px；选中放大到 0.3（约 22px）
   * 这些数是按"屏幕上恒定尺寸"标定的（见 REF_DIST）。 */
  var MK_HALO=0.24,MK_CORE=0.085,MK_CONTOUR=0.13,MK_RING=0.24,MK_RING_SEL=0.3;
  /* 标记的光学尺寸按相机距离补偿，等于"屏幕上恒定大小"（地图钉的做法）：
   * 精灵本身随世界缩放，手机小屏、宽屏、拉近拉远都会让同一枚标记差出一倍多，
   * 补一个 1/距离 的补偿就稳定了 —— REF_DIST 是上面那套尺寸标定时的相机距离。 */
  var REF_DIST=9.7;
  var MOON_COL=new THREE.Color('#e8ecf5');
  var GOLD_COL=new THREE.Color('#d4b66a');
  var DIM_COL=new THREE.Color('#5a6a8a');
  var WHITE_COL=new THREE.Color('#ffffff');
  /* 大洲色（与 myths.js 的 REGIONS.color、底部筛选条的提示点同源）：
   * 光晕／热核／细环三者同色，热核只向白提 18% —— 提多了在沙漠、雪原上会褪成一颗白点，
   * 色相就白给；保持接近原色的热核，落在亮地表上也还看得出是哪块大陆。 */
  var REG_COL={};(function(){
    for(var i=0;i<REGIONS.length;i++)REG_COL[REGIONS[i].id]=new THREE.Color(REGIONS[i].color||'#e8ecf5');
  })();
  var markers=[];
  (function buildMarkers(){
    for(var i=0;i<MYTHS.length;i++){
      var m=MYTHS[i];
      var grp=new THREE.Group();
      grp.position.copy(ll2v(m.lat,m.lon,R*1.012));
      grp.lookAt(0,0,0);grp.rotateX(Math.PI);
      var cReg=REG_COL[m.region]||MOON_COL;
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
      // depthTest 全关，靠 renderOrder 手动定层序：描边 → 光晕 → 细环 → 热核
      contour.renderOrder=10;halo.renderOrder=11;ring.renderOrder=12;core.renderOrder=13;
      grp.add(contour);grp.add(halo);grp.add(ring);grp.add(core);grp.add(hit);
      markerGroup.add(grp);
      markers.push({myth:m,grp:grp,contour:contour,halo:halo,core:core,ring:ring,hit:hit,
        cHalo:cHalo,cCore:cCore,cRing:cRing,fade:1,sel:false,dim:false,front:false});
    }
  })();
  /* 选中后的扩散脉冲：全场景共用一个环，跟着选中的标记走（省 14 个精灵） */
  var ping=new THREE.Sprite(new THREE.SpriteMaterial({map:ringLineTex,transparent:true,depthWrite:false,depthTest:false,toneMapped:false,color:MOON_COL.clone(),opacity:0}));
  ping.visible=false;ping.renderOrder=14;markerGroup.add(ping);

  /* ===== 星空点 =====
   * 星星用软圆点精灵（Points）画，不再依赖贴图里的 1px 方块：
   * 分 4 档大小 + 每颗独立亮度/色温 + 银道面聚集，最亮的一档带十字星芒。
   * 关掉 sizeAttenuation：星星尺寸只跟屏幕有关，拉近拉远不会被放大成方块；
   * size 单位是设备像素，故乘 DPR（脚本开头已把 DPR 上限压到 2）。
   * 注意 3~5px 的星点在屏幕上就是一枚小小的软方块 —— 这是点精灵的物理下限（Points 的图元永远是方的，
   * 图形只能由贴图的 alpha 决定），放大看得到方角，正常视距下就是一颗星，不是 bug；
   * 已对比过 32/16/8 三种贴图尺寸降到 4.5/6.6px 的效果，形状几乎一致，没必要为此换贴图。*/
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
  /* 视线下压量（panG/pan，单位是 tan 角度，随卡片开合在 0 与 PAN_CARD 之间过渡）：
   * 卡片会盖住画面下半部，而选中的标记正好被 aimLatLon 对到画面正中 —— 点选完就看不见了，
   * 连同它那块名牌一起被卡片吃掉。把相机的注视点往下挪 pan×radius（等价于视线下压一个固定角度，
   * 与屏幕尺寸、缩放级别都无关），整块地球连同标记就一起上移，正好落在卡片上方。
   * 屏幕位移 ≈ tan(PAN_CARD)/tan(fov/2)×(H/2) ≈ 13% 屏高。 */
  var PAN_CARD=0.14,panG=0,pan=0;
  function camPos(){var sp=Math.sin(phi);
    camera.position.set(radius*sp*Math.sin(theta),radius*Math.cos(phi),radius*sp*Math.cos(theta));
    camera.lookAt(0,-pan*radius,0);
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
  /* 选中：对到该点正面（aimLatLon），并让视线下压 panG=0.14 —— 地球连同标记一起上移，
   * 标记与名牌就落在卡片上方而不是卡片背后（见 camPos 里 pan 的说明）。 */
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
    panG=PAN_CARD;          /* 卡片一开，视线下压，地球与标记整体上移让出卡片 */
  }
  function hideCard(){cardEl.classList.remove('show');panG=0;}
  document.getElementById('cClose').addEventListener('click',clearSelection);

  function regionName(id){
    for(var i=0;i<REGIONS.length;i++)if(REGIONS[i].id===id)return REGIONS[i].name;
    return '';
  }

  /* ===== 分享到小红书 =====
   * 用 canvas 合成 1080×1440 分享卡片（夜空 + 月相 + 配图 + 文字），
   * 经 writeTempFile 换 filePath 后调 postNote 唤起笔记发布页。
   * 容器未注入端能力时（普通浏览器预览）降级提示。API 见
   * https://miniapp-sandbox.xiaohongshu.com/minitool/doc#s3-3 */
  var cShareBtn=document.getElementById('cShare');
  function drawShareCard(idx,m,onDone){
    var sw=1080,sh=1440;
    var c=document.createElement('canvas');c.width=sw;c.height=sh;
    var x=c.getContext('2d');
    var bg=x.createLinearGradient(0,0,0,sh);
    bg.addColorStop(0,'#060b1a');bg.addColorStop(.5,'#0e1932');bg.addColorStop(1,'#070c1c');
    x.fillStyle=bg;x.fillRect(0,0,sw,sh);
    x.fillStyle='rgba(255,255,255,.85)';
    for(var i=0;i<140;i++){
      x.globalAlpha=Math.random()*0.6+0.2;
      x.beginPath();x.arc(Math.random()*sw,Math.random()*sh*0.45,Math.random()*1.6+0.3,0,Math.PI*2);x.fill();
    }
    x.globalAlpha=1;
    var mx=sw/2,my=200,mr=72;
    var mg=x.createRadialGradient(mx,my,0,mx,my,mr*2.4);
    mg.addColorStop(0,'rgba(232,236,245,.45)');mg.addColorStop(1,'rgba(232,236,245,0)');
    x.fillStyle=mg;x.fillRect(mx-mr*2.4,my-mr*2.4,mr*4.8,mr*4.8);
    var mgrad=x.createRadialGradient(mx-mr*0.3,my-mr*0.3,0,mx,my,mr);
    mgrad.addColorStop(0,'#fdfbf4');mgrad.addColorStop(.6,'#e8ecf5');mgrad.addColorStop(1,'#8b98b4');
    x.fillStyle=mgrad;x.beginPath();x.arc(mx,my,mr,0,Math.PI*2);x.fill();
    var y=340;
    function drawText(){
      x.textAlign='center';
      x.fillStyle='#e8ecf5';x.font='600 66px Georgia,"Songti SC","Noto Serif SC",serif';
      x.fillText(m.name,sw/2,y);y+=70;
      x.fillStyle='#d4b66a';x.font='28px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
      x.fillText(m.civ+' · '+regionName(m.region),sw/2,y);y+=60;
      x.textAlign='left';x.fillStyle='#eaf1fb';x.font='30px Georgia,"Songti SC","Noto Serif SC",serif';
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
        x.fillStyle='rgba(212,182,106,.14)';x.fillRect(tx,y-26,tw,38);
        x.strokeStyle='rgba(212,182,106,.55)';x.lineWidth=1;x.strokeRect(tx,y-26,tw,38);
        x.fillStyle='#d4b66a';x.fillText(tag,tx+14,y);tx+=tw+14;
      }
      y+=56;
      x.fillStyle='#8da2c0';x.font='22px -apple-system,"PingFang SC",sans-serif';
      x.fillText('纬度 '+m.lat.toFixed(1)+'°   经度 '+m.lon.toFixed(1)+'°',60,y);
      x.textAlign='center';
      x.fillStyle='#d4b66a';x.font='600 30px Georgia,serif';x.fillText('寰宇月话',sw/2,sh-58);
      x.fillStyle='#8da2c0';x.font='18px -apple-system,sans-serif';x.fillText('GLOBAL MOON MYTHS',sw/2,sh-28);
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
    var m=MYTHS[idx];
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
      content+='\n—— 寰宇月话 · 全球月亮神话';
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

  /* ===== 标记点显隐、呼吸与脉冲 =====
   * 呼吸只动"光晕的亮度与大小 + 热核大小"，描边的直径保持不动 ——
   * 让描边跟着缩放，整枚标记会一胀一缩地发糊，看着像没对齐的抖动；收住反而干净。 */
  var _v=new THREE.Vector3(),_n=new THREE.Vector3(),_d=new THREE.Vector3();
  function refreshMarkers(t){
    /* 屏幕恒定大小：整组等比缩放（连 hit 球一起，点击热区在手机上也不会变小） */
    var mkScale=Math.max(0.6,Math.min(2.2,radius/REF_DIST));
    for(var i=0;i<markers.length;i++){
      var m=markers[i];
      m.grp.scale.setScalar(mkScale);
      var sel=(i===selIdx);
      var inReg=(curRegion==='all'||m.myth.region===curRegion);
      var dim=(!sel&&!inReg);
      m.sel=sel;m.dim=dim;
      _v.setFromMatrixPosition(m.grp.matrixWorld);_v.project(camera);
      m.grp.getWorldPosition(_n);
      _d.copy(camera.position).sub(_n).normalize();_n.normalize();
      var facing=_n.dot(_d);
      var front=(_v.z<1)&&(facing>=0.16);
      m.front=front;
      var show=front&&(sel||inReg);
      m.contour.visible=show;m.halo.visible=show;m.core.visible=show;m.ring.visible=show;
      /* 贴边淡出：facing .16→.40 由 0 涨到 1，标记转到地球轮廓附近时渐渐消失，
       * 不会出现"圆盘浮在地球外面"的观感（比一刀切断更自然）。 */
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
    /* 脉冲环：只有选中的标记有，1.8 秒从光圈处向外扩一圈并淡出（"音波"式提示） */
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

  /* ===== 标签投影：所有朝向镜头的标记都挂名牌 =====
   * 之前只给选中的那一个挂牌，其余 13 个点全靠猜（而且选中后点位正好被卡片挡住，
   * 等于"标签从来没露过面"）。现在改为：每个可见标记一块牌，挤不下时让位。
   * 排版是一次贪心：先排选中的，再排更正面的（fade 大者先排），
   * 与已排好的矩形相交就直接隐去 —— 于是地球转起来是"外围的牌子逐个让位"而不是叠成一团。
   * 名牌里带一颗大洲色的小圆点，和底部筛选条、地球上的光点同色，三处对得上。 */
  var tagPool=[],tagCand=[];
  (function initTags(){
    for(var i=0;i<MYTHS.length;i++){
      var el=document.createElement('div');el.className='tag';el.style.opacity='0';
      var cs=(REG_COL[MYTHS[i].region]||MOON_COL).getStyle();   // 'rgb(r,g,b)'
      var d=document.createElement('i');
      d.style.background=cs;
      el.style.borderColor=cs.replace('rgb(','rgba(').replace(')',',.5)');
      el.appendChild(d);
      el.appendChild(document.createTextNode(MYTHS[i].civ+'·'+MYTHS[i].name));
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
      /* 尺寸只在第一次露面时量一次：此时元素已在 DOM 里（opacity:0 仍有布局），
       * 之后字号不变就一直复用，避免每帧 offsetWidth 触发重排。 */
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
    // 天球与星点同一转速：银河带与星星是同一片天，转速不同会互相错位
    stars.rotation.y+=dt*0.0016;sky.rotation.y+=dt*0.0016;
    theta+=(thetaG-theta)*0.12;phi+=(phiG-phi)*0.12;radius+=(radiusG-radius)*0.1;pan+=(panG-pan)*0.12;
    camPos();
    astroUpdate();          // 太阳方位、月相、月光：每帧按真实北京时间重算（开销可忽略）
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
    /* 名牌的宽高是按当时字号量的、缓存着用；换视口（尤其横竖屏切换）字号会变，必须重量 */
    for(var i=0;i<tagPool.length;i++){tagPool[i].w=0;tagPool[i].h=0;}
  });
  addEventListener('visibilitychange',function(){if(document.hidden){running=false;}else if(!running){running=true;clock.getDelta();animate();}});
  cv.addEventListener('webglcontextlost',function(e){e.preventDefault();running=false;document.getElementById('loader').classList.add('hide');document.getElementById('fallback').classList.add('show');},false);

  animate();
  setTimeout(function(){document.getElementById('loader').classList.add('hide');},600);
  setTimeout(function(){var tp=document.getElementById('tip');tp.classList.add('show');setTimeout(function(){tp.classList.remove('show');},3800);},1400);
})();
