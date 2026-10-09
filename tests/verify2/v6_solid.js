/*!
 * tests/verify2/v6_solid.js — 立体几何模块（geometry2.js: solid-3d）旋转/投影/欧拉公式独立复核
 *
 * 回放真实 draw 抓取投影后的顶点，与独立实现的
 *   1) 绕 y 轴偏航 ψ 再绕 x 轴俯仰 φ 的旋转矩阵
 *   2) 透视投影 x·D/(D−z)，D = 6 − 4·persp
 * 逐点对比；并检验欧拉公式、面/棱闭合性、画家算法、以及 persp=0 时"正交投影"的说法。
 *
 * 运行：node tests/verify2/v6_solid.js
 */
'use strict';
var H = require('./harness.js');
var MC = H.MC;

var mods = H.loadModule('src/modules/geometry2.js');
var solid = H.byId(mods, 'solid-3d');
console.log('模块 solid-3d 注册:', !!solid);

var checks = 0, bad = [], frag = [];
function ck(label, cond, detail) { checks++; if (!cond) bad.push({ label: label, detail: detail }); return cond; }

/* 独立实现：AST 固定的旋转与投影（源码 geometry2.js: 216–229） */
function rotY(v, psi) { var c = Math.cos(psi), s = Math.sin(psi); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; }
function rotX(v, phi) { var c = Math.cos(phi), s = Math.sin(phi); return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]; }
function indepRotate(v, psi, phi) { return rotX(rotY(v, psi), phi); }         // 先偏航后俯仰
function indepRotateOther(v, psi, phi) { return rotY(rotX(v, phi), psi); }    // 交换次序（对照）
function indepProject(v, D) { var s = D / Math.max(0.2, D - v[2]); return { x: v[0] * s, y: v[1] * s, z: v[2], s: s }; }

var SOLIDS = {
  cube: [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
  tetra: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]],
  octa: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
};

/* ---------------------------------------------------- 1. 旋转/投影逐点对照 */
console.log('\n[1] 回放 draw 的投影顶点 vs 独立实现：');
var worstP = 0, worstOther = 0, samples = 0;
var params = [];
[[0, 0], [35, 22], [90, 0], [180, -45], [270, 80], [360, -80], [45, 60], [123, 33], [0, 80], [359, 1]].forEach(function (a) {
  [0, 0.5, 1, 0.25, 0.75].forEach(function (persp) { params.push({ yaw: a[0], pitch: a[1], persp: persp }); });
});
['cube', 'tetra', 'octa'].forEach(function (shape) {
  params.forEach(function (q) {
    var p = { shape: shape, theta: q.yaw, phi: q.pitch, persp: q.persp, faces: false, labels: false, axes3: false };
    var plot = H.makePlot({ xMin: -3, xMax: 3, yMin: -3, yMax: 3 });
    solid.draw(plot, p);
    var drawn = plot.rec.points.map(function (pt) { return { x: pt.args[0], y: pt.args[1] }; });
    var D = 6 - 4 * q.persp;
    var psi = q.yaw * Math.PI / 180, phi = q.pitch * Math.PI / 180;
    var V = SOLIDS[shape];
    var worstLocal = 0, worstLocalOther = 0;
    V.forEach(function (v, i) {
      var e = indepProject(indepRotate(v, psi, phi), D);
      var eo = indepProject(indepRotateOther(v, psi, phi), D);
      worstLocal = Math.max(worstLocal, Math.hypot(drawn[i].x - e.x, drawn[i].y - e.y));
      worstLocalOther = Math.max(worstLocalOther, Math.hypot(drawn[i].x - eo.x, drawn[i].y - eo.y));
      samples++;
    });
    worstP = Math.max(worstP, worstLocal);
    worstOther = Math.max(worstOther, worstLocalOther);
    if (worstLocal > 1e-12) {
      ck('投影点与独立实现不符 ' + shape + ' yaw=' + q.yaw + ' pitch=' + q.pitch + ' persp=' + q.persp, false, worstLocal);
    }
  });
});
console.log('    对照点 ' + samples + ' 个：与"先偏航后俯仰"实现最大偏差 = ' + worstP.toExponential(2) +
  '；与"先俯仰后偏航"实现最大偏差 = ' + worstOther.toExponential(2));
