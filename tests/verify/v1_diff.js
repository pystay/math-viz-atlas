/*!
 * v1_diff.js — 符号求导 vs 高精度数值求导（Ridders/Richardson 外推）
 * 用法: node tests/verify/v1_diff.js
 */
'use strict';
var MC = require('../../src/core/math-core.js');

var checks = 0, bad = [];

/* Ridders 外推数值导数（Numerical Recipes dfridr），精度约 1e-12~1e-14 */
function dfridr(f, x, h0) {
  h0 = h0 === undefined ? 1e-2 : h0;
  var ntab = 10, con = 1.4, con2 = con * con, big = 1e30, safe = 2.0;
  var a = [], err = big, ans = 0;
  var h = h0;
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
    if (i > 0 && Math.abs(a[i][i] - a[i - 1][i - 1]) >= safe * err) break;
    h /= con;
  }
  return ans;
}

function rel(a, b) {
  if (Number.isNaN(a) && Number.isNaN(b)) return 0;
  if (!isFinite(a) || !isFinite(b)) return (a === b) ? 0 : Infinity;
  return Math.abs(a - b) / Math.max(1, Math.abs(b));
}

var GRID = [0.3, 0.7, 1.1, 1.9, 2.7, 3.7, -0.3, -1.3, -2.6, 0.05, 5.5];
var POS = [0.05, 0.3, 0.7, 1.1, 1.9, 2.7, 3.7, 5.5, 0.001, 12];
var UNIT = [-0.97, -0.5, -0.2, 0.2, 0.5, 0.97];
var SMALLPOS = [1e-6, 1e-4, 0.01, 0.3, 1.1];

var CASES = [
  { src: 'x^2', xs: GRID },
  { src: 'x^3', xs: GRID },
  { src: 'x^5', xs: GRID },
  { src: 'x^0.5', xs: POS },
  { src: 'x^(-2)', xs: POS },
  { src: 'x^(1/3)', xs: POS },
  { src: 'x^2.5', xs: POS },
  { src: '-x^2', xs: GRID },
  { src: '2^x', xs: GRID },
  { src: 'e^x', xs: GRID },
  { src: 'exp(x)', xs: GRID },
  { src: 'pi^x', xs: GRID },
  { src: '0.5^x', xs: GRID },
  { src: 'x^x', xs: POS },
  { src: 'x^(2x)', xs: POS },
  { src: '(x^2)^3', xs: GRID },
  { src: 'x^(x^2)', xs: [0.3, 0.7, 1.4] },
  { src: 'sin(x)', xs: GRID },
  { src: 'cos(2x)', xs: GRID },
  { src: 'sin(3x+1)', xs: GRID },
  { src: 'tan(x)', xs: [-1.2, -0.5, 0.3, 0.7, 1.1] },
  { src: 'tan(2x)', xs: [-0.6, -0.2, 0.3, 0.6] },
  { src: 'asin(x)', xs: UNIT },
  { src: 'acos(x)', xs: UNIT },
  { src: 'atan(x)', xs: [-5, -1.3, 0.3, 2.7, 40] },
  { src: 'atan(x/2)', xs: [-5, -1.3, 0.3, 2.7, 40] },
  { src: 'abs(x)', xs: [-3.7, -1.3, -0.3, 0.4, 1.7, 4.2] },
  { src: 'abs(sin(x))', xs: [-2.5, -1.2, -0.4, 0.6, 1.9, 3.3] },
  { src: 'abs(x^2-1)', xs: [-2.3, -1.4, -0.5, 0.4, 1.6, 2.9] },
  { src: 'ln(x)', xs: POS },
  { src: 'ln(abs(x))', xs: [-3.1, -1.4, -0.4, 0.6, 2.2] },
  { src: 'log(x)', xs: POS },
  { src: 'log2(x)', xs: POS },
  { src: 'sqrt(x)', xs: SMALLPOS },
  { src: 'sqrt(x^2+1)', xs: GRID },
  { src: 'sqrt(1+x)', xs: [1e-6, 0.01, 0.4, 2.5, 11] },
  { src: 'exp(x)*sin(x)', xs: GRID },
  { src: 'e^(-x^2)', xs: GRID },
  { src: 'ln(x)/x', xs: POS },
  { src: '(x^2+1)/(x-2)', xs: [-3.3, -1.1, 0.6, 1.9, 4.7] },
  { src: '1/(1+x^2)', xs: GRID },
  { src: 'x*ln(x)', xs: POS },
  { src: 'x^2*sin(x)', xs: GRID },
  { src: 'sin(1/x)', xs: [-0.31, -0.17, 0.23, 0.41, 1.7] },
  { src: 'sin(ln(x^2+1))', xs: [-2.1, -0.4, 0.9, 2.6] },
  { src: 'ln(x)^2', xs: POS },
  { src: '1/sqrt(x)', xs: [1e-4, 0.01, 0.5, 3.3] },
  { src: 'x/(x^2+1)', xs: GRID },
  { src: '(2x+1)^3', xs: GRID },
  { src: 'sqrt(sqrt(x))', xs: [1e-4, 0.01, 0.5, 3.3] },
  { src: '(x^x)^2', xs: POS },
  { src: '2^(3x)', xs: GRID },
  { src: '10^x', xs: GRID },
  { src: 'log(x^2+1)', xs: GRID },
  { src: 'tan(x)^2', xs: [-1.2, -0.4, 0.3, 1.1] },
  { src: 'cos(x)^2+sin(x)^2', xs: GRID }
];

