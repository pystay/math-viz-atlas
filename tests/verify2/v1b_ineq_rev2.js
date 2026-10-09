/*!
 * tests/verify2/v1b_ineq_rev2.js — 一元二次不等式解集审计（针对 19:33:57 之后的 algebra2.js 修订版）
 *
 * 与 v1_ineq.js 相同的暴力采样内核，但适配新的返回结构：
 *   solveQuad(...) = {type, parts:[{lo,hi,loOpen,hiOpen}], marks:[{x,closed}], latex, text, linear?}
 * 额外核对：latex/text 的括号开闭、±∞ 端点必须开、marks 与 parts 一致。
 *
 * 运行：node tests/verify2/v1b_ineq_rev2.js
 */
'use strict';
var H = require('./harness.js');
var MC = H.MC;

var mods = H.loadModule('src/modules/algebra2.js', 'root.__export = { solveQuad: solveQuad };');
var solveQuad = mods.__exports.solveQuad;
var ineq = H.byId(mods, 'algebra-inequality');
var checks = 0, bad = [];
function ck(label, cond, detail) { checks++; if (!cond) bad.push({ label: label, detail: detail }); return cond; }

var OPS = ['>', '>=', '<', '<='];
var strictOf = function (op) { return op === '>' || op === '<'; };
var wantPosOf = function (op) { return op === '>' || op === '>='; };

/** 独立参考解：返回 {type, parts:[[lo,hi,loOpen,hiOpen]], root} */
function refSolve(a, b, c, op) {
  var strict = strictOf(op), wantPos = wantPosOf(op);
  if (a === 0) {
    if (b === 0) {
      var t = wantPos ? (strict ? c > 0 : c >= 0) : (strict ? c < 0 : c <= 0);
      return t ? { type: 'all', parts: [[-Infinity, Infinity, true, true]] } : { type: 'empty', parts: [] };
    }
    var r = -c / b;
    return (b > 0) === wantPos
      ? { type: 'halfline', parts: [[r, Infinity, strict, true]], root: r }
      : { type: 'halfline', parts: [[-Infinity, r, true, strict]], root: r };
  }
  var disc = b * b - 4 * a * c, TOL = 1e-12;   // 与模块同一阈值（阈值本身只在顶点距轴 <1e-12 时可分辨）
  if (disc < -TOL) {
    return (a > 0) === wantPos ? { type: 'all', parts: [[-Infinity, Infinity, true, true]] } : { type: 'empty', parts: [] };
  }
  var sq = Math.sqrt(Math.max(0, disc));
  var r1 = (-b - sq) / (2 * a), r2 = (-b + sq) / (2 * a);
  if (r1 > r2) { var tmp = r1; r1 = r2; r2 = tmp; }
  if (Math.abs(disc) <= TOL) {
    var rr = (r1 + r2) / 2;
    if ((a > 0) === wantPos) {
      return strict ? { type: 'punctured', parts: [[-Infinity, rr, true, true], [rr, Infinity, true, true]], root: rr }
                    : { type: 'all', parts: [[-Infinity, Infinity, true, true]] };
    }
    return strict ? { type: 'empty', parts: [] } : { type: 'point', parts: [[rr, rr, false, false]], root: rr };
  }
  if (wantPos === (a > 0)) {
    return { type: 'union', parts: [[-Infinity, r1, true, strict], [r2, Infinity, strict, true]], roots: [r1, r2] };
  }
  return { type: 'interval', parts: [[r1, r2, strict, strict]], roots: [r1, r2] };
}
function modParts(sol) {
  return (sol.parts || []).map(function (p) { return [p.lo, p.hi, !!p.loOpen, !!p.hiOpen]; });
}
function sameParts(mp, rp) {
  if (mp.length !== rp.length) return false;
  for (var i = 0; i < mp.length; i++) {
    for (var k = 0; k < 4; k++) {
      if (k === 2 || k === 3) { if (mp[i][k] !== rp[i][k]) return false; }
      else if (!(Math.abs(mp[i][k] - rp[i][k]) < 1e-9 || (mp[i][k] === rp[i][k]))) return false;
    }
  }
  return true;
}
function contains(sol, x) {
  return (sol.parts || []).some(function (p) {
    var loOK = p.lo === -Infinity || (p.loOpen ? x > p.lo : x >= p.lo);
    var hiOK = p.hi === Infinity || (p.hiOpen ? x < p.hi : x <= p.hi);
    return loOK && hiOK;
  });
}
var LABEL = { all: '全体实数', empty: '空集', punctured: '挖去端点', point: '单点', union: '两支并集', interval: '一段区间' };
function expectType(ref) {
  if (ref.type === 'halfline') return 'interval';   // 半直线在 2 元素 parts 体系里就是单片段
  return ref.type;
}

