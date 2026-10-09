/*!
 * tests/verify2/v2_conic.js — 圆锥曲线 r = p/(1+e·cosθ)：焦点/准线/离心率独立复核
 *
 * 用真实模块（algebra2.js 的 analytic-conic）的 readouts/formula，并回放 draw 抓取
 * 实际绘制的曲线点与准线位置，和独立代数拟合（A x² + B x + C y² + D = 0）对比。
 *
 * 运行：node tests/verify2/v2_conic.js
 */
'use strict';
var H = require('./harness.js');
var MC = H.MC;

var mods = H.loadModule('src/modules/algebra2.js');
var conic = H.byId(mods, 'analytic-conic');
console.log('模块 analytic-conic 注册:', !!conic);

var checks = 0, bad = [], fragile = [], good = [];
function ck(label, cond, detail) {
  checks++;
  if (!cond) bad.push({ label: label, detail: detail });
  return cond;
}
function frag(label, detail) { fragile.push({ label: label, detail: detail }); }

function readouts(p) {
  var out = {};
  conic.readouts(p).forEach(function (r) { out[r.label.zh] = r.value; });
  return out;
}

/* ------------------------------------------------ 1. 极坐标定义的直接验证 */
function polarPoint(e, p, th) {
  var den = 1 + e * Math.cos(th);
  if (den <= 1e-12) return null;
  var r = p / den;
  return { r: r, x: r * Math.cos(th), y: r * Math.sin(th), den: den };
}
var ratioWorst = 0, ratioSamples = 0;
var E_LIST = [0.2, 0.35, 0.5, 0.6, 0.8, 0.95, 0.99, 1.0, 1.01, 1.2, 1.4, 1.8];
var P_LIST = [1, 1.6, 2.2, 3];
E_LIST.forEach(function (e) {
  P_LIST.forEach(function (p) {
    var d = p / e;
    for (var i = 0; i < 721; i++) {
      var th = (i / 720) * Math.PI * 2;
      var q = polarPoint(e, p, th);
      if (!q) continue;
      var PF = Math.abs(q.r);
      var PL = Math.abs(d - q.x);
      var ratio = PF / PL;
      ratioSamples++;
      var err = Math.abs(ratio - e);
      if (err > ratioWorst) ratioWorst = err;
      // 同时验证直角坐标轨迹方程 x² + y² = e²(x−d)²
      var lhs = q.x * q.x + q.y * q.y, rhs = e * e * (q.x - d) * (q.x - d);
      if (Math.abs(lhs - rhs) > 1e-9 * Math.max(1, lhs)) {
        ck('轨迹方程 x²+y²=e²(x−d)² 不成立 e=' + e + ' p=' + p + ' θ=' + th.toFixed(4), false, lhs + ' vs ' + rhs);
      }
    }
  });
});
console.log('\n[1] 极坐标定义 |PF|/|PL| = e：样本 ' + ratioSamples + ' 点，最大偏差 = ' + ratioWorst.toExponential(3));
ck('|PF|/|PL| 恒等于 e（最大偏差 < 1e-12）', ratioWorst < 1e-12, 'maxerr=' + ratioWorst);
console.log('    准线改为别的 x 时比值不再等于 e 的反例检查：');
(function () {
  var e = 0.6, p = 1.6;
  [p / e - 0.3, p / e + 0.3, p / e * 1.2].forEach(function (dAlt) {
    var q = polarPoint(e, p, 1.0);
    var ratio = Math.abs(q.r) / Math.abs(dAlt - q.x);
    console.log('      x=' + dAlt.toFixed(4) + ' → 比值 = ' + ratio.toFixed(6) + '（≠ e=' + e + '）');
    ck('错误准线处比值应偏离 e', Math.abs(ratio - e) > 1e-3, ratio);
  });
})();

