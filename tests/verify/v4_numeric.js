/*!
 * v4_numeric.js — riemann / simpson / formatNumber 语义与误差
 */
'use strict';
var MC = require('../../src/core/math-core.js');
var checks = 0, issues = [];
function note(sev, msg, detail) { issues.push({ sev: sev, msg: msg, detail: detail }); console.log('  [' + sev + '] ' + msg + (detail ? '  ' + detail : '')); }
/* Ridders 外推数值导数 */
function dfridr(f, x, h0) {
  var ntab = 10, con = 1.4, con2 = con * con, err = 1e30, ans = 0, a = [], h = h0;
  for (var i = 0; i < ntab; i++) {
    a[i] = [];
    a[i][0] = (f(x + h) - f(x - h)) / (2 * h);
    var fac = con2;
    for (var j = 1; j <= i; j++) {
      a[i][j] = (a[i][j - 1] * fac - a[i - 1][j - 1]) / (fac - 1);
      fac *= con2;
      var errt = Math.max(Math.abs(a[i][j] - a[i][j - 1]), Math.abs(a[i][j] - a[i - 1][j - 1]));
      if (errt <= err) { err = errt; ans = a[i][j]; }
    }
    if (i > 1 && Math.abs(a[i][i] - a[i - 1][i - 1]) >= 2 * err) break;
    h /= con;
  }
  return ans;
}

console.log('== 1. 黎曼和取样点是否落在正确位置 ==');
[
  { mode: 'left', want: function (x0, x1) { return x0; } },
  { mode: 'right', want: function (x0, x1) { return x1; } },
  { mode: 'mid', want: function (x0, x1) { return (x0 + x1) / 2; } }
].forEach(function (c) {
  var r = MC.riemann(function (x) { return x; }, -1, 2, 7, c.mode);
  var badRows = 0;
  r.rectangles.forEach(function (rc) {
    checks++;
    var want = c.want(rc.x0, rc.x1);
    if (Math.abs(rc.sample - want) > 1e-15) badRows++;
    // 矩形高度必须等于取样点处的函数值
    if (Math.abs(rc.h - rc.sample) > 1e-15) badRows++;
  });
  console.log('  mode=' + c.mode + ' 采样点/高度检查: ' + (badRows ? badRows + ' 处不符' : '全部正确') + '（n=7, dx=' + r.dx.toFixed(4) + '）');
  if (badRows) note('high', 'riemann mode=' + c.mode + ' 采样点错误', badRows + ' rows');
});
var rb = MC.riemann(function (x) { return x; }, 2, -1, 4, 'mid');
console.log('  a>b 时 dx=' + rb.dx + '（负步长，代数和随之变号）');

console.log('\n== 2. 有符号面积（跨越零点）==');
var fx = function (x) { return x; };
[
  { a: -1, b: 1, want: 0 }, { a: 0, b: 1, want: 0.5 }, { a: -2, b: 1, want: -1.5 }
].forEach(function (c) {
  ['left', 'right', 'mid'].forEach(function (m) {
    checks++;
    var got = MC.riemann(fx, c.a, c.b, 1000, m).value;
    // left/right 是 O(1/n)，n=1000 时容差取 5(b-a)/n；mid 是 O(1/n^2)，容差 1e-12
    var tol = m === 'mid' ? 1e-12 : 5 * Math.abs(c.b - c.a) / 1000;
    var okv = Math.abs(got - c.want) <= tol;
    console.log('  ∫_' + c.a + '^' + c.b + ' x dx  mode=' + m + ' = ' + got + (okv ? ' ok' : ' (期望 ' + c.want + ')'));
    if (!okv) note('high', 'riemann 有符号面积错误', 'a=' + c.a + ' b=' + c.b + ' mode=' + m + ' got=' + got);
  });
});
checks++;
var midSym = MC.riemann(fx, -1, 1, 1000, 'mid').value;
console.log('  ∫_-1^1 x dx（mid, n=1000）= ' + midSym + (Math.abs(midSym) < 1e-15 ? '  精确抵消 (ok)' : '  非零！'));
if (Math.abs(midSym) >= 1e-15) note('medium', 'mid 模式在对称区间上未抵消', String(midSym));

console.log('\n== 3. 收敛阶：mid = O(1/n^2) vs left/right = O(1/n) ==');
var f2 = function (x) { return x * x; };
var exact2 = 1 / 3;
[10, 20, 40, 80, 160].forEach(function (n) {
  var eL = Math.abs(MC.riemann(f2, 0, 1, n, 'left').value - exact2);
  var eR = Math.abs(MC.riemann(f2, 0, 1, n, 'right').value - exact2);
  var eM = Math.abs(MC.riemann(f2, 0, 1, n, 'mid').value - exact2);
  checks++;
  console.log('  n=' + pad(String(n), 4) + ' e_left=' + eL.toExponential(3) + ' e_right=' + eR.toExponential(3) + ' e_mid=' + eM.toExponential(3));
});
var ratioL = Math.abs(MC.riemann(f2, 0, 1, 40, 'left').value - exact2) / Math.abs(MC.riemann(f2, 0, 1, 80, 'left').value - exact2);
var ratioM = Math.abs(MC.riemann(f2, 0, 1, 40, 'mid').value - exact2) / Math.abs(MC.riemann(f2, 0, 1, 80, 'mid').value - exact2);
checks++;
console.log('  n 加倍时误差比: left/right≈' + ratioL.toFixed(3) + ' (理论 2), mid≈' + ratioM.toFixed(3) + ' (理论 4)');
if (!(ratioL > 1.9 && ratioL < 2.1)) note('medium', '左端点法收敛阶异常', String(ratioL));
if (!(ratioM > 3.8 && ratioM < 4.2)) note('medium', '中点法收敛阶异常', String(ratioM));

