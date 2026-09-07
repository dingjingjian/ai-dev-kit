(function (global) {
  'use strict';
  var M3D = global.M3D || (global.M3D = {});

  var vec3 = {
    create: function () { return [0, 0, 0]; },
    fromValues: function (x, y, z) { return [x, y, z]; },
    set: function (o, x, y, z) { o[0] = x; o[1] = y; o[2] = z; return o; },
    copy: function (o, a) { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; return o; },
    add: function (o, a, b) { o[0] = a[0] + b[0]; o[1] = a[1] + b[1]; o[2] = a[2] + b[2]; return o; },
    sub: function (o, a, b) { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; },
    scale: function (o, a, s) { o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s; return o; },
    dot: function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; },
    cross: function (o, a, b) {
      var ax = a[0], ay = a[1], az = a[2], bx = b[0], by = b[1], bz = b[2];
      o[0] = ay * bz - az * by; o[1] = az * bx - ax * bz; o[2] = ax * by - ay * bx;
      return o;
    },
    len: function (a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); },
    normalize: function (o, a) {
      var l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
      if (l > 1e-8) { l = 1 / l; o[0] = a[0] * l; o[1] = a[1] * l; o[2] = a[2] * l; }
      else { o[0] = 0; o[1] = 0; o[2] = 0; }
      return o;
    },
    lerp: function (o, a, b, t) {
      o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t;
      return o;
    }
  };

  var mat4 = {
    create: function () { return new Float32Array(16); },
    identity: function (o) {
      o[0] = 1; o[1] = 0; o[2] = 0; o[3] = 0;
      o[4] = 0; o[5] = 1; o[6] = 0; o[7] = 0;
      o[8] = 0; o[9] = 0; o[10] = 1; o[11] = 0;
      o[12] = 0; o[13] = 0; o[14] = 0; o[15] = 1;
      return o;
    },
    copy: function (o, a) { for (var i = 0; i < 16; i++) o[i] = a[i]; return o; },
    multiply: function (o, a, b) {
      var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
      var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
      var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
      var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
      var b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
      o[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      o[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      o[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      o[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
      o[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      o[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      o[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      o[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
      o[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      o[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      o[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      o[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
      o[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      o[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      o[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      o[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      return o;
    },
    perspective: function (o, fovy, aspect, near, far) {
      var f = 1 / Math.tan(fovy / 2);
      var nf = 1 / (near - far);
      o[0] = f / aspect; o[1] = 0; o[2] = 0; o[3] = 0;
      o[4] = 0; o[5] = f; o[6] = 0; o[7] = 0;
      o[8] = 0; o[9] = 0; o[10] = (far + near) * nf; o[11] = -1;
      o[12] = 0; o[13] = 0; o[14] = 2 * far * near * nf; o[15] = 0;
      return o;
    },
    lookAt: function (o, eye, center, up) {
      var ex = eye[0], ey = eye[1], ez = eye[2];
      var cx = center[0], cy = center[1], cz = center[2];
      var ux = up[0], uy = up[1], uz = up[2];
      var zx = ex - cx, zy = ey - cy, zz = ez - cz;
      var zl = 1 / Math.sqrt(zx * zx + zy * zy + zz * zz);
      zx *= zl; zy *= zl; zz *= zl;
      var xx = uy * zz - uz * zy, xy = uz * zx - ux * zz, xz = ux * zy - uy * zx;
      var xl = 1 / Math.sqrt(xx * xx + xy * xy + xz * xz);
      xx *= xl; xy *= xl; xz *= xl;
      var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
      o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
      o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
      o[12] = -(xx * ex + xy * ey + xz * ez);
      o[13] = -(yx * ex + yy * ey + yz * ez);
      o[14] = -(zx * ex + zy * ey + zz * ez);
      o[15] = 1;
      return o;
    },
    translate: function (o, a, v) {
      var x = v[0], y = v[1], z = v[2];
      if (a === o) {
        o[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
        o[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
        o[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
      } else {
        o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; o[3] = a[3];
        o[4] = a[4]; o[5] = a[5]; o[6] = a[6]; o[7] = a[7];
        o[8] = a[8]; o[9] = a[9]; o[10] = a[10]; o[11] = a[11];
        o[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
        o[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
        o[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
        o[15] = a[15];
      }
      return o;
    },
    rotateX: function (o, a, rad) {
      var s = Math.sin(rad), c = Math.cos(rad);
      var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
      var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
      if (a !== o) {
        o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; o[3] = a[3];
        o[12] = a[12]; o[13] = a[13]; o[14] = a[14]; o[15] = a[15];
      }
      o[4] = a10 * c + a20 * s; o[5] = a11 * c + a21 * s; o[6] = a12 * c + a22 * s; o[7] = a13 * c + a23 * s;
      o[8] = a20 * c - a10 * s; o[9] = a21 * c - a11 * s; o[10] = a22 * c - a12 * s; o[11] = a23 * c - a13 * s;
      return o;
    },
    rotateY: function (o, a, rad) {
      var s = Math.sin(rad), c = Math.cos(rad);
      var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
      var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
      if (a !== o) {
        o[4] = a[4]; o[5] = a[5]; o[6] = a[6]; o[7] = a[7];
        o[12] = a[12]; o[13] = a[13]; o[14] = a[14]; o[15] = a[15];
      }
      o[0] = a00 * c - a20 * s; o[1] = a01 * c - a21 * s; o[2] = a02 * c - a22 * s; o[3] = a03 * c - a23 * s;
      o[8] = a00 * s + a20 * c; o[9] = a01 * s + a21 * c; o[10] = a02 * s + a22 * c; o[11] = a03 * s + a23 * c;
      return o;
    },
    rotateZ: function (o, a, rad) {
      var s = Math.sin(rad), c = Math.cos(rad);
      var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
      var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
      if (a !== o) {
        o[8] = a[8]; o[9] = a[9]; o[10] = a[10]; o[11] = a[11];
        o[12] = a[12]; o[13] = a[13]; o[14] = a[14]; o[15] = a[15];
      }
      o[0] = a00 * c + a10 * s; o[1] = a01 * c + a11 * s; o[2] = a02 * c + a12 * s; o[3] = a03 * c + a13 * s;
      o[4] = a10 * c - a00 * s; o[5] = a11 * c - a01 * s; o[6] = a12 * c - a02 * s; o[7] = a13 * c - a03 * s;
      return o;
    },
    scale: function (o, a, v) {
      var x = v[0], y = v[1], z = v[2];
      o[0] = a[0] * x; o[1] = a[1] * x; o[2] = a[2] * x; o[3] = a[3] * x;
      o[4] = a[4] * y; o[5] = a[5] * y; o[6] = a[6] * y; o[7] = a[7] * y;
      o[8] = a[8] * z; o[9] = a[9] * z; o[10] = a[10] * z; o[11] = a[11] * z;
      o[12] = a[12]; o[13] = a[13]; o[14] = a[14]; o[15] = a[15];
      return o;
    },
    invert: function (o, a) {
      var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
      var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
      var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
      var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
      var b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
      var b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
      var b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
      var b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
      var det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
      if (!det) return null;
      det = 1 / det;
      o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
      o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
      o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
      o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
      o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
      o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
      o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
      o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
      o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
      o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
      o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
      o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
      o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
      o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
      o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
      o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
      return o;
    },
    transpose: function (o, a) {
      if (a === o) {
        var a01 = a[1], a02 = a[2], a12 = a[6];
        o[1] = a[4]; o[2] = a[8]; o[3] = a[12];
        o[4] = a01; o[6] = a[9]; o[7] = a[13];
        o[8] = a02; o[9] = a12; o[11] = a[14];
        o[12] = a[3]; o[13] = a[7]; o[14] = a[11];
      } else {
        o[0] = a[0]; o[1] = a[4]; o[2] = a[8]; o[3] = a[12];
        o[4] = a[1]; o[5] = a[5]; o[6] = a[9]; o[7] = a[13];
        o[8] = a[2]; o[9] = a[6]; o[10] = a[10]; o[11] = a[14];
        o[12] = a[3]; o[13] = a[7]; o[14] = a[11]; o[15] = a[15];
      }
      return o;
    }
  };

  M3D.vec3 = vec3;
  M3D.mat4 = mat4;
})(typeof window !== 'undefined' ? window : this);