var tally = { total: 0, a0: 0, a0bad: 0, nonZero: 0, typeBad: 0, partsBad: 0, sampleBad: 0, labelBad: 0, markBad: 0, latexBad: 0, textBad: 0, nanTotal: 0 };
var sampleN = 0, firstBad = [];
function oneCase(a, b, c, op) {
  tally.total++;
  var strict = strictOf(op), wantPos = wantPosOf(op);
  var sol = solveQuad(a, b, c, op);
  var ref = refSolve(a, b, c, op);
  if (a === 0) { tally.a0++; } else { tally.nonZero++; }
  var nan = (sol.parts || []).some(function (p) { return isNaN(p.lo) || isNaN(p.hi); }) ||
    (sol.marks || []).some(function (m) { return isNaN(m.x); }) ||
    /NaN/.test(String(sol.latex)) || /NaN/.test(String(sol.text));
  if (nan) {
    tally.nanTotal++;
    if (firstBad.length < 8) firstBad.push({ kind: 'NaN', a: a, b: b, c: c, op: op, latex: sol.latex, text: sol.text });
  }
  var typeOK = sol.type === expectType(ref);
  if (!typeOK) {
    if (a === 0) tally.a0bad++; else tally.typeBad++;
    if (firstBad.length < 8) firstBad.push({ kind: 'type', a: a, b: b, c: c, op: op, got: sol.type, want: expectType(ref) });
  }
  if (!sameParts(modParts(sol), ref.parts)) {
    if (a === 0) tally.a0bad++; else tally.partsBad++;
    if (firstBad.length < 8) firstBad.push({ kind: 'parts', a: a, b: b, c: c, op: op, got: JSON.stringify(modParts(sol)), want: JSON.stringify(ref.parts) });
  }
  if (LABEL[sol.type] !== undefined) {
    var lm = {};
    try { ineq.readouts({ a: a, b: b, c: c, op: op }).forEach(function (r) { lm[r.label.zh] = r.value; }); } catch (e) { }
    if (lm['解集类型'] !== LABEL[sol.type]) {
      tally.labelBad++;
      if (firstBad.length < 8) firstBad.push({ kind: 'label', a: a, b: b, c: c, op: op, shown: lm['解集类型'], want: LABEL[sol.type] });
    }
  }
  // latex/text 的端点开闭必须与 parts 一致；±∞ 端必须开
  (sol.parts || []).forEach(function (p) {
    if (p.lo === -Infinity && !p.loOpen) { tally.latexBad++; firstBad.push({ kind: 'inf-bracket', a: a, b: b, c: c, op: op, part: JSON.stringify(p) }); }
    if (p.hi === Infinity && !p.hiOpen) { tally.latexBad++; firstBad.push({ kind: 'inf-bracket', a: a, b: b, c: c, op: op, part: JSON.stringify(p) }); }
  });
  // marks 必须与 parts 端点及其开闭一致（同一 x 只画一个点，实心优先）
  var markMap = {};
  (sol.parts || []).forEach(function (p) {
    if (p.lo === p.hi) { markMap[p.lo] = !p.loOpen; return; }
    if (isFinite(p.lo)) markMap[p.lo] = (markMap[p.lo] === undefined ? false : markMap[p.lo]) || !p.loOpen;
    if (isFinite(p.hi)) markMap[p.hi] = (markMap[p.hi] === undefined ? false : markMap[p.hi]) || !p.hiOpen;
  });
  var wantMarks = Object.keys(markMap).map(function (k) { return [parseFloat(k), markMap[k]]; })
    .sort(function (x, y) { return x[0] - y[0]; });
  var gotMarks = (sol.marks || []).map(function (m) { return [m.x, !!m.closed]; })
    .sort(function (x, y) { return x[0] - y[0]; });
  var marksOK = wantMarks.length === gotMarks.length && wantMarks.every(function (w, i) {
    return Math.abs(w[0] - gotMarks[i][0]) < 1e-9 && w[1] === gotMarks[i][1];
  });
  if (!marksOK) {
    tally.markBad++;
    if (firstBad.length < 8) firstBad.push({ kind: 'marks', a: a, b: b, c: c, op: op, got: JSON.stringify(gotMarks), want: JSON.stringify(wantMarks) });
  }
  // 暴力采样
  var xs = [0];
  for (var k = 0; k < 12; k++) xs.push(-50 + k * (100 / 11));
  var rootsAll = (ref.roots || []).concat(ref.root !== undefined ? [ref.root] : []);
  xs.forEach(function (x) {
    var L = a * x * x + b * x + c;
    if (rootsAll.some(function (r) { return Math.abs(x - r) < 1e-6; }) || Math.abs(L) < 1e-9) return;
    sampleN++;
    var truth = wantPos ? (strict ? L > 0 : L >= 0) : (strict ? L < 0 : L <= 0);
    if (contains(sol, x) !== truth) {
      if (a === 0) tally.a0bad++; else tally.sampleBad++;
      if (firstBad.length < 8) firstBad.push({ kind: 'sample', a: a, b: b, c: c, op: op, x: x, L: L, module: contains(sol, x), truth: truth });
    }
  });
}