console.log('\n== 4. 中点误差界 |E| <= (b-a)^3/(24 n^2) max|f\'\'| ==');
[
  { f: function (x) { return x * x; }, a: 0, b: 1, m2: 2 },
  { f: function (x) { return Math.exp(x); }, a: 0, b: 2, m2: Math.exp(2) },
  { f: function (x) { return Math.sin(x); }, a: 0, b: 3, m2: 1 },
  { f: function (x) { return Math.pow(x, 3); }, a: 0, b: 2, m2: 12 }
].forEach(function (c) {
  var tru = MC.simpson(c.f, c.a, c.b, 200000);
  [4, 8, 16, 32].forEach(function (n) {
    checks++;
    var e = Math.abs(MC.riemann(c.f, c.a, c.b, n, 'mid').value - tru);
    var bound = Math.pow(c.b - c.a, 3) / (24 * n * n) * c.m2;
    var okv = e <= bound * (1 + 1e-9);   // 界可以取等号（如 f=x^2 时恰好取等）
    console.log('  n=' + pad(String(n), 3) + ' |误差|=' + e.toExponential(6) + ' 界=' + bound.toExponential(6) + (okv ? ' ok' : ' 超出界!'));
    if (!okv) note('high', '中点法误差超出教科书界', 'n=' + n + ' e=' + e + ' bound=' + bound);
  });
});

console.log('\n== 5. 辛普森积分 ==');
var poly = function (x) { return 3 * x * x * x - 2 * x + 1; };  // 三次，辛普森应精确
var F = function (x) { return 0.75 * Math.pow(x, 4) - x * x + x; };
checks++;
var se = MC.simpson(poly, -1, 2, 4);
console.log('  三次多项式 ∫_-1^2 = ' + se + '，解析值 ' + (F(2) - F(-1)) + '（辛普森对三次精确）');
if (Math.abs(se - (F(2) - F(-1))) > 1e-12) note('medium', 'simpson 对三次多项式不精确', String(se));
checks++;
var sOdd = MC.simpson(poly, -1, 2, 5);
console.log('  n=5（奇数）自动变成偶数: simpson=' + sOdd);
checks++;
var sNaN = MC.simpson(function (x) { return Math.log(x); }, -1, 2, 100);
console.log('  ∫_-1^2 ln x dx = ' + sNaN + '（定义域外 → NaN，未做任何提示）');
checks++;
var sOne = MC.simpson(poly, 1, 1, 100);
console.log('  a=b 时 = ' + sOne);
checks++;
var sRev = MC.simpson(poly, 2, -1, 100);
console.log('  b<a 时 = ' + sRev + '（应为 -(' + (F(2) - F(-1)) + ')）');
if (Math.abs(sRev + (F(2) - F(-1))) > 1e-10) note('medium', 'simpson 反向区间符号错误', String(sRev));

console.log('\n== 6. formatNumber 是否会掩盖/歪曲数值 ==');
[
  [1e-13, 4, '差值 1e-13 显示为 0'],
  [-1e-13, 4, '负的极小值'],
  [0.000123456, 5, ''],
  [123456789, 6, '大数'],
  [1 / 3, 6, ''],
  [2 / 3, 6, ''],
  [NaN, 4, ''],
  [-Infinity, 4, ''],
  [Math.PI, 6, 'pi 6 位有效数字'],
  [Math.PI, 2, ''],
  [1.05, 2, '两位有效数字'],
  [2.55, 2, ''],
  [1.04, 2, ''],
  [0.999, 2, ''],
  [99.5, 2, ''],
  [1.005, 3, '']
].forEach(function (t) {
  checks++;
  var s = MC.formatNumber(t[0], t[1]);
  var relerr = (typeof t[0] === 'number' && isFinite(t[0]) && t[0] !== 0 && isFinite(Number(s)))
    ? Math.abs(Number(s) - t[0]) / Math.abs(t[0]) : NaN;
  console.log('  formatNumber(' + t[0] + ', ' + t[1] + ') = "' + s + '"' +
    (isFinite(relerr) ? '  相对舍入误差=' + (relerr * 100).toFixed(3) + '%' : '') + (t[2] ? '   // ' + t[2] : ''));
});

