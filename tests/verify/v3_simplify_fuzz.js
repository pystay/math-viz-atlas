/*!
 * v3_simplify_fuzz.js — 化简器是否会改变表达式的值？
 *   A) 定向构造：0/x、0*NaN、常数合并溢出 等
 *   B) 带种子的随机表达式模糊测试（原式 vs simplify 后，多 x 点比较）
 *   C) 教学管线模糊测试：数值导数(f) vs simplify(diff(f))（UI 显示的就是后者）
 */
'use strict';
var MC = require('../../src/core/math-core.js');
var checks = 0;
var findings = [];

/* ---------- 定向构造 ---------- */
console.log('== A. 定向：simplify 的代数恒等式是否有反例 ==');
var targeted = [
  { src: '0/x', why: 'x=0 处原式 NaN，化简后为 0' },
  { src: '0*(1/x)', why: 'x=0 处 0*Infinity=NaN，化简后为 0' },
  { src: '0*ln(x)', why: 'x<0 处 0*NaN=NaN，化简后为 0' },
  { src: '0*abs(x)/x', why: '组合' },
  { src: '10^300*(10^300*x)', why: '常数合并中间溢出 → Infinity*x' },
  { src: '10^300*(10^300+ x)', why: '常数加法溢出' },
  { src: 'x^0', why: 'x=0 与 x=NaN' },
  { src: '(1/x)^0', why: 'x=0 处 Infinity^0=1' },
  { src: 'x/x', why: 'x=0 处应 NaN' },
  { src: 'x*0/x', why: '组合' }
];
targeted.forEach(function (t) {
  var ast = MC.parse(t.src);
  var simp = MC.simplify(ast);
  var f0 = MC.compile(ast), f1 = MC.compile(simp);
  var line = '  ' + pad(t.src, 20) + ' → ' + pad(MC.toLatex(simp).slice(0, 34), 36);
  var bad = [];
  [-1, 0, 0.5, 1, 3].forEach(function (x) {
    checks++;
    var a = f0({ x: x }), b = f1({ x: x });
    var same = (a === b) || (Number.isNaN(a) && Number.isNaN(b)) ||
      (isFinite(a) && isFinite(b) && Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a)));
    if (!same) bad.push('x=' + x + ': orig=' + a + ' simplified=' + b);
  });
  if (bad.length) {
    findings.push({ src: t.src, detail: bad.join(' | '), why: t.why, sev: 'medium' });
    console.log('  VALUE-CHANGED  ' + line.trim());
    bad.forEach(function (d) { console.log('        ' + d + '   [' + t.why + ']'); });
  } else {
    console.log(line + '（5 个采样点值一致）');
  }
});

