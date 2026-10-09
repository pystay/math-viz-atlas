/*!
 * tests/verify2/v7_series_arith.js — 等差数列（series.js: sequence-arith）与几何级数独立复核
 * 运行：node tests/verify2/v7_series_arith.js
 */
'use strict';
var H = require('./harness.js');
var MC = H.MC;

var mods = H.loadModule('src/modules/series.js');
var arith = H.byId(mods, 'sequence-arith');
var geo = H.byId(mods, 'series-geometric');
var harm = H.byId(mods, 'series-harmonic');
console.log('模块注册：sequence-arith=' + !!arith + ' series-geometric=' + !!geo + ' series-harmonic=' + !!harm);

var checks = 0, bad = [], frag = [];
function ck(label, cond, detail) { checks++; if (!cond) bad.push({ label: label, detail: detail }); return cond; }
function ro(m, p) { var o = {}; m.readouts(p).forEach(function (r) { o[r.label.zh] = r.value; }); return o; }

/* --------------------------------------------------- 1. 等差通项/求和全网格 */
console.log('\n[1] 等差数列：闭式 vs 逐项累加（全滑块网格）：');
var A1 = [], D = [];
for (var i = -12; i <= 12; i++) A1.push(parseFloat((i * 0.5).toFixed(1)));
for (var j = -30; j <= 30; j++) D.push(parseFloat((j * 0.1).toFixed(1)));
var cases = 0, anBad = 0, snBad = 0, worstAn = 0, worstSn = 0, formBad = 0;
for (var ia = 0; ia < A1.length; ia++) {
  for (var id = 0; id < D.length; id++) {
    for (var n = 1; n <= 30; n++) {
      var a1 = A1[ia], d = D[id];
      var r = ro(arith, { a1: a1, d: d, n: n, sumline: true });
      var anLoop = a1, sum = 0;
      for (var k = 1; k <= n; k++) { anLoop = a1 + (k - 1) * d; sum += anLoop; }
      var anClosed = a1 + (n - 1) * d;
      var snClosedA = (n * (2 * a1 + (n - 1) * d)) / 2;
      var snClosedB = (n * (a1 + anClosed)) / 2;
      cases++;
      if (Math.abs(anClosed - anLoop) > 1e-12 * Math.max(1, Math.abs(anLoop))) { formBad++; }
      if (Math.abs(snClosedA - sum) > 1e-12 * Math.max(1, Math.abs(sum))) { formBad++; }
      if (Math.abs(snClosedA - snClosedB) > 1e-12 * Math.max(1, Math.abs(sum))) { formBad++; }
      var eAn = Math.abs(parseFloat(r['aₙ']) - anLoop) / Math.max(1, Math.abs(anLoop));
      var eSn = Math.abs(parseFloat(r['Sₙ']) - sum) / Math.max(1, Math.abs(sum));
      worstAn = Math.max(worstAn, eAn); worstSn = Math.max(worstSn, eSn);
      if (eAn > 5e-4) { anBad++; if (anBad < 4) console.log('      aₙ 读数不符 ', JSON.stringify({ a1: a1, d: d, n: n, shown: r['aₙ'], want: anLoop })); }
      if (eSn > 5e-4) { snBad++; if (snBad < 4) console.log('      Sₙ 读数不符 ', JSON.stringify({ a1: a1, d: d, n: n, shown: r['Sₙ'], want: sum })); }
    }
  }
}
console.log('    用例 ' + cases + ' 个（a₁∈[−6,6] 步长 0.5，d∈[−3,3] 步长 0.1，n∈[1,30]）');
console.log('    闭式与累加不一致 ' + formBad + ' 次；读数最大相对偏差 aₙ ' + worstAn.toExponential(2) + '，Sₙ ' + worstSn.toExponential(2) + '（显示 4/5 位有效数字）');
ck('S_n = n(2a₁+(n−1)d)/2 与逐项累加一致', formBad === 0, formBad);
ck('aₙ 读数 = a₁+(n−1)d', anBad === 0, anBad);
ck('Sₙ 读数 = Σaₖ（含负 d）', snBad === 0, snBad);

