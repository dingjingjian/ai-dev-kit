(function (global) {
  'use strict';
  var M3D = global.M3D || (global.M3D = {});
  var mat4 = M3D.mat4;

  var PHONG_VS = [
    'attribute vec3 aPosition;', 'attribute vec3 aNormal;',
    'uniform mat4 uModel;', 'uniform mat4 uView;', 'uniform mat4 uProj;', 'uniform mat4 uNormalMat;',
    'varying vec3 vWorldPos;', 'varying vec3 vNormal;',
    'void main(){ vec4 wp=uModel*vec4(aPosition,1.0); vWorldPos=wp.xyz;',
    'vNormal=normalize((uNormalMat*vec4(aNormal,0.0)).xyz); gl_Position=uProj*uView*wp; }'
  ].join('\n');
  var PHONG_FS = [
    'precision mediump float;', 'varying vec3 vWorldPos;', 'varying vec3 vNormal;',
    'uniform vec3 uColor;', 'uniform vec3 uLightDir;', 'uniform vec3 uLightColor;',
    'uniform vec3 uAmbient;', 'uniform vec3 uRimColor;', 'uniform vec3 uCamPos;',
    'uniform float uAlpha;', 'uniform float uGlow;', 'uniform float uIsEarth;',
    'void main(){ vec3 N=normalize(vNormal); vec3 L=normalize(uLightDir);',
    'float diff=max(dot(N,L),0.0); vec3 V=normalize(uCamPos-vWorldPos); vec3 H=normalize(L+V);',
    'float spec=pow(max(dot(N,H),0.0),48.0); float rim=pow(1.0-max(dot(N,V),0.0),2.5);',
    'vec3 baseCol=uColor;',
    'if(uIsEarth>0.5){',
    'float lat=asin(clamp(N.y,-1.0,1.0)); float lon=atan(N.z,N.x);',
    'float land=0.0;',
    'land+=smoothstep(0.55,0.85,sin(lon*1.5+0.5)*cos(lat*2.0));',
    'land+=smoothstep(0.45,0.75,sin(lon*2.3-1.0)*sin(lat*1.8+0.3));',
    'land+=smoothstep(0.65,0.88,cos(lon*1.8+2.0)*cos(lat*2.5));',
    'land+=smoothstep(0.50,0.78,sin(lon*3.1+1.5)*cos(lat*3.2-0.8));',
    'vec3 ocean=vec3(0.06,0.20,0.36); vec3 cont=vec3(0.20,0.34,0.16);',
    'baseCol=mix(ocean,cont,clamp(land,0.0,1.0));',
    'float ice=smoothstep(0.72,0.88,abs(N.y));',
    'baseCol=mix(baseCol,vec3(0.86,0.89,0.93),ice);',
    'float cloud=smoothstep(0.45,0.72,sin(lon*4.0+lat*3.0)*sin(lat*5.0+1.0));',
    'baseCol=mix(baseCol,vec3(0.92,0.93,0.96),cloud*0.35);',
    '}',
    'vec3 col=baseCol*(uAmbient+uLightColor*diff)+uLightColor*spec*0.35+uRimColor*rim;',
    'col=mix(col,baseCol*1.7,uGlow);',
    'gl_FragColor=vec4(col,uAlpha); }'
  ].join('\n');
  var POINT_VS = [
    'attribute vec3 aPosition;', 'attribute float aLife;', 'attribute vec3 aColor;', 'attribute float aSize;',
    'uniform mat4 uView;', 'uniform mat4 uProj;', 'uniform float uSize;',
    'varying float vLife;', 'varying vec3 vColor;',
    'void main(){ vec4 vp=uView*vec4(aPosition,1.0); gl_Position=uProj*vp;',
    'gl_PointSize=uSize*aSize*aLife*(300.0/max(-vp.z,0.1)); vLife=aLife; vColor=aColor; }'
  ].join('\n');
  var POINT_FS = [
    'precision mediump float;', 'varying float vLife;', 'varying vec3 vColor;',
    'void main(){ vec2 d=gl_PointCoord-vec2(0.5); float r=dot(d,d); if(r>0.25) discard;',
    'float life=vLife; float core=1.0-r*4.0; float alpha=core*life;',
    'float warmth=clamp((vColor.r-vColor.b)*1.5,0.0,1.0);',
    'vec3 hot=vec3(1.0,0.92,0.65);',
    'vec3 col=mix(vColor,hot,warmth*life*life*0.7);',
    'col+=vec3(0.18,0.12,0.06)*warmth*core*life;',
    'gl_FragColor=vec4(col,alpha); }'
  ].join('\n');
  var STAR_VS = [
    'attribute vec3 aPosition;', 'uniform mat4 uView;', 'uniform mat4 uProj;', 'uniform float uSize;', 'uniform float uOffY;',
    'void main(){ vec3 p=aPosition; p.y+=uOffY; gl_Position=uProj*uView*vec4(p,1.0); gl_PointSize=uSize; }'
  ].join('\n');
  var STAR_FS = [
    'precision mediump float;', 'uniform float uAlpha;',
    'void main(){ vec2 d=gl_PointCoord-vec2(0.5); if(dot(d,d)>0.25) discard; gl_FragColor=vec4(1.0,0.98,0.92,uAlpha); }'
  ].join('\n');

  function compileShader(gl, type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) return null; return s;
  }
  function createProgram(gl, vsSrc, fsSrc) {
    var vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc), fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    var p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null; return p;
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

    var pL = {
      aPosition: gl.getAttribLocation(phong, 'aPosition'), aNormal: gl.getAttribLocation(phong, 'aNormal'),
      uModel: gl.getUniformLocation(phong, 'uModel'), uView: gl.getUniformLocation(phong, 'uView'),
      uProj: gl.getUniformLocation(phong, 'uProj'), uNormalMat: gl.getUniformLocation(phong, 'uNormalMat'),
      uColor: gl.getUniformLocation(phong, 'uColor'), uLightDir: gl.getUniformLocation(phong, 'uLightDir'),
      uLightColor: gl.getUniformLocation(phong, 'uLightColor'), uAmbient: gl.getUniformLocation(phong, 'uAmbient'),
      uRimColor: gl.getUniformLocation(phong, 'uRimColor'), uCamPos: gl.getUniformLocation(phong, 'uCamPos'),
      uAlpha: gl.getUniformLocation(phong, 'uAlpha'), uGlow: gl.getUniformLocation(phong, 'uGlow'),
      uIsEarth: gl.getUniformLocation(phong, 'uIsEarth')
    };
    var ptL = {
      aPosition: gl.getAttribLocation(ppart, 'aPosition'), aLife: gl.getAttribLocation(ppart, 'aLife'),
      aColor: gl.getAttribLocation(ppart, 'aColor'), aSize: gl.getAttribLocation(ppart, 'aSize'),
      uView: gl.getUniformLocation(ppart, 'uView'), uProj: gl.getUniformLocation(ppart, 'uProj'),
      uSize: gl.getUniformLocation(ppart, 'uSize')
    };
    var stL = {
      aPosition: gl.getAttribLocation(pstar, 'aPosition'), uView: gl.getUniformLocation(pstar, 'uView'),
      uProj: gl.getUniformLocation(pstar, 'uProj'), uSize: gl.getUniformLocation(pstar, 'uSize'),
      uAlpha: gl.getUniformLocation(pstar, 'uAlpha'), uOffY: gl.getUniformLocation(pstar, 'uOffY')
    };

    var view = mat4.create(), proj = mat4.create(), tmpInv = mat4.create(), normalMat = mat4.create();
    var camera = { eye: [0, 3, 9], target: [0, 3, 0], up: [0, 1, 0], fov: 45 * Math.PI / 180, near: 0.1, far: 2000 };
    var light = { dir: [0.5, 0.8, 0.3], color: [1, 0.97, 0.9], ambient: [0.16, 0.18, 0.22], rim: [0.25, 0.35, 0.55] };
    var clearColor = [0.04, 0.05, 0.09];
    var meshes = [], lost = false;

    function createMesh(g, color, opts) {
      opts = opts || {};
      var m = {
        geometry: g, color: color || [0.8, 0.8, 0.8],
        modelMatrix: mat4.identity(mat4.create()), visible: true, alpha: 1, glow: 0,
        group: opts.group || 'scene', isEarth: opts.isEarth || false,
        _posBuf: gl.createBuffer(), _norBuf: gl.createBuffer(), _idxBuf: gl.createBuffer()
      };
      gl.bindBuffer(gl.ARRAY_BUFFER, m._posBuf); gl.bufferData(gl.ARRAY_BUFFER, g.positions, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, m._norBuf); gl.bufferData(gl.ARRAY_BUFFER, g.normals, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m._idxBuf); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.indices, gl.STATIC_DRAW);
      m.indexCount = g.indices.length; meshes.push(m); return m;
    }

    var particles = (function () {
      var max = 2000, data = new Float32Array(max * 8), vel = new Float32Array(max * 3), life = new Float32Array(max), maxLife = new Float32Array(max);
      var count = 0, cursor = 0, buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
      function spawn(x, y, z, vx, vy, vz, r, g2, b, lf, size) {
        var i = cursor; cursor = (cursor + 1) % max; var o = i * 8;
        data[o] = x; data[o + 1] = y; data[o + 2] = z; data[o + 3] = 1.0;
        data[o + 4] = r; data[o + 5] = g2; data[o + 6] = b; data[o + 7] = size || 1;
        vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz; life[i] = lf; maxLife[i] = lf;
        if (i >= count) count = i + 1;
      }
      function update(dt) {
        for (var i = 0; i < count; i++) {
          if (life[i] <= 0) continue;
          life[i] -= dt; if (life[i] <= 0) { data[i * 8 + 3] = 0; continue; }
          var vi = i * 3, oi = i * 8;
          vel[vi + 1] -= 2.5 * dt; vel[vi] *= (1 - 1.2 * dt); vel[vi + 1] *= (1 - 0.6 * dt); vel[vi + 2] *= (1 - 1.2 * dt);
          data[oi] += vel[vi] * dt; data[oi + 1] += vel[vi + 1] * dt; data[oi + 2] += vel[vi + 2] * dt;
          data[oi + 3] = life[i] / maxLife[i];
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
      }
      function render() {
        if (count === 0) return;
        gl.useProgram(ppart); gl.uniformMatrix4fv(ptL.uView, false, view); gl.uniformMatrix4fv(ptL.uProj, false, proj); gl.uniform1f(ptL.uSize, 1.6);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf); var stride = 32;
        gl.enableVertexAttribArray(ptL.aPosition); gl.vertexAttribPointer(ptL.aPosition, 3, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(ptL.aLife); gl.vertexAttribPointer(ptL.aLife, 1, gl.FLOAT, false, stride, 12);
        gl.enableVertexAttribArray(ptL.aColor); gl.vertexAttribPointer(ptL.aColor, 3, gl.FLOAT, false, stride, 16);
        gl.enableVertexAttribArray(ptL.aSize); gl.vertexAttribPointer(ptL.aSize, 1, gl.FLOAT, false, stride, 28);
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false);
        gl.drawArrays(gl.POINTS, 0, count); gl.depthMask(true); gl.disable(gl.BLEND);
      }
      function reset() { count = 0; cursor = 0; for (var i = 0; i < max; i++) life[i] = 0; }
      return { spawn: spawn, update: update, render: render, reset: reset, max: max };
    })();

    var stars = (function () {
      var n = 260, pos = new Float32Array(n * 3), buf = gl.createBuffer(), alpha = 0, offY = 0;
      for (var i = 0; i < n; i++) {
        var theta = Math.acos(2 * Math.random() - 1), phi = Math.random() * Math.PI * 2, r = 60 + Math.random() * 40;
        pos[i * 3] = r * Math.sin(theta) * Math.cos(phi); pos[i * 3 + 1] = r * Math.cos(theta); pos[i * 3 + 2] = r * Math.sin(theta) * Math.sin(phi);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
      function render() {
        if (alpha <= 0.001) return;
        gl.useProgram(pstar); gl.uniformMatrix4fv(stL.uView, false, view); gl.uniformMatrix4fv(stL.uProj, false, proj);
        gl.uniform1f(stL.uSize, 2.5); gl.uniform1f(stL.uAlpha, alpha); gl.uniform1f(stL.uOffY, offY);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(stL.aPosition); gl.vertexAttribPointer(stL.aPosition, 3, gl.FLOAT, false, 0, 0);
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
        gl.drawArrays(gl.POINTS, 0, n); gl.depthMask(true); gl.disable(gl.BLEND);
      }
      return { render: render, setAlpha: function (a) { alpha = a; }, setOffsetY: function (y) { offY = y; } };
    })();

    function resize(w, h, dpr) {
      var pw = Math.floor(w * dpr), ph = Math.floor(h * dpr);
      if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    function drawMesh(m) {
      mat4.invert(tmpInv, m.modelMatrix); mat4.transpose(normalMat, tmpInv);
      gl.uniformMatrix4fv(pL.uModel, false, m.modelMatrix); gl.uniformMatrix4fv(pL.uNormalMat, false, normalMat);
      gl.uniform3fv(pL.uColor, m.color); gl.uniform1f(pL.uAlpha, m.alpha); gl.uniform1f(pL.uGlow, m.glow);
      gl.uniform1f(pL.uIsEarth, m.isEarth ? 1 : 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, m._posBuf); gl.enableVertexAttribArray(pL.aPosition); gl.vertexAttribPointer(pL.aPosition, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, m._norBuf); gl.enableVertexAttribArray(pL.aNormal); gl.vertexAttribPointer(pL.aNormal, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m._idxBuf);
      var transparent = m.alpha < 0.999;
      if (transparent) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); }
      gl.drawElements(gl.TRIANGLES, m.indexCount, gl.UNSIGNED_SHORT, 0);
      if (transparent) { gl.depthMask(true); gl.disable(gl.BLEND); }
    }

    function render() {
      if (lost) return;
      gl.clearColor(clearColor[0], clearColor[1], clearColor[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
      var aspect = canvas.width / canvas.height;
      mat4.perspective(proj, camera.fov, aspect, camera.near, camera.far);
      mat4.lookAt(view, camera.eye, camera.target, camera.up);
      stars.render();
      gl.useProgram(phong);
      gl.uniformMatrix4fv(pL.uView, false, view); gl.uniformMatrix4fv(pL.uProj, false, proj);
      gl.uniform3fv(pL.uLightDir, light.dir); gl.uniform3fv(pL.uLightColor, light.color);
      gl.uniform3fv(pL.uAmbient, light.ambient); gl.uniform3fv(pL.uRimColor, light.rim); gl.uniform3fv(pL.uCamPos, camera.eye);
      var i, m;
      for (i = 0; i < meshes.length; i++) { m = meshes[i]; if (m.visible && m.alpha >= 0.999) drawMesh(m); }
      for (i = 0; i < meshes.length; i++) { m = meshes[i]; if (m.visible && m.alpha < 0.999) drawMesh(m); }
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
      createMesh: createMesh, resize: resize, render: render, project: project,
      setClearColor: function (r, g, b) { clearColor[0] = r; clearColor[1] = g; clearColor[2] = b; },
      isLost: function () { return lost; },
      destroy: function () { canvas.removeEventListener('webglcontextlost', onContextLost); canvas.removeEventListener('webglcontextrestored', onContextRestored); }
    };
  }
  M3D.createRenderer = createRenderer;
})(typeof window !== 'undefined' ? window : this);
