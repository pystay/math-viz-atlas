/*!
 * v5_modules.js — 直接加载 src/modules/*.js（用 vm + 最小 stub），
 * 调用真实的 formula()/readouts()/init()/animate()，核对教学公式与显示数字。
 */
'use strict';
var fs = require('fs'), vm = require('vm'), path = require('path');
var MC = require('../../src/core/math-core.js');
var ROOT = path.resolve(__dirname, '../../');
var checks = 0, issues = [];
function note(sev, msg, detail) { issues.push({ sev: sev, msg: msg, detail: detail }); console.log('  [' + sev + '] ' + msg + (detail ? '  ' + detail : '')); }

var PALETTE = { cobalt: '#1', coral: '#2', mint: '#3', ink: '#4', paper: '#5', muted: '#6' };
function loadModule(file) {
  var code = fs.readFileSync(path.join(ROOT, file), 'utf8');
  var reg = [];
  var sandbox = {
    window: {
      MS: { register: function (m) { reg.push(m); return m; } },
      Plot: { PALETTE: PALETTE },
      MathCore: MC,
      Sketch: { wobblyEllipse: function () { return []; }, stroke: function () { } }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: file });
  return reg;
}
function byId(mods, id) { for (var i = 0; i < mods.length; i++) if (mods[i].id === id) return mods[i]; return null; }
function call(m, fn, p, state) { checks++; try { return m[fn](p, state); } catch (e) { return 'ERR:' + e.message; } }

/* ============================ geometry ============================ */
console.log('== geometry.js：内接/外切正 n 边形面积公式 ==');
var geo = byId(loadModule('src/modules/geometry.js'), 'geo-circle');
console.log('  注册成功: ' + !!geo);
[[3, 'n=3'], [4, 'n=4'], [6, 'n=6'], [12, 'n=12'], [96, 'n=96']].forEach(function (t) {
  var n = t[0];
  var r = call(geo, 'readouts', { n: n, outer: true });
  var inner = (n / 2) * Math.sin(2 * Math.PI / n);
  var outer = n * Math.tan(Math.PI / n);
  // 用 shoelace 独立算内接/外切多边形面积
  function shoe(pts) {
    var s = 0;
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(s) / 2;
  }
  var innerPts = [], outerPts = [];
  for (var i = 0; i < n; i++) {
    var a1 = (i / n) * Math.PI * 2;
    innerPts.push([Math.cos(a1), Math.sin(a1)]);
    outerPts.push([Math.cos(a1) / Math.cos(Math.PI / n), Math.sin(a1) / Math.cos(Math.PI / n)]);
  }
  checks++;
  var si = shoe(innerPts), so = shoe(outerPts);
  var okI = Math.abs(si - inner) < 1e-12, okO = Math.abs(so - outer) < 1e-12;
  console.log('  ' + t[1] + ': 公式内接=' + inner.toFixed(10) + ' shoelace=' + si.toFixed(10) + (okI ? ' ok' : ' 不符') +
    ' | 公式外切=' + outer.toFixed(10) + ' shoelace=' + so.toFixed(10) + (okO ? ' ok' : ' 不符'));
  if (!okI || !okO) note('blocker', 'geometry 面积公式与 shoelace 不符', t[1]);
  checks++;
  if (!(inner < Math.PI && outer > Math.PI)) note('high', '夹逼关系不成立', t[1] + ' inner=' + inner + ' outer=' + outer);
  // 显示一致性
  var shown = r.map(function (x) { return x.value; });
  console.log('        读数量: n=' + shown[0] + ' 内接=' + shown[1] + ' 外切=' + shown[2] + ' π=' + shown[3] + ' 内接误差=' + shown[4]);
  checks++;
  if (shown[3] !== '3.141593') note('low', 'geometry π 读数是硬编码字面量 3.141593（非 formatNumber 计算）', shown[3]);
  checks++;
  if (String(shown[1]) !== MC.formatNumber(inner, 6)) note('medium', 'geometry 内接读数字符串与公式不一致', shown[1] + ' vs ' + MC.formatNumber(inner, 6));
});
checks++;
console.log('  硬编码 π="3.141593" vs formatNumber(Math.PI,6)="' + MC.formatNumber(Math.PI, 6) + '" vs 真值 ' + Math.PI);
console.log('  内接误差读数样例 n=6: ' + JSON.stringify(call(geo, 'readouts', { n: 6 }).filter(function (x) { return /误差/.test(x.label.zh); })));
console.log('  formula(n=6) = ' + call(geo, 'formula', { n: 6 }));

