/**
 * 郑和宝船 — 应用层
 *
 * 阶段 0 占位实现：仅渲染参数表中的记载值，验证取数链路与合规基线。
 * 阶段 4 换装真正的 WebGL 渲染与三模式交互。
 *
 * 合规约束（minitool-zip-builder）：经典脚本、无模块语法、事件用 addEventListener。
 */
(function () {
  'use strict';

  var ZH = window.ZH_SHIP;
  if (!ZH) return;

  var R = ZH.RECORD;

  function row(label, value) {
    return '<div class="row"><dt>' + label + '</dt><dd>' + value + '</dd></div>';
  }

  function render() {
    var c = ZH.selfCheck();

    var el = document.getElementById('stats');
    if (el) {
      el.innerHTML =
        row('船长（记载）', '四十四丈四尺') +
        row('船宽（记载）', '十八丈') +
        row('长宽比', R.ratio.toFixed(2)) +
        row('桅 / 帆', R.mastCount + ' 桅　' + R.sailCount + ' 帆') +
        row('水密隔舱', ZH.SHIP.bulkheadCount + ' 舱');
    }

    var note = document.getElementById('note');
    if (note) {
      note.innerHTML =
        '取材《明史·郑和传》《瀛涯胜览》与龙江船厂遗址实物。<br>' +
        '尺度按记载折算约 <b>' + R.lengthM.toFixed(0) + ' × ' + R.beamM.toFixed(0) + ' 米</b>，' +
        '学界对其米数有争议，本应用仅呈现<b>比例关系</b>。<br>' +
        '九桅十二帆的排布为<b>学界推定</b>，非史料明文。';
    }

    // 自检不通过时暴露出来，避免静默错数
    if (!c.ok && note) {
      note.innerHTML += '<br><b>参数自检未通过：桅 ' + c.mastCount + ' / 帆 ' + c.sailCount + '</b>';
    }
  }

  function init() {
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