/* ------------------------------------- 2. 从采样点独立拟合，恢复 e 与准线 d */
function gauss(A, b) {
  var n = b.length, M = A.map(function (r, i) { return r.concat([b[i]]); });
  for (var c = 0; c < n; c++) {
    var piv = c;
    for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    var t = M[c]; M[c] = M[piv]; M[piv] = t;
    if (Math.abs(M[c][c]) < 1e-14) return null;
    for (var r2 = 0; r2 < n; r2++) {
      if (r2 === c) continue;
      var f = M[r2][c] / M[c][c];
      for (var k = c; k <= n; k++) M[r2][k] -= f * M[c][k];
    }
  }
  return M.map(function (row, i) { return row[n] / row[i]; });
}
/** 拟合 A x² + B x + C y² + D = 0（C 归一化），返回 {A,B,C,D,e,d} */
function fitConic(pts) {
  var basis = function (q) { return [q.x * q.x, q.x, q.y * q.y, 1]; };
  var N = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], g = [0, 0, 0, 0];
  pts.forEach(function (q) {
    var b = basis(q);
    for (var i = 0; i < 4; i++) {
      for (var j = 0; j < 4; j++) N[i][j] += b[i] * b[j];
      g[i] += b[i] * 0; // 齐次方程：右端 0
    }
  });
  // 齐次最小二乘：固定 C（y² 系数）=1 → 未知 [A,B,D]，方程 A x² + B x + D = -y²
  var M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], rhs = [0, 0, 0];
  pts.forEach(function (q) {
    var b = [q.x * q.x, q.x, 1], y2 = -q.y * q.y;
    for (var i = 0; i < 3; i++) {
      for (var j = 0; j < 3; j++) M[i][j] += b[i] * b[j];
      rhs[i] += b[i] * y2;
    }
  });
  var sol = gauss(M, rhs);
  if (!sol) return null;
  var A = sol[0], B = sol[1], D = sol[2], C = 1;
  var e2 = 1 - A / C;
  var d = B / (2 * (C - A));
  return { A: A, B: B, C: C, D: D, e: Math.sqrt(Math.max(0, e2)), d: d };
}
console.log('\n[2] 从极坐标采样点独立拟合（固定 y² 系数）恢复 e 与准线 d：');
var fitWorstE = 0, fitWorstD = 0, fitCases = 0;
E_LIST.forEach(function (e) {
  P_LIST.forEach(function (p) {
    var pts = [];
    for (var i = 0; i < 4000; i++) {
      var th = (i / 4000) * Math.PI * 2;
      var q = polarPoint(e, p, th);
      if (!q || Math.abs(q.r) > 500) continue;
      pts.push(q);
    }
    var f = fitConic(pts);
    if (!f) { ck('拟合失败', false, 'e=' + e + ' p=' + p); return; }
    fitCases++;
    var errE = Math.abs(f.e - e), errD = Math.abs(f.d - p / e);
    fitWorstE = Math.max(fitWorstE, errE);
    fitWorstD = Math.max(fitWorstD, errD);
    if (errE > 1e-6 || errD > 1e-6) {
      ck('拟合 e/d 偏差', false, 'e=' + e + ' p=' + p + ' → e_fit=' + f.e + ' d_fit=' + f.d + ' 期望 d=' + (p / e));
    }
  });
});
console.log('    拟合 ' + fitCases + ' 组：max|e_fit − e| = ' + fitWorstE.toExponential(2) +
  '，max|d_fit − p/e| = ' + fitWorstD.toExponential(2));
ck('拟合恢复的 e 与滑块 e 一致', fitWorstE < 1e-6, fitWorstE);
ck('拟合恢复的准线 = p/e', fitWorstD < 1e-6, fitWorstD);

/* ------------------------------------- 3. e=1 是抛物线而非椭圆/双曲线 */
console.log('\n[3] e = 1 的二次曲线判别式 B²−4AC（=0 → 抛物线）：');
[[1, 1], [1, 1.6], [1, 3]].forEach(function (t) {
  var e = t[0], p = t[1];
  // 直接用代数展开：x²+y² = (x−p)² → y² − 2px + p² = 0 → A=0,B=0,C=1,D=−2p
  var A = 1 - e * e, B = 0, C = 1, D = -2 * e * e * (p / e) * 0 + (-(e * e) * (p / e) * (p / e));
  void D;
  var disc = B * B - 4 * A * C;
  console.log('    p=' + p + ' → A=' + A + ' B=' + B + ' C=' + C + ' B²−4AC=' + disc + '（抛物线判据 =0）');
  ck('e=1 时 B²−4AC = 0（抛物线）', Math.abs(disc) < 1e-15, disc);
  // 极坐标采样点应满足 y² = p² − 2px（远离 θ=π 的远端以避免相减抵消）
  var worst = 0;
  for (var i = 1; i < 720; i++) {
    var th = (i / 720) * Math.PI * 2;
    var q = polarPoint(1, p, th);
    if (!q || !isFinite(q.x) || Math.abs(q.x) > 100) continue;
    var scale = Math.max(p * p, Math.abs(2 * p * q.x), q.y * q.y);
    worst = Math.max(worst, Math.abs(q.y * q.y - (p * p - 2 * p * q.x)) / scale);
  }
  console.log('      采样点(|x|≤100)与抛物线 y² = p² − 2px 的最大相对偏差 = ' + worst.toExponential(2));
  ck('e=1 采样点落在抛物线 y²=p²−2px 上', worst < 1e-12, worst);
});