/* --------------------------------------------------- 2. 经典样例 & 负 d */
console.log('\n[2] 样例：');
[[2, 1, 10], [10, -2, 6], [-6, 3, 30], [0, 0, 5], [1, -0.1, 30], [6, -3, 1]].forEach(function (t) {
  var r = ro(arith, { a1: t[0], d: t[1], n: t[2], sumline: true });
  var an = t[0] + (t[2] - 1) * t[1];
  var sn = t[2] * (2 * t[0] + (t[2] - 1) * t[1]) / 2;
  console.log('    a₁=' + t[0] + ' d=' + t[1] + ' n=' + t[2] + ' → aₙ=' + r['aₙ'] + '（' + an + '）Sₙ=' + r['Sₙ'] + '（' + sn + '）');
  ck('样例 aₙ/Sₙ (a₁=' + t[0] + ',d=' + t[1] + ',n=' + t[2] + ')',
    Math.abs(parseFloat(r['aₙ']) - an) < 1e-4 * Math.max(1, Math.abs(an)) &&
    Math.abs(parseFloat(r['Sₙ']) - sn) < 1e-5 * Math.max(1, Math.abs(sn)));
});
console.log('    formula(a₁=2,d=1) = ' + arith.formula({ a1: 2, d: 1, n: 10 }));

/* --------------------------------------------------- 3. draw 回放 & 视窗 */
console.log('\n[3] draw 回放（柱/点/阶梯线）与 view 是否覆盖内容：');
var drawBad = 0, viewBad = 0, contentSamples = 0;
[[2, 1, 10], [10, -2, 6], [-6, 3, 30], [1, -0.1, 30], [6, 3, 30], [-6, -3, 30]].forEach(function (t) {
  var p = { a1: t[0], d: t[1], n: t[2], sumline: true };
  var view = arith.view(p);
  var plot = H.makePlot(view);
  arith.draw(plot, p);
  var pts = plot.rec.points.map(function (q) { return q.args; });
  var labelPoints = plot.rec.labels.map(function (l) { return [l.args[0], l.args[1]]; });
  // 所有绘制点（含 Sₖ 点）必须落在 view 内
  var allY = pts.map(function (q) { return q[1]; }).concat(labelPoints.map(function (q) { return q[1]; }));
  var allX = pts.map(function (q) { return q[0]; }).concat(labelPoints.map(function (q) { return q[0]; }));
  var inside = Math.min.apply(null, allY) >= view.yMin - 1e-9 && Math.max.apply(null, allY) <= view.yMax + 1e-9 &&
    Math.min.apply(null, allX) >= view.xMin - 1e-9 && Math.max.apply(null, allX) <= view.xMax + 1e-9;
  contentSamples++;
  var sn = t[2] * (2 * t[0] + (t[2] - 1) * t[1]) / 2;
  var an = t[0] + (t[2] - 1) * t[1];
  console.log('    a₁=' + t[0] + ' d=' + t[1] + ' n=' + t[2] + '：view y∈[' + view.yMin.toFixed(2) + ',' + view.yMax.toFixed(2) + ']' +
    ' 内容 y∈[' + Math.min.apply(null, allY).toFixed(2) + ',' + Math.max.apply(null, allY).toFixed(2) + '] 含于视窗=' + inside +
    '（aₙ=' + an + ' Sₙ=' + sn + '）');
  if (!inside) viewBad++;
  // 部分和折线的点数应 = n
  var sumPts = plot.rec.points.filter(function (q) { return q.o.fill === H.PALETTE.mint; }).length;
  if (sumPts !== t[2]) { drawBad++; console.log('      Sₖ 点数 ' + sumPts + ' ≠ n=' + t[2]); }
});
ck('draw 的部分和点数 = n', drawBad === 0, drawBad);
ck('view() 覆盖全部绘制内容（含 Sₙ）', viewBad === 0, viewBad);

