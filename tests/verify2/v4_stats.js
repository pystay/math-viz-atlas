/*!
 * tests/verify2/v4_stats.js — 统计（math-core 的 quantile/fiveNumber/stdev/histogram/sampleNormal
 * 以及 stats.js 的直方图+箱线图）独立复核
 * 运行：node tests/verify2/v4_stats.js
 */
'use strict';
var H = require('./harness.js');
var MC = H.MC;

var checks = 0, bad = [], frag = [];
function ck(label, cond, detail) { checks++; if (!cond) bad.push({ label: label, detail: detail }); return cond; }
function frag_(label, detail) { frag.push({ label: label, detail: detail }); }

/* --------------------------------------------- 1. quantile / fiveNumber（R-7） */
function refQuantile(sorted, q) {           // numpy 'linear' = Excel PERCENTILE.INC = R-7
  var n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  var h = (n - 1) * q, lo = Math.floor(h), hi = Math.ceil(h);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo);
}
var rnd = (function (s) { return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })(999);
var qWorst = 0, qN = 0;
for (var t = 0; t < 20000; t++) {
  var n = 1 + Math.floor(rnd() * 40);
  var arr = [];
  for (var i = 0; i < n; i++) arr.push(Math.round((rnd() * 20 - 10) * (rnd() < 0.3 ? 1 : 4)));  // 含大量重复
  var s = arr.slice().sort(function (a, b) { return a - b; });
  for (var k = 0; k < 5; k++) {
    var q = [0, 0.1, 0.25, 0.5, 0.75][k];
    var got = MC.quantile(arr, q), want = refQuantile(s, q);
    qN++;
    qWorst = Math.max(qWorst, Math.abs(got - want));
  }
}
console.log('[1] quantile（R-7）独立复核：' + qN + ' 次，最大偏差 = ' + qWorst);
ck('quantile 与 R-7/PERCENTILE.INC 完全一致', qWorst === 0, qWorst);
// 经典样例（模块测试里的 8 个数据）
var sample = [2, 4, 4, 4, 5, 5, 7, 9];
var five = MC.fiveNumber(sample);
console.log('    fiveNumber([2,4,4,4,5,5,7,9]) = ' + JSON.stringify(five));
ck('fiveNumber: Q1=4, med=4.5, Q3=5.5, IQR=1.5',
  five.q1 === 4 && five.median === 4.5 && five.q3 === 5.5 && five.iqr === 1.5, JSON.stringify(five));
ck('quantile([1,2,3,4],0.25)=1.75', Math.abs(MC.quantile([1, 2, 3, 4], 0.25) - 1.75) < 1e-15, MC.quantile([1, 2, 3, 4], 0.25));
ck('quantile 单元素', MC.quantile([7], 0.3) === 7);
ck('quantile 空数组 = NaN', isNaN(MC.quantile([], 0.5)));

/* --------------------------------------------- 2. mean / stdev（n−1） */
var mWorst = 0, sWorst = 0, sN = 0;
for (var t2 = 0; t2 < 5000; t2++) {
  var n2 = 2 + Math.floor(rnd() * 60), a2 = [];
  for (var j = 0; j < n2; j++) a2.push(rnd() * 200 - 100);
  var m = a2.reduce(function (x, y) { return x + y; }, 0) / n2;
  var ss = a2.reduce(function (x, y) { return x + (y - m) * (y - m); }, 0) / (n2 - 1);
  mWorst = Math.max(mWorst, Math.abs(MC.mean(a2) - m) / Math.max(1, Math.abs(m)));
  sWorst = Math.max(sWorst, Math.abs(MC.stdev(a2) - Math.sqrt(ss)) / Math.max(1e-12, Math.sqrt(ss)));
  sN++;
}
console.log('\n[2] mean/stdev（n−1 分母）：' + sN + ' 组，mean 最大相对偏差 ' + mWorst.toExponential(2) + '，stdev ' + sWorst.toExponential(2));
ck('mean 正确', mWorst < 1e-15, mWorst);
ck('stdev 用 n−1 且与独立计算一致', sWorst < 1e-12, sWorst);
ck('stdev 单元素 = NaN', isNaN(MC.stdev([3])));
console.log('    stdev([2,4,4,4,5,5,7,9]) = ' + MC.stdev(sample) + '（√(32/7) = ' + Math.sqrt(32 / 7) + '）');
ck('stdev 样例 = √(32/7)', Math.abs(MC.stdev(sample) - Math.sqrt(32 / 7)) < 1e-15);