ck('draw 的投影顶点 = 独立实现的 rotX(φ)·rotY(ψ)·v 再透视', worstP < 1e-12, worstP);
ck('旋转次序确实是先 y 偏航后 x 俯仰（交换次序会明显不符）', worstOther > 1e-3, worstOther);

/* ---------------------------------------------------- 2. 旋转矩阵性质 */
console.log('\n[2] 旋转矩阵性质（正交、行列式 +1、保持长度）：');
(function () {
  var worstOrtho = 0, worstDet = 0, worstNorm = 0;
  for (var i = 0; i < 500; i++) {
    var psi = (i / 500) * 2 * Math.PI * 3 - 2, phi = (i / 500) * 2 * Math.PI - 3;
    var cols = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(function (e) { return indepRotate(e, psi, phi); });
    for (var a = 0; a < 3; a++) {
      worstNorm = Math.max(worstNorm, Math.abs(Math.hypot(cols[a][0], cols[a][1], cols[a][2]) - 1));
      for (var b = 0; b < 3; b++) {
        var dot = cols[a][0] * cols[b][0] + cols[a][1] * cols[b][1] + cols[a][2] * cols[b][2];
        worstOrtho = Math.max(worstOrtho, Math.abs(dot - (a === b ? 1 : 0)));
      }
    }
    var det = cols[0][0] * (cols[1][1] * cols[2][2] - cols[1][2] * cols[2][1])
            - cols[0][1] * (cols[1][0] * cols[2][2] - cols[1][2] * cols[2][0])
            + cols[0][2] * (cols[1][0] * cols[2][1] - cols[1][1] * cols[2][0]);
    worstDet = Math.max(worstDet, Math.abs(det - 1));
    // 任意向量长度保持
    var v = [Math.sin(i), Math.cos(i * 1.7), Math.sin(i * 0.3) * 2];
    var r = indepRotate(v, psi, phi);
    worstNorm = Math.max(worstNorm, Math.abs(Math.hypot(r[0], r[1], r[2]) - Math.hypot(v[0], v[1], v[2])));
  }
  console.log('    正交性偏差 ' + worstOrtho.toExponential(2) + '，|det−1| = ' + worstDet.toExponential(2) +
    '，长度偏差 ' + worstNorm.toExponential(2));
  ck('旋转矩阵正交', worstOrtho < 1e-14, worstOrtho);
  ck('旋转矩阵行列式 = +1（真旋转，非反射）', worstDet < 1e-14, worstDet);
  ck('旋转保持向量长度', worstNorm < 1e-14, worstNorm);
})();