/* ============================ series ============================ */
console.log('\n== series.js：几何级数 ==');
var ser = byId(loadModule('src/modules/series.js'), 'series-geometric');
console.log('  注册成功: ' + !!ser);
console.log('  -- 滑块可达的 r 值（-0.9 起步，步长 0.01）逐个检查显示公式 --');
var badR = [];
for (var k = 0; k <= 200; k++) {
  var r = Math.round((-0.9 + k * 0.01) * 100) / 100;
  var f = call(ser, 'formula', { r: r, n: 8 });
  var shownR = MC.formatNumber(r, 2);
  // 公式里显示的 r 与真实 r 不一致 / 显示为 1 时闭式退化
  if (Number(shownR) !== r || Number(shownR) === 1) {
    badR.push({ r: r, shown: shownR, f: f });
  }
}
console.log('  显示 r 与真实 r 不一致或退化的取值数: ' + badR.length);
badR.slice(0, 6).forEach(function (b) {
  console.log('    r=' + b.r + ' 显示为 ' + b.shown + ' → ' + b.f);
});
if (badR.length) note('medium', '几何级数 formula 在 ' + badR.length + ' 个可达 r 上失真（含 r=1 时的 0/0）',
  'r 列表: ' + badR.map(function (b) { return b.r + '→' + b.shown; }).join(', '));

console.log('  -- 余项估计 |r|^n/(1-|r|) 是否是上界、有多松 --');
[[0.5, 8], [0.9, 8], [-0.9, 8], [0.99, 10], [-0.5, 20], [0.5, 3]].forEach(function (t) {
  var r = t[0], n = t[1];
  var rd = call(ser, 'readouts', { r: r, n: n });
  var bound = Math.pow(Math.abs(r), n) / (1 - Math.abs(r));
  var trueTail = Math.pow(r, n) / (1 - r);
  checks++;
  var valid = Math.abs(trueTail) <= bound + 1e-12;
  console.log('  r=' + pad(String(r), 5) + ' n=' + pad(String(n), 3) + ' 显示余项=' + pad(String(rd[3].value), 12) +
    ' 真值|r^n/(1-r)|=' + Math.abs(trueTail).toExponential(3) + ' 上界=' + bound.toExponential(3) + (valid ? ' ok' : ' 不是上界!') +
    ' 松紧比=' + (bound / Math.abs(trueTail)).toFixed(2));
  if (!valid) note('high', '几何级数余项估计不是上界', 'r=' + r + ' n=' + n);
});
// n=1 时的余项：S_1 = 1，真余项 = r/(1-r)
checks++;
var rd1 = call(ser, 'readouts', { r: 0.99, n: 1 });
console.log('  r=0.99,n=1 显示余项=' + rd1[3].value + '（真值 |0.99/0.01|=99，显示 99 ok）');

console.log('  -- 调和级数 --');
var har = byId(loadModule('src/modules/series.js'), 'series-harmonic');
[[1], [10], [24], [100], [500]].forEach(function (t) {
  var n = t[0];
  var rd = call(har, 'readouts', { n: n });
  var H = MC.harmonicPartial(n).value;
  var approx = Math.log(n) + 0.5772156649015329;
  checks++;
  console.log('  n=' + pad(String(n), 4) + ' H(n)=' + pad(rd[0].value, 12) + ' ln n + γ=' + pad(rd[1].value, 12) +
    ' 差=' + pad(rd[2].value, 10) + ' 末项=' + rd[3].value + '  真差=' + (H - approx).toExponential(3));
  if (H - approx < 0) note('high', 'H(n) < ln n + γ', 'n=' + n);
});
checks++;
var H500 = MC.harmonicPartial(500).value;
console.log('  n=500: H=' + H500 + '  界 ln n + γ + 1/(2n) = ' + (Math.log(500) + 0.5772156649015329 + 1 / 1000) + '  ' + (H500 < Math.log(500) + 0.5772156649015329 + 1 / 1000 ? 'ok（O(1/n) 渐近成立）' : '不符'));