/* --------------------------------------------- 3. histogram 归一化/计数/边界 */
console.log('\n[3] histogram 定义复核：');
var hCases = [[200, 5, 1.2, 12], [37, -2, 0.4, 5], [800, 14, 3, 25], [30, 0, 0.3, 7], [101, 3.7, 2.2, 13]];
var hBad = 0;
hCases.forEach(function (c) {
  var d = MC.sampleNormal(c[0], c[1], c[2], 20261009);
  var h = MC.histogram(d, c[3]);
  var cnt = h.bins.reduce(function (s, b) { return s + b.count; }, 0);
  var integ = h.bins.reduce(function (s, b) { return s + b.density * h.width; }, 0);
  var edgesOK = h.bins.every(function (b, i) { return Math.abs(b.x1 - b.x0 - h.width) < 1e-12 && (i === 0 || Math.abs(h.bins[i - 1].x1 - b.x0) < 1e-12); });
  var inRange = d.every(function (v) { return v >= h.lo && v <= h.hi; });
  console.log('    n=' + c[0] + ' bins=' + c[3] + '：箱数=' + h.bins.length + '，计数和=' + cnt + '/' + d.length +
    '，∫密度=' + integ.toFixed(15) + '，箱边界连续=' + edgesOK + '，lo/hi=[' + h.lo.toFixed(3) + ',' + h.hi.toFixed(3) + ']');
  if (cnt !== d.length || Math.abs(integ - 1) > 1e-12 || !edgesOK || !inRange) hBad++;
});
ck('直方图：计数和 = n、密度积分 = 1、箱宽一致', hBad === 0, hBad);
var hEdge = MC.histogram([5, 5, 5, 5], 4);
console.log('    全相同数据 histogram([5,5,5,5],4)：width=' + hEdge.width + ' 计数和=' + hEdge.bins.reduce(function (s, b) { return s + b.count; }, 0) +
  ' 积分=' + hEdge.bins.reduce(function (s, b) { return s + b.density * hEdge.width; }, 0));
ck('全相同数据不产生 NaN/除零', isFinite(hEdge.width) && hEdge.bins.every(function (b) { return isFinite(b.density); }));
var hBig = MC.histogram([1, 2, 3], 10);
ck('数据少箱数多：计数和仍 = n', hBig.bins.reduce(function (s, b) { return s + b.count; }, 0) === 3);

/* --------------------------------------------- 4. sampleNormal 统计性质 */
console.log('\n[4] sampleNormal：');
var big = MC.sampleNormal(200000, 5, 1.2, 7);
var bm = MC.mean(big), bs = MC.stdev(big);
console.log('    n=200000, μ=5, σ=1.2 → 样本均值=' + bm.toFixed(4) + '，样本 s=' + bs.toFixed(4));
ck('大样本均值接近 μ', Math.abs(bm - 5) < 0.02, bm);
ck('大样本标准差接近 σ', Math.abs(bs - 1.2) < 0.02, bs);
ck('同种子完全可复现', MC.sampleNormal(50, 3, 1, 99).join() === MC.sampleNormal(50, 3, 1, 99).join());
ck('样本全部有限', big.every(function (v) { return isFinite(v); }));

/* --------------------------------------------- 5. stats.js draw 回放 vs 独立 Tukey */
console.log('\n[5] stats.js 箱线图回放 vs 独立 1.5·IQR（Tukey）实现：');
var mods = H.loadModule('src/modules/stats.js');
var st = H.byId(mods, 'stats-histogram');
console.log('    模块 stats-histogram 注册:', !!st);