/* ------------------------------------- 4. 模块 readouts / formula 复核 */
console.log('\n[4] 模块 readouts（可达滑块值 e = 0.2 + k·0.02）：');
console.log('    （读数"实测 |PF|/|PL|" = formatNumber(e,4)：见 [6] 验证它与真实绘制点测得的比值一致，但其数值本身是直接抄 e，并未真的去量）');
var kindBad = [], ratioBad = [], dirBad = [], dirRel = 0;
for (var k = 0; k <= 80; k++) {
  var eStr = (0.2 + k * 0.02).toFixed(2);
  var e = parseFloat(eStr);
  var p = 1.6;
  var r = readouts({ e: e, p: p, dir: true, ratio: true });
  var truth = Math.abs(e - 1) < 1e-12 ? 'parabola' : (e < 1 ? 'ellipse' : 'hyperbola');
  var kind = /抛物线/.test(r['类型']) ? 'parabola' : (/椭圆/.test(r['类型']) ? 'ellipse' : 'hyperbola');
  if (kind !== truth) kindBad.push({ e: e, shown: r['类型'], truth: truth });
  if (Math.abs(parseFloat(r['实测 |PF|/|PL|']) - e) > 1e-9) ratioBad.push({ e: e, shown: r['实测 |PF|/|PL|'] });
  // 读数按 formatNumber(...,4) = 4 位有效数字显示，允许 5e-4 相对舍入
  if (Math.abs(parseFloat(r['准线 x = p/e']) - p / e) > 5e-4 * Math.max(1, Math.abs(p / e))) dirBad.push({ e: e, shown: r['准线 x = p/e'], want: p / e });
  dirRel = Math.max(dirRel, Math.abs(parseFloat(r['准线 x = p/e']) - p / e) / Math.max(1, Math.abs(p / e)));
}
console.log('    81 个可达 e：类型标注错误 ' + kindBad.length + '，实测比值错误 ' + ratioBad.length + '，准线读数错误 ' + dirBad.length +
  '（准线读数最大相对舍入 = ' + dirRel.toExponential(2) + '，4 位有效数字允许 ≤5e-4）');
kindBad.forEach(function (x) { console.log('      ', JSON.stringify(x)); });
ratioBad.slice(0, 5).forEach(function (x) { console.log('      ', JSON.stringify(x)); });
ck('81 个可达 e 的类型标注全部正确', kindBad.length === 0, JSON.stringify(kindBad.slice(0, 3)));
ck('81 个可达 e 的准线读数 = p/e', dirBad.length === 0, JSON.stringify(dirBad.slice(0, 3)));

/* 容差脆弱性：分类判据已改为 |e−1| < 1e-9，检查可达值是否安全 */
console.log('    分类判据 |e−1| < 1e-9（现行 conicKind）：可达值里的最近邻 = ' +
  (0.2 + 40 * 0.02).toPrecision(20) + ' 与 ' + (0.2 + 40 * 0.02 - 0.02).toPrecision(20) +
  '，|Δe| = ' + Math.abs(0.02).toPrecision(4) + ' ≫ 1e-9 → 无边界误判');

console.log('\n[5] formula 字符串与读数一致性：');
[[0.6, 1.6], [1.0, 3], [1.4, 1]].forEach(function (t) {
  var f = conic.formula({ e: t[0], p: t[1] });
  console.log('    e=' + t[0] + ' p=' + t[1] + ' → ' + f);
  ck('formula 里的准线 = p/e', f.indexOf(MC.formatNumber(t[1] / t[0], 4)) >= 0, f);
});