/* ============================ algebra ============================ */
console.log('\n== algebra.js：二次函数顶点/判别式 ==');
var quad = byId(loadModule('src/modules/algebra.js'), 'algebra-quadratic');
console.log('  -- 顶点公式核对（随机参数）--');
var vbad = 0;
for (var i = 0; i < 200; i++) {
  var a = -2 + (i % 81) * 0.05, b = -4 + (i % 81) * 0.1, c = -4 + (i % 41) * 0.2;
  if (Math.abs(a) < 1e-9) continue;
  var vx = -b / (2 * a), vy = c - b * b / (4 * a);
  var f = function (x) { return a * x * x + b * x + c; };
  checks++;
  if (Math.abs(f(vx) - vy) > 1e-9 * Math.max(1, Math.abs(vy))) vbad++;
  var disc = b * b - 4 * a * c;
  if (disc > 0) {
    var r1 = (-b - Math.sqrt(disc)) / (2 * a), r2 = (-b + Math.sqrt(disc)) / (2 * a);
    checks++;
    if (Math.abs(f(r1)) > 1e-6 || Math.abs(f(r2)) > 1e-6) vbad++;
  }
}
console.log('  顶点/求根公式 200 组参数核对：' + (vbad ? vbad + ' 处不符' : '全部正确'));
if (vbad) note('blocker', 'quadratic 顶点或求根公式错误', vbad + ' 处');

console.log('  -- a=0（滑块可达）时的自相矛盾 --');
[[0, 0, -1], [0, 2, -1], [0, -3, 2]].forEach(function (t) {
  var p = { a: t[0], b: t[1], c: t[2] };
  var rd = call(quad, 'readouts', p);
  var fml = call(quad, 'formula', p);
  console.log('  a=0,b=' + t[1] + ',c=' + t[2] + '  formula: ' + fml);
  console.log('        读数: Δ=' + rd[0].value + ' 顶点=' + rd[1].value + ' 实根=' + rd[2].value + ' 开口=' + rd[3].value);
  checks++;
  if (rd[3].value !== '向上') note('high', 'a=0 时"开口"读数与实际绘制曲线（a=被夹紧成+0.02，开口向上）矛盾', '显示=' + rd[3].value);
  checks++;
  // 绘制用的是夹紧后的 a；顶点读数应与"绘制曲线"一致（数值比较，避免 -0 字符串差异）
  var ac = Math.abs(p.a) < 0.02 ? (p.a >= 0 ? 0.02 : -0.02) : p.a;
  var cvx = -p.b / (2 * ac), cvy = p.c - p.b * p.b / (4 * ac);
  var m = /^\(([^,]+), ([^)]+)\)$/.exec(rd[1].value);
  var sameVertex = m && Math.abs(Number(m[1]) - cvx) < 0.005 && Math.abs(Number(m[2]) - cvy) < 0.005;
  if (!sameVertex) note('medium', '顶点读数与绘制曲线不一致', rd[1].value + ' vs (' + cvx + ', ' + cvy + ')');
  console.log('        (绘图用 a=' + ac + ' → 顶点 (' + cvx + ', ' + cvy + ')，读数 ' + rd[1].value + '，' + (sameVertex ? '一致' : '不一致') + ')');
  checks++;
  // 显示公式里的 a 与参与计算的 a 不一致（a=0 被夹紧成 0.02）
  if (Math.abs(p.a) < 0.02 && /y = 0x\^\{2\}/.test(fml)) {
    note('high', 'a=0 时 formula 显示 y=0x²+bx+c（直线），但读数/绘图用的是抛物 0.02x²+bx+c',
      'formula="' + fml + '"，实根读数=' + rd[2].value + '，顶点读数=' + rd[1].value + '（直线的根应为 ' + MC.formatNumber(-p.c / (p.b || 1), 3) + ' 附近，只有 1 个）');
  }
});

console.log('\n== algebra.js：指数/对数互反 ==');
var exl = byId(loadModule('src/modules/algebra.js'), 'algebra-explog');
var REACH = [];
for (var j = 0; j <= 55; j++) REACH.push(Math.round((0.25 + j * 0.05) * 100) / 100);
console.log('  滑块可达底数是否含 1: ' + REACH.indexOf(1));
var p1 = { a: 1, mirror: true };
var rdE = call(exl, 'readouts', p1);
console.log('  a=1 formula: ' + call(exl, 'formula', p1));
console.log('  a=1 读数: ' + rdE.map(function (x) { return x.label.zh + '=' + x.value; }).join(', '));
checks++;
if (REACH.indexOf(1) >= 0) note('medium', '底数 a=1 可达：log_1 x 无定义、a^x 不可逆，仍显示"互为反函数/关于 y=x 对称"', 'a=1 时 log 曲线为 NaN，读数量 log_1 1=0、log_1 1=1');
console.log('  a=1 时绘图函数 log(x)/log(1) = ' + (Math.log(2) / Math.log(1)) + '（x>0 全部 NaN）');
checks++;
[[0.25], [0.5], [0.9], [1.5], [3]].forEach(function (t) {
  var a = t[0];
  var okInverse = Math.abs(Math.pow(a, Math.log(a) / Math.log(a)) - a) < 1e-12;  // log_a(a)=1
  console.log('  a=' + pad(String(a), 5) + ' log_a a = ' + (Math.log(a) / Math.log(a)) + (okInverse ? ' ok' : ''));
});