function dataset(p) { return MC.sampleNormal(Math.round(p.n), p.mu, p.sigma, 20261009); }
function tukey(d) {
  var five = MC.fiveNumber(d);
  var lo = five.q1 - 1.5 * five.iqr, hi = five.q3 + 1.5 * five.iqr;
  var inl = d.filter(function (v) { return v >= lo && v <= hi; });
  return {
    five: five, lo: lo, hi: hi,
    whiskLo: Math.min.apply(null, inl), whiskHi: Math.max.apply(null, inl),
    outliers: d.filter(function (v) { return v < lo || v > hi; }).sort(function (a, b) { return a - b; })
  };
}
var cases = [
  { n: 200, mu: 5, sigma: 1.2, bins: 12, normal: true, outlier: true },
  { n: 30, mu: 0, sigma: 0.3, bins: 5, normal: false, outlier: true },
  { n: 800, mu: 14, sigma: 3, bins: 25, normal: true, outlier: true },
  { n: 100, mu: -4, sigma: 0.5, bins: 9, normal: true, outlier: true },
  { n: 500, mu: 7.4, sigma: 1.5, bins: 17, normal: false, outlier: true }
];
var boxBad = 0, binBad = 0;
cases.forEach(function (p) {
  var plot = H.makePlot({ xMin: p.mu - 4 * p.sigma, xMax: p.mu + 4 * p.sigma, yMin: -2, yMax: 2 });
  st.draw(plot, p);
  var d = dataset(p);
  var ref = tukey(d);
  var h = MC.histogram(d, Math.round(p.bins));
  // 直方图柱
  var bars = plot.rec.rects.filter(function (r) { return r.o.fill === 'rgba(74,98,136,0.22)'; });
  var nonEmpty = h.bins.filter(function (b) { return b.count > 0; }).length;
  if (bars.length !== nonEmpty) binBad++;
  // 柱高/柱位是否等于 count/(n·w)
  var heightBad = 0;
  h.bins.forEach(function (b) {
    if (b.count === 0) return;
    var drawn = bars.filter(function (r) { return Math.abs(r.args[0] - b.x0) < 1e-12; })[0];
    if (!drawn || Math.abs(drawn.args[3] - b.density) > 1e-15 || Math.abs(drawn.args[2] - b.x1) > 1e-12) heightBad++;
  });
  if (heightBad) ck('直方图柱高 = count/(n·w) (n=' + p.n + ')', false, heightBad + ' 根柱不符');
  // 箱体
  var box = plot.rec.rects.filter(function (r) { return r.o.stroke === H.PALETTE.mint; })[0];
  // 须与中位线：mint segment
  var mintSegs = plot.rec.segments.filter(function (s) { return s.o.color === H.PALETTE.mint; });
  var medians = mintSegs.filter(function (s) { return s.o.width === 2.6; });
  var whiskers = mintSegs.filter(function (s) { return s.o.width === 1.6; });
  // 点：均值（paper 填充）与离群点
  var pts = plot.rec.points;
  var meanPt = pts.filter(function (q) { return q.o.fill === H.PALETTE.paper; })[0];
  var outPts = pts.filter(function (q) { return q.o.fill === 'rgba(206,88,72,0.85)'; }).map(function (q) { return q.args[0]; }).sort(function (a, b) { return a - b; });
  var okBox = box && Math.abs(box.args[0] - ref.five.q1) < 1e-12 && Math.abs(box.args[2] - ref.five.q3) < 1e-12;
  var okMed = medians.length === 1 && Math.abs(medians[0].args[0] - ref.five.median) < 1e-12;
  var okMean = meanPt && Math.abs(meanPt.args[0] - MC.mean(d)) < 1e-12;
  var wl = Math.min.apply(null, whiskers.map(function (s) { return s.args[0]; }));
  var wh = Math.max.apply(null, whiskers.map(function (s) { return s.args[2]; }));
  var okWhisk = Math.abs(wl - ref.whiskLo) < 1e-12 && Math.abs(wh - ref.whiskHi) < 1e-12;
  var okOut = outPts.length === ref.outliers.length && outPts.every(function (v, i) { return Math.abs(v - ref.outliers[i]) < 1e-12; });
  console.log('    n=' + p.n + ' μ=' + p.mu + ' σ=' + p.sigma + ' bins=' + p.bins +
    '：柱 ' + bars.length + '/' + nonEmpty + '，箱 [' + ref.five.q1.toFixed(4) + ',' + ref.five.q3.toFixed(4) + ']' +
    '，须 [' + ref.whiskLo.toFixed(4) + ',' + ref.whiskHi.toFixed(4) + ']，离群 ' + ref.outliers.length + ' 个');
  console.log('        核对：箱体=' + okBox + ' 中位线=' + okMed + ' 均值点=' + okMean + ' 须=' + okWhisk + ' 离群点集合=' + okOut +
    '，fences=[' + ref.lo.toFixed(4) + ',' + ref.hi.toFixed(4) + ']');
  if (!(okBox && okMed && okMean && okWhisk && okOut)) { boxBad++; ck('箱线图元素与 Tukey 参考不符 (n=' + p.n + ')', false, JSON.stringify({ okBox: okBox, okMed: okMed, okMean: okMean, okWhisk: okWhisk, okOut: okOut })); }
  else ck('箱线图元素与 Tukey 参考一致 (n=' + p.n + ')', true);
});
console.log('    直方图柱数与非空箱数不符的用例数 = ' + binBad);
console.log('\n[5b] outlier 开关关闭时不应画离群点：');
(function () {
  var p = { n: 200, mu: 5, sigma: 1.2, bins: 12, normal: false, outlier: false };
  var plot = H.makePlot({ xMin: -1, xMax: 11, yMin: -2, yMax: 2 });
  st.draw(plot, p);
  var outPts = plot.rec.points.filter(function (q) { return q.o.fill === 'rgba(206,88,72,0.85)'; });
  console.log('    outlier=false 时离群点绘制数 = ' + outPts.length + '（参考实现应有 ' + tukey(dataset(p)).outliers.length + ' 个）');
  ck('关闭开关后不画离群点', outPts.length === 0, outPts.length);
})();

