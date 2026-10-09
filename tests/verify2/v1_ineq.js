/*!
 * tests/verify2/v1_ineq.js — 一元二次不等式解集：solveQuad vs 独立解析解 + 暴力采样
 *
 * 加载真实的 src/modules/algebra2.js，把闭包内的 solveQuad 在内存中导出
 * （只在源码字符串末尾追加导出语句，磁盘文件未改动）。
 *
 * 运行：node tests/verify2/v1_ineq.js
 */
'use strict';
var H = require('./harness.js');
var MC = H.MC;

var mods = H.loadModule('src/modules/algebra2.js', 'root.__export = { solveQuad: solveQuad };');
var solveQuad = mods.__exports.solveQuad;
var ineq = H.byId(mods, 'algebra-inequality');
console.log('solveQuad 导出:', typeof solveQuad, '| 模块注册:', !!ineq);

var OPS = ['>', '>=', '<', '<='];
var strictOf = function (op) { return op === '>' || op === '<'; };
var wantPosOf = function (op) { return op === '>' || op === '>='; };

/** 独立参考解（从定义重写，不看源码）。返回 {type, intervals, root, roots} */
function refSolve(a, b, c, op) {
  var strict = strictOf(op), wantPos = wantPosOf(op);
  if (a === 0) {
    if (b === 0) {
      var t = wantPos ? (strict ? c > 0 : c >= 0) : (strict ? c < 0 : c <= 0);
      return t ? { type: 'all', intervals: [[-Infinity, Infinity]] } : { type: 'empty', intervals: [] };
    }
    var r = -c / b;
    var growsPositive = b > 0;
    if (growsPositive === wantPos) return { type: 'halfline', intervals: [[strict ? r : r, Infinity]], root: r, strict: strict, openEnd: r, side: 'right' };
    return { type: 'halfline', intervals: [[-Infinity, r]], root: r, strict: strict, openEnd: r, side: 'left' };
  }
  var disc = b * b - 4 * a * c;
  var TOL = 1e-9;
  if (disc < -TOL) {
    var whole = (a > 0) === wantPos;
    return whole ? { type: 'all', intervals: [[-Infinity, Infinity]] } : { type: 'empty', intervals: [] };
  }
  var sq = Math.sqrt(Math.max(0, disc));
  var r1 = (-b - sq) / (2 * a), r2 = (-b + sq) / (2 * a);
  if (r1 > r2) { var tmp = r1; r1 = r2; r2 = tmp; }
  if (Math.abs(disc) <= TOL) {
    var rr = (r1 + r2) / 2;
    if ((a > 0) === wantPos) {
      return strict ? { type: 'punctured', intervals: [[-Infinity, rr], [rr, Infinity]], root: rr }
                    : { type: 'all', intervals: [[-Infinity, Infinity]] };
    }
    return strict ? { type: 'empty', intervals: [] } : { type: 'point', intervals: [[rr, rr]], root: rr };
  }
  var outside = a > 0;
  if (wantPos === outside) return { type: 'union', intervals: [[-Infinity, r1], [r2, Infinity]], roots: [r1, r2] };
  return { type: 'interval', intervals: [[r1, r2]], roots: [r1, r2] };
}

/** 模块解集的成员判定（按 type + op 语义，与 solveQuad 的返回结构对应） */
function moduleContains(sol, op, x) {
  var strict = strictOf(op);
  switch (sol.type) {
    case 'all': return true;
    case 'empty': return false;
    case 'point': return x === sol.root;
    case 'punctured': return x !== sol.root;
    case 'union': return strict ? (x < sol.roots[0] || x > sol.roots[1]) : (x <= sol.roots[0] || x >= sol.roots[1]);
    case 'interval': return strict ? (x > sol.roots[0] && x < sol.roots[1]) : (x >= sol.roots[0] && x <= sol.roots[1]);
  }
  return false;
}
/** 参考解集的成员判定 */
function refContains(ref, op, x) {
  var strict = strictOf(op), wantPos = wantPosOf(op);
  if (ref.type === 'all') return true;
  if (ref.type === 'empty') return false;
  if (ref.type === 'point') return x === ref.root;
  if (ref.type === 'punctured') return x !== ref.root;
  if (ref.type === 'halfline') {
    return ref.side === 'right' ? (strict ? x > ref.openEnd : x >= ref.openEnd)
                               : (strict ? x < ref.openEnd : x <= ref.openEnd);
  }
  void wantPos;
  if (ref.type === 'union') return strict ? (x < ref.roots[0] || x > ref.roots[1]) : (x <= ref.roots[0] || x >= ref.roots[1]);
  return strict ? (x > ref.roots[0] && x < ref.roots[1]) : (x >= ref.roots[0] && x <= ref.roots[1]);
}