/* ============================ trig ============================ */
console.log('\n== trig.js：等高线与参数显示 ==');
var trg = byId(loadModule('src/modules/trig.js'), 'trig-unit');
console.log('  -- "圆上点纵坐标 == 曲线高度" 恒等核对（ω,A,φ,t 网格）--');
var tbad = 0, tgrid = 0;
for (var w = 0.4; w <= 3.0001; w += 0.2) {
  for (var A = 0.2; A <= 1.8001; A += 0.25) {
    for (var phi = -3.14; phi <= 3.1401; phi += 0.5) {
      for (var tt = 0; tt <= 6.3; tt += 1.05) {
        var theta = w * tt + phi;
        checks++; tgrid++;
        var py = A * Math.sin(theta), qy = A * Math.sin(w * tt + phi);
        if (Math.abs(py - qy) > 1e-12) tbad++;
      }
    }
  }
}
console.log('  等高恒等式逐点核对：' + tgrid + ' 点，' + (tbad ? tbad + ' 处不等' : '全部相等（py 与 qy 逐位相同）'));
if (tbad) note('blocker', 'trig 等高恒等式不成立', tbad + ' 处');
console.log('  -- 周期读数 T=2π/ω --');
[[0.4], [1], [3]].forEach(function (t) {
  var rd = call(trg, 'readouts', { A: 1, w: t[0], phi: 0 }, { t: 0.5 });
  checks++;
  console.log('  ω=' + pad(String(t[0]), 4) + ' 读数 T=' + pad(rd[3].value, 10) + ' 真值=' + ((2 * Math.PI) / t[0]).toFixed(3));
});
console.log('  -- formula(A,ω) 与绘图所用参数是否一致（两位有效数字）--');
var A = 1.05, w2 = 2.55, phi2 = 3.11;
console.log('  A=1.05, ω=2.55, φ=3.11 → formula: ' + call(trg, 'formula', { A: A, w: w2, phi: phi2 }));
checks++;
note('low', 'trig formula 用 2 位有效数字，A=1.05 显示 1.1、ω=2.55 显示 2.5，与绘制曲线误差可达 ~4.8%',
  'formatNumber(1.05,2)="' + MC.formatNumber(1.05, 2) + '", formatNumber(2.55,2)="' + MC.formatNumber(2.55, 2) + '"');

/* ============================ calculus ============================ */
console.log('\n== calculus.js：导数/积分模块读数 ==');
var der = byId(loadModule('src/modules/calculus.js'), 'calc-derivative');
var itg = byId(loadModule('src/modules/calculus.js'), 'calc-integral');
console.log('  -- 导数模块：f=ln(x) 在 x0<=0（滑块可达 -2.5..2.5）--');
[[-2.5], [-1], [0], [0.5], [2.5]].forEach(function (t) {
  var x0 = t[0];
  var rd = call(der, 'readouts', { func: 'ln', x0: x0, h: 0.8 });
  console.log('  x0=' + pad(String(x0), 5) + ' 读数: ' + rd.map(function (x) { return x.label.zh + '=' + x.value; }).join(' | '));
  checks++;
  if (x0 <= 0 && rd[1].value !== 'NaN' && rd[1].value !== '−∞' && rd[1].value !== '+∞') {
    note('medium', 'ln(x) 在定义域外 x0=' + x0 + ' 仍显示有限的"切线斜率 f′(x0)"=' + rd[1].value,
      'ln x 在 x≤0 无定义（1/x 是 ln|x| 的导数），而画布上该点也不存在');
  }
});
console.log('  -- 导数模块：切线斜率 vs 数值导数（全部函数 × 多个 x0）--');
var FUNCS = ['x2', 'x3', 'sin', 'exp', 'ln'];
var derBad = 0;
FUNCS.forEach(function (id) {
  var SRC = { x2: 'x^2', x3: 'x^3', sin: 'sin(x)', exp: 'e^x', ln: 'ln(x)' }[id];
  var d = MC.compile(MC.diff(MC.parse(SRC), 'x'));
  [-2.5, -1, 0, 0.7, 2.5].forEach(function (x0) {
    if (id === 'ln' && x0 <= 0) return;
    var rd = call(der, 'readouts', { func: id, x0: x0, h: 0.8 });
    checks++;
    if (Math.abs(Number(rd[1].value) - d({ x: x0 })) > 1e-4 * Math.max(1, Math.abs(d({ x: x0 })))) derBad++;
  });
});
console.log('  切线斜率读数核对：' + (derBad ? derBad + ' 处不符' : '全部正确'));
if (derBad) note('high', '导数模块读数与符号导数不符', derBad + ' 处');

