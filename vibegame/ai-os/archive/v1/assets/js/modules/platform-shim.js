/*!
 * platform-shim.js —— 灵光平台 API 垫片
 *
 * 原产物依赖灵光容器注入的三个 SDK（base.js / AudioContext2.js /
 * voice-tts-simple.js）与 window.lingguang 全局对象。这些资源来自外部域名，
 * 离线容器内一律加载不到，已从 index.html 移除。
 *
 * 经扫描，app.runtime.js 对平台的实际依赖只有三处，本模块提供等价实现：
 *   1. window.lingguang.vibrate({ mode, intensity })  —— 扫雷踩雷时的震动反馈
 *   2. window.lingguang._getArtifactId()              —— 错误上报元信息（非可选链，缺失会抛错）
 *   3. window.lingguang._getArtifactVersion()         —— 同上
 *
 * AudioContext2 / voice-tts-simple 在产物中零引用（AudioContext、tts、speech
 * 三个关键字命中数均为 0），故不提供垫片。
 */

/*
 * globalThis polyfill —— 安卓9(WebView ≈ Chrome 69) 无 globalThis(Chrome 71+)。
 * app.runtime.js 中 `typeof globalThis.__instrumentedCatchMonitor` 会先访问
 * globalThis 标识符再取属性，typeof 不保护中间引用，会抛 ReferenceError。
 * 本文件是 <head> 中第一个脚本，在此补全可保证后续所有脚本可用。
 */
if (typeof globalThis === 'undefined') {
  window.globalThis = window;
}

(function (global) {
  'use strict';

  var ARTIFACT_ID = 'ai-os';
  var ARTIFACT_VERSION = '138';

  // 震动强度 -> 时长（毫秒）。navigator.vibrate 不在容器禁用清单内，
  // 不支持时静默降级为无操作，不影响主流程。
  var DURATION = {
    light: 10,
    medium: 20,
    heavy: 40
  };

  function vibrate(options) {
    var opts = options || {};
    var base = DURATION[opts.intensity] || DURATION.medium;
    var duration = opts.mode === 'long' ? base * 3 : base;

    if (typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(duration);
      } catch (err) {
        // 部分 WebView 未授权震动，忽略即可
      }
    }
  }

  function init() {
    var platform = global.lingguang || {};

    if (typeof platform.vibrate !== 'function') {
      platform.vibrate = vibrate;
    }
    if (typeof platform._getArtifactId !== 'function') {
      platform._getArtifactId = function () { return ARTIFACT_ID; };
    }
    if (typeof platform._getArtifactVersion !== 'function') {
      platform._getArtifactVersion = function () { return ARTIFACT_VERSION; };
    }

    global.lingguang = platform;

    // 运行时错误上报会读取这几个全局量（均带 ?? 兜底，这里补全以保持日志可读）
    global.artifactId = global.artifactId || ARTIFACT_ID;
    global.artifactVersion = global.artifactVersion || ARTIFACT_VERSION;
    global.trace_id = global.trace_id || '';
  }

  global.AIOS = global.AIOS || {};
  global.AIOS.platformShim = { init: init };
})(window);