function sameIntervals(mi, ri) {
  if (mi.length !== ri.length) return false;
  for (var i = 0; i < mi.length; i++) {
    if (!(Math.abs(mi[i][0] - ri[i][0]) < 1e-9 || (mi[i][0] === -Infinity && ri[i][0] === -Infinity))) return false;
    if (!(Math.abs(mi[i][1] - ri[i][1]) < 1e-9 || (mi[i][1] === Infinity && ri[i][1] === Infinity))) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ 主扫描 */
var mismatchType = [], mismatchSample = [], mismatchInterval = [], nanCases = [], a0Cases = [], nearTangent = [];
var cases = 0, sampleCount = 0;
var tally = {
  aNonZero: 0, aNonZeroTypeBad: 0, aNonZeroIntervalBad: 0, aNonZeroSampleBad: 0,
  aZero: 0, aZeroTypeBad: 0, aZeroSampleBad: 0, nanTotal: 0
};
function fmtSol(s) {
  function n(v) { return v === Infinity ? '+Inf' : v === -Infinity ? '-Inf' : (typeof v === 'number' && isNaN(v) ? 'NaN' : v); }
  return '{type:' + s.type + ', intervals:' + JSON.stringify((s.intervals || []).map(function (iv) { return [n(iv[0]), n(iv[1])]; })) +
    ', roots:' + JSON.stringify((s.roots || []).map(n)) + ', root:' + n(s.root) + ', latex:"' + s.latex + '"}';
}

function oneCase(a, b, c, op) {
  cases++;
  var sol = solveQuad(a, b, c, op);
  var ref = refSolve(a, b, c, op);
  var hasNaN = (sol.intervals || []).some(function (iv) { return isNaN(iv[0]) || isNaN(iv[1]); }) ||
    (sol.root !== undefined && isNaN(sol.root)) ||
    (sol.roots && sol.roots.some(function (r) { return isNaN(r); }));
  if (hasNaN) {
    tally.nanTotal++;
    if (nanCases.length < 6) nanCases.push({ a: a, b: b, c: c, op: op, sol: fmtSol(sol) });
  }
  if (a === 0) {
    tally.aZero++;
    a0Cases.push({ a: a, b: b, c: c, op: op, got: sol.type, want: ref.type, latex: sol.latex });
  } else { tally.aNonZero++; }
  var disc = b * b - 4 * a * c;
  if (a !== 0 && disc !== 0 && Math.abs(disc) < 1e-9) {
    if (nearTangent.length < 5) nearTangent.push({ a: a, b: b, c: c, disc: disc, got: sol.type, want: ref.type });
  }
  var typeOK = (sol.type === ref.type);
  if (!typeOK) {
    if (a === 0) tally.aZeroTypeBad++; else tally.aNonZeroTypeBad++;
    if (mismatchType.length < 10) mismatchType.push({ a: a, b: b, c: c, op: op, got: sol.type, want: ref.type });
  }
  if (a !== 0 && sol.intervals && ref.intervals && sol.type !== 'all' && sol.type !== 'empty' &&
      !sameIntervals(sol.intervals, ref.intervals)) {
    tally.aNonZeroIntervalBad++;
    if (mismatchInterval.length < 10) {
      mismatchInterval.push({ a: a, b: b, c: c, op: op, got: JSON.stringify(sol.intervals), want: JSON.stringify(ref.intervals) });
    }
  }
  // 暴力采样：避开根附近，避免边界歧义
  var xs = [0];
  for (var k = 0; k < 12; k++) xs.push(-50 + k * (100 / 11));
  var rootsAll = (sol.roots || []).concat(sol.root !== undefined ? [sol.root] : []);
  if (ref.roots) rootsAll = rootsAll.concat(ref.roots);
  if (ref.root !== undefined) rootsAll.push(ref.root);
  for (var i = 0; i < xs.length; i++) {
    var x = xs[i], L = a * x * x + b * x + c;
    var nearRoot = rootsAll.some(function (r) { return Math.abs(x - r) < 1e-6; });
    if (nearRoot || Math.abs(L) < 1e-9) continue;
    sampleCount++;
    var truth = wantPosOf(op) ? (strictOf(op) ? L > 0 : L >= 0) : (strictOf(op) ? L < 0 : L <= 0);
    var got = moduleContains(sol, op, x);
    var want = refContains(ref, op, x);
    if (got !== truth) {
      if (a === 0) tally.aZeroSampleBad++; else tally.aNonZeroSampleBad++;
      if (mismatchSample.length < 10) {
        mismatchSample.push({ a: a, b: b, c: c, op: op, x: x, L: L, module: got, truth: truth, ref: want, type: sol.type });
      }
    }
  }
}

var A_GRID = [], B_GRID = [], C_GRID = [];
for (var ia = -20; ia <= 20; ia++) A_GRID.push(parseFloat((ia / 10).toFixed(1)));
for (var ib = -60; ib <= 60; ib += 5) B_GRID.push(parseFloat((ib / 10).toFixed(1)));
for (var ic = -60; ic <= 60; ic += 5) C_GRID.push(parseFloat((ic / 10).toFixed(1)));

A_GRID.forEach(function (a) {
  B_GRID.forEach(function (b) {
    C_GRID.forEach(function (c) {
      OPS.forEach(function (op) { oneCase(a, b, c, op); });
    });
  });
});
console.log('主网格用例数 =', cases, '成员采样点 =', sampleCount);

/* 相切 / Δ=0 专项 */
[[1, -2, 1], [1, 2, 1], [-1, 2, -1], [-1, -2, -1], [0.5, 1, 0.5], [0.25, 1, 1], [2, 4, 2], [0.1, -0.2, 0.1], [1, 0, 0], [-1, 0, 0], [0.2, 0, 0]]
  .forEach(function (t) { OPS.forEach(function (op) { oneCase(t[0], t[1], t[2], op); }); });
console.log('含相切专项，累计用例数 =', cases);

/* ------------------------------------------------------- 输出发现 */
console.log('\n== A. a≠0 的类型/区间/采样一致性 ==');
console.log('  a≠0 用例 =', tally.aNonZero, '：类型不符', tally.aNonZeroTypeBad, '，区间不符', tally.aNonZeroIntervalBad, '，采样不符', tally.aNonZeroSampleBad);
console.log('  类型不一致样例数(截断) =', mismatchType.length);
mismatchType.forEach(function (x) { console.log('   ', JSON.stringify(x)); });
console.log('  区间不一致样例数(截断) =', mismatchInterval.length);
mismatchInterval.forEach(function (x) { console.log('   ', JSON.stringify(x)); });
console.log('  暴力采样不一致样例数(截断) =', mismatchSample.length);
mismatchSample.forEach(function (x) { console.log('   ', JSON.stringify(x)); });

console.log('\n== B. a = 0 退化情形 ==');
console.log('  a=0 用例总数 =', tally.aZero, '（类型不符 ' + tally.aZeroTypeBad + '，采样不符 ' + tally.aZeroSampleBad + '）');
a0Cases.slice(0, 8).forEach(function (x) { console.log('   ', JSON.stringify(x)); });
console.log('  NaN/Inf 解集总数 =', tally.nanTotal, '；样例：');
nanCases.forEach(function (x) { console.log('   ', JSON.stringify(x)); });

console.log('\n== C. |Δ| ∈ (0,1e-9) 的阈值敏感情形 ==');
nearTangent.forEach(function (x) { console.log('   ', JSON.stringify(x)); });

/* ------------------------------------------------- 模块 readouts 复核 */
console.log('\n== D. 模块 readouts 复核（a=0 与 ∞ 括号记号）==');
function ro(params) {
  var out = {};
  ineq.readouts(params).forEach(function (r) { out[r.label.zh] = r.value; });
  return out;
}
var cases0 = [[0, 1, -2, '>'], [0, 1, -2, '>='], [0, -1, -2, '<'], [0, 2, 3, '>'], [0, 0, -1, '>'], [0, 0, 1, '<='], [0, 3, 0, '>'], [1e-9, 1, -2, '>']];
cases0.forEach(function (t) {
  var r = ro({ a: t[0], b: t[1], c: t[2], op: t[3] });
  console.log('   a=' + t[0] + ' b=' + t[1] + ' c=' + t[2] + ' op=' + t[3] +
    ' → Δ=' + r['判别式 Δ'] + ' | 根=' + r['根的情况'] + ' | 类型=' + r['解集类型'] + ' | 解集=' + JSON.stringify(r['解集']));
});
console.log('\n   非严格不等式的 ∞ 端点记号（应为开括号）：');
[[1, -1, -2, '>='], [1, -1, -2, '<='], [-1, 0, 1, '<='], [1, 0, 1, '>=']].forEach(function (t) {
  var sol = solveQuad(t[0], t[1], t[2], t[3]);
  console.log('   a=' + t[0] + ' b=' + t[1] + ' c=' + t[2] + ' op=' + t[3] + ' → latex = ' + sol.latex);
});
console.log('\n   draw 内 a 的退化保护 vs solveQuad：a=0,b=2,c=-1 > 0');
console.log('   solveQuad(0,2,-1,">") =', JSON.stringify(solveQuad(0, 2, -1, '>')));

H.reset();
mismatchType.forEach(function (x) { H.note('wrong-math', x.got === 'all' || x.got === 'empty' ? 'medium' : (x.want === 'halfline' ? 'high' : 'medium'), '类型不一致', JSON.stringify(x)); });
nanCases.forEach(function (x) { H.note('wrong-math', 'high', 'a=0 时解集含 NaN/Inf', JSON.stringify(x)); });
mismatchSample.slice(0, 6).forEach(function (x) { H.note('wrong-math', 'blocker', '采样点判定与真值不符', JSON.stringify(x)); });
nearTangent.forEach(function (x) { H.note('fragile', 'low', 'Δ 阈值敏感', JSON.stringify(x)); });
console.log('\n[统计] 主检查用例 ' + cases + ' 个，采样点 ' + sampleCount + ' 个；' +
  'a=0 异常 ' + tally.aZeroTypeBad + '/' + tally.aZero + '，NaN 解集 ' + tally.nanTotal +
  '，a≠0 类型不符 ' + tally.aNonZeroTypeBad + '，区间不符 ' + tally.aNonZeroIntervalBad +
  '，采样不符 ' + tally.aNonZeroSampleBad + '，阈值敏感 ' + nearTangent.length);
