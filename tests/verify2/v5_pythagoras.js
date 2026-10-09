/*!
 * tests/verify2/v5_pythagoras.js — 勾股定理模块（geometry2.js: geo-pythagoras）独立复核
 *
 * 回放真实 draw，抓取三块正方形（按颜色分辨）的四个顶点，验证：
 *   · 每块确实是正方形（四边相等、四角 90°、面积 = a²/b²/c²）
 *   · 正方形建在哪一侧（外侧 / 三角形内部），以及相互重叠面积
 *   · 斜边上的正方形由 squareOn 的旋转方向决定，是否与 (vx,vy)→(vy,−vx) 一致
 *   · "单位方格"开关实际画出的方格数与面积的关系
 *
 * 运行：node tests/verify2/v5_pythagoras.js
 */
'use strict';
var H = require('./harness.js');
var MC = H.MC;

var mods = H.loadModule('src/modules/geometry2.js');
var pyth = H.byId(mods, 'geo-pythagoras');
console.log('模块 geo-pythagoras 注册:', !!pyth);

var checks = 0, bad = [], frag = [];
function ck(label, cond, detail) { checks++; if (!cond) bad.push({ label: label, detail: detail }); return cond; }

/* -------------------------------------------------- 几何工具（独立实现） */
function shoelace(pts) {
  var s = 0;
  for (var i = 0; i < pts.length; i++) {
    var a = pts[i], b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}
function sideLens(pts) {
  return pts.map(function (p, i) {
    var q = pts[(i + 1) % pts.length];
    return Math.hypot(q[0] - p[0], q[1] - p[1]);
  });
}
function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
function inConvexPoly(pt, poly) {
  var s = 0;
  for (var i = 0; i < poly.length; i++) {
    var c = cross(poly[i], poly[(i + 1) % poly.length], pt);
    if (Math.abs(c) < 1e-12) continue;
    var sg = c > 0 ? 1 : -1;
    if (s === 0) s = sg; else if (sg !== s) return false;
  }
  return true;
}
/** Sutherland–Hodgman 凸多边形裁剪（自动判定裁剪多边形绕向，求交面积用） */
function clip(subject, clipPoly) {
  var orient = shoelace(clipPoly) > 0 ? 1 : -1;     // >0 逆时针：内侧 = cross > 0
  var out = subject.slice();
  for (var i = 0; i < clipPoly.length && out.length; i++) {
    var a = clipPoly[i], b = clipPoly[(i + 1) % clipPoly.length];
    var input = out; out = [];
    var sgn = function (p) { return orient * cross(a, b, p); };
    for (var j = 0; j < input.length; j++) {
      var cur = input[j], prev = input[(j + input.length - 1) % input.length];
      var sc = sgn(cur), sp = sgn(prev);
      if (sc >= 0) { if (sp < 0) out.push(inter(prev, cur, a, b)); out.push(cur); }
      else if (sp >= 0) out.push(inter(prev, cur, a, b));
    }
  }
  return out;
}
function inter(p, q, a, b) {
  var d1 = cross(a, b, p), d2 = cross(a, b, q);
  var t = d1 / (d1 - d2);
  return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
}
function overlapArea(polyA, polyB) {
  var c = clip(polyA, polyB);
  return c.length >= 3 ? Math.abs(shoelace(c)) : 0;
}

/* --------------------------------------------------------- 回放 + 复核 */
function replay(a, b, grid3) {
  var plot = H.makePlot({ xMin: -20, xMax: 20, yMin: -20, yMax: 20 });
  pyth.draw(plot, { a: a, b: b, hyp: true, grid3: !!grid3 });
  return plot;
}
function squarePolys(plot) {
  var byColor = {};
  [['a', H.PALETTE.cobalt], ['b', H.PALETTE.coral], ['c', H.PALETTE.mint]].forEach(function (t) {
    var segs = plot.rec.segments.filter(function (s) { return s.o.color === t[1]; });
    if (segs.length < 4) { byColor[t[0]] = null; return; }
    // squareOn 依次画 pts[0..3] → 前 4 条线段即为四条边
    byColor[t[0]] = segs.slice(0, 4).map(function (s) { return [s.args[0], s.args[1]]; });
  });
  return byColor;
}
function fmtPoly(p) { return p ? p.map(function (q) { return '(' + q[0].toFixed(3) + ',' + q[1].toFixed(3) + ')'; }).join(' ') : 'null'; }

console.log('\n[1] 三块正方形是否真的是正方形 / 面积 / 位置：');
var testAB = [[3, 4], [1, 1], [2.7, 1.3], [5, 1], [1.5, 4.6], [4.9, 0.1], [0.7, 0.9], [3.3, 3.3]];
var wrongSquare = 0, wrongArea = 0, wrongPlacement = 0;
testAB.forEach(function (t) {
  var a = t[0], b = t[1], c = Math.hypot(a, b);
  var plot = replay(a, b, false);
  var sq = squarePolys(plot);
  var A = [0, 0], B = [a, 0], C = [0, b];
  var tri = [A, B, C];
  var want = { a: a * a, b: b * b, c: c * c };
  var lines = [];
  ['a', 'b', 'c'].forEach(function (k) {
    var poly = sq[k];
    if (!poly) { ck('缺少正方形 ' + k, false, 'a=' + a + ' b=' + b); return; }
    var L = sideLens(poly);
    var equalSides = Math.max.apply(null, L) - Math.min.apply(null, L) < 1e-12;
    var rightAngles = poly.every(function (p, i) {
      var q = poly[(i + 1) % 4], r = poly[(i + 2) % 4];
      var u = [q[0] - p[0], q[1] - p[1]], v = [r[0] - q[0], r[1] - q[1]];
      return Math.abs(u[0] * v[0] + u[1] * v[1]) < 1e-12;
    });
    var area = Math.abs(shoelace(poly));
    if (!equalSides || !rightAngles) wrongSquare++;
    if (Math.abs(area - want[k]) > 1e-9) wrongArea++;
    var insideTri = inConvexPoly([poly[0][0] + (poly[1][0] - poly[0][0]) * 0.5 + (poly[3][0] - poly[0][0]) * 0.5,
      poly[0][1] + (poly[1][1] - poly[0][1]) * 0.5 + (poly[3][1] - poly[0][1]) * 0.5], tri);
    var ov = overlapArea(poly, tri);
    lines.push(k + '：边长[' + L.map(function (x) { return x.toFixed(4); }).join(',') + '] 面积=' + area.toFixed(6) +
      '(期望' + want[k].toFixed(6) + ') 中心在三角形内=' + insideTri + ' 与三角形重叠面积=' + ov.toFixed(6));
  });
  console.log('  a=' + a + ' b=' + b + ' c=' + c.toFixed(6));
  lines.forEach(function (l) { console.log('    ' + l); });
  console.log('    a 正方形顶点 ' + fmtPoly(sq.a));
  console.log('    b 正方形顶点 ' + fmtPoly(sq.b));
  console.log('    c 正方形顶点 ' + fmtPoly(sq.c));
});
ck('三块图形都是正方形（四边相等 + 四角 90°）', wrongSquare === 0, wrongSquare + ' 例异常');
ck('三块图形面积分别 = a²、b²、c²', wrongArea === 0, wrongArea + ' 例异常');

console.log('\n[2] 斜边正方形旋转方向复核（源码用 r = (vy, −vx)）：');
(function () {
  var bad = 0;
  testAB.forEach(function (t) {
    var a = t[0], b = t[1];
    var sq = squarePolys(replay(a, b, false));
    var B = [a, 0], C = [0, b];
    var vx = C[0] - B[0], vy = C[1] - B[1];
    var expect = [B, C, [C[0] + vy, C[1] - vx], [B[0] + vy, B[1] - vx]];
    var ok = sq.c.every(function (p, i) { return Math.hypot(p[0] - expect[i][0], p[1] - expect[i][1]) < 1e-12; });
    if (!ok) { bad++; console.log('    不符 a=' + a + ' b=' + b + '：' + fmtPoly(sq.c) + ' vs 期望 ' + fmtPoly(expect)); }
  });
  console.log('    与 (vx,vy)→(vy,−vx) 顺时针 90° 构造一致的用例 = ' + (testAB.length - bad) + '/' + testAB.length);
  ck('斜边正方形顶点 = 源码所述 (vy,−vx) 旋转构造', bad === 0, bad);
})();

console.log('\n[3] 三块正方形的相互重叠 / 与三角形的重叠（视觉正确性）：');
[
  { a: 3, b: 4 }, { a: 4, b: 3 }, { a: 5, b: 1 }, { a: 1, b: 5 }, { a: 2, b: 2 }, { a: 2.7, b: 1.3 },
  { a: 1, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 1 }, { a: 5, b: 5 }, { a: 1.2, b: 3.4 }, { a: 4.4, b: 0.6 }
].forEach(function (t) {
  var a = t.a, b = t.b, c = Math.hypot(a, b);
  var sq = squarePolys(replay(a, b, false));
  var tri = [[0, 0], [a, 0], [0, b]];
  var oab = overlapArea(sq.a, sq.b), oac = overlapArea(sq.a, sq.c), obc = overlapArea(sq.b, sq.c);
  var otA = overlapArea(sq.a, tri), otB = overlapArea(sq.b, tri), otC = overlapArea(sq.c, tri);
  console.log('  a=' + a + ' b=' + b + '：a∩b=' + oab.toFixed(4) + ' a∩c=' + oac.toFixed(4) + ' b∩c=' + obc.toFixed(4) +
    ' | 与三角形重叠 a=' + otA.toFixed(4) + ' b=' + otB.toFixed(4) + ' c=' + otC.toFixed(4) +
    '（b 方块面积 ' + (b * b).toFixed(4) + '，压在三角形内部占比 ' + (100 * otB / (b * b)).toFixed(1) + '%）');
  ck('b 边正方形不与三角形重叠 (a=' + a + ',b=' + b + ')', otB < 1e-9, otB);
  ck('b 边正方形不与斜边正方形重叠 (a=' + a + ',b=' + b + ')', obc < 1e-9, obc);
});

console.log('\n[4] "单位方格"开关（现行实现取 n = round(边长)，格子数 = n²）：');
[
  { a: 3, b: 4 }, { a: 2, b: 2 }, { a: 5, b: 1 }, { a: 1.5, b: 2.5 }, { a: 4, b: 4 }
].forEach(function (t) {
  var a = t.a, b = t.b, c = Math.hypot(a, b);
  var plot = replay(a, b, true);
  var guides = plot.rec.guides;
  var frac = [];
  [['a', H.PALETTE.cobalt, a], ['b', H.PALETTE.coral, b], ['c', H.PALETTE.mint, c]].forEach(function (q) {
    var n = guides.filter(function (g) { return g.o.color === q[1]; }).length / 2 + 1;   // 每方向 n−1 条 → 两方向 2(n−1)
    var side = q[2], cells = Math.round(side) * Math.round(side), cellSide = side / Math.round(side);
    var exact = Math.abs(side - Math.round(side)) < 1e-9;
    console.log('  a=' + a + ' b=' + b + '：' + q[0] + ' 方块 边长=' + side.toFixed(4) + ' → n=' + Math.round(side) +
      '，格子数=' + cells + '（面积=' + (side * side).toFixed(4) + '），格边长=' + cellSide.toFixed(4) + (exact ? ' ✓单位方格' : ' ✗非单位方格'));
    if (!exact) frac.push({ side: side, n: Math.round(side), cells: cells, area: side * side, cellSide: cellSide });
  });
  if (frac.length) {
    console.log('      → 非整数边长时"单位方格"名不副实：' + JSON.stringify(frac[0]));
  }
});
(function () {
  // 整数边长：必须严格等于单位方格（格子数 = 面积、格边长 = 1）
  var plot = replay(3, 4, true);
  var guides = plot.rec.guides;
  var nA = guides.filter(function (g) { return g.o.color === H.PALETTE.cobalt; }).length / 2 + 1;
  var nB = guides.filter(function (g) { return g.o.color === H.PALETTE.coral; }).length / 2 + 1;
  var nC = guides.filter(function (g) { return g.o.color === H.PALETTE.mint; }).length / 2 + 1;
  console.log('\n  整数边长 a=3,b=4：n(a)=' + nA + ' n(b)=' + nB + ' n(c)=' + nC + '（应为 3、4、5）');
  ck('整数边长时单位方格正确（n = 边长，格子数 = 面积）', nA === 3 && nB === 4 && nC === 5, nA + ',' + nB + ',' + nC);
  // 非整数边长：残余名不副实
  var plot2 = replay(1.5, 2.5, true);
  var g2 = plot2.rec.guides.filter(function (g) { return g.o.color === H.PALETTE.cobalt; }).length / 2 + 1;
  console.log('  非整数边长 a=1.5：n=' + g2 + '，格子数=' + (g2 * g2) + '，格边长=' + (1.5 / g2).toFixed(4) + '（面积 2.25）');
  ck('非整数边长时仍为单位方格（格边长=1 且 格子数=面积）', Math.abs(1.5 / g2 - 1) < 1e-12 && g2 * g2 === 2.25,
    'n=' + g2 + '，格边长=' + (1.5 / g2).toFixed(4) + '，格子数=' + (g2 * g2) + '，面积=2.25');
})();

console.log('\n[5] 视图范围是否容得下三块正方形（几何是否被裁切）：');
var viewFails = [];
[[3, 4], [1, 1], [5, 1], [1, 5], [2.7, 1.3], [5, 5], [1, 5], [4.9, 4.9]].forEach(function (t) {
  [0.75, 1.0, 1.4].forEach(function (aspect) {
    var plot = H.makePlot({ xMin: -20, xMax: 20, yMin: -20, yMax: 20 });
    plot.size.w = 800; plot.size.h = 800 * aspect;
    var sqv = pyth.square({ a: t[0], b: t[1] }, plot);
    var hh = sqv.halfWidth * (plot.size.h / plot.size.w);
    var vx = [sqv.cx - sqv.halfWidth, sqv.cx + sqv.halfWidth], vy = [sqv.cy - hh, sqv.cy + hh];
    pyth.draw(plot, { a: t[0], b: t[1], hyp: true, grid3: false });
    var xs = [], ys = [];
    plot.rec.segments.forEach(function (s) { xs.push(s.args[0], s.args[2]); ys.push(s.args[1], s.args[3]); });
    var xmin = Math.min.apply(null, xs), xmax = Math.max.apply(null, xs);
    var ymin = Math.min.apply(null, ys), ymax = Math.max.apply(null, ys);
    var inside = xmin >= vx[0] - 1e-9 && xmax <= vx[1] + 1e-9 && ymin >= vy[0] - 1e-9 && ymax <= vy[1] + 1e-9;
    if (!inside) viewFails.push({ a: t[0], b: t[1], aspect: aspect, view: [vx, vy], content: [xmin, xmax, ymin, ymax] });
    if (t[0] === 3 && t[1] === 4 && aspect === 0.75) {
      console.log('  a=3 b=4 aspect=0.75：视窗 x∈[' + vx[0].toFixed(2) + ',' + vx[1].toFixed(2) + '] y∈[' + vy[0].toFixed(2) + ',' + vy[1].toFixed(2) + ']' +
        '，内容 x∈[' + xmin.toFixed(2) + ',' + xmax.toFixed(2) + '] y∈[' + ymin.toFixed(2) + ',' + ymax.toFixed(2) + ']');
    }
  });
});
console.log('    内容超出视窗（被裁切）的组合数 = ' + viewFails.length);
viewFails.slice(0, 6).forEach(function (f) { console.log('      ', JSON.stringify(f)); });
ck('三块正方形全部落在视窗内', viewFails.length === 0, JSON.stringify(viewFails.slice(0, 3)));

console.log('\n[6] 结论：独立检查 ' + checks + ' 项，不符 ' + bad.length + ' 项');
bad.forEach(function (b) { console.log('  [WRONG] ' + b.label + ' → ' + b.detail); });
frag.forEach(function (b) { console.log('  [FRAGILE] ' + b.label + ' → ' + b.detail); });