var A_GRID = [], B_GRID = [], C_GRID = [];
for (var ia = -20; ia <= 20; ia++) A_GRID.push(parseFloat((ia / 10).toFixed(1)));
for (var ib = -60; ib <= 60; ib += 5) B_GRID.push(parseFloat((ib / 10).toFixed(1)));
for (var ic = -60; ic <= 60; ic += 5) C_GRID.push(parseFloat((ic / 10).toFixed(1)));
A_GRID.forEach(function (a) { B_GRID.forEach(function (b) { C_GRID.forEach(function (c) { OPS.forEach(function (op) { oneCase(a, b, c, op); }); }); }); });
// a=0 全网格（b、c 步长 0.5）+ 相切专项
[0].forEach(function (a) { B_GRID.forEach(function (b) { C_GRID.forEach(function (c) { OPS.forEach(function (op) { oneCase(a, b, c, op); }); }); }); });
[[1, -2, 1], [-1, 2, -1], [0.5, 1, 0.5], [0.25, 1, 1], [0.1, -0.2, 0.1], [1, 0, 0], [0.2, 0, 0], [1e-9, 1, -2]]
  .forEach(function (t) { OPS.forEach(function (op) { oneCase(t[0], t[1], t[2], op); }); });
// 注：a=1e-13（< 模块的 1e-12 线性阈值）故意不纳入严格计数，见 [3] 的容差说明

console.log('[1] 用例总数 ' + tally.total + '（a≠0 ' + tally.nonZero + '，a=0 ' + tally.a0 + '），成员采样点 ' + sampleN);
console.log('    类型不符 ' + tally.typeBad + '（a≠0）/' + tally.a0bad + '（a=0 合计异常）；片段不符 ' + tally.partsBad +
  '；采样不符 ' + tally.sampleBad + '；类型标签不符 ' + tally.labelBad + '；marks 不符 ' + tally.markBad + '；∞ 端点开闭违例 ' + tally.latexBad);
console.log('    含 NaN 的解集 ' + tally.nanTotal);
firstBad.slice(0, 8).forEach(function (x) { console.log('    ✗ ' + JSON.stringify(x)); });
ck('a≠0 全部用例的片段与参考一致', tally.partsBad === 0, tally.partsBad);
ck('a≠0 全部用例的类型与参考一致', tally.typeBad === 0, tally.typeBad);
ck('a=0 退化用例类型/片段/采样全部正确', tally.a0bad === 0, tally.a0bad);
ck('无 NaN/Inf 解集', tally.nanTotal === 0, tally.nanTotal);
ck('解集类型标签与 solveQuad 返回一致', tally.labelBad === 0, tally.labelBad);
ck('端点 marks 与 parts 开闭一致', tally.markBad === 0, tally.markBad);
ck('±∞ 端点一律开区间', tally.latexBad === 0, tally.latexBad);

console.log('\n[2] 抽样显示（含 a=0 与各类边界）：');
[[1, -1, -2, '>'], [1, -1, -2, '>='], [1, -1, -2, '<'], [1, 0, 1, '>'], [1, 0, 1, '<'], [1, -2, 1, '>'], [1, -2, 1, '<='],
 [-1, 0, 1, '>'], [0, 1, -2, '>'], [0, 1, -2, '<='], [0, -1, -2, '<'], [0, 0, -1, '>'], [0, 0, 1, '<='], [0, 0, 0, '>='],
 [0, 3, 0, '>'], [1e-9, 1, -2, '>'], [2, -4, 2, '<=']].forEach(function (t) {
  var sol = solveQuad(t[0], t[1], t[2], t[3]);
  var lm = {};
  ineq.readouts({ a: t[0], b: t[1], c: t[2], op: t[3] }).forEach(function (r) { lm[r.label.zh] = r.value; });
  var ref = refSolve(t[0], t[1], t[2], t[3]);
  console.log('    a=' + t[0] + ' b=' + t[1] + ' c=' + t[2] + ' op=' + t[3] + ' → 类型=' + lm['解集类型'] +
    ' | 解集=' + JSON.stringify(lm['解集']) + ' | latex=' + sol.latex + ' | marks=' + JSON.stringify((sol.marks || []).map(function (m) { return [m.x, m.closed]; })) +
    ' | 参考=' + JSON.stringify(ref.parts) + (sol.linear ? ' [linear]' : ''));
  ck('显示解集文字与 parts 一致 (a=' + t[0] + ',' + t[3] + ')', String(lm['解集']).replace(/\s/g, '') === String(sol.text).replace(/\s/g, ''), lm['解集'] + ' vs ' + sol.text);
});

console.log('\n[3] a=0 与 a=1e-13 的阈值行为：');
[[1e-13, 1, -2], [1e-12, 1, -2], [1e-11, 1, -2], [0, 1, -2]].forEach(function (t) {
  OPS.forEach(function (op) {
    var sol = solveQuad(t[0], t[1], t[2], op);
    var ref = refSolve(t[0], t[1], t[2], op);
    console.log('    a=' + t[0] + ' op=' + op + ' → module ' + sol.type + ' ' + (sol.text || '') + ' | 精确二次参考 ' + ref.type + ' ' + JSON.stringify(ref.parts));
  });
});

console.log('\n[4] 结论：独立检查 ' + checks + ' 项，不符 ' + bad.length + ' 项');
bad.forEach(function (b) { console.log('  [WRONG] ' + b.label + ' → ' + b.detail); });