console.log('== 1. 符号求导 vs Ridders 数值导数（容差 1e-7 相对） ==');
CASES.forEach(function (c) {
  var f, d;
  try {
    f = MC.functionOfX(c.src);
    d = MC.compile(MC.diff(MC.parse(c.src), 'x'));
  } catch (e) {
    console.log('  [ERROR] ' + c.src + ' → ' + e.message);
    bad.push({ src: c.src, why: 'parse/diff error: ' + e.message });
    return;
  }
  var worst = 0, wx = null, wS = null, wN = null;
  c.xs.forEach(function (x) {
    checks++;
    var s = d({ x: x });
    var n = dfridr(f, x, Math.max(1e-9, Math.abs(x) * 1e-2));
    var r = rel(s, n);
    if (r > worst) { worst = r; wx = x; wS = s; wN = n; }
  });
  var flag = worst > 1e-7;
  console.log('  ' + (flag ? 'FAIL' : ' ok ') + '  d/dx ' + pad(c.src, 22) +
    ' worstRel=' + fmt(worst) + (flag ? '  @x=' + wx + ' symbolic=' + wS + ' numeric=' + wN : ''));
  if (flag) bad.push({ src: c.src, x: wx, symbolic: wS, numeric: wN, rel: worst });
});

/* ---- abs 的导数符号（x=0 处不可导） ---- */
console.log('\n== 2. abs 的导数符号（单侧差分；x=0 处不可导） ==');
['abs(x)', 'abs(x^2-1)', 'abs(sin(x))'].forEach(function (src) {
  var d = MC.compile(MC.diff(MC.parse(src), 'x'));
  var f = MC.functionOfX(src);
  [-1, 1].forEach(function (sgn) {
    [1e-6, 0.5].forEach(function (m) {
      var x = sgn * m;
      var h = Math.max(1e-9, m * 1e-4);
      checks++;
      var oneSided = (f(x + h) - f(x)) / h;   // 右导数
      var sym = d({ x: x });
      var r = rel(sym, oneSided);
      console.log('  ' + (r < 1e-4 ? ' ok ' : 'FAIL') + '  ' + pad(src + ' @x=' + x, 26) +
        ' symbolic=' + sym.toFixed(9) + ' 右导数=' + oneSided.toFixed(9));
      if (!(r < 1e-4)) bad.push({ src: src, x: x, got: sym, want: oneSided });
    });
  });
});
console.log('  abs(x) 在 x=0 的符号导数值 = ' + MC.compile(MC.diff(MC.parse('abs(x)'), 'x'))({ x: 0 }) + ' (0/0 → NaN，与"不可导"一致)');

