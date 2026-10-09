/*!
 * tests/verify2/v3_vectors.js — 向量模块（trig2.js: vector-parallelogram）独立复核
 * 运行：node tests/verify2/v3_vectors.js
 */
'use strict';
var H = require('./harness.js');
var MC = H.MC;

var mods = H.loadModule('src/modules/trig2.js');
var vec = H.byId(mods, 'vector-parallelogram');
console.log('模块 vector-parallelogram 注册:', !!vec);

var checks = 0, bad = [], frag = [];
function ck(label, cond, detail) { checks++; if (!cond) bad.push({ label: label, detail: detail }); return cond; }
function ro(p) { var o = {}; vec.readouts(p).forEach(function (r) { o[r.label.zh] = r.value; }); return o; }

/* ------------------------------------------------ 1. 随机/网格参数复核读数 */
var worst = { a: 0, b: 0, dot: 0, ang: 0, sum: 0 };
var N = 0, nanCases = [], zeroCases = [];
var rnd = (function (s) { return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })(12345);
for (var it = 0; it < 200000; it++) {
  var p = {
    ax: Math.round((rnd() * 8 - 4) * 10) / 10, ay: Math.round((rnd() * 8 - 4) * 10) / 10,
    bx: Math.round((rnd() * 8 - 4) * 10) / 10, by: Math.round((rnd() * 8 - 4) * 10) / 10
  };
  var r = ro(p);
  var la = Math.hypot(p.ax, p.ay), lb = Math.hypot(p.bx, p.by);
  var dot = p.ax * p.bx + p.ay * p.by;
  var sx = p.ax + p.bx, sy = p.ay + p.by;
  var lenSum = Math.hypot(sx, sy);
  var cosT = Math.acos(Math.max(-1, Math.min(1, dot / (la * lb))));
  N++;
  worst.a = Math.max(worst.a, Math.abs(parseFloat(r['|a|']) - la) / Math.max(1e-12, la));
  worst.b = Math.max(worst.b, Math.abs(parseFloat(r['|b|']) - lb) / Math.max(1e-12, lb));
  worst.dot = Math.max(worst.dot, Math.abs(parseFloat(r['a·b']) - Math.round(dot * 100) / 100));
  worst.sum = Math.max(worst.sum, Math.abs(parseFloat(r['|a+b|']) - lenSum) / Math.max(1e-12, lenSum));
  var shownAng = parseFloat(r['夹角']);
  if (isFinite(shownAng)) worst.ang = Math.max(worst.ang, Math.abs(shownAng - cosT * 180 / Math.PI) / Math.max(1, cosT * 180 / Math.PI));
  if (!isFinite(shownAng) && la > 1e-9 && lb > 1e-9) {
    if (nanCases.length < 3) nanCases.push(p);
  }
  if (la < 1e-9 || lb < 1e-9) { if (zeroCases.length < 3) zeroCases.push({ p: p, r: r }); }
}
console.log('\n[1] 随机参数 ' + N + ' 组：|a| 最大相对误差 ' + worst.a.toExponential(2) +
  '，|b| ' + worst.b.toExponential(2) + '，a·b（2 位小数）' + worst.dot.toExponential(2) +
  '，|a+b| ' + worst.sum.toExponential(2) + '（均为显示舍入）');
ck('|a| 读数（4 位有效数字）正确', worst.a < 5e-4, worst.a);
ck('|b| 读数正确', worst.b < 5e-4, worst.b);
ck('a·b 读数（formatFixed 2 位）正确', worst.dot < 5e-3, worst.dot);
ck('|a+b| 读数正确', worst.sum < 5e-4, worst.sum);
console.log('    夹角（acos 独立计算）与读数最大相对偏差 = ' + worst.ang.toExponential(2) + '（4 位有效数字）');
ck('夹角读数正确（含 [0,180] 钳制）', worst.ang < 5e-4, worst.ang);