/* ---------------------------------------------------- 3. 透视投影性质 */
console.log('\n[3] 透视投影 s = D/(D−z) 的单调性与相机距离：');
(function () {
  var mono = true, prev = -Infinity;
  for (var z = -1.8; z <= 1.8; z += 0.01) {
    var s = indepProject([0, 0, z], 2).s;
    if (s <= prev) mono = false;
    prev = s;
  }
  console.log('    D=2 时 s 随 z 单调递增 = ' + mono);
  ck('s(z) 严格单调递增', mono);
  // 应用层显示 D = 6 − 4·persp，检查图上标签
  var badLabel = 0;
  [0, 0.25, 0.5, 0.75, 1].forEach(function (persp) {
    var plot = H.makePlot();
    solid.draw(plot, { shape: 'cube', theta: 35, phi: 22, persp: persp, faces: true, labels: true, axes3: true });
    var lab = plot.rec.labels.filter(function (l) { return /相机距离 D/.test(String(l.args[2])); })[0];
    var want = "D = " + MC.formatFixed(6 - 4 * persp, 2);
    if (!lab || String(lab.args[2]).indexOf(want) < 0) { badLabel++; console.log('      标签不符 persp=' + persp + '：' + (lab && lab.args[2]) + ' 期望含 ' + want); }
  });
  ck('图上相机距离标签 D = 6 − 4·persp', badLabel === 0, badLabel);
  // 透视强度 0 时的缩放离散度（"正交投影"的说法）
  console.log('    persp = 0（D=6）时各顶点的透视缩放 s 范围：');
  ['cube', 'tetra', 'octa'].forEach(function (shape) {
    var p = { shape: shape, theta: 35, phi: 22, persp: 0, faces: false, labels: false, axes3: false };
    var plot = H.makePlot();
    solid.draw(plot, p);
    var D = 6;
    var ss = SOLIDS[shape].map(function (v) { return indepProject(indepRotate(v, 35 * Math.PI / 180, 22 * Math.PI / 180), D).s; });
    var lo = Math.min.apply(null, ss), hi = Math.max.apply(null, ss);
    console.log('      ' + shape + '：s ∈ [' + lo.toFixed(6) + ', ' + hi.toFixed(6) + ']，放大率比 = ' + (hi / lo).toFixed(4) +
      '（正交投影应为 1.0000）');
    var lab = plot.rec.labels.filter(function (l) { return /投影/.test(String(l.args[2])); })[0];
    console.log('      图上标签：' + (lab && lab.args[2]));
  });
  // 平行棱在 persp=0 时是否保持平行：立方体两条沿 z 的棱
  var pa = [1, 1, -1], pb = [1, 1, 1], pc = [-1, 1, -1], pd = [-1, 1, 1];
  var psi = 35 * Math.PI / 180, phi = 22 * Math.PI / 180;
  var A = indepProject(indepRotate(pa, psi, phi), 6), B = indepProject(indepRotate(pb, psi, phi), 6);
  var C = indepProject(indepRotate(pc, psi, phi), 6), D2 = indepProject(indepRotate(pd, psi, phi), 6);
  var len1 = Math.hypot(B.x - A.x, B.y - A.y), len2 = Math.hypot(D2.x - C.x, D2.y - C.y);
  var dir1 = [(B.x - A.x) / len1, (B.y - A.y) / len1], dir2 = [(D2.x - C.x) / len2, (D2.y - C.y) / len2];
  var crossz = Math.abs(dir1[0] * dir2[1] - dir1[1] * dir2[0]);
  console.log('    persp=0 时两条平行 z 棱：投影长度 ' + len1.toFixed(6) + ' vs ' + len2.toFixed(6) +
    '（比值 ' + (len2 / len1).toFixed(4) + '），方向叉积 = ' + crossz.toExponential(2) +
    '（正交投影应比值=1、叉积=0）');
  ck('persp=0 时的投影可称为正交投影（各顶点缩放一致）', Math.abs(len2 / len1 - 1) < 1e-9,
    '平行棱投影长度比 = ' + (len2 / len1).toFixed(4) + '，方向叉积 = ' + crossz.toFixed(4) +
    '；立方体缩放区间 0.7827–1.3844（1.77×）');
  var lab0 = (function () {
    var p = H.makePlot({ xMin: -3, xMax: 3, yMin: -3, yMax: 3 });
    solid.draw(p, { shape: 'cube', theta: 35, phi: 22, persp: 0, faces: true, labels: true, axes3: true });
    var l1 = p.rec.labels.filter(function (x) { return /投影/.test(String(x.args[2])); })[0];
    var rd = {};
    solid.readouts({ shape: 'cube', theta: 35, phi: 22, persp: 0, faces: true, labels: true, axes3: true }).forEach(function (x) { rd[x.label.zh] = x.value; });
    return { label: l1 && l1.args[2], readout: rd['投影'] };
  })();
  console.log('    persp=0 的界面文案：图内标签「' + lab0.label + '」，读数「' + lab0.readout + '」');
  ck('persp=0 时界面不应宣称"正交投影"', String(lab0.label).indexOf('正交') < 0 && lab0.readout !== '正交',
    '标签=' + lab0.label + '，读数=' + lab0.readout);
})();