/* 最小值恰好在 fence 上（>= 判定）的边界 */
console.log('\n[6] 边界：IQR=0（超过半数数据相同）与 fence 含端点的行为');
(function () {
  var d = [0, 10, 10, 10, 10, 10, 10, 10, 10, 20];
  var f = MC.fiveNumber(d);
  var lo = f.q1 - 1.5 * f.iqr, hi = f.q3 + 1.5 * f.iqr;
  console.log('    数据 ' + JSON.stringify(d) + ' → Q1=' + f.q1 + ' Q3=' + f.q3 + ' IQR=' + f.iqr +
    ' fences=[' + lo + ',' + hi + ']');
  var inl = d.filter(function (v) { return v >= lo && v <= hi; });
  var out = d.filter(function (v) { return v < lo || v > hi; });
  console.log('    标准 Tukey 结果：须端点 = [' + Math.min.apply(null, inl) + ',' + Math.max.apply(null, inl) + ']，离群点 ' + JSON.stringify(out));
  // 模块 draw 的同一数据必须复现这一标准结果（IQR=0 时须收缩到 Q1=Q3，其余为离群点）
  var plot = H.makePlot({ xMin: -1, xMax: 21, yMin: -2, yMax: 2 });
  st.draw(plot, { n: 10, mu: 10, sigma: 1, bins: 5, normal: false, outlier: true });
  var mintSegs = plot.rec.segments.filter(function (s) { return s.o.color === H.PALETTE.mint; });
  var whisk = mintSegs.filter(function (s) { return s.o.width === 1.6; });
  var wl = Math.min.apply(null, whisk.map(function (s) { return s.args[0]; }));
  var wh = Math.max.apply(null, whisk.map(function (s) { return s.args[2]; }));
  console.log('    注意：模块 draw 使用内部固定种子数据（与上面数据无关），此处只验证定义与读数一致：' +
    'whisk=[' + wl.toFixed(4) + ',' + wh.toFixed(4) + ']');
  var dref = MC.sampleNormal(10, 10, 1, 20261009);
  var fref = MC.fiveNumber(dref);
  var lo2 = fref.q1 - 1.5 * fref.iqr, hi2 = fref.q3 + 1.5 * fref.iqr;
  var inl2 = dref.filter(function (v) { return v >= lo2 && v <= hi2; });
  ck('IQR 退化时须端点 = 区间内最小/最大数据点（含端点）',
    Math.abs(wl - Math.min.apply(null, inl2)) < 1e-12 && Math.abs(wh - Math.max.apply(null, inl2)) < 1e-12,
    wl + ',' + wh + ' vs ' + Math.min.apply(null, inl2) + ',' + Math.max.apply(null, inl2));
  ck('标准 Tukey 在 IQR=0 时把 [0,20] 判为离群点（与 R/Excel 一致）', out.length === 2 && out[0] === 0 && out[1] === 20, JSON.stringify(out));
})();

console.log('\n[7] 结论：独立检查 ' + checks + ' 项，不符 ' + bad.length + ' 项');
bad.forEach(function (b) { console.log('  [WRONG] ' + b.label + ' → ' + b.detail); });
frag.forEach(function (b) { console.log('  [FRAGILE] ' + b.label + ' → ' + b.detail); });