/* --------------------------------------------------- 4. 几何级数交叉复核 */
console.log('\n[4] 几何级数 readouts vs 逐项累加：');
var gBad = 0;
for (var gi = 0; gi <= 200; gi++) {
  var r = parseFloat((-0.9 + gi * 0.01).toFixed(2));
  for (var gn = 1; gn <= 30; gn++) {
    var out = ro(geo, { r: r, n: gn, limit: true });
    var sum = 0;
    for (var k2 = 0; k2 < gn; k2++) sum += Math.pow(r, k2);
    if (Math.abs(parseFloat(out['Sₙ']) - sum) > 5e-6 * Math.max(1, Math.abs(sum))) { gBad++; }
    var lastTerm = Math.pow(r, gn - 1);
    // |末项| < 1e-12 时 formatNumber 退化为 toExponential(1)（2 位有效数字）
    var tolLast = Math.abs(lastTerm) < 1e-12 ? 5e-2 * Math.abs(lastTerm) : 5e-5 * Math.max(1e-12, Math.abs(lastTerm));
    if (Math.abs(parseFloat(out['末项']) - lastTerm) > tolLast) {
      if (!(Math.abs(lastTerm) < 1e-12 && parseFloat(out['末项']) === 0)) { gBad++; if (gBad < 4) console.log('      末项不符 r=' + r + ' n=' + gn + ' ' + out['末项'] + ' vs ' + lastTerm); }
    }
    if (Math.abs(r) < 1 && Math.abs(parseFloat(out['极限']) - 1 / (1 - r)) > 5e-6 * Math.max(1, Math.abs(1 / (1 - r)))) gBad++;
    if (Math.abs(r) < 1) {
      // 余项读数用 formatNumber(...,3) = 3 位有效数字 → 相对误差 ≤ 5e-3
      var tail = Math.abs(Math.pow(r, gn) / (1 - r));
      if (Math.abs(parseFloat(out['余项 |rⁿ/(1−r)|']) - tail) > 5e-3 * Math.max(1e-12, tail)) {
        if (!(parseFloat(out['余项 |rⁿ/(1−r)|']) === 0 && tail < 5e-3)) { gBad++; if (gBad < 6) console.log('      余项不符 r=' + r + ' n=' + gn + ' ' + out['余项 |rⁿ/(1−r)|'] + ' vs ' + tail); }
      }
    }
  }
}
console.log('    201×30 = 6030 组：不符 ' + gBad);
ck('几何级数 Sₙ/末项/极限/余项与独立计算一致', gBad === 0, gBad);

/* --------------------------------------------------- 5. 调和级数交叉复核 */
console.log('\n[5] 调和级数：');
var hBad = 0;
[1, 2, 10, 24, 100, 500].forEach(function (n) {
  var out = ro(harm, { n: n, compare: true });
  var s = 0;
  for (var k = 1; k <= n; k++) s += 1 / k;
  var approx = Math.log(n) + 0.5772156649015329;
  if (Math.abs(parseFloat(out['H(n)']) - s) > 5e-6 * s) hBad++;
  if (Math.abs(parseFloat(out['ln n + γ']) - approx) > 5e-6 * Math.abs(approx)) hBad++;
  if (Math.abs(parseFloat(out['差']) - (s - approx)) > 5e-5 * Math.max(1e-6, Math.abs(s - approx))) hBad++;
  console.log('    n=' + n + '：H=' + out['H(n)'] + '（' + s.toFixed(6) + '）ln n+γ=' + out['ln n + γ'] + ' 差=' + out['差']);
});
ck('调和级数读数正确', hBad === 0, hBad);
frag.push({ label: 'sequence-arith 的 info 文案仍写"阶梯的弯曲"，但图上（以及 toggle/legend 文案）已改为"部分和曲线 Sₖ"折线', detail: 'series.js:279 vs series.js:213/250-252' });

console.log('\n[6] 结论：独立检查 ' + checks + ' 项，不符 ' + bad.length + ' 项');
bad.forEach(function (b) { console.log('  [WRONG] ' + b.label + ' → ' + b.detail); });
frag.forEach(function (b) { console.log('  [FRAGILE] ' + b.label + ' → ' + b.detail); });