/* ------------------------------------- 6. 回放 draw：实际绘制点 + 准线位置 */
console.log('\n[6] 回放 draw（真实绘制指令）并复核所有曲线点：');
function replay(e, p, dir, ratio) {
  var plot = H.makePlot({ xMin: -8, xMax: 8, yMin: -6, yMax: 6 });
  conic.draw(plot, { e: e, p: p, dir: dir, ratio: ratio });
  return plot;
}
function worldOf(plot, px, py) { return { x: plot.wx(px), y: plot.wy(py) }; }

[[0.6, 1.6], [0.99, 2], [1.0, 1.6], [1.4, 1.6], [1.8, 3], [0.2, 1]].forEach(function (t) {
  var e = t[0], p = t[1];
  var plot = replay(e, p, true, true);
  var path = plot.rec.paths.filter(function (q) { return q.op === 'stroke' && q.style === H.PALETTE.cobalt; });
  var pts = [];
  path.forEach(function (seg) {
    seg.pts.forEach(function (q) {
      if (q.op === 'M' || q.op === 'L') pts.push(worldOf(plot, q.x, q.y));
    });
  });
  var worst = 0, worstCart = 0;
  pts.forEach(function (q) {
    var PF = Math.hypot(q.x, q.y);
    var PL = Math.abs(p / e - q.x);
    worst = Math.max(worst, Math.abs(PF / PL - e));
    worstCart = Math.max(worstCart, Math.abs(q.x * q.x + q.y * q.y - e * e * (q.x - p / e) * (q.x - p / e)));
  });
  // 准线位置（mint 竖直虚线）
  var dirSeg = plot.rec.segments.filter(function (s) { return s.o.color === H.PALETTE.mint; })[0];
  var dirX = dirSeg ? dirSeg.args[0] : NaN;
  // 比值标签文本
  var ratioLabel = plot.rec.labels.filter(function (l) { return /\|PF\|\/\|PL\|/.test(String(l.args[2])); })[0];
  var shownRatio = ratioLabel ? parseFloat(String(ratioLabel.args[2]).replace(/[^0-9.]/g, '')) : NaN;
  console.log('    e=' + e + ' p=' + p + '：绘制点 ' + pts.length + '，max|PF/PL−e|=' + worst.toExponential(2) +
    '，max|轨迹方程残差|=' + worstCart.toExponential(2) + '，准线 x=' + (dirSeg ? MC.formatNumber(dirX, 6) : '未绘制') +
    '（p/e=' + MC.formatNumber(p / e, 6) + '），图上比值标签=' + (ratioLabel ? ratioLabel.args[2] : '未绘制'));
  ck('e=' + e + ' p=' + p + ' 绘制点全部满足 |PF|/|PL| = e', worst < 1e-6, worst);
  ck('e=' + e + ' p=' + p + ' 准线画在 x = p/e', Math.abs(dirX - p / e) < 1e-9, dirX + ' vs ' + (p / e));
  ck('e=' + e + ' p=' + p + ' 图上比值标签与 e 一致', Math.abs(shownRatio - e) < 5e-4, shownRatio + ' vs ' + e);
});

