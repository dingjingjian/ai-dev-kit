/* ============================================================
 * 人工智能计算器 - 原生 JS 实现
 * 仿真计算器界面，50% 概率显示错误结果，用户需判对错
 * ============================================================ */
(function () {
  'use strict';

  // ===== DOM 引用 =====
  var $ = function (id) { return document.getElementById(id); };
  var el = {
    score: $('score'),
    combo: $('combo'),
    comboCard: $('comboCard'),
    highScore: $('highScore'),
    accuracy: $('accuracy'),
    totalRounds: $('totalRounds'),
    helpBtn: $('helpBtn'),
    resetBtn: $('resetBtn'),
    helpPanel: $('helpPanel'),
    helpClose: $('helpClose'),
    badgeCalc: $('badgeCalc'),
    badgeVerify: $('badgeVerify'),
    badgeOk: $('badgeOk'),
    badgeNo: $('badgeNo'),
    expression: $('expression'),
    display: $('display'),
    feedback: $('feedback'),
    verifyBar: $('verifyBar'),
    idleHint: $('idleHint'),
    idleText: $('idleText'),
    keypad: $('keypad'),
    okBtn: $('okBtn'),
    noBtn: $('noBtn'),
    toastWrap: $('toastWrap')
  };

  // ===== 状态 =====
  var state = {
    display: '0',
    previousValue: null,
    currentOperation: null,
    shouldResetDisplay: false,
    expression: '',
    score: 0,
    highScore: 0,
    combo: 0,
    gamePhase: 'calculating',   // calculating | verifying | feedback
    correctResult: null,
    shownResult: null,
    isResultWrong: false,
    totalRounds: 0,
    correctJudgments: 0,
    hasDecimalInOperation: false
  };
  var feedbackTimer = null;

  // ===== 从 localStorage 读取 =====
  try {
    var s = localStorage.getItem('calculatorGame_score');
    if (s) state.score = parseInt(s, 10) || 0;
    var h = localStorage.getItem('calculatorGame_highScore');
    if (h) state.highScore = parseInt(h, 10) || 0;
  } catch (e) { /* localStorage 不可用时忽略 */ }

  // ===== 错误结果生成（移植自原 React 版） =====
  function generateWrongResult(correctResult, hasDecimalInOperation) {
    var result = parseFloat(correctResult);
    var isInteger = Number.isInteger(result);
    var resultStr = correctResult.toString();
    var digits = resultStr.replace('.', '').split('');
    var resultLength = digits.length;

    var availableErrorTypes = [];
    availableErrorTypes.push('off_by_small');
    availableErrorTypes.push('digit_position_error');
    if (resultLength >= 2) availableErrorTypes.push('digit_swap');
    if (hasDecimalInOperation || !isInteger) availableErrorTypes.push('decimal_error');
    if (resultStr.indexOf('.') >= 0 && result > 10 && result < 1000000) availableErrorTypes.push('decimal_shift');

    var errorType = availableErrorTypes[Math.floor(Math.random() * availableErrorTypes.length)];
    var wrongResult;

    switch (errorType) {
      case 'off_by_small': {
        if (isInteger) {
          var offsets = [1, -1, 2, -2, 10, -10, 11, -11];
          wrongResult = result + offsets[Math.floor(Math.random() * offsets.length)];
        } else {
          var parts = correctResult.split('.');
          var decimalPart = parts[1];
          if (decimalPart && decimalPart.length > 0) {
            var lastDigit = parseInt(decimalPart[decimalPart.length - 1], 10);
            var newLastDigit = (lastDigit + (Math.random() > 0.5 ? 1 : -1) + 10) % 10;
            var newDecimal = decimalPart.slice(0, -1) + newLastDigit;
            wrongResult = parseFloat(parts[0] + '.' + newDecimal);
          } else {
            wrongResult = result + 0.1;
          }
        }
        break;
      }
      case 'digit_position_error': {
        if (resultLength >= 1) {
          var idx = Math.floor(Math.random() * digits.length);
          var orig = parseInt(digits[idx], 10);
          var errorMap = {
            0: [6, 8, 9], 1: [7, 4, 1], 2: [3, 5, 2], 3: [2, 5, 8],
            4: [1, 9, 4], 5: [2, 3, 6], 6: [0, 5, 8], 7: [1, 9, 7],
            8: [0, 3, 6], 9: [4, 7, 9]
          };
          var opts = errorMap[orig] || [orig + 1, orig - 1];
          var nd = opts[Math.floor(Math.random() * opts.length)] % 10;
          var newDigits = digits.slice();
          newDigits[idx] = nd;
          if (correctResult.indexOf('.') >= 0) {
            var dp = correctResult.indexOf('.');
            wrongResult = parseFloat(newDigits.slice(0, dp).join('') + '.' + newDigits.slice(dp).join(''));
          } else {
            wrongResult = parseFloat(newDigits.join(''));
          }
        } else {
          wrongResult = result + 1;
        }
        break;
      }
      case 'digit_swap': {
        if (resultLength >= 2) {
          var nd2 = digits.slice();
          if (Math.random() < 0.7 && resultLength >= 2) {
            var i2 = Math.floor(Math.random() * (resultLength - 1));
            var t = nd2[i2]; nd2[i2] = nd2[i2 + 1]; nd2[i2 + 1] = t;
          } else {
            var a = Math.floor(Math.random() * resultLength);
            var b = Math.floor(Math.random() * resultLength);
            while (b === a) b = Math.floor(Math.random() * resultLength);
            var t2 = nd2[a]; nd2[a] = nd2[b]; nd2[b] = t2;
          }
          if (correctResult.indexOf('.') >= 0) {
            var dp2 = correctResult.indexOf('.');
            wrongResult = parseFloat(nd2.slice(0, dp2).join('') + '.' + nd2.slice(dp2).join(''));
          } else {
            wrongResult = parseFloat(nd2.join(''));
          }
        } else {
          wrongResult = result + 1;
        }
        break;
      }
      case 'decimal_error': {
        if (correctResult.indexOf('.') >= 0) {
          var pp = correctResult.split('.');
          if (Math.random() < 0.5 && pp[1].length > 0) {
            wrongResult = parseFloat(pp[0] + '.' + pp[1].slice(0, -1));
          } else {
            var dl = pp[1].length;
            var wd = '';
            for (var i = 0; i < dl; i++) {
              var od = parseInt(pp[1][i], 10);
              if (Math.random() < 0.3) {
                wd += ((od + Math.floor(Math.random() * 3)) % 10).toString();
              } else {
                wd += pp[1][i];
              }
            }
            wrongResult = parseFloat(pp[0] + '.' + wd);
          }
        } else {
          wrongResult = result + (Math.floor(Math.random() * 9) + 1) / 10;
        }
        break;
      }
      case 'decimal_shift': {
        if (correctResult.indexOf('.') >= 0) {
          var dpos = correctResult.indexOf('.');
          if (Math.random() < 0.5 && dpos > 0) {
            var ns = correctResult.slice(0, dpos - 1) + '.' + correctResult[dpos - 1] + correctResult.slice(dpos + 1);
            wrongResult = parseFloat(ns);
          } else if (dpos < correctResult.length - 1) {
            var ns2 = correctResult.slice(0, dpos) + correctResult[dpos + 1] + '.' + correctResult.slice(dpos + 2);
            wrongResult = parseFloat(ns2);
          } else {
            wrongResult = result;
          }
        } else {
          var st = correctResult;
          var ip = Math.max(1, st.length - Math.floor(Math.random() * 2));
          wrongResult = parseFloat(st.slice(0, ip) + '.' + st.slice(ip));
        }
        break;
      }
      default:
        wrongResult = result + (Math.random() > 0.5 ? 1 : -1);
    }

    if (isInteger && !hasDecimalInOperation) wrongResult = Math.round(wrongResult);
    if (wrongResult === result) wrongResult = result + (isInteger ? 1 : 0.1);
    if (result > 0 && wrongResult < 0) wrongResult = Math.abs(wrongResult);
    if (Number.isInteger(wrongResult)) return wrongResult.toString();
    return parseFloat(wrongResult.toFixed(4)).toString();
  }

  // ===== Toast =====
  function toast(msg, type) {
    var t = document.createElement('div');
    t.className = 'toast ' + (type || 'info');
    t.textContent = msg;
    el.toastWrap.appendChild(t);
    // 强制重排以触发动画
    void t.offsetWidth;
    t.classList.add('show');
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
    }, 1800);
  }

  // ===== 渲染 =====
  function render() {
    el.display.textContent = state.display;
    var len = state.display.length;
    var containerWidth = el.display.parentElement ? el.display.parentElement.clientWidth - 8 : 300;
    var fontSize = containerWidth / (len * 0.68);
    fontSize = Math.min(60, Math.max(20, fontSize));
    el.display.style.fontSize = fontSize + 'px';
    el.expression.innerHTML = state.expression || '&nbsp;';
    el.score.textContent = state.score;
    el.combo.textContent = 'x' + state.combo;
    el.highScore.textContent = state.highScore;
    el.totalRounds.textContent = state.totalRounds;
    el.accuracy.textContent = (state.totalRounds > 0 ? Math.round((state.correctJudgments / state.totalRounds) * 100) : 0) + '%';
    el.comboCard.classList.toggle('active', state.combo > 0);

    // 阶段徽章
    el.badgeCalc.classList.toggle('show', state.gamePhase === 'calculating');
    el.badgeVerify.classList.toggle('show', state.gamePhase === 'verifying');
    el.badgeOk.classList.toggle('show', state.gamePhase === 'feedback' && state.feedback && state.feedback.type === 'correct');
    el.badgeNo.classList.toggle('show', state.gamePhase === 'feedback' && state.feedback && state.feedback.type === 'wrong');

    // 结果颜色
    el.display.className = 'result';
    if (state.gamePhase === 'verifying') el.display.classList.add('verify');
    else if (state.gamePhase === 'feedback' && state.feedback) {
      el.display.classList.add(state.feedback.type === 'correct' ? 'ok' : 'no');
    }

    // 反馈信息
    if (state.feedback) {
      var html = '';
      if (state.feedback.type === 'correct') {
        // 答对：显示完整反馈文案
        html += '<div class="feedback-msg">' + escapeHtml(state.feedback.message) + '</div>';
      } else if (state.feedback.showCorrect) {
        // 答错场景1：AI 显示了错误结果，用户却判断为正确 → 显示判断错误+扣分 和 正确答案
        html += '<div class="feedback-msg">判断错误！扣5分</div>';
        html += '<div class="feedback-correct">正确答案 <b class="num">' + escapeHtml(state.correctResult) + '</b></div>';
      } else {
        // 答错场景2：AI 显示了正确结果，用户却判断为错误 → 显示判断错误+扣分
        html += '<div class="feedback-msg">判断错误！扣5分</div>';
      }
      el.feedback.innerHTML = html;
      el.feedback.className = 'feedback ' + (state.feedback.type === 'correct' ? 'ok' : 'no') + ' show';
    } else {
      el.feedback.className = 'feedback';
      el.feedback.innerHTML = '';
    }

    // 验证条 / idle 提示 / 反馈
    if (state.gamePhase === 'verifying') {
      el.verifyBar.classList.remove('hide');
      el.idleHint.classList.add('hide');
    } else if (state.gamePhase === 'feedback') {
      el.verifyBar.classList.add('hide');
      el.idleHint.classList.add('hide');
    } else {
      el.verifyBar.classList.add('hide');
      el.idleHint.classList.remove('hide');
      el.idleText.textContent = '输入算式后点击 = 开始验证';
    }

    // 按键区禁用
    el.keypad.classList.toggle('disabled', state.gamePhase !== 'calculating');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ===== 计算器逻辑 =====
  function clear() {
    state.display = '0';
    state.previousValue = null;
    state.currentOperation = null;
    state.shouldResetDisplay = false;
    state.expression = '';
    state.gamePhase = 'calculating';
    state.feedback = null;
    state.hasDecimalInOperation = false;
    render();
  }

  function resetGame() {
    clear();
    state.score = 0;
    state.combo = 0;
    state.totalRounds = 0;
    state.correctJudgments = 0;
    saveScore();
    toast('游戏已重置！', 'info');
    render();
  }

  function backspace() {
    if (state.gamePhase !== 'calculating') return;
    if (state.display.length === 1 || (state.display.length === 2 && state.display.charAt(0) === '-')) {
      state.display = '0';
    } else {
      state.display = state.display.slice(0, -1);
    }
    render();
  }

  function appendNumber(num) {
    if (state.gamePhase !== 'calculating') {
      clear();
      state.display = num;
      render();
      return;
    }
    if (state.shouldResetDisplay) {
      state.display = num;
      state.shouldResetDisplay = false;
    } else {
      if (state.display === '0') {
        state.display = num;
      } else if (state.display.length < 12) {
        state.display = state.display + num;
      }
    }
    render();
  }

  function appendDecimal() {
    if (state.gamePhase !== 'calculating') return;
    if (state.shouldResetDisplay) {
      state.display = '0.';
      state.shouldResetDisplay = false;
    } else if (state.display.indexOf('.') < 0) {
      state.display = state.display + '.';
    }
    render();
  }

  function chooseOperation(op) {
    if (state.gamePhase !== 'calculating') clear();
    var current = parseFloat(state.display);
    if (state.currentOperation && !state.shouldResetDisplay) {
      var result = compute(state.previousValue, current, state.currentOperation);
      result = Math.round(result * 1000000000) / 1000000000;
      state.display = result.toString();
      state.previousValue = result;
    } else {
      state.previousValue = current;
    }
    state.currentOperation = op;
    state.shouldResetDisplay = true;
    state.expression = state.display + ' ' + op;
    render();
  }

  function compute(prev, cur, op) {
    switch (op) {
      case '+': return prev + cur;
      case '-': return prev - cur;
      case '×': return prev * cur;
      case '÷': return cur !== 0 ? prev / cur : 0;
      default: return cur;
    }
  }

  function calculate() {
    if (state.currentOperation === null || state.previousValue === null) return;
    var current = parseFloat(state.display);
    var prevHasDecimal = state.previousValue.toString().indexOf('.') >= 0;
    var curHasDecimal = state.display.indexOf('.') >= 0;
    var opHadDecimal = prevHasDecimal || curHasDecimal;
    state.hasDecimalInOperation = opHadDecimal;

    var result;
    if (state.currentOperation === '÷' && current === 0) {
      state.display = 'Error';
      state.expression = '';
      state.previousValue = null;
      state.currentOperation = null;
      state.shouldResetDisplay = true;
      render();
      return;
    }
    result = compute(state.previousValue, current, state.currentOperation);
    result = Math.round(result * 1000000000) / 1000000000;
    var resultStr = result.toString();
    if (resultStr.length > 14) {
      var intPart = resultStr.split('.')[0];
      var maxDecimals = Math.max(0, 14 - intPart.length - 1);
      resultStr = result.toFixed(maxDecimals);
      if (resultStr.indexOf('.') >= 0) {
        resultStr = resultStr.replace(/0+$/, '').replace(/\.$/, '');
      }
    }

    // 50% 概率显示错误结果
    var shouldShowWrong = Math.random() < 0.5;
    var wrongResult = shouldShowWrong ? generateWrongResult(resultStr, opHadDecimal) : null;
    var finalDisplay = shouldShowWrong ? wrongResult : resultStr;

    state.correctResult = resultStr;
    state.shownResult = finalDisplay;
    state.isResultWrong = shouldShowWrong;
    state.display = finalDisplay;
    state.expression = state.previousValue + ' ' + state.currentOperation + ' ' + current + ' =';
    state.previousValue = null;
    state.currentOperation = null;
    state.shouldResetDisplay = true;
    state.gamePhase = 'verifying';
    state.feedback = null;
    render();
  }

  function verifyResult(userThinksWrong) {
    var actualIsWrong = state.isResultWrong;
    var userJudgeCorrect = (userThinksWrong && actualIsWrong) || (!userThinksWrong && !actualIsWrong);

    state.totalRounds++;
    if (userJudgeCorrect) {
      var comboBonus = Math.floor(state.combo / 3) * 5;
      var points = 10 + comboBonus;
      state.score += points;
      state.combo++;
      state.correctJudgments++;
      if (state.score > state.highScore) state.highScore = state.score;
      state.feedback = {
        type: 'correct',
        message: '判断正确！+' + points + '分' + (state.combo >= 2 ? ' (连击 x' + (state.combo) + '!)' : '')
      };
    } else {
      state.score = Math.max(0, state.score - 5);
      state.combo = 0;
      // 区分两种答错场景：
      //   actualIsWrong=true  → AI 显示了错误结果，用户却判断为正确 → 显示正确答案
      //   actualIsWrong=false → AI 显示了正确结果，用户却判断为错误 → 仅显示判断错误
      state.feedback = { type: 'wrong', showCorrect: actualIsWrong };
    }
    state.gamePhase = 'feedback';
    saveScore();
    render();
  }

  function percentage() {
    if (state.gamePhase !== 'calculating') return;
    var current = parseFloat(state.display);
    state.display = (current / 100).toString();
    render();
  }

  function toggleSign() {
    if (state.gamePhase !== 'calculating') return;
    var current = parseFloat(state.display);
    state.display = (-current).toString();
    render();
  }

  function saveScore() {
    try {
      localStorage.setItem('calculatorGame_score', state.score.toString());
      localStorage.setItem('calculatorGame_highScore', state.highScore.toString());
    } catch (e) { /* 忽略 */ }
  }

  // ===== 事件绑定 =====
  // 按键区事件委托
  el.keypad.addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    if (state.gamePhase !== 'calculating' && !(btn.dataset.action === 'clear')) {
      // 非计算阶段，除 AC 外的按键先清空
    }
    var num = btn.dataset.num;
    var op = btn.dataset.op;
    var action = btn.dataset.action;
    if (num !== undefined) appendNumber(num);
    else if (op) chooseOperation(op);
    else if (action === 'clear') clear();
    else if (action === 'sign') toggleSign();
    else if (action === 'percent') percentage();
    else if (action === 'decimal') appendDecimal();
    else if (action === 'equals') calculate();
  });

  // 验证按钮
  el.okBtn.addEventListener('click', function () { verifyResult(false); });
  el.noBtn.addEventListener('click', function () { verifyResult(true); });

  // 反馈阶段任意位置点击跳过（排除 verify-btn 自身的点击，避免刚答完即触发）
  document.addEventListener('click', function (e) {
    if (state.gamePhase === 'feedback' && state.feedback) {
      if (e.target.closest('.verify-btn')) return;
      if (feedbackTimer) { clearTimeout(feedbackTimer); feedbackTimer = null; }
      clear();
    }
  });

  // 帮助 & 重置
  el.helpBtn.addEventListener('click', function () {
    el.helpPanel.hidden = !el.helpPanel.hidden;
  });
  el.helpClose.addEventListener('click', function () {
    el.helpPanel.hidden = true;
  });
  el.resetBtn.addEventListener('click', resetGame);

  // 键盘支持
  document.addEventListener('keydown', function (e) {
    // 反馈阶段：任意键跳过
    if (state.gamePhase === 'feedback' && state.feedback) {
      e.preventDefault();
      if (feedbackTimer) { clearTimeout(feedbackTimer); feedbackTimer = null; }
      clear();
      return;
    }
    if (state.gamePhase === 'verifying') {
      if (e.key === 'c' || e.key === 'C') { e.preventDefault(); verifyResult(false); }
      else if (e.key === 'x' || e.key === 'X' || e.key === 'i' || e.key === 'I') { e.preventDefault(); verifyResult(true); }
      return;
    }
    if (e.key >= '0' && e.key <= '9') appendNumber(e.key);
    else if (e.key === '.') appendDecimal();
    else if (e.key === '+' || e.key === '-') chooseOperation(e.key);
    else if (e.key === '*') chooseOperation('×');
    else if (e.key === '/') { e.preventDefault(); chooseOperation('÷'); }
    else if (e.key === 'Enter' || e.key === '=') { if (state.gamePhase === 'calculating') calculate(); }
    else if (e.key === 'Escape') {
      if (!el.helpPanel.hidden) { el.helpPanel.hidden = true; e.preventDefault(); }
      else clear();
    }
    else if (e.key === 'Backspace') backspace();
  });

  // 初始渲染
  render();
})();