/* ---------- 随机模糊 ---------- */
console.log('\n== B. 随机表达式模糊：原式 vs 化简式 ==');
var seed = 20261009;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function pick(a) { return a[Math.floor(rnd() * a.length)]; }
var SAFE_FUNCS = ['sin', 'cos', 'exp', 'abs', 'ln', 'sqrt', 'atan'];
function gen(depth) {
  if (depth <= 0 || rnd() < 0.25) return rnd() < 0.6 ? 'x' : String(pick([0, 1, 2, 3, 5, 0.5, 7]));
  var r = rnd();
  if (r < 0.18) return pick(SAFE_FUNCS) + '(' + gen(depth - 1) + ')';
  var op = pick(['+', '-', '*', '/', '^']);
  var l = gen(depth - 1), rt = gen(depth - 1);
  if (op === '^') rt = String(pick([0, 1, 2, 3, -1, 0.5]));
  return '(' + l + ')' + op + '(' + rt + ')';
}
var XS = [-3.3, -1.7, -0.4, 0.35, 0.9, 1.6, 2.7, 4.4];
var fuzzValue = 0, mismatchValue = 0, examples = [];
for (var i = 0; i < 800; i++) {
  var src = gen(3);
  var ast, simp;
  try { ast = MC.parse(src); simp = MC.simplify(ast); } catch (e) { continue; }
  fuzzValue++;
  var f0 = MC.compile(ast), f1 = MC.compile(simp);
  var hits = [];
  XS.forEach(function (x) {
    checks++;
    var a, b;
    try { a = f0({ x: x }); } catch (e) { a = 'err'; }
    try { b = f1({ x: x }); } catch (e) { b = 'err'; }
    if (typeof a !== 'number' || typeof b !== 'number') { if (a !== b) hits.push('x=' + x + ' orig=' + a + ' simp=' + b); return; }
    if (Number.isNaN(a) && Number.isNaN(b)) return;
    if (Number.isNaN(a) !== Number.isNaN(b)) { hits.push('x=' + x + ' orig=' + a + ' simp=' + b); return; }
    if (!isFinite(a) || !isFinite(b)) { if (a !== b) hits.push('x=' + x + ' orig=' + a + ' simp=' + b); return; }
    var d = Math.abs(a - b) / Math.max(1, Math.abs(a), Math.abs(b));
    if (d > 1e-9) hits.push('x=' + x + ' orig=' + a + ' simp=' + b + ' rel=' + d.toExponential(2));
  });
  if (hits.length) {
    mismatchValue++;
    if (examples.length < 12) examples.push({ src: src, hits: hits });
    checks++;
  }
}
console.log('  随机表达式: ' + fuzzValue + ' 个；值发生变化的表达式: ' + mismatchValue + ' 个');
examples.forEach(function (e) {
  console.log('  VALUE-CHANGED  ' + e.src);
  e.hits.slice(0, 3).forEach(function (h) { console.log('        ' + h); });
});
if (mismatchValue) findings.push({ src: '(fuzz) ' + mismatchValue + '/' + fuzzValue + ' 随机表达式', detail: examples.map(function (e) { return e.src; }).join(' ; '), why: 'simplify 改变取值', sev: 'medium' });

/* ---------- 教学管线：显示的导数是否正确 ---------- */
console.log('\n== C. 教学管线模糊：Ridders 数值导数(f) vs simplify(diff(f)) ==');
/* Ridders 外推数值导数（Numerical Recipes dfridr） */
function dfridr(f, x, h0) {
  var ntab = 10, con = 1.4, con2 = con * con, err = 1e30, ans = 0;
  var a = [], h = h0;
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
var DXS = [0.3, 0.7, 1.3, 2.2, 3.6];
var pipeTested = 0, pipeBad = [];
for (var k = 0; k < 300; k++) {
  var src = gen(2);
  if (/\^/.test(src)) continue;
  var f;
  try { f = MC.functionOfX(src); } catch (e) { continue; }
  var dshow;
  try { dshow = MC.compile(MC.simplify(MC.diff(MC.parse(src), 'x'))); } catch (e) { continue; }
  pipeTested++;
  DXS.forEach(function (x) {
    checks++;
    var a = f(x), s = dshow({ x: x });
    if (!isFinite(a)) return;
    var n = dfridr(f, x, Math.abs(x) * 1e-2 + 1e-6);
    if (!isFinite(s) || !isFinite(n)) return;
    var rel = Math.abs(s - n) / Math.max(1, Math.abs(n));
    if (rel > 1e-5) pipeBad.push({ src: src, x: x, shown: s, numeric: n, rel: rel });
  });
}
console.log('  参与管线的表达式: ' + pipeTested + ' 个；显示导数与数值导数不符: ' + pipeBad.length);
pipeBad.slice(0, 10).forEach(function (b) { console.log('  ' + pad(b.src, 44) + ' @x=' + b.x + ' shown=' + b.shown + ' numeric=' + b.numeric + ' rel=' + b.rel.toExponential(2)); });
if (pipeBad.length) findings.push({ src: '(pipeline fuzz)', detail: pipeBad.slice(0, 5).map(function (b) { return b.src + '@' + b.x; }).join(' ; '), why: 'diff+simplify 后的显示导数与数值导数不符', sev: 'high' });

function pad(s, n) { while (s.length < n) s += ' '; return s; }
console.log('\n----------------------------------------');
console.log('v3 checks=' + checks + '  findings=' + findings.length);
findings.forEach(function (f) { console.log('  [' + f.sev + '] ' + f.src + ' — ' + f.why); });