/* ---------------------------------------------------- 4. 欧拉公式与多面体闭合性 */
console.log('\n[4] 欧拉公式 V−E+F 与面/棱闭合性：');
var FACES = {
  cube: [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 3, 7, 4]],
  tetra: [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]],
  octa: [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]]
};
['cube', 'tetra', 'octa'].forEach(function (shape) {
  var V = SOLIDS[shape].length, F = FACES[shape].length;
  var ec = {}, edgeCount = 0;
  FACES[shape].forEach(function (f) {
    for (var i = 0; i < f.length; i++) {
      var a = f[i], b = f[(i + 1) % f.length];
      var k = Math.min(a, b) + '-' + Math.max(a, b);
      ec[k] = (ec[k] || 0) + 1;
    }
  });
  Object.keys(ec).forEach(function (k) { if (ec[k] === 2) edgeCount++; });
  var E = Object.keys(ec).length, twice = Object.keys(ec).every(function (k) { return ec[k] === 2; });
  var ro = {};
  solid.readouts({ shape: shape, theta: 35, phi: 22, persp: 0.5 }).forEach(function (x) { ro[x.label.zh] = x.value; });
  var f = solid.formula({ shape: shape });
  console.log('  ' + shape + '：V=' + V + ' E=' + E + ' F=' + F + ' → V−E+F=' + (V - E + F) +
    '；每条棱恰属两个面 = ' + twice + '；读数 V/E/F/欧拉 = ' + ro['顶点 V'] + '/' + ro['棱 E'] + '/' + ro['面 F'] + '/' + ro['V − E + F（欧拉）']);
  console.log('      formula = ' + f);
  ck(shape + ' 欧拉公式 V−E+F=2', V - E + F === 2, V - E + F);
  ck(shape + ' 面表闭合（每条棱恰属 2 个面）', twice, JSON.stringify(ec));
  ck(shape + ' 读数与几何量一致', ro['顶点 V'] === String(V) && ro['棱 E'] === String(E) && ro['面 F'] === String(F) && ro['V − E + F（欧拉）'] === '2');
  ck(shape + ' formula 中的 V/E/F 正确', f.indexOf('V=' + V) >= 0 && f.indexOf('E=' + E) >= 0 && f.indexOf('F=' + F) >= 0, f);
  ck(shape + ' 无重复棱（每个 key 计数 2）', edgeCount === E, edgeCount + ' vs ' + E);
});

/* ---------------------------------------------------- 5. 画家算法 / 面朝向 */
console.log('\n[5] 画家算法（按平均 z 升序）与正面覆盖：(0,0) 是否落在最后绘制的面内：');
(function () {
  function inPoly(pt, poly) {
    var s = 0;
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length];
      var c = (b.x - a.x) * (pt.y - a.y) - (b.y - a.y) * (pt.x - a.x);
      if (Math.abs(c) < 1e-12) continue;
      var sg = c > 0 ? 1 : -1;
      if (s === 0) s = sg; else if (sg !== s) return false;
    }
    return true;
  }
  var total = 0, cover = 0;
  ['cube', 'tetra', 'octa'].forEach(function (shape) {
    for (var i = 0; i < 40; i++) {
      var yaw = i * 9, pitch = -70 + (i % 15) * 10;
      var p = { shape: shape, theta: yaw, phi: pitch, persp: 0.5, faces: true, labels: false, axes3: false };
      var plot = H.makePlot();
      solid.draw(plot, p);
      var fills = plot.rec.paths.filter(function (q) { return q.op === 'fill' && /rgba\(206,88,72/.test(String(q.style)); });
      if (!fills.length) continue;
      var last = fills[fills.length - 1].pts.filter(function (q) { return q.op !== 'Z'; });
      total++;
      if (inPoly({ x: plot.sx(0), y: plot.sy(0) }, last)) cover++;
    }
  });
  console.log('    最后绘制的面覆盖屏幕中心 (' + cover + '/' + total + ')');
})();

console.log('\n[6] 结论：独立检查 ' + checks + ' 项，不符 ' + bad.length + ' 项');
bad.forEach(function (b) { console.log('  [WRONG] ' + b.label + ' → ' + b.detail); });
frag.forEach(function (b) { console.log('  [FRAGILE] ' + b.label + ' → ' + b.detail); });