/* ---- 具体公式的解析核对 ---- */
console.log('\n== 3. 特殊函数导数公式的解析核对（与手算闭式比较） ==');
var analytic = [
  { src: 'log(x)', x: 1e-3, want: function (x) { return 1 / (x * Math.LN10); }, name: "d/dx log10 x = 1/(x ln10)" },
  { src: 'log2(x)', x: 1e-3, want: function (x) { return 1 / (x * Math.LN2); }, name: "d/dx log2 x = 1/(x ln2)" },
  { src: 'ln(x)', x: 1e-3, want: function (x) { return 1 / x; }, name: "d/dx ln x = 1/x" },
  { src: 'sqrt(x)', x: 1e-8, want: function (x) { return 1 / (2 * Math.sqrt(x)); }, name: "d/dx sqrt x = 1/(2 sqrt x)" },
  { src: 'asin(x)', x: 0.9999, want: function (x) { return 1 / Math.sqrt(1 - x * x); }, name: "d/dx asin x = 1/sqrt(1-x^2)" },
  { src: 'acos(x)', x: -0.9999, want: function (x) { return -1 / Math.sqrt(1 - x * x); }, name: "d/dx acos x = -1/sqrt(1-x^2)" },
  { src: 'atan(x)', x: 1e6, want: function (x) { return 1 / (1 + x * x); }, name: "d/dx atan x = 1/(1+x^2)" },
  { src: 'tan(x)', x: 1.5, want: function (x) { return 1 / Math.pow(Math.cos(x), 2); }, name: "d/dx tan x = sec^2 x" },
  { src: '2^x', x: 3, want: function (x) { return Math.pow(2, x) * Math.LN2; }, name: "d/dx 2^x = 2^x ln2" },
  { src: 'x^x', x: 2.5, want: function (x) { return Math.pow(x, x) * (Math.log(x) + 1); }, name: "d/dx x^x = x^x(ln x + 1)" },
  { src: 'x^(2x)', x: 1.7, want: function (x) { return Math.pow(x, 2 * x) * (2 * Math.log(x) + 2); }, name: "d/dx x^(2x)" }
];
analytic.forEach(function (c) {
  checks++;
  var d = MC.compile(MC.diff(MC.parse(c.src), 'x'));
  var got = d({ x: c.x }), want = c.want(c.x);
  var r = rel(got, want);
  console.log('  ' + (r < 1e-9 ? ' ok ' : 'FAIL') + '  ' + pad(c.name, 28) + ' @x=' + c.x + ' got=' + got + ' want=' + want);
  if (!(r < 1e-9)) bad.push({ src: c.src, x: c.x, got: got, want: want, rel: r });
});

/* ---- logb / atan2 / min / max 求导是否静默给错 ---- */
console.log('\n== 4. 多元/未实现函数的求导行为 ==');
['logb(x,2)', 'atan2(x,1)', 'min(x,2)', 'max(x,2)', 'sinh(x)', 'floor(x)', 'sign(x)'].forEach(function (src) {
  checks++;
  try {
    var d = MC.diff(MC.parse(src), 'x');
    var v = MC.compile(d)({ x: 1.3 });
    var f = MC.functionOfX(src);
    var n = dfridr(f, 1.3, 1e-3);
    console.log('  ' + src + ' → 未抛错, d(1.3)=' + v + ' 数值=' + n + ' ' + (rel(v, n) < 1e-6 ? 'ok' : 'SILENT-WRONG'));
    if (!(rel(v, n) < 1e-6)) bad.push({ src: src, got: v, want: n });
  } catch (e) {
    console.log('  ' + src + ' → 正确抛出: ' + e.message);
  }
});

function fmt(v) { return v === 0 ? '0' : v.toExponential(2); }
function pad(s, n) { while (s.length < n) s += ' '; return s; }

console.log('\n----------------------------------------');
console.log('v1 checks=' + checks + '  failures=' + bad.length);
if (bad.length) { console.log(JSON.stringify(bad, null, 1)); }