console.log('\n[7] e>1 时绘制的分支完整性（轨迹 |PF|/|PL|=e 在 e>1 时含**两支**）：');
[[1.0, 1.6], [1.01, 1.6], [1.2, 2], [1.4, 1.6], [1.8, 3]].forEach(function (t) {
  var e = t[0], p = t[1];
  var plot = replay(e, p, false, false);
  var strokes = plot.rec.paths.filter(function (q) { return q.op === 'stroke' && q.style === H.PALETTE.cobalt; });
  var all = [];
  strokes.forEach(function (s) { s.pts.forEach(function (q) { if (q.op === 'M' || q.op === 'L') all.push(worldOf(plot, q.x, q.y)); }); });
  var maxX = Math.max.apply(null, all.map(function (q) { return q.x; }));
  var minX = Math.min.apply(null, all.map(function (q) { return q.x; }));
  // 第二支（远支）顶点的 x 坐标：x = e·d/(e−1) = p/(e−1)
  var farVertexX = e > 1 ? p / (e - 1) : NaN;
  var nearVertexX = e > 1 ? p / (e + 1) : p / 2;
  console.log('    e=' + e + ' p=' + p + '：描线段数=' + strokes.length + '，绘制点 x∈[' + minX.toFixed(3) + ', ' + maxX.toFixed(3) + ']' +
    '；近支顶点 x=' + nearVertexX.toFixed(3) + (e > 1 ? '，远支顶点 x=' + farVertexX.toFixed(3) : '（抛物线单支）'));
  if (e > 1) {
    // 远支上的点是否满足 |PF|/|PL| = e？（应当满足 → 属于轨迹，图里却缺失）
    var xf = farVertexX + 0.5;
    var y2 = e * e * (xf - p / e) * (xf - p / e) - xf * xf;
    if (y2 > 0) {
      var yf = Math.sqrt(y2);
      var ratioFar = Math.hypot(xf, yf) / Math.abs(xf - p / e);
      console.log('        远支样本点(' + xf.toFixed(3) + ', ±' + yf.toFixed(3) + ') 的 |PF|/|PL| = ' + ratioFar.toFixed(12) + '（= e=' + e + '，确属轨迹）');
      ck('远支点满足定义比值 e=' + e, Math.abs(ratioFar - e) < 1e-12, ratioFar);
    }
    if (maxX < farVertexX - 1e-9) {
      if (farVertexX <= 40) {
        ck('e=' + e + ' 的远支被绘制（绘制点应达到 x ≥ ' + farVertexX.toFixed(3) + '）', false,
          '绘制点最大 x = ' + maxX.toFixed(3) + '，远支顶点 x = ' + farVertexX.toFixed(3) + ' → 第二支整体缺失');
      } else {
        console.log('        （远支顶点 x=' + farVertexX.toFixed(1) + ' 超出 draw 的 |r|≤40 裁剪范围，属良性裁剪）');
      }
    }
  } else {
    ck('e=1 抛物线 x 上界 = p/2 = ' + (p / 2).toFixed(3), Math.abs(maxX - p / 2) < 1e-9, maxX);
    ck('e=1 抛物线应为 2 段（θ=π 处断开，两段在顶点相接）', strokes.length === 2, strokes.length);
  }
});

console.log('\n[8] 椭圆闭合性 / 标准形式（模块 info 声称 e<1 即标准椭圆且 e=c/a）：');
(function () {
  console.log('    半轴复核对（a = p/(1−e²)，b = p/√(1−e²)，c = ea）：');
  [[0.2, 1], [0.5, 1.6], [0.6, 1.6], [0.8, 2], [0.95, 3]].forEach(function (t) {
    var e = t[0], p = t[1];
    var pts = [];
    for (var i = 0; i < 4000; i++) {
      var th = (i / 4000) * Math.PI * 2;
      var q = polarPoint(e, p, th);
      if (q && Math.abs(q.r) < 500) pts.push(q);
    }
    var f = fitConic(pts);
    var A = f.A, B = f.B, D = f.D;
    var k = B * B / (4 * A) - D;
    var alpha2 = k / A, beta2 = k;
    var aFit = Math.sqrt(alpha2), bFit = Math.sqrt(beta2);
    var aTheo = p / (1 - e * e), bTheo = p / Math.sqrt(1 - e * e);
    var cTheo = e * aTheo;
    var eFit = Math.sqrt(1 - A);
    console.log('      e=' + e + ' p=' + p + '：a_fit=' + aFit.toFixed(9) + '(理论 ' + aTheo.toFixed(9) + ')' +
      '，b_fit=' + bFit.toFixed(9) + '(理论 ' + bTheo.toFixed(9) + ')' +
      '，e_fit=' + eFit.toFixed(9) + '，c/a=' + (cTheo / aTheo).toFixed(9));
    ck('椭圆半轴 a 与 p/(1−e²) 一致 (e=' + e + ')', Math.abs(aFit - aTheo) < 1e-6 * Math.max(1, aTheo), aFit + ' vs ' + aTheo);
    ck('椭圆半轴 b 与 p/√(1−e²) 一致 (e=' + e + ')', Math.abs(bFit - bTheo) < 1e-6 * Math.max(1, bTheo), bFit + ' vs ' + bTheo);
    ck('e = c/a 成立 (e=' + e + ')', Math.abs(eFit - cTheo / aTheo) < 1e-8, eFit + ' vs ' + (cTheo / aTheo));
  });
})();

console.log('\n[9] 结论：独立检查 ' + checks + ' 项，不符 ' + bad.length + ' 项');
bad.forEach(function (b) { console.log('  [WRONG] ' + b.label + ' → ' + b.detail); });
console.log('脆弱/存疑 ' + fragile.length + ' 项');
fragile.forEach(function (b) { console.log('  [FRAGILE] ' + b.label + ' → ' + b.detail); });