console.log('\n== 7. toLatex 正确性（用 KaTeX 实际渲染验证）==');
var katex = null;
try { katex = require('katex'); } catch (e) { console.log('  (katex 不可用: ' + e.message + ')'); }
['x^2', '(x^2)^3', 'x^(2^3)', '2*x^3+1', '-(x+1)', 'x-(-y)', '1/(x+1)', 'sqrt(x^2+1)',
  'abs(x-1)', 'x^(-2)', '2*(3*x)', 'e^x', 'ln(x)/x', 'sin(x)^2', 'x^(1/2)', '(-x)^2', '(-x)^3',
  'x*(-x)', '1/(-x)', '(2x)^2', '-(x)^2', '0-x^2', '(-x+1)^2', '2^-x', '(-x)^(-2)'].forEach(function (src) {
  checks++;
  var tex;
  try { tex = MC.toLatex(MC.parse(src)); } catch (e) { tex = 'ERR:' + e.message; }
  var rendered = '未渲染';
  if (katex && !/^ERR/.test(tex)) {
    try { katex.renderToString(tex); rendered = 'KaTeX ok'; }
    catch (e) { rendered = 'KaTeX 渲染失败: ' + e.message.split('\n')[0]; }
  } else if (katex) { rendered = 'KaTeX 未渲染(解析失败)'; }
  // 语义核对：渲染后的 KaTeX 表达式在 x=3 处是否等于 AST 的值
  var sem = '';
  if (katex && rendered === 'KaTeX ok') {
    try {
      var astVal = MC.compile(MC.parse(src))({ x: 3 });
      // 用 KaTeX 的 MathML/文本不足以求值，改用独立解析：把 LaTeX 交给 katex 只验证语法。
      sem = ' value@x=3 = ' + astVal;
    } catch (e) { sem = ''; }
  }
  console.log('  ' + pad(src, 12) + ' → ' + pad(tex, 34) + ' ' + rendered + sem);
  if (/渲染失败/.test(rendered)) note('medium', 'toLatex 输出非法 LaTeX（KaTeX 拒绝渲染）', src + ' → ' + tex);
});

console.log('\n== 8. 显示语义核对：toLatex 对负号/幂的括号化（期望的规范形式）==');
[
  { src: '(-x)^2', want: '\\left(-x\\right)^{2}', note: '偶次幂：必须括号化，否则显示 -x² = -9 而实际 +9' },
  { src: '(-x)^3', want: '\\left(-x\\right)^{3}', note: '奇次幂：不括号也同值，但统一括号化' },
  { src: '0-x^2', want: '0 - x^{2}', note: '负号在幂之外，语义正确（0-x² = -x²）' },
  { src: '-(x)^2', want: '-x^{2}', note: '同上' },
  { src: '(x^2)^3', want: '\\left(x^{2}\\right)^{3}', note: 'LaTeX 中 x^{2}^{3} 非法（Double superscript）' },
  { src: 'x - -x', want: 'x - -x', note: '可读性差但语义正确（\u2260 --x）' }
].forEach(function (c) {
  checks++;
  var got = MC.toLatex(MC.parse(c.src));
  var okv = got === c.want;
  console.log('  ' + (okv ? ' ok ' : 'FAIL') + '  ' + pad(c.src, 10) + ' → ' + pad(got, 30) + (okv ? '' : ' want ' + c.want) + '   ' + c.note);
  if (!okv) note('high', 'toLatex 输出的数学语义与 AST 不一致', c.src + ' → ' + got + ' (期望 ' + c.want + ')');
});

console.log('\n== 9. 模块实际显示的 5 条导数公式（calculus.js FUNCS）是否可渲染且正确 ==');
var FUNCS = [
  { id: 'x2', src: 'x^2', tex: 'x^{2}' },
  { id: 'x3', src: 'x^3', tex: 'x^{3}' },
  { id: 'sin', src: 'sin(x)', tex: '\\sin x' },
  { id: 'exp', src: 'e^x', tex: 'e^{x}' },
  { id: 'ln', src: 'ln(x)', tex: '\\ln x' }
];
FUNCS.forEach(function (fn) {
  checks++;
  var d = MC.simplify(MC.diff(MC.parse(fn.src), 'x'));
  var tex = MC.toLatex(d);
  var r = 'KaTeX ok';
  if (katex) { try { katex.renderToString(tex); } catch (e) { r = 'KaTeX FAIL: ' + e.message.split('\n')[0]; } }
  var num = MC.compile(d)({ x: 1.3 }), rid = dfridr(MC.functionOfX(fn.src), 1.3, 1e-2);
  console.log('  f=' + pad(fn.src, 8) + ' f\'=' + pad(tex, 26) + ' ' + r + '  d(1.3)=' + num.toFixed(8) + ' 数值=' + rid.toFixed(8));
  if (!(Math.abs(num - rid) < 1e-6)) note('high', '模块显示的导数与数值导数值不符', fn.src + ' → ' + tex);
  if (/FAIL/.test(r)) note('high', '模块公式无法渲染', fn.src + ' → ' + tex);
});

function pad(s, n) { while (s.length < n) s += ' '; return s; }
console.log('\n----------------------------------------');
console.log('v4 checks=' + checks + '  issues=' + issues.length);
issues.forEach(function (i) { console.log('  [' + i.sev + '] ' + i.msg + ' — ' + i.detail); });