/* ---------------------------------------------------------- 2. 退化情形 */
console.log('\n[2] 退化情形（零向量 / 反向 / 相同 / 平行）：');
[
  { t: 'a=0 向量', p: { ax: 0, ay: 0, bx: 1, by: 1 } },
  { t: 'b=0 向量', p: { ax: 3, ay: 1, bx: 0, by: 0 } },
  { t: '两个零向量', p: { ax: 0, ay: 0, bx: 0, by: 0 } },
  { t: '反向 (2,0) vs (-3,0)', p: { ax: 2, ay: 0, bx: -3, by: 0 } },
  { t: '相同 (1,2) vs (1,2)', p: { ax: 1, ay: 2, bx: 1, by: 2 } },
  { t: '同向 (1,2) vs (2,4)', p: { ax: 1, ay: 2, bx: 2, by: 4 } },
  { t: '反向 (1,1) vs (-1,-1)', p: { ax: 1, ay: 1, bx: -1, by: -1 } },
  { t: '垂直 (1,0) vs (0,1)', p: { ax: 1, ay: 0, bx: 0, by: 1 } },
  { t: '钝角 (1,0) vs (-1,1)', p: { ax: 1, ay: 0, bx: -1, by: 1 } }
].forEach(function (c) {
  var r = ro(c.p);
  console.log('    ' + c.t + ' → |a|=' + r['|a|'] + ' |b|=' + r['|b|'] + ' a·b=' + r['a·b'] +
    ' 夹角=' + r['夹角'] + ' |a+b|=' + r['|a+b|']);
});
(function () {
  var r = ro({ ax: 0, ay: 0, bx: 1, by: 1 });
  ck('零向量夹角应显示"未定义"而不是字面量 NaN', String(r['夹角']).indexOf('NaN') < 0, '夹角 = ' + r['夹角']);
  var r2 = ro({ ax: 0, ay: 0, bx: 0, by: 0 });
  ck('两个零向量夹角不显示 NaN', String(r2['夹角']).indexOf('NaN') < 0, '夹角 = ' + r2['夹角']);
})();

/* ------------------------------------------------- 3. 公式与图上标注一致性 */
console.log('\n[3] formula / draw 图上角度标注一致性：');
function replay(p) { var plot = H.makePlot({ xMin: -5.6, xMax: 6.6, yMin: -5, yMax: 6 }); vec.draw(plot, p); return plot; }
var angBad = 0, formulaBad = 0, sampleN = 0;
for (var it2 = 0; it2 < 300; it2++) {
  var p2 = {
    ax: Math.round((rnd() * 8 - 4) * 10) / 10, ay: Math.round((rnd() * 8 - 4) * 10) / 10,
    bx: Math.round((rnd() * 8 - 4) * 10) / 10, by: Math.round((rnd() * 8 - 4) * 10) / 10,
    para: true, decomp: true
  };
  var la = Math.hypot(p2.ax, p2.ay), lb = Math.hypot(p2.bx, p2.by);
  if (la < 1e-6 || lb < 1e-6) continue;
  sampleN++;
  var plot = replay(p2);
  var lab = plot.rec.labels.filter(function (l) { return /°$/.test(String(l.args[2])); })[0];
  var shown = lab ? parseFloat(String(lab.args[2])) : NaN;
  var want = Math.acos(Math.max(-1, Math.min(1, (p2.ax * p2.bx + p2.ay * p2.by) / (la * lb)))) * 180 / Math.PI;
  // 图上标签用 formatNumber(deg,3) = 3 位有效数字 → 相对误差 ≤ 5e-3
  if (!(Math.abs(shown - want) <= 5e-3 * Math.max(1, want))) { angBad++; if (angBad < 4) console.log('      偏差: ', JSON.stringify(p2), shown, want); }
  var f = vec.formula(p2);
  var wantSum = '(' + MC.formatFixed(p2.ax + p2.bx, 1) + ',\\ ' + MC.formatFixed(p2.ay + p2.by, 1) + ')';
  if (f.indexOf(wantSum) < 0) { formulaBad++; if (formulaBad < 3) console.log('      formula 不符: ', f, 'want', wantSum); }
}
console.log('    有效样本 ' + sampleN + '：图上角度标注不符 ' + angBad + '，formula 不符 ' + formulaBad);
ck('图上角度弧标注 = acos 计算值（formatNumber 3 位有效数字内）', angBad === 0, angBad);
ck('formula 的和向量分量与滑块一致', formulaBad === 0, formulaBad);
frag.push({ label: '图上角度标签仅 3 位有效数字（如 167.43° 显示为 167°），读数 4 位（167.4°）', detail: '' });
(function () {
  var r = ro({ ax: 1, ay: 2, bx: 1, by: 2 });
  var r2 = ro({ ax: 1, ay: 2, bx: 2, by: 4 });
  if (r['夹角'] !== '0°' || r2['夹角'] !== '0°') {
    frag.push({ label: '相同/同向向量的夹角读数不是 0°', detail: r['夹角'] + ' / ' + r2['夹角'] });
  }
})();

console.log('\n[4] 结论：独立检查 ' + checks + ' 项，不符 ' + bad.length + ' 项');
bad.forEach(function (b) { console.log('  [WRONG] ' + b.label + ' → ' + b.detail); });
frag.forEach(function (b) { console.log('  [FRAGILE] ' + b.label + ' → ' + b.detail); });