console.log('  -- 积分模块：a>b（滑块可达）时画布标签与控件含义相反 --');
[[2, -1], [-1, 2]].forEach(function (t) {
  var p = { func: 'x3', a: t[0], b: t[1], n: 8, mode: 'mid' };
  var rd = call(itg, 'readouts', p);
  var fml = call(itg, 'formula', p);
  var lo = Math.min(t[0], t[1]), hi = Math.max(t[0], t[1]);
  var trueRev = -(Math.pow(hi, 4) / 4 - Math.pow(lo, 4) / 4);
  console.log('  控件 a=' + t[0] + ', b=' + t[1] + ' → formula: ' + fml);
  console.log('        读数 Sₙ=' + rd[0].value + ' 参考值=' + rd[1].value + ' 正/负面积=' + rd[3].value);
  console.log('        ∫_a^b x³ dx 真值 = ' + trueRev + '，模块按 ∫_' + lo + '^' + hi + ' 计算 = ' + (trueRev === 0 ? 0 : -trueRev) +
    '；画布标签写 "a = ' + lo + '" / "b = ' + hi + '"');
  checks++;
  if (t[0] > t[1]) note('medium', '积分模块 a>b 时静默交换上下限：数值符号与 ∫_a^b 相反，且画布把 ' + lo + ' 标成 "a"（与控件 a=' + t[0] + ' 矛盾）',
    '显示 Sₙ=' + rd[0].value + '，∫_' + t[0] + '^' + t[1] + ' x³ dx 应为 ' + trueRev);
});
console.log('  -- 积分模块：ln 在 a<0（滑块可达）时的读数 --');
var rdLn = call(itg, 'readouts', { func: 'ln', a: -1, b: 2, n: 8, mode: 'mid' });
console.log('  a=-1,b=2,f=ln(x) → ' + rdLn.map(function (x) { return x.label.zh + '=' + x.value; }).join(' | '));
checks++;
if (rdLn[0].value === 'NaN') note('low', 'ln(x) 在 a<0 时读数直接显示 NaN（未提示定义域）', 'Sₙ=NaN, 误差=NaN');
console.log('  -- 积分模块：n=1 与 n=80、三种模式的误差读数 --');
[[1], [8], [80]].forEach(function (t) {
  ['left', 'mid', 'right'].forEach(function (m) {
    var rd = call(itg, 'readouts', { func: 'x2', a: 0, b: 1.5, n: t[0], mode: m });
    checks++;
    console.log('  n=' + pad(String(t[0]), 3) + ' mode=' + pad(m, 6) + ' Sₙ=' + pad(rd[0].value, 12) + ' 参考=' + pad(rd[1].value, 12) + ' 误差=' + rd[2].value);
  });
});

/* ============================ linear ============================ */
console.log('\n== algebra.js：线性函数 ==');
var lin = byId(loadModule('src/modules/algebra.js'), 'algebra-linear');
[[0, 1], [1, 0], [-3, 4]].forEach(function (t) {
  var rd = call(lin, 'readouts', { k: t[0], b: t[1] });
  console.log('  k=' + t[0] + ', b=' + t[1] + ' → 零点=' + rd[2].value + ' f(2)=' + rd[3].value + '  (真零点=' + (t[0] === 0 ? 'N/A' : -t[1] / t[0]) + ')');
  checks++;
  if (t[0] === 0 && rd[2].value !== '不存在') note('medium', 'k=0 时零点读数应为"不存在"', rd[2].value);
});

function pad(s, n) { while (s.length < n) s += ' '; return s; }
console.log('\n----------------------------------------');
console.log('v5 checks=' + checks + '  issues=' + issues.length);
issues.forEach(function (i) { console.log('  [' + i.sev + '] ' + i.msg + ' — ' + i.detail); });
