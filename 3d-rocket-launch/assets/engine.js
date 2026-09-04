(function (global) {
  'use strict';
  var M3D = global.M3D || (global.M3D = {});
  var mat4 = M3D.mat4;

  // 顶点着色器保留 highp（WebGL1 顶点着色器默认 highp），把视线向量在此算好，
  // 避免片元着色器里用世界坐标（地球半径上千，mediump 精度不够）。
  var PHONG_VS = [
    'attribute vec3 aPosition;', 'attribute vec3 aNormal;', 'attribute vec2 aUV;',
    'uniform mat4 uModel;', 'uniform mat4 uView;', 'uniform mat4 uProj;', 'uniform mat4 uNormalMat;',
    'uniform vec3 uCamPos;',
    'varying vec3 vNormal;', 'varying vec3 vViewDir;', 'varying vec3 vObjPos;', 'varying vec2 vUV;',
    'varying float vDist;',
    'void main(){',
    ' vec4 wp=uModel*vec4(aPosition,1.0);',
    ' vNormal=normalize((uNormalMat*vec4(aNormal,0.0)).xyz);',
    ' vViewDir=normalize(uCamPos-wp.xyz);',
    ' vDist=length(uCamPos-wp.xyz);',
    ' vObjPos=aPosition;',
    ' vUV=aUV;',
    ' gl_Position=uProj*uView*wp;',
    '}'
  ].join('\n');

  var PHONG_FS = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'varying vec3 vNormal;', 'varying vec3 vViewDir;', 'varying vec3 vObjPos;', 'varying vec2 vUV;',
    'varying float vDist;',
    'uniform vec3 uColor;', 'uniform vec3 uLightDir;', 'uniform vec3 uLightColor;',
    'uniform vec3 uAmbient;', 'uniform vec3 uRimColor;',
    'uniform float uAlpha;', 'uniform float uGlow;', 'uniform float uIsEarth;', 'uniform float uTime;',
    'uniform float uAtmo;', 'uniform float uUseTex;', 'uniform sampler2D uTex;', 'uniform float uFill;',
    'float hash31(vec3 p){',
    ' p=fract(p*0.3183099+vec3(0.71,0.113,0.419)); p*=17.0;',
    ' return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }',
    'float noise3(vec3 x){',
    ' vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);',
    ' return mix(mix(mix(hash31(i+vec3(0,0,0)),hash31(i+vec3(1,0,0)),f.x),',
    '                mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),',
    '            mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),',
    '                mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z); }',
    'float fbm3(vec3 p){',
    ' float s=0.0,a=0.5;',
    ' for(int i=0;i<3;i++){ s+=a*noise3(p); p=p*2.03+vec3(1.7); a*=0.5; }',
    ' return s; }',
    'void main(){',
    ' vec3 N=normalize(vNormal); vec3 L=normalize(uLightDir); vec3 V=normalize(vViewDir);',
    ' float diff=max(dot(N,L),0.0);',
    ' vec3 baseCol=uColor;',
    ' float landMask=0.0; float waterMask=1.0; float bright=0.0;',
    ' if(uIsEarth>0.5){',
    '   vec3 sp=normalize(vObjPos);',
    '   if(uUseTex>0.5){',
    // 卫星影像纹理（等距圆柱投影）：海面按“蓝显著高于红绿”识别，用于高光/夜灯掩码
    '     vec3 tex=texture2D(uTex,vUV).rgb*1.3+vec3(0.035);',
    '     float w=smoothstep(0.015,0.055,tex.b-max(tex.r,tex.g));',
    '     baseCol=tex*mix(1.0,1.5,w);',   // 洋面提亮（源图海洋偏暗）
    '     landMask=1.0-w; waterMask=w;',
    // 近地面细节噪声：贴图分辨率有限，靠近地表时混入高频纹理避免糊成一片
    '     float nearFade=1.0-smoothstep(80.0,520.0,vDist);',
    '     if(nearFade>0.004){',
    '       float det=noise3(sp*90.0+vec3(3.7,9.1,1.3))-0.5;',
    '       baseCol*=1.0+det*0.5*nearFade;',
    '     }',
    '   } else {',
    // 程序化后备：低频 fbm 决定海陆，加点中频细节
    '     float e=fbm3(sp*2.1+vec3(11.3,4.7,2.1));',
    '     e+=0.22*noise3(sp*6.3+vec3(2.7,9.1,5.5));',
    '     float polar=1.0-smoothstep(0.0015,0.0100,1.0-sp.y);',
    '     e+=polar*0.30;',
    '     vec3 deep=vec3(0.020,0.090,0.200); vec3 shallow=vec3(0.070,0.260,0.400);',
    '     vec3 ocean=mix(deep,shallow,smoothstep(0.30,0.52,e));',
    '     float alt=smoothstep(0.52,0.78,e);',
    '     vec3 coast=vec3(0.50,0.47,0.30);',
    '     vec3 green=vec3(0.185,0.340,0.140);',
    '     vec3 high=vec3(0.38,0.33,0.23);',
    '     vec3 desert=vec3(0.55,0.46,0.28);',
    '     float dry=smoothstep(0.42,0.66,noise3(sp*3.3+vec3(7.7,1.3,4.9)));',
    '     vec3 land=mix(coast,green,smoothstep(0.05,0.30,alt));',
    '     land=mix(land,desert,dry*0.55);',
    '     land=mix(land,high,smoothstep(0.55,0.95,alt));',
    '     float landEdge=smoothstep(0.495,0.525,e);',
    '     landMask=landEdge; waterMask=1.0-landEdge;',
    '     baseCol=mix(ocean,land,landEdge);',
    '     float patch=noise3(sp*9.0+vec3(3.3,1.1,7.7));',
    '     baseCol*=1.0+landEdge*(patch-0.5)*0.38;',
    '     float ice=smoothstep(0.70,0.86,abs(sp.y)+0.05*noise3(sp*5.0))*smoothstep(0.004,0.020,1.0-sp.y);',
    '     vec3 iceCol=mix(vec3(0.74,0.82,0.90),vec3(0.93,0.96,0.99),noise3(sp*7.0+vec3(9.0)));',
    '     baseCol=mix(baseCol,iceCol,ice);',
    '   }',
    '   bright=dot(baseCol,vec3(0.33));',
    '   landMask*=1.0-smoothstep(0.55,0.80,bright);',   // 冰盖/亮沙漠不放城市灯光
    // 云带（沿纬向缓慢移动）
    '   float cl=fbm3(sp*3.6+vec3(uTime*0.012,0.0,uTime*0.004));',
    '   float band=0.55+0.45*sin(sp.y*7.0);',
    '   float cloud=smoothstep(0.46,0.62,cl*band);',
    '   baseCol=mix(baseCol,vec3(0.95,0.96,0.98),cloud*0.58);',
    '   waterMask*=(1.0-cloud*0.58);',
    ' }',
    ' vec3 H=normalize(L+V);',
    ' float spec=pow(max(dot(N,H),0.0),150.0)*waterMask;',
    ' float rim=pow(1.0-max(dot(N,V),0.0),2.5);',
    ' float ndl=dot(N,L);',
    ' float day=smoothstep(-0.14,0.25,ndl);',
    ' vec3 col=baseCol*(uAmbient+uLightColor*diff*day)+uLightColor*spec*0.42*day;',
    // 大气边缘散射（日照侧靠近地平线更亮）
    ' float limb=pow(1.0-max(dot(N,V),0.0),3.0);',
    ' col+=uAtmo*limb*max(ndl,0.0);',
    // 夜面城市灯光
    ' if(uIsEarth>0.5 && ndl<0.12){',
    '   vec3 sp2=normalize(vObjPos);',
    '   float city=pow(smoothstep(0.70,0.94,noise3(sp2*26.0)),3.2)*landMask;',
    '   col+=vec3(1.0,0.80,0.46)*city*smoothstep(0.12,-0.18,ndl)*1.2;',
    ' }',
    ' col+=uRimColor*rim*0.6;',
    // 相机侧补光：箭体大姿态转弯后向阳面背离镜头时仍可辨（地球不受此光）
    ' col+=vec3(1.0,0.98,0.95)*uFill*max(dot(N,V),0.0);',
    ' col=mix(col,baseCol*1.7,uGlow);',
    ' gl_FragColor=vec4(col,uAlpha); }'
  ].join('\n');

  // 大气辉光：只画背面，附加混合，形成环绕星球的光晕
  var ATMO_FS = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'varying vec3 vNormal;', 'varying vec3 vViewDir;', 'varying vec3 vObjPos;',
    'uniform vec3 uColor;', 'uniform vec3 uLightDir;', 'uniform float uInner;', 'uniform float uStrength;',
    'uniform float uMode;',   // 0=太空光晕（星球边缘向外衰减） 1=地面天光（仰角梯度天空 + 地平线霞光）
    'void main(){',
    ' vec3 N=normalize(vNormal); vec3 V=normalize(vViewDir); vec3 L=normalize(uLightDir);',
    ' float sun=smoothstep(-0.55,0.40,dot(N,L));',
    ' float a; vec3 col;',
    ' if(uMode>0.5){',
    // 地面模式：相机在大气壳内部，看到的是壳的远侧内表面。
    // -V.y 恰好等于视线仰角的正弦：-1=正下方 0=地平线 +1=天顶。
    // 用它做整片天空的垂直梯度，让天空/太空之间不再出现直边的方块感。
    '   float elev=-V.y;',
    '   if(elev<-0.05) discard;',                       // 地平线以下交给地表，不画
    '   float horizon=exp(-elev*elev*26.0);',           // 贴地平线的霞光峰
    '   float t=smoothstep(0.0,0.85,elev);',            // 0=地平线 1=天顶
    '   col=mix(uColor*1.55+vec3(0.10,0.05,-0.01),uColor*0.20,t);',
    '   col+=vec3(1.0,0.58,0.32)*horizon*sun*0.55;',    // 朝阳侧的暖色霞光
    '   col*=0.42+0.58*sun;',
    '   a=(horizon*0.55+(1.0-t)*0.55)*uStrength;',      // 地平线最浓，向天顶平滑变淡
    '   a*=smoothstep(-0.05,0.06,elev);',
    ' } else {',
    // 太空模式：相机在大气壳外，只保留星球边缘一圈辉光
    '   float ndv=dot(N,V);',
    '   float pr=sqrt(max(0.0,1.0-ndv*ndv));',          // 归一化视线掠过半径
    '   float hn=(pr-uInner)/max(1.0-uInner,0.0001);',  // 0=星球边缘 1=大气顶
    '   if(hn<0.0) discard;',
    '   a=uStrength*exp(-hn*1.35);',
    '   col=uColor*(0.06+0.94*sun);',
    ' }',
    ' gl_FragColor=vec4(col*a,a); }'
  ].join('\n');

  // 粒子：一套着色器两种形态 —— glow（附加混合的火焰/火花）与 smoke（混合的软边烟团）
  var POINT_VS = [
    'attribute vec3 aPosition;', 'attribute float aLife;', 'attribute vec3 aColor;', 'attribute float aSize;',
    'attribute float aGrow;', 'attribute float aSeed;',
    'uniform mat4 uView;', 'uniform mat4 uProj;', 'uniform mediump float uSize;', 'uniform mediump float uPtScale;',
    'uniform mediump float uTime;', 'uniform mediump float uSmoke;',
    'varying float vLife;', 'varying vec3 vColor;', 'varying float vSeed;',
    'void main(){',
    ' float age=clamp(1.0-aLife,0.0,1.0);',
    ' vec3 p=aPosition;',
    ' if(uSmoke>0.5){',                                  // 烟团：随年龄膨胀 + 低频湍流扰动
    '   float ph=aSeed*6.2831;',
    '   float amp=aSize*0.30*(0.25+age);',
    '   p+=vec3(sin(uTime*0.85+ph),sin(uTime*0.61+ph*1.7)*0.55,cos(uTime*1.07+ph*1.3))*amp;',
    ' }',
    ' vec4 vp=uView*vec4(p,1.0); gl_Position=uProj*vp;',
    ' float d=max(-vp.z,0.05);',
    ' float s=aSize*(1.0+aGrow*age*2.4);',               // 直径随寿命增长
    ' gl_PointSize=clamp(uSize*s*uPtScale/d,1.0,240.0);',
    ' vLife=aLife; vColor=aColor; vSeed=aSeed; }'
  ].join('\n');
  var POINT_FS = [
    'precision mediump float;', 'varying float vLife;', 'varying vec3 vColor;', 'varying float vSeed;',
    'uniform mediump float uSmoke;',
    'void main(){ vec2 d=gl_PointCoord-vec2(0.5); float r2=dot(d,d); if(r2>0.25) discard;',
    ' float life=vLife;',
    ' if(uSmoke>0.5){',
    '   float r=sqrt(r2)*2.0;',
    '   float a=1.0-r; a=a*a*(3.0-2.0*a);',              // 软边，避免一个个圆球
    '   float age=1.0-life;',
    '   float env=smoothstep(0.0,0.16,age)*pow(life,0.75);', // 快速生成、缓慢消散
    '   float wisp=0.74+0.36*sin(vSeed*27.3+r*6.4+vSeed*3.1);', // 团絮明暗
    '   gl_FragColor=vec4(vColor*wisp,a*env*0.58);',
    ' } else {',
    '   float core=1.0-r2*4.0; float alpha=core*life;',
    '   float warmth=clamp((vColor.r-vColor.b)*1.5,0.0,1.0);',
    '   vec3 hot=vec3(1.0,0.92,0.65);',
    '   vec3 col=mix(vColor,hot,warmth*life*life*0.7);',
    '   col+=vec3(0.18,0.12,0.06)*warmth*core*life;',
    '   gl_FragColor=vec4(col,alpha); }',
    '}'
  ].join('\n');

  var STAR_VS = [
    'attribute vec3 aPosition;', 'attribute float aBright;',
    'uniform mat4 uView;', 'uniform mat4 uProj;', 'uniform float uSize;', 'uniform float uTime;',
    'varying float vB;',
    'void main(){ vec4 vp=uView*vec4(aPosition,1.0); gl_Position=uProj*vp;',
    ' vB=aBright*(0.72+0.28*sin(uTime*1.7+aPosition.x*0.31+aPosition.z*0.17));',
    ' gl_PointSize=uSize*(0.55+aBright*0.75); }'
  ].join('\n');
  var STAR_FS = [
    'precision mediump float;', 'varying float vB;', 'uniform float uAlpha;',
    'void main(){ vec2 d=gl_PointCoord-vec2(0.5); float r=dot(d,d); if(r>0.25) discard;',
    ' float a=(1.0-r*3.2); gl_FragColor=vec4(vec3(1.0,0.98,0.94),a*vB*uAlpha); }'
  ].join('\n');

  function compileShader(gl, type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { if (global.console) console.warn('shader:', gl.getShaderInfoLog(s)); return null; }
    return s;
  }
  function createProgram(gl, vsSrc, fsSrc) {
    var vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc), fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    var p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { if (global.console) console.warn('program:', gl.getProgramInfoLog(p)); return null; }
    return p;
  }

  var geom = M3D.geom || {};
  geom.cylinder = function (rt, rb, h, seg) {
    var pos = [], nor = [], idx = [], twoPi = Math.PI * 2, i;
    for (i = 0; i <= seg; i++) {
      var a = (i / seg) * twoPi, x = Math.cos(a), z = Math.sin(a);
      var slope = (rt - rb) / h, nlen = Math.sqrt(1 + slope * slope);
      var nx = x / nlen, ny = -slope / nlen, nz = z / nlen;
      pos.push(x * rt, h, z * rt, x * rb, 0, z * rb);
      nor.push(nx, ny, nz, nx, ny, nz);
    }
    for (i = 0; i < seg; i++) {
      var a0 = i * 2, a1 = i * 2 + 1, b0 = (i + 1) * 2, b1 = (i + 1) * 2 + 1;
      idx.push(a0, b0, a1, a1, b0, b1);
    }
    if (rt > 0.0001) {
      var base = pos.length / 3; pos.push(0, h, 0); nor.push(0, 1, 0);
      for (i = 0; i <= seg; i++) { var at = (i / seg) * twoPi; pos.push(Math.cos(at) * rt, h, Math.sin(at) * rt); nor.push(0, 1, 0); }
      for (i = 0; i < seg; i++) idx.push(base, base + 1 + i + 1, base + 1 + i);
    }
    if (rb > 0.0001) {
      var b2 = pos.length / 3; pos.push(0, 0, 0); nor.push(0, -1, 0);
      for (i = 0; i <= seg; i++) { var ab = (i / seg) * twoPi; pos.push(Math.cos(ab) * rb, 0, Math.sin(ab) * rb); nor.push(0, -1, 0); }
      for (i = 0; i < seg; i++) idx.push(b2, b2 + 1 + i, b2 + 1 + i + 1);
    }
    return { positions: new Float32Array(pos), normals: new Float32Array(nor), indices: new Uint16Array(idx) };
  };
  geom.cone = function (r, h, seg) { return geom.cylinder(0.0001, r, h, seg); };
  geom.fin = function (rootY, tipY, rootX, tipX, thick) {
    var pos = [rootX,rootY,thick, -rootX,rootY,thick, -tipX,tipY,thick, tipX,tipY,thick,
      rootX,rootY,-thick, tipX,tipY,-thick, -tipX,tipY,-thick, -rootX,rootY,-thick];
    var nor = [0,0,1,0,0,1,0,0,1,0,0,1, 0,0,-1,0,0,-1,0,0,-1,0,0,-1];
    return { positions: new Float32Array(pos), normals: new Float32Array(nor), indices: new Uint16Array([0,1,2,0,2,3,4,5,6,4,6,7]) };
  };
  geom.ring = function (rInner, rOuter, seg) {
    var pos = [], nor = [], idx = [], i;
    for (i = 0; i <= seg; i++) {
      var a = (i / seg) * Math.PI * 2, x = Math.cos(a), z = Math.sin(a);
      pos.push(x * rOuter, 0, z * rOuter, x * rInner, 0, z * rInner); nor.push(0, 1, 0, 0, 1, 0);
    }
    for (i = 0; i < seg; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    return { positions: new Float32Array(pos), normals: new Float32Array(nor), indices: new Uint16Array(idx) };
  };
  geom.disk = function (r, seg) {
    var pos = [0, 0, 0], nor = [0, 1, 0], idx = [];
    for (var i = 0; i <= seg; i++) { var a = (i / seg) * Math.PI * 2; pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); nor.push(0, 1, 0); }
    for (i = 0; i < seg; i++) idx.push(0, i + 1, i + 2);
    return { positions: new Float32Array(pos), normals: new Float32Array(nor), indices: new Uint16Array(idx) };
  };

  // 完整球体（外表面，法线朝外，逆时针缠绕；带等距圆柱 UV，v=1 为 +Y 极）
  geom.sphere = function (R, seg, rings) {
    var pos = [], nor = [], uvs = [], idx = [], i, j;
    for (i = 0; i <= rings; i++) {
      var phi = (i / rings) * Math.PI, sp = Math.sin(phi), cp = Math.cos(phi);
      for (j = 0; j <= seg; j++) {
        var th = (j / seg) * Math.PI * 2, ct = Math.cos(th), st = Math.sin(th);
        var nx = sp * ct, ny = cp, nz = sp * st;
        pos.push(nx * R, ny * R, nz * R); nor.push(nx, ny, nz);
        // u 取 1-j/seg：等距圆柱贴图 u=0 对应西经 180°，自西向东递增；
        // 直接用 j/seg 会得到镜像贴图（像从球内部看，大陆左右翻转）。
        uvs.push(1 - j / seg, 1 - i / rings);
      }
    }
    for (i = 0; i < rings; i++) {
      for (j = 0; j < seg; j++) {
        var a = i * (seg + 1) + j, b = a + seg + 1;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    return { positions: new Float32Array(pos), normals: new Float32Array(nor), uvs: new Float32Array(uvs), indices: new Uint16Array(idx) };
  };

  // 贴合球面的球冠：中心在 +Y，arcR 为弧长半径，顶点相对地表点（y=0 为冠顶）
  geom.cap = function (R, arcR, seg, rings) {
    rings = rings || 8;
    var maxPhi = arcR / R, pos = [], nor = [], idx = [], i, j;
    for (i = 0; i <= rings; i++) {
      var phi = (i / rings) * maxPhi, sp = Math.sin(phi), cp = Math.cos(phi);
      for (j = 0; j <= seg; j++) {
        var th = (j / seg) * Math.PI * 2, ct = Math.cos(th), st = Math.sin(th);
        var nx = sp * ct, ny = cp, nz = sp * st;
        pos.push(nx * R, ny * R - R, nz * R); nor.push(nx, ny, nz);
      }
    }
    for (i = 0; i < rings; i++) {
      for (j = 0; j < seg; j++) {
        var a = i * (seg + 1) + j, b = a + seg + 1;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    return { positions: new Float32Array(pos), normals: new Float32Array(nor), indices: new Uint16Array(idx) };
  };

  geom.lathe = function (profile, seg) {
    var pos = [], nor = [], idx = [], n = profile.length, i, j;
    for (i = 0; i < n; i++) {
      var r = profile[i][0], y = profile[i][1], dr, dy;
      if (i === 0) { dr = profile[1][0] - r; dy = profile[1][1] - y; }
      else if (i === n - 1) { dr = r - profile[i - 1][0]; dy = y - profile[i - 1][1]; }
      else { dr = profile[i + 1][0] - profile[i - 1][0]; dy = profile[i + 1][1] - profile[i - 1][1]; }
      var len = Math.sqrt(dy * dy + dr * dr) || 1, nx = dy / len, ny = -dr / len;
      for (j = 0; j <= seg; j++) { var a = (j / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a); pos.push(ca * r, y, sa * r); nor.push(ca * nx, ny, sa * nx); }
    }
    for (i = 0; i < n - 1; i++) { for (j = 0; j < seg; j++) { var a0 = i * (seg + 1) + j, b0 = (i + 1) * (seg + 1) + j, a1 = a0 + 1, b1 = b0 + 1; idx.push(a0, b0, a1, a1, b0, b1); } }
    if (profile[0][0] > 0.001) { var base = pos.length / 3; pos.push(0, profile[0][1], 0); nor.push(0, -1, 0); for (j = 0; j <= seg; j++) { var ab = (j / seg) * Math.PI * 2; pos.push(Math.cos(ab) * profile[0][0], profile[0][1], Math.sin(ab) * profile[0][0]); nor.push(0, -1, 0); } for (j = 0; j < seg; j++) idx.push(base, base + 1 + j, base + 1 + j + 1); }
    return { positions: new Float32Array(pos), normals: new Float32Array(nor), indices: new Uint16Array(idx) };
  };
  geom.torus = function (R, tube, seg, tubularSegments) {
    tubularSegments = tubularSegments || 10;
    var pos = [], nor = [], idx = [], i, j;
    for (i = 0; i <= seg; i++) {
      var u = (i / seg) * Math.PI * 2, cu = Math.cos(u), su = Math.sin(u);
      for (j = 0; j <= tubularSegments; j++) {
        var v = (j / tubularSegments) * Math.PI * 2, cv = Math.cos(v), sv = Math.sin(v);
        pos.push((R + tube * cv) * cu, tube * sv, (R + tube * cv) * su);
        nor.push(cv * cu, sv, cv * su);
      }
    }
    for (i = 0; i < seg; i++) {
      for (j = 0; j < tubularSegments; j++) {
        var a = i * (tubularSegments + 1) + j, b = a + tubularSegments + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    return { positions: new Float32Array(pos), normals: new Float32Array(nor), indices: new Uint16Array(idx) };
  };
  geom.box = function (w, h, d) {
    var x = w / 2, z = d / 2;
    var pos = [
      -x,0,z, x,0,z, x,h,z, -x,h,z,
      x,0,-z, -x,0,-z, -x,h,-z, x,h,-z,
      x,0,z, x,0,-z, x,h,-z, x,h,z,
      -x,0,-z, -x,0,z, -x,h,z, -x,h,-z,
      -x,h,z, x,h,z, x,h,-z, -x,h,-z,
      -x,0,-z, x,0,-z, x,0,z, -x,0,z
    ];
    var nor = [
      0,0,1, 0,0,1, 0,0,1, 0,0,1,
      0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1,
      1,0,0, 1,0,0, 1,0,0, 1,0,0,
      -1,0,0, -1,0,0, -1,0,0, -1,0,0,
      0,1,0, 0,1,0, 0,1,0, 0,1,0,
      0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0
    ];
    var idx = [];
    for (var f = 0; f < 6; f++) { var o = f * 4; idx.push(o, o + 1, o + 2, o, o + 2, o + 3); }
    return { positions: new Float32Array(pos), normals: new Float32Array(nor), indices: new Uint16Array(idx) };
  };
  M3D.geom = geom;

  function createRenderer(canvas) {
    var gl = canvas.getContext('webgl', { antialias: true, alpha: false, depth: true }) ||
             canvas.getContext('experimental-webgl', { antialias: true, alpha: false, depth: true });
    if (!gl) return null;
    var phong = createProgram(gl, PHONG_VS, PHONG_FS), ppart = createProgram(gl, POINT_VS, POINT_FS), pstar = createProgram(gl, STAR_VS, STAR_FS);
    if (!phong || !ppart || !pstar) return null;
    var atmo = createProgram(gl, PHONG_VS, ATMO_FS);

    var pL = {
      aPosition: gl.getAttribLocation(phong, 'aPosition'), aNormal: gl.getAttribLocation(phong, 'aNormal'),
      aUV: gl.getAttribLocation(phong, 'aUV'),
      uModel: gl.getUniformLocation(phong, 'uModel'), uView: gl.getUniformLocation(phong, 'uView'),
      uProj: gl.getUniformLocation(phong, 'uProj'), uNormalMat: gl.getUniformLocation(phong, 'uNormalMat'),
      uCamPos: gl.getUniformLocation(phong, 'uCamPos'),
      uColor: gl.getUniformLocation(phong, 'uColor'), uLightDir: gl.getUniformLocation(phong, 'uLightDir'),
      uLightColor: gl.getUniformLocation(phong, 'uLightColor'), uAmbient: gl.getUniformLocation(phong, 'uAmbient'),
      uRimColor: gl.getUniformLocation(phong, 'uRimColor'),
      uAlpha: gl.getUniformLocation(phong, 'uAlpha'), uGlow: gl.getUniformLocation(phong, 'uGlow'),
      uIsEarth: gl.getUniformLocation(phong, 'uIsEarth'), uTime: gl.getUniformLocation(phong, 'uTime'),
      uAtmo: gl.getUniformLocation(phong, 'uAtmo'),
      uUseTex: gl.getUniformLocation(phong, 'uUseTex'), uTex: gl.getUniformLocation(phong, 'uTex'),
      uFill: gl.getUniformLocation(phong, 'uFill')
    };
    var aL = atmo ? {
      aPosition: gl.getAttribLocation(atmo, 'aPosition'), aNormal: gl.getAttribLocation(atmo, 'aNormal'),
      uModel: gl.getUniformLocation(atmo, 'uModel'), uView: gl.getUniformLocation(atmo, 'uView'),
      uProj: gl.getUniformLocation(atmo, 'uProj'), uNormalMat: gl.getUniformLocation(atmo, 'uNormalMat'),
      uCamPos: gl.getUniformLocation(atmo, 'uCamPos'), uColor: gl.getUniformLocation(atmo, 'uColor'),
      uLightDir: gl.getUniformLocation(atmo, 'uLightDir'),
      uInner: gl.getUniformLocation(atmo, 'uInner'), uStrength: gl.getUniformLocation(atmo, 'uStrength'),
      uMode: gl.getUniformLocation(atmo, 'uMode')
    } : null;
    var ptL = {
      aPosition: gl.getAttribLocation(ppart, 'aPosition'), aLife: gl.getAttribLocation(ppart, 'aLife'),
      aColor: gl.getAttribLocation(ppart, 'aColor'), aSize: gl.getAttribLocation(ppart, 'aSize'),
      aGrow: gl.getAttribLocation(ppart, 'aGrow'), aSeed: gl.getAttribLocation(ppart, 'aSeed'),
      uView: gl.getUniformLocation(ppart, 'uView'), uProj: gl.getUniformLocation(ppart, 'uProj'),
      uSize: gl.getUniformLocation(ppart, 'uSize'), uPtScale: gl.getUniformLocation(ppart, 'uPtScale'),
      uTime: gl.getUniformLocation(ppart, 'uTime'), uSmoke: gl.getUniformLocation(ppart, 'uSmoke')
    };
    var stL = {
      aPosition: gl.getAttribLocation(pstar, 'aPosition'), aBright: gl.getAttribLocation(pstar, 'aBright'),
      uView: gl.getUniformLocation(pstar, 'uView'), uProj: gl.getUniformLocation(pstar, 'uProj'),
      uSize: gl.getUniformLocation(pstar, 'uSize'), uAlpha: gl.getUniformLocation(pstar, 'uAlpha'),
      uTime: gl.getUniformLocation(pstar, 'uTime')
    };

    var view = mat4.create(), proj = mat4.create(), tmpInv = mat4.create(), normalMat = mat4.create(), skyView = mat4.create();
    var camera = { eye: [0, 3, 9], target: [0, 3, 0], up: [0, 1, 0], fov: 45 * Math.PI / 180, near: 0.1, far: 2000 };
    var light = { dir: [0.5, 0.8, 0.3], color: [1, 0.97, 0.9], ambient: [0.16, 0.18, 0.22], rim: [0.25, 0.35, 0.55] };
    var clearColor = [0.04, 0.05, 0.09];
    var meshes = [], lost = false, time = 0;

    // 默认白纹理：保证非贴图网格的采样器始终有效
    var whiteTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, whiteTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // 加载等距圆柱投影贴图：尺寸为 2 的幂时直接上传（启用 mipmap 与 REPEAT），否则重采样到 1024x512。
    // file:// 直接打开时 <img> 会污染画布导致 texImage2D 被拒，故优先使用内联 data URI（earth-data.js）。
    function createTexture(url, onReady) {
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.width, h = img.height;
          var pot = (w & (w - 1)) === 0 && (h & (h - 1)) === 0;
          var src = img;
          if (!pot) {
            var c = document.createElement('canvas');
            c.width = 1024; c.height = 512;
            c.getContext('2d').drawImage(img, 0, 0, 1024, 512);
            src = c;
          }
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.generateMipmap(gl.TEXTURE_2D);
          var ext = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
          if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT,
            Math.min(8, gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
          if (onReady) onReady(true);
        } catch (e) { if (onReady) onReady(false); }
      };
      img.onerror = function () { if (onReady) onReady(false); };
      img.src = (typeof global.EARTH_TEXTURE_URI === 'string') ? global.EARTH_TEXTURE_URI : url;
      return tex;
    }

    function createMesh(g, color, opts) {
      opts = opts || {};
      var m = {
        geometry: g, color: color || [0.8, 0.8, 0.8],
        modelMatrix: mat4.identity(mat4.create()), visible: true, alpha: 1, glow: 0,
        group: opts.group || 'scene', isEarth: opts.isEarth || false,
        atmo: opts.atmo || 0, atmoShader: opts.atmoShader || false, atmoMode: 0,
        fill: opts.fill != null ? opts.fill : (opts.isEarth ? 0 : 0.26),  // 相机侧补光强度
        blend: opts.blend || 'alpha',        // 'alpha' | 'add' | 'none'
        cull: opts.cull || 'back',           // 'back' | 'front' | 'none'
        depthWrite: opts.depthWrite !== false,
        texture: null,
        _posBuf: gl.createBuffer(), _norBuf: gl.createBuffer(), _idxBuf: gl.createBuffer(),
        _uvBuf: g.uvs ? gl.createBuffer() : null
      };
      gl.bindBuffer(gl.ARRAY_BUFFER, m._posBuf); gl.bufferData(gl.ARRAY_BUFFER, g.positions, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, m._norBuf); gl.bufferData(gl.ARRAY_BUFFER, g.normals, gl.STATIC_DRAW);
      if (m._uvBuf) { gl.bindBuffer(gl.ARRAY_BUFFER, m._uvBuf); gl.bufferData(gl.ARRAY_BUFFER, g.uvs, gl.STATIC_DRAW); }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m._idxBuf); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.indices, gl.STATIC_DRAW);
      m.indexCount = g.indices.length; meshes.push(m); return m;
    }

    var pSize = 0.5;   // 粒子全局尺寸系数（glow / smoke 两个池共用）

    // 单个粒子池：glow=附加混合的火焰/火花，smoke=普通混合的软边烟团
    // 数据布局（每粒子 10 个 float）：pos3 / life1 / color3 / size1 / grow1 / seed1
    function createPool(cap, smoke) {
      var F = 10, STRIDE = F * 4;
      var data = new Float32Array(cap * F), vel = new Float32Array(cap * 3),
        life = new Float32Array(cap), maxLife = new Float32Array(cap),
        gravS = new Float32Array(cap), dragS = new Float32Array(cap);
      var count = 0, cursor = 0, buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);

      function spawn(x, y, z, vx, vy, vz, r, g2, b, lf, sz, gs, grow, drag, seed) {
        var i = cursor; cursor = (cursor + 1) % cap; var o = i * F;
        data[o] = x; data[o + 1] = y; data[o + 2] = z; data[o + 3] = 1.0;
        data[o + 4] = r; data[o + 5] = g2; data[o + 6] = b; data[o + 7] = sz || 1;
        data[o + 8] = grow || 0; data[o + 9] = seed == null ? Math.random() : seed;
        vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
        life[i] = lf; maxLife[i] = lf;
        gravS[i] = (gs === undefined) ? 1 : gs;
        dragS[i] = (drag === undefined) ? (gravS[i] > 0 ? 1 : 0) : drag;
        if (i >= count) count = i + 1;
      }
      function update(dt) {
        for (var i = 0; i < count; i++) {
          if (life[i] <= 0) continue;
          life[i] -= dt; if (life[i] <= 0) { data[i * F + 3] = 0; continue; }
          var vi = i * 3, oi = i * F, gS = gravS[i], dr = dragS[i];
          vel[vi + 1] -= 2.5 * dt * gS;
          vel[vi] *= (1 - 1.4 * dt * dr); vel[vi + 1] *= (1 - 0.5 * dt * dr); vel[vi + 2] *= (1 - 1.4 * dt * dr);
          data[oi] += vel[vi] * dt; data[oi + 1] += vel[vi + 1] * dt; data[oi + 2] += vel[vi + 2] * dt;
          data[oi + 3] = life[i] / maxLife[i];
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
      }
      function render() {
        if (count === 0) return;
        gl.useProgram(ppart);
        gl.uniformMatrix4fv(ptL.uView, false, view); gl.uniformMatrix4fv(ptL.uProj, false, proj);
        gl.uniform1f(ptL.uSize, pSize);
        gl.uniform1f(ptL.uPtScale, canvas.height / (2 * Math.tan(camera.fov / 2)));
        gl.uniform1f(ptL.uTime, time);
        gl.uniform1f(ptL.uSmoke, smoke ? 1 : 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(ptL.aPosition); gl.vertexAttribPointer(ptL.aPosition, 3, gl.FLOAT, false, STRIDE, 0);
        gl.enableVertexAttribArray(ptL.aLife); gl.vertexAttribPointer(ptL.aLife, 1, gl.FLOAT, false, STRIDE, 12);
        gl.enableVertexAttribArray(ptL.aColor); gl.vertexAttribPointer(ptL.aColor, 3, gl.FLOAT, false, STRIDE, 16);
        gl.enableVertexAttribArray(ptL.aSize); gl.vertexAttribPointer(ptL.aSize, 1, gl.FLOAT, false, STRIDE, 28);
        gl.enableVertexAttribArray(ptL.aGrow); gl.vertexAttribPointer(ptL.aGrow, 1, gl.FLOAT, false, STRIDE, 32);
        gl.enableVertexAttribArray(ptL.aSeed); gl.vertexAttribPointer(ptL.aSeed, 1, gl.FLOAT, false, STRIDE, 36);
        gl.enable(gl.BLEND);
        // 烟走普通混合（能压暗、能遮住背景），火光走附加混合（越叠越亮）
        if (smoke) gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        else gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.depthMask(false);
        gl.drawArrays(gl.POINTS, 0, count); gl.depthMask(true); gl.disable(gl.BLEND);
      }
      function reset() { count = 0; cursor = 0; for (var i = 0; i < cap; i++) life[i] = 0; }
      return { spawn: spawn, update: update, render: render, reset: reset, cap: cap };
    }

    var particles = (function () {
      var glow = createPool(2200, false), smoke = createPool(1400, true);
      return {
        // 火焰 / 火花 / 在轨标记（附加混合）
        spawn: function (x, y, z, vx, vy, vz, r, g2, b, lf, sz, gs, grow) {
          glow.spawn(x, y, z, vx, vy, vz, r, g2, b, lf, sz, gs, grow || 0);
        },
        // 烟团（普通混合，grow=膨胀系数，drag=空气阻尼，gs=重力倍率）
        spawnSmoke: function (x, y, z, vx, vy, vz, r, g2, b, lf, sz, grow, drag, gs) {
          smoke.spawn(x, y, z, vx, vy, vz, r, g2, b, lf, sz, gs === undefined ? 0 : gs, grow, drag);
        },
        update: function (dt) { glow.update(dt); smoke.update(dt); },
        render: function () { smoke.render(); glow.render(); },
        reset: function () { glow.reset(); smoke.reset(); },
        max: glow.cap + smoke.cap,
        setSize: function (s) { pSize = s; }
      };
    })();

    var stars = (function () {
      var n = 900, pos = new Float32Array(n * 3), bri = new Float32Array(n), buf = gl.createBuffer(), bbuf = gl.createBuffer(), alpha = 0;
      for (var i = 0; i < n; i++) {
        var u = Math.random() * 2 - 1, ph = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u), r = 100;
        pos[i * 3] = r * s * Math.cos(ph); pos[i * 3 + 1] = r * u; pos[i * 3 + 2] = r * s * Math.sin(ph);
        bri[i] = 0.25 + Math.pow(Math.random(), 2.2) * 0.95;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, bbuf); gl.bufferData(gl.ARRAY_BUFFER, bri, gl.STATIC_DRAW);
      function render() {
        if (alpha <= 0.001) return;
        // 星空用“只旋转不平移”的视图矩阵，等效于无限远天球
        mat4.copy(skyView, view);
        skyView[12] = 0; skyView[13] = 0; skyView[14] = 0;
        gl.useProgram(pstar);
        gl.uniformMatrix4fv(stL.uView, false, skyView); gl.uniformMatrix4fv(stL.uProj, false, proj);
        gl.uniform1f(stL.uSize, 1.7); gl.uniform1f(stL.uAlpha, alpha); gl.uniform1f(stL.uTime, time);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(stL.aPosition); gl.vertexAttribPointer(stL.aPosition, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, bbuf); gl.enableVertexAttribArray(stL.aBright); gl.vertexAttribPointer(stL.aBright, 1, gl.FLOAT, false, 0, 0);
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false);
        gl.drawArrays(gl.POINTS, 0, n); gl.depthMask(true); gl.disable(gl.BLEND);
      }
      return { render: render, setAlpha: function (a) { alpha = a; } };
    })();

    function resize(w, h, dpr) {
      var pw = Math.floor(w * dpr), ph = Math.floor(h * dpr);
      if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    function drawMesh(m) {
      var additive = (m.blend === 'add');
      var useAtmo = additive && m.atmoShader && aL;
      if (additive && !aL && m.atmoShader) return;
      var L = useAtmo ? aL : pL;
      gl.useProgram(useAtmo ? atmo : phong);
      mat4.invert(tmpInv, m.modelMatrix); mat4.transpose(normalMat, tmpInv);
      gl.uniformMatrix4fv(L.uModel, false, m.modelMatrix);
      gl.uniformMatrix4fv(L.uNormalMat, false, normalMat);
      gl.uniformMatrix4fv(L.uView, false, view); gl.uniformMatrix4fv(L.uProj, false, proj);
      gl.uniform3fv(L.uCamPos, camera.eye);
      gl.uniform3fv(L.uLightDir, light.dir);
      gl.uniform3fv(L.uColor, m.color);
      if (!useAtmo) {
        gl.uniform3fv(L.uLightColor, light.color);
        gl.uniform3fv(L.uAmbient, light.ambient);
        gl.uniform3fv(L.uRimColor, light.rim);
        gl.uniform1f(L.uAlpha, m.alpha); gl.uniform1f(L.uGlow, m.glow);
        gl.uniform1f(L.uIsEarth, m.isEarth ? 1 : 0);
        gl.uniform1f(L.uTime, time);
        gl.uniform1f(L.uAtmo, m.atmo || 0);
        gl.uniform1f(L.uFill, m.fill || 0);
      } else {
        gl.uniform1f(L.uInner, m.atmoInner || 0.9);
        gl.uniform1f(L.uStrength, m.atmoStrength == null ? 1 : m.atmoStrength);
        gl.uniform1f(L.uMode, m.atmoMode ? 1 : 0);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, m._posBuf);
      gl.enableVertexAttribArray(L.aPosition); gl.vertexAttribPointer(L.aPosition, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, m._norBuf);
      gl.enableVertexAttribArray(L.aNormal); gl.vertexAttribPointer(L.aNormal, 3, gl.FLOAT, false, 0, 0);
      if (!useAtmo && L.aUV >= 0) {
        if (m._uvBuf) {
          gl.bindBuffer(gl.ARRAY_BUFFER, m._uvBuf);
          gl.enableVertexAttribArray(L.aUV); gl.vertexAttribPointer(L.aUV, 2, gl.FLOAT, false, 0, 0);
        } else {
          gl.disableVertexAttribArray(L.aUV); gl.vertexAttrib2f(L.aUV, 0, 0);
        }
      }
      // 贴图绑定
      if (!useAtmo && L.uTex) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, m.texture || whiteTex);
        gl.uniform1i(L.uTex, 0);
        gl.uniform1f(L.uUseTex, m.texture ? 1 : 0);
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m._idxBuf);

      var prevCull = true;
      if (m.cull === 'none') { gl.disable(gl.CULL_FACE); prevCull = false; }
      else gl.cullFace(m.cull === 'front' ? gl.FRONT : gl.BACK);
      if (additive) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false); }
      else if (m.alpha < 0.999) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); }
      gl.drawElements(gl.TRIANGLES, m.indexCount, gl.UNSIGNED_SHORT, 0);
      if (additive || m.alpha < 0.999) { gl.depthMask(true); gl.disable(gl.BLEND); }
      if (!prevCull) gl.enable(gl.CULL_FACE);
      else gl.cullFace(gl.BACK);
    }

    function render(dt) {
      if (lost) return;
      if (dt) time += dt;
      gl.clearColor(clearColor[0], clearColor[1], clearColor[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
      var aspect = canvas.width / canvas.height;
      mat4.perspective(proj, camera.fov, aspect, camera.near, camera.far);
      mat4.lookAt(view, camera.eye, camera.target, camera.up);
      stars.render();
      var i, m;
      // 1) 不透明
      for (i = 0; i < meshes.length; i++) {
        m = meshes[i];
        if (m.visible && m.blend !== 'add' && m.alpha >= 0.999 && !m.transparentOnly) drawMesh(m);
      }
      // 2) 附加混合（大气辉光等）
      for (i = 0; i < meshes.length; i++) {
        m = meshes[i];
        if (m.visible && m.blend === 'add') drawMesh(m);
      }
      // 3) 半透明
      for (i = 0; i < meshes.length; i++) {
        m = meshes[i];
        if (m.visible && m.blend !== 'add' && m.alpha < 0.999) drawMesh(m);
      }
      particles.render();
    }

    function project(worldPos, out) {
      var vx = worldPos[0], vy = worldPos[1], vz = worldPos[2];
      var e = view, pe = proj;
      var vx1 = e[0]*vx+e[4]*vy+e[8]*vz+e[12], vy1 = e[1]*vx+e[5]*vy+e[9]*vz+e[13], vz1 = e[2]*vx+e[6]*vy+e[10]*vz+e[14], vw1 = e[3]*vx+e[7]*vy+e[11]*vz+e[15];
      var cx = pe[0]*vx1+pe[4]*vy1+pe[8]*vz1+pe[12]*vw1, cy = pe[1]*vx1+pe[5]*vy1+pe[9]*vz1+pe[13]*vw1, cz = pe[2]*vx1+pe[6]*vy1+pe[10]*vz1+pe[14]*vw1, cw = pe[3]*vx1+pe[7]*vy1+pe[11]*vz1+pe[15]*vw1;
      if (cw <= 0) { out.visible = false; return out; }
      var ndcx = cx / cw, ndcy = cy / cw;
      out.x = (ndcx + 1) * 0.5 * canvas.clientWidth;
      out.y = (1 - ndcy) * 0.5 * canvas.clientHeight;
      out.visible = ndcx >= -1 && ndcx <= 1 && ndcy >= -1 && ndcy <= 1;
      return out;
    }

    function onContextLost(e) { e.preventDefault(); lost = true; }
    function onContextRestored() { lost = false; }
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    return {
      gl: gl, canvas: canvas, camera: camera, light: light, meshes: meshes, particles: particles, stars: stars,
      createMesh: createMesh, createTexture: createTexture, resize: resize, render: render, project: project,
      setClearColor: function (r, g, b) { clearColor[0] = r; clearColor[1] = g; clearColor[2] = b; },
      isLost: function () { return lost; },
      getTime: function () { return time; },
      destroy: function () { canvas.removeEventListener('webglcontextlost', onContextLost); canvas.removeEventListener('webglcontextrestored', onContextRestored); }
    };
  }
  M3D.createRenderer = createRenderer;
})(typeof window !== 'undefined' ? window : this);
