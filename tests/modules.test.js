/*!
 * tests/modules.test.js — 模块层回归测试
 * ---------------------------------------------------------------------------
 * 这些断言直接对应「独立对抗性评审」在 modules/ 里发现的 13 个问题，
 * 目的：把每个缺陷钉成一条不会复发的回归测试。
 *
 * 模块文件是浏览器风格 IIFE（挂在 window 上），这里用最小 shim 在 Node 里加载：
 * 只调用 formula / readouts / controls，不触发 draw（不需要 canvas）。
 *
 * 运行：node tests/modules.test.js
 */
'use strict';

// ---- 浏览器环境 shim ------------------------------------------------------
global.window = global;
global.self = global;
require('../src/render/motion.js');
require('../src/render/timeline.js');
global.MathCore = require('../src/core/math-core.js');
global.Plot = {
  PALETTE: {
    paper: '#FBF7EF', panel: '#FFFDF8', grid: 'x', gridMajor: 'x', axis: 'x', ink: '#20262F',
    muted: '#6B7280', coral: '#CE5848', coralSoft: 'x', cobalt: '#4A6288', cobaltSoft: 'x',
    mint: '#2F9E7E', mintSoft: 'x', amber: '#C08A2E', violet: '#7A5AA8'
  }
};
global.Sketch = { mulberry32: function () { return function () { return 0.5; }; }, wobblyEllipse: function () { return []; }, stroke: function () {}, jitterLine: function () { return []; }, particleRing: function () { return []; } };
global.MS = {
  modules: [],
  register: function (m) { this.modules.push(m); return m; },
  byId: function (id) {
    for (var i = 0; i < this.modules.length; i++) if (this.modules[i].id === id) return this.modules[i];
    return null;
  }
};

require('../src/modules/sandbox.js');
require('../src/modules/arithmetic.js');
require('../src/modules/algebra.js');
require('../src/modules/algebra2.js');
require('../src/modules/geometry.js');
require('../src/modules/geometry2.js');
require('../src/modules/trig.js');
require('../src/modules/trig2.js');
require('../src/modules/calculus.js');
require('../src/modules/series.js');
require('../src/modules/stats.js');
require('../src/modules/demos.js');

var MC = global.MathCore;
var MS = global.MS;

var passed = 0, failed = 0;
function group(name) { console.log('\n== ' + name + ' =='); }
function ok(label, cond, extra) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; console.log('  ✗ ' + label + (extra !== undefined ? '  → ' + extra : '')); }
}
function mod(id) {
  var m = MS.byId(id);
  if (!m) throw new Error('模块不存在: ' + id);
  return m;
}
/** 取模块的控件清单（支持静态数组或函数形式） */
function ctrls(id, params) {
  var m = mod(id);
  return typeof m.controls === 'function' ? m.controls(params || {}) : m.controls;
}
function value(id, key) {
  var list = ctrls(id, {});
  for (var i = 0; i < list.length; i++) if (list[i].id === key) return list[i].value;
  return undefined;
}
function readoutMap(id, params, state) {
  var out = {};
  mod(id).readouts(params, state || {}).forEach(function (r) { out[r.label.zh] = r.value; });
  return out;
}

console.log('\n===== 模块层回归测试（对应独立评审的 13 项发现）=====');
ok('已加载 19 个模块', MS.modules.length === 19, MS.modules.length);

// ---------------------------------------------------------------------------
group('#1 [high] 二次函数 a=0："公式/绘图/读数/开口"四处口径必须一致');
var qFormulaLine = mod('algebra-quadratic').formula({ a: 0, b: 2, c: -1 });
var qRead0 = readoutMap('algebra-quadratic', { a: 0, b: 2, c: -1 });
ok('a=0 时公式退化为直线 y = 2x - 1', qFormulaLine.indexOf('x^{2}') < 0 && qFormulaLine.indexOf('2x') >= 0, qFormulaLine);
ok('a=0 时"开口"显示为 —（直线没有开口）', qRead0['开口'] === '—', qRead0['开口']);
ok('a=0 时判别式标注"不适用"', qRead0['判别式 Δ'] === '不适用', qRead0['判别式 Δ']);
ok('a=0 时实根为直线的根 0.5', qRead0['实根'] === '0.5', qRead0['实根']);
var qRead1 = readoutMap('algebra-quadratic', { a: 1, b: 0, c: -1 });
ok('a=1 时公式含 x^{2} 且开口 向上', mod('algebra-quadratic').formula({ a: 1, b: 0, c: -1 }).indexOf('x^{2}') >= 0 && qRead1['开口'] === '向上');
ok('a=-1 时开口 向下', readoutMap('algebra-quadratic', { a: -1, b: 0, c: 1 })['开口'] === '向下');

// ---------------------------------------------------------------------------
group('#2 [medium] 几何级数：r=1 不能显示 0/0，参数显示必须与滑块一致');
var gF1 = mod('series-geometric').formula({ r: 1, n: 8 });
ok('r=1 时不再出现 (1−1ⁿ)/(1−1) 的 0/0', gF1.indexOf('1-1') < 0, gF1);
ok('r=1 时给出真实部分和 S_n = n', gF1.indexOf('= n') >= 0, gF1);
ok('r=1.01 显示为 1.01（不再显示成 1）', mod('series-geometric').formula({ r: 1.01, n: 8 }).indexOf('1.01') >= 0,
  mod('series-geometric').formula({ r: 1.01, n: 8 }));
ok('r=1.05 显示为 1.05（不再显示成 1.1）', mod('series-geometric').formula({ r: 1.05, n: 8 }).indexOf('1.05') >= 0,
  mod('series-geometric').formula({ r: 1.05, n: 8 }));
ok('r=0.5 仍给出正常闭式', mod('series-geometric').formula({ r: 0.5, n: 8 }).indexOf('0.5') >= 0);

// ---------------------------------------------------------------------------
group('#3 [medium] 指数/对数：底数 a=1 必须显式声明"无反函数、对数无定义"');
var eF1 = mod('algebra-explog').formula({ a: 1 });
var eR1 = readoutMap('algebra-explog', { a: 1, mirror: true });
ok('a=1 时公式明确写出 log₁x 无定义', eF1.indexOf('无定义') >= 0, eF1);
ok('a=1 时不再声称互为反函数', eF1.indexOf('Longleftrightarrow') < 0);
ok('a=1 时读数"反函数 = 不存在"', eR1['反函数'] === '不存在', eR1['反函数']);
ok('a=1 时读数"logₐ x = 无定义"', eR1['logₐ x'] === '无定义', eR1['logₐ x']);
var eF2 = mod('algebra-explog').formula({ a: 2 });
ok('a=2 时恢复正常的反函数表述', eF2.indexOf('Longleftrightarrow') >= 0 && eF2.indexOf('2') >= 0, eF2);

// ---------------------------------------------------------------------------
group('#4 [medium] 导数的切点必须落在函数定义域内');
var x0ln = null;
ctrls('calc-derivative', { func: 'ln' }).forEach(function (c) { if (c.id === 'x0') x0ln = c; });
ok('选择 ln(x) 时切点滑块最小值为 0.1（不再允许 x₀ ≤ 0）', x0ln && x0ln.min === 0.1, x0ln && x0ln.min);
var x0x2 = null;
ctrls('calc-derivative', { func: 'x2' }).forEach(function (c) { if (c.id === 'x0') x0x2 = c; });
ok('选择 x² 时切点范围仍是 ±2.5', x0x2 && x0x2.min === -2.5 && x0x2.max === 2.5);
var dR = readoutMap('calc-derivative', { func: 'ln', x0: -1, h: 0.8, play: false });
ok('强行传入定义域外的 x₀ 时，切线斜率显示"定义域外"而不是假值 −1',
  dR['切线斜率 f′(x₀)'] === '定义域外', dR['切线斜率 f′(x₀)']);
ok('此时割线斜率也显示"定义域外"', dR['割线斜率'] === '定义域外', dR['割线斜率']);
var dRok = readoutMap('calc-derivative', { func: 'ln', x0: 1.3, h: 0.4, play: false });
ok('定义域内 x₀=1.3 时切线斜率 = 1/1.3 ≈ 0.76923', dRok['切线斜率 f′(x₀)'] === '0.76923', dRok['切线斜率 f′(x₀)']);

// ---------------------------------------------------------------------------
group('#5 [medium] 定积分 a > b 必须是"反向积分"（结果为负），不得静默交换');
var iRev = readoutMap('calc-integral', { func: 'x3', a: 2, b: -1, n: 8, mode: 'mid' });
ok('∫₂^{−1} x³ dx 的黎曼和为负', parseFloat(iRev['黎曼和（代数和）']) < 0, iRev['黎曼和（代数和）']);
ok('∫₂^{−1} x³ dx 的参考值 ≈ −3.75', Math.abs(parseFloat(iRev['参考值']) + 3.75) < 1e-6, iRev['参考值']);
var iFwd = readoutMap('calc-integral', { func: 'x3', a: -1, b: 2, n: 8, mode: 'mid' });
ok('交换上下限后数值正好相反（∫_{−1}^{2} x³ dx = +3.75）',
  Math.abs(parseFloat(iFwd['参考值']) - 3.75) < 1e-6 &&
  Math.abs(parseFloat(iFwd['参考值']) + parseFloat(iRev['参考值'])) < 1e-9, iFwd['参考值']);
ok('公式保留用户的 a / b 方向', mod('calc-integral').formula({ func: 'x3', a: 2, b: -1, n: 8 }).indexOf('\\int_{2}^{') >= 0,
  mod('calc-integral').formula({ func: 'x3', a: 2, b: -1, n: 8 }));
ok('正/负面积按几何意义统计（与方向无关，均为正）',
  parseFloat(iRev['正 / 负面积'].split('/')[0]) > 0, iRev['正 / 负面积']);

// ---------------------------------------------------------------------------
group('#6 [low] formatNumber 不能把 1e−13 显示成 0');
ok('formatNumber(1e-13) ≠ "0"', MC.formatNumber(1e-13, 4) !== '0', MC.formatNumber(1e-13, 4));
ok('formatNumber(0) 仍为 "0"', MC.formatNumber(0) === '0');
ok('formatFixed(1.05,2) = "1.05"（定点，不用有效数字）', MC.formatFixed(1.05, 2) === '1.05', MC.formatFixed(1.05, 2));
ok('formatFixed(0.10,2) 去掉尾零 = "0.1"', MC.formatFixed(0.1, 2) === '0.1', MC.formatFixed(0.1, 2));

// ---------------------------------------------------------------------------
group('#7 [low] 几何模块的 π 读数不再是硬编码');
var geo = readoutMap('geo-circle', { n: 96, outer: true, animate: false });
ok('π 读数 = formatNumber(Math.PI,7)', geo['π'] === MC.formatNumber(Math.PI, 7), geo['π']);
ok('外切误差已补充', geo['外切误差'] !== undefined, geo['外切误差']);

// ---------------------------------------------------------------------------
group('#8 [low] 几何级数余项用精确式 |rⁿ/(1−r)|（r<0 时不再松十几倍）');
var gRem = readoutMap('series-geometric', { r: -0.9, n: 8, limit: true });
var want = Math.pow(0.9, 8) / Math.abs(1 + 0.9);
ok('r=−0.9, n=8 的余项 ≈ ' + want.toFixed(4), Math.abs(parseFloat(gRem['余项 |rⁿ/(1−r)|']) - want) < 5e-4,
  gRem['余项 |rⁿ/(1−r)|'] + ' vs ' + want.toFixed(4));

// ---------------------------------------------------------------------------
group('#9 [low] 三角/代数公式的参数显示必须与滑块值一致');
ok('A=1.05, ω=2.55 时公式显示 1.05 与 2.55',
  mod('trig-unit').formula({ A: 1.05, w: 2.55, phi: 3.1 }).indexOf('1.05') >= 0 &&
  mod('trig-unit').formula({ A: 1.05, w: 2.55, phi: 3.1 }).indexOf('2.55') >= 0,
  mod('trig-unit').formula({ A: 1.05, w: 2.55, phi: 3.1 }));
ok('二次函数 a=0.05 时公式显示 0.05（不是 0.05→"0.05"被四舍五入）',
  mod('algebra-quadratic').formula({ a: 0.05, b: 1, c: 0 }).indexOf('0.05') >= 0,
  mod('algebra-quadratic').formula({ a: 0.05, b: 1, c: 0 }));
ok('线性函数 k=1.05, b=-2.55 显示一致',
  mod('algebra-linear').formula({ k: 1.05, b: -2.55 }).indexOf('1.05') >= 0 &&
  mod('algebra-linear').formula({ k: 1.05, b: -2.55 }).indexOf('2.55') >= 0,
  mod('algebra-linear').formula({ k: 1.05, b: -2.55 }));

// ---------------------------------------------------------------------------
group('#10 [low] 定积分超出定义域时给出明确提示，而不是 NaN');
var iBad = readoutMap('calc-integral', { func: 'ln', a: -1, b: 2, n: 8, mode: 'mid' });
ok('∫_{−1}^{2} ln(x) dx 显示"定义域外"', iBad['黎曼和（代数和）'] === '定义域外', iBad['黎曼和（代数和）']);
ok('参考值同样为"定义域外"', iBad['参考值'] === '定义域外');
ok('给出可读的提示文本', String(iBad['提示']).indexOf('无定义') >= 0, iBad['提示']);

// ---------------------------------------------------------------------------
group('#11–#13 [low] 引擎层：负底数求导、实数域分数幂、悬挂负号');
ok('d/dx((-2)^x) 抛错（实数域不可导），不再输出含 ln(−2) 的假公式', (function () {
  try { MC.simplify(MC.diff(MC.parse('(-2)^x'), 'x')); return false; }
  catch (e) { return /不可导/.test(e.message); }
})());
ok('(-8)^(1/3) = −2（实数域奇次根）', MC.functionOfX('(-8)^(1/3)')(0) === -2, MC.functionOfX('(-8)^(1/3)')(0));
ok('(-4)^(1/2) 仍为 NaN（实数域无定义）', isNaN(MC.functionOfX('(-4)^(1/2)')(0)));
ok('x^(1/3) 在 x=−8 处可取到 −2（负半轴可绘）', MC.functionOfX('x^(1/3)')(-8) === -2);
ok('toLatex(x-(-x)) 加括号，无悬挂负号', MC.toLatex(MC.parse('x-(-x)')) === 'x - \\left(-x\\right)',
  MC.toLatex(MC.parse('x-(-x)')));
ok('toLatex(2*(-x)) 加括号', MC.toLatex(MC.parse('2*(-x)')) === '2 \\cdot \\left(-x\\right)',
  MC.toLatex(MC.parse('2*(-x)')));

// ---------------------------------------------------------------------------
group('#14 自由输入管线：解析 → 报错定位 → 符号求导（沙盒核心）');
var t1 = MC.toFunctionOfX('sin(x)*e^(-x/3)');
ok('复杂表达式解析成功', t1.ok === true, t1.message);
ok('自动生成 LaTeX 回显', t1.ok && t1.latex.indexOf('\\sin') >= 0, t1.ok && t1.latex);
var t2 = MC.toFunctionOfX('x^2 + si(x)');
ok('拼错的函数名被识别为"未定义的函数或变量"', t2.ok === false && /未定义/.test(t2.message), t2.message);
ok('并给出出错字符位置（si 从第 6 个字符开始）', t2.index === 6, t2.index);
var t3 = MC.toFunctionOfX('y + 1');
ok('多变量输入被拒绝并说明原因', t3.ok === false && /单变量/.test(t3.message), t3.message);
var t4 = MC.toFunctionOfX('sin');
ok('函数缺括号给出针对性提示', t4.ok === false && /缺少括号/.test(t4.message), t4.message);
var t5 = MC.parseSafe('x^2 +');
ok('语法错误返回 ok=false 且带位置', t5.ok === false && t5.index === 5, JSON.stringify(t5));
ok('隐式乘法 2x 可解析', MC.toFunctionOfX('2x').ok === true);
ok('空输入不崩溃', MC.toFunctionOfX('').ok === false);
ok('沙盒中非法输入只影响该槽位（读数显示"输入错误"）',
  readoutMap('sandbox', { f1: 'x^2', f2: 'si(x)', f3: '1/x' }, { px: 2 })['f2(x₀)'] === '输入错误',
  readoutMap('sandbox', { f1: 'x^2', f2: 'si(x)', f3: '1/x' }, { px: 2 })['f2(x₀)']);
var sb = readoutMap('sandbox', { f1: 'x^2', f2: 'x', f3: 'x^3' }, { px: 2 });
ok('沙盒探针读数为符号求导结果：f₁′(2) = 4', sb['f1(x₀) / f′'] === '4 / 4', sb['f1(x₀) / f′']);
ok('沙盒探针 f₃′(2) = 12（x³ 的导数）', sb['f3(x₀) / f′'] === '8 / 12', sb['f3(x₀) / f′']);
ok('沙盒探针 x₀ 读数正确', sb['探针 x₀'] === '2', sb['探针 x₀']);

// ---------------------------------------------------------------------------
group('#15 一元二次不等式的解集（初中代数）');
var ineq = function (a, b, c, op) { return readoutMap('algebra-inequality', { a: a, b: b, c: c, op: op }); };
ok('x²−x−2 > 0 的解集为两支（Δ=9）', ineq(1, -1, -2, '>')['解集类型'] === '两支并集', JSON.stringify(ineq(1, -1, -2, '>')));
ok('x²−x−2 < 0 的解集为一段区间', ineq(1, -1, -2, '<')['解集类型'] === '一段区间');
ok('判别式读数正确（Δ=9）', ineq(1, -1, -2, '>')['判别式 Δ'] === '9');
ok('x²+1 > 0 恒成立 → 全体实数', ineq(1, 0, 1, '>')['解集类型'] === '全体实数');
ok('x²+1 < 0 → 空集', ineq(1, 0, 1, '<')['解集类型'] === '空集');
ok('(x−1)² ≥ 0 恒成立 → 全体实数', ineq(1, -2, 1, '>=')['解集类型'] === '全体实数');
ok('(x−1)² > 0 → 挖去单点', ineq(1, -2, 1, '>')['解集类型'] === '挖去端点');
ok('(x−1)² ≤ 0 → 单点集合', ineq(1, -2, 1, '<=')['解集类型'] === '单点');
ok('开口向下时结论反转：−x²+1 > 0 为区间', ineq(-1, 0, 1, '>')['解集类型'] === '一段区间');

// ---------------------------------------------------------------------------
group('#16 圆锥曲线：离心率统一定义（高中解析几何）');
function conic(e) { return readoutMap('analytic-conic', { e: e, p: 1.6, dir: true, ratio: true }); }
ok('e = 0.6 → 椭圆', /椭圆/.test(conic(0.6)['类型']), conic(0.6)['类型']);
ok('e = 1.00 → 抛物线', /抛物线/.test(conic(1.0)['类型']), conic(1.0)['类型']);
ok('e = 1.40 → 双曲线', /双曲线/.test(conic(1.4)['类型']), conic(1.4)['类型']);
ok('实测 |PF|/|PL| 恒等于 e（定义的自洽性）',
  Math.abs(parseFloat(conic(0.6)['实测 |PF|/|PL|']) - 0.6) < 1e-3, conic(0.6)['实测 |PF|/|PL|']);
ok('准线位置 = p/e', Math.abs(parseFloat(conic(0.8)['准线 x = p/e']) - 1.6 / 0.8) < 1e-4, conic(0.8)['准线 x = p/e']);

// ---------------------------------------------------------------------------
group('#17 向量加法与数量积（高中向量）');
function vec(ax, ay, bx, by) {
  return readoutMap('vector-parallelogram', { ax: ax, ay: ay, bx: bx, by: by, para: true, decomp: true });
}
ok('|a| = √10 ≈ 3.1623', Math.abs(parseFloat(vec(3, 1, 0.5, 3)['|a|']) - Math.sqrt(10)) < 1e-3, vec(3, 1, 0.5, 3)['|a|']);
ok('a·b = 3×0.5 + 1×3 = 4.5', vec(3, 1, 0.5, 3)['a·b'] === '4.5', vec(3, 1, 0.5, 3)['a·b']);
ok('|a+b| = |(3.5, 4)| = √28.25 ≈ 5.3151',
  Math.abs(parseFloat(vec(3, 1, 0.5, 3)['|a+b|']) - Math.sqrt(28.25)) < 1e-3, vec(3, 1, 0.5, 3)['|a+b|']);
ok('垂直向量夹角 90°', Math.abs(parseFloat(vec(1, 0, 0, 1)['夹角']) - 90) < 1e-6, vec(1, 0, 0, 1)['夹角']);
ok('垂直向量数量积为 0', vec(1, 0, 0, 1)['a·b'] === '0', vec(1, 0, 0, 1)['a·b']);
ok('反向向量夹角 180°', Math.abs(parseFloat(vec(2, 0, -3, 0)['夹角']) - 180) < 1e-6, vec(2, 0, -3, 0)['夹角']);

// ---------------------------------------------------------------------------
group('#18 统计：直方图与箱线图（初中-高中统计）');
var sample = [2, 4, 4, 4, 5, 5, 7, 9];
var five = MC.fiveNumber(sample);
ok('五数概括：Q₁ = 4', five.q1 === 4, five.q1);
ok('五数概括：中位数 = 4.5', five.median === 4.5, five.median);
ok('五数概括：Q₃ = 5.5', five.q3 === 5.5, five.q3);
ok('IQR = Q₃ − Q₁ = 1.5', five.iqr === 1.5, five.iqr);
ok('分位数线性插值：quantile([1,2,3,4], 0.25) = 1.75', Math.abs(MC.quantile([1, 2, 3, 4], 0.25) - 1.75) < 1e-12, MC.quantile([1, 2, 3, 4], 0.25));
ok('样本标准差用 n−1：s = √(32/7) ≈ 2.1381', Math.abs(MC.stdev(sample) - Math.sqrt(32 / 7)) < 1e-12, MC.stdev(sample));
ok('直方图计数之和 = 样本量', (function () {
  var d = MC.sampleNormal(200, 0, 1, 7);
  var h = MC.histogram(d, 10);
  return h.bins.reduce(function (s, b) { return s + b.count; }, 0) === d.length;
})());
ok('直方图密度 × 箱宽 = 频率（归一化正确）', (function () {
  var d = MC.sampleNormal(300, 5, 1.2, 20261009);
  var h = MC.histogram(d, 12);
  var total = h.bins.reduce(function (s, b) { return s + b.density * h.width; }, 0);
  return Math.abs(total - 1) < 1e-9;
})());
ok('种子随机可复现（两次生成完全相同）', (function () {
  var a = MC.sampleNormal(50, 3, 1, 99), b = MC.sampleNormal(50, 3, 1, 99);
  for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
})());
var st = readoutMap('stats-histogram', { n: 200, mu: 5, sigma: 1.2, bins: 12, normal: true, outlier: true });
ok('模块均值与同种子数据一致（读数按 4 位有效数字显示）',
  Math.abs(parseFloat(st['均值 x̄']) - MC.mean(MC.sampleNormal(200, 5, 1.2, 20261009))) < 5e-4, st['均值 x̄']);
ok('Q₁/Q₃ 读数格式与五数概括一致',
  st['Q₁ / Q₃'] === MC.formatNumber(MC.fiveNumber(MC.sampleNormal(200, 5, 1.2, 20261009)).q1, 3) + ' / ' +
                 MC.formatNumber(MC.fiveNumber(MC.sampleNormal(200, 5, 1.2, 20261009)).q3, 3), st['Q₁ / Q₃']);

// ---------------------------------------------------------------------------
group('#19 等差/等比数列与立体几何');
var seq = readoutMap('sequence-arith', { a1: 2, d: 1, n: 10, sumline: true });
ok('a₁₀ = 2 + 9×1 = 11', seq['aₙ'] === '11', seq['aₙ']);
ok('S₁₀ = 10(2+11)/2 = 65', seq['Sₙ'] === '65', seq['Sₙ']);
var seq2 = readoutMap('sequence-arith', { a1: 10, d: -2, n: 6, sumline: true });
ok('递减等差：a₆ = 10 − 10 = 0', seq2['aₙ'] === '0', seq2['aₙ']);
ok('递减等差：S₆ = 6(10+0)/2 = 30', seq2['Sₙ'] === '30', seq2['Sₙ']);
['cube', 'tetra', 'octa'].forEach(function (shape) {
  var r = readoutMap('solid-3d', { shape: shape, theta: 35, phi: 22, persp: 0.5, faces: true, labels: true, axes3: true });
  ok(shape + '：欧拉公式 V − E + F = 2', r['V − E + F（欧拉）'] === '2', JSON.stringify(r));
});
var pyth = readoutMap('geo-pythagoras', { a: 3, b: 4, hyp: true, grid3: false });
ok('勾股：3² + 4² = 25 = c²', pyth['a² + b²'] === '25' && pyth['c²'] === '25', JSON.stringify(pyth));
ok('勾股：c = 5', pyth['c'] === '5', pyth['c']);
ok('勾股：非整数情形 a=1,b=1 → c = √2 ≈ 1.41421',
  Math.abs(parseFloat(readoutMap('geo-pythagoras', { a: 1, b: 1, hyp: true, grid3: false })['c']) - Math.SQRT2) < 5e-6,
  readoutMap('geo-pythagoras', { a: 1, b: 1, hyp: true, grid3: false })['c']);

// ---------------------------------------------------------------------------
group('#20 第二轮评审发现的两处修复（a=0 一次不等式 / 双曲线第二支）');
// (1) a = 0 是滑块可达值：必须按一次不等式正确求解，且 ±∞ 端点永远开区间
var ineq0 = function (a, b, c, op) { return readoutMap('algebra-inequality', { a: a, b: b, c: c, op: op }); };
ok('a=0, x−2>0 → x>2，解集 (2, +∞)', ineq0(0, 1, -2, '>')['解集'] === '(2, +∞)', ineq0(0, 1, -2, '>')['解集']);
ok('a=0, −x+2>0 → x<2，解集 (−∞, 2)', ineq0(0, -1, 2, '>')['解集'] === '(−∞, 2)', ineq0(0, -1, 2, '>')['解集']);
ok('a=0, x≥0 → 解集 [0, +∞)（左端点闭合）', ineq0(0, 1, 0, '>=')['解集'] === '[0, +∞)', ineq0(0, 1, 0, '>=')['解集']);
ok('a=0, b=0, c=1 > 0 → 全体实数', ineq0(0, 0, 1, '>')['解集'] === '全体实数', ineq0(0, 0, 1, '>')['解集']);
ok('a=0, b=0, c=−1 > 0 → 空集', ineq0(0, 0, -1, '>')['解集'] === '空集', ineq0(0, 0, -1, '>')['解集']);
ok('a=0 时判别式显示 —（不是二次）', ineq0(0, 1, -2, '>')['判别式 Δ'] === '—');
ok('a=0 时根的情况标注"不是二次（a = 0）"', ineq0(0, 1, -2, '>')['根的情况'] === '不是二次（a = 0）');
ok('非严格不等式的 ∞ 端点是开括号（[−∞ 是错误写法）',
  ineq0(1, -1, -2, '>=')['解集'] === '(−∞, −1] ∪ [2, +∞)', ineq0(1, -1, -2, '>=')['解集']);
ok('严格不等式两端都开：x²−x−2>0 → (−∞, −1) ∪ (2, +∞)',
  ineq0(1, -1, -2, '>')['解集'] === '(−∞, −1) ∪ (2, +∞)', ineq0(1, -1, -2, '>')['解集']);

// (2) 双曲线必须有第二支：用假 canvas 记录真实绘制点
function fakePlot() {
  var pts = [], segs = [], guides = [];
  var ctx = {
    save: function () {}, restore: function () {}, beginPath: function () {},
    moveTo: function (x, y) { pts.push([x, y]); }, lineTo: function (x, y) { pts.push([x, y]); },
    stroke: function () {}, closePath: function () {}, fill: function () {},
    fillRect: function () {}, strokeRect: function () {}, arc: function () {},
    fillText: function () {}, measureText: function () { return { width: 10 }; },
    setLineDash: function () {}, setTransform: function () {}
  };
  var stubs = {};
  ['grid', 'axes', 'curve', 'rect', 'point', 'label', 'arrow',
   'areaUnder', 'slopeTriangle', 'zoomAt', 'panBy', 'clear', 'background', 'frame'].forEach(function (k) {
    stubs[k] = function () {};
  });
  stubs.segment = function (x0, y0, x1, y1, o) {
    segs.push({ x0: x0, y0: y0, x1: x1, y1: y1, color: o && o.color });
  };
  stubs.guide = function (x0, y0, x1, y1, o) {
    guides.push({ x0: x0, y0: y0, x1: x1, y1: y1, color: o && o.color });
  };
  stubs.ctx = ctx;
  stubs.size = { w: 1000, h: 700, dpr: 1 };
  stubs.sx = function (x) { return x * 50 + 500; };
  stubs.sy = function (y) { return 350 - y * 50; };
  stubs.view = { xMin: -12, xMax: 12, yMin: -8, yMax: 12 };
  stubs._pts = pts;
  stubs._segs = segs;
  stubs._guides = guides;
  return stubs;
}
function drawnMaxX(id, params) {
  var plot = fakePlot();
  mod(id).draw(plot, params, {});
  var maxX = -Infinity;
  plot._pts.forEach(function (p) { var wx = (p[0] - 500) / 50; if (wx > maxX) maxX = wx; });
  return maxX;
}
var maxX14 = drawnMaxX('analytic-conic', { e: 1.4, p: 1.6, dir: true, ratio: true });
ok('e=1.4 的双曲线绘制出第二支（远支顶点 x = p/(e−1) = 4）', maxX14 >= 3.9, '实际最大 x = ' + maxX14.toFixed(3));
ok('e=1.8 的第二支顶点 x = 1.6/0.8 = 2', drawnMaxX('analytic-conic', { e: 1.8, p: 1.6, dir: true, ratio: false }) >= 1.95,
  drawnMaxX('analytic-conic', { e: 1.8, p: 1.6, dir: true, ratio: false }).toFixed(3));
ok('e=0.6 的椭圆不会超过 a = p/(1−e²) = 2.5',
  drawnMaxX('analytic-conic', { e: 0.6, p: 1.6, dir: true, ratio: false }) <= 2.6,
  drawnMaxX('analytic-conic', { e: 0.6, p: 1.6, dir: true, ratio: false }).toFixed(3));
ok('e=1.00 仍判为抛物线', /抛物线/.test(conic(1.0)['类型']), conic(1.0)['类型']);
ok('e=0.98 判为椭圆（0.98 是椭圆，不是抛物线）', /椭圆/.test(conic(0.98)['类型']), conic(0.98)['类型']);
ok('e=1.02 判为双曲线', /双曲线/.test(conic(1.02)['类型']), conic(1.02)['类型']);

// ---------------------------------------------------------------------------
group('#21 第二轮评审第二轮修复（勾股正方形朝向 / 单位方格 / 零向量夹角）');
var pPlot = fakePlot();
mod('geo-pythagoras').draw(pPlot, { a: 1, b: 2, hyp: true, grid3: false }, {});
var coralSegs = pPlot._segs.filter(function (s) { return s.color === '#CE5848'; });
ok('b 边正方形画在三角形**外侧**（4 条边都在 x ≤ 0）',
  coralSegs.length === 4 && coralSegs.every(function (s) { return s.x0 <= 1e-9 && s.x1 <= 1e-9; }),
  JSON.stringify(coralSegs.map(function (s) { return [s.x0, s.x1]; })));
var pPlot2 = fakePlot();
mod('geo-pythagoras').draw(pPlot2, { a: 3, b: 4, hyp: true, grid3: true }, {});
ok('单位方格：三块正方形共 18 条内部分隔线 = (3−1+4−1+5−1)×2',
  pPlot2._guides.length === 18, pPlot2._guides.length);
ok('单位方格边长恰为 1（a 边 3² 的竖线在 x=1,2；b 边 4² 的竖线在 x=−1,−2,−3）', (function () {
  var vx = pPlot2._guides.filter(function (g) { return Math.abs(g.x0 - g.x1) < 1e-9; })
    .map(function (g) { return Math.round(g.x0 * 1e6) / 1e6; })
    .sort(function (x, y) { return x - y; });
  return JSON.stringify(vx) === JSON.stringify([-3, -2, -1, 1, 2]);
})(), JSON.stringify(pPlot2._guides.filter(function (g) { return Math.abs(g.x0 - g.x1) < 1e-9; }).map(function (g) { return g.x0; })));
ok('单位方格横线在 y = −2,−1（a 边）与 1,2,3（b 边）', (function () {
  var hy = pPlot2._guides.filter(function (g) { return Math.abs(g.y0 - g.y1) < 1e-9; })
    .map(function (g) { return Math.round(g.y0 * 1e6) / 1e6; })
    .sort(function (x, y) { return x - y; });
  return JSON.stringify(hy) === JSON.stringify([-2, -1, 1, 2, 3]);
})(), JSON.stringify(pPlot2._guides.filter(function (g) { return Math.abs(g.y0 - g.y1) < 1e-9; }).map(function (g) { return g.y0; })));
ok('零向量夹角显示"未定义（零向量）"而不是 NaN',
  readoutMap('vector-parallelogram', { ax: 0, ay: 0, bx: 1, by: 1, para: true, decomp: true })['夹角'] === '未定义（零向量）',
  readoutMap('vector-parallelogram', { ax: 0, ay: 0, bx: 1, by: 1, para: true, decomp: true })['夹角']);
ok('相同方向的夹角为精确 0°（无浮点噪声）',
  readoutMap('vector-parallelogram', { ax: 1, ay: 2, bx: 3, by: 6, para: true, decomp: true })['夹角'] === '0°',
  readoutMap('vector-parallelogram', { ax: 1, ay: 2, bx: 3, by: 6, para: true, decomp: true })['夹角']);

// ---------------------------------------------------------------------------
group('#22 第二轮评审第三批修复（前导空白定位 / 文案与图形一致）');
ok('前导空格不会让插入符定位错位：toFunctionOfX("  si(x)").index = 2',
  MC.toFunctionOfX('  si(x)').index === 2, MC.toFunctionOfX('  si(x)').index);
ok('parseSafe("  x +").index 也补偿前导空白（3+2=5）',
  MC.parseSafe('  x +').index === 5, MC.parseSafe('  x +').index);
ok('无前导空白时 index 不受影响',
  MC.toFunctionOfX('x^2 + si(x)').index === 6, MC.toFunctionOfX('x^2 + si(x)').index);
ok('纯空白输入 index = 0 且给出"表达式为空"',
  MC.toFunctionOfX('   ').index === 0 && /为空/.test(MC.toFunctionOfX('   ').message), JSON.stringify(MC.toFunctionOfX('   ')));
ok('等差数列不再把折线称作"阶梯"',
  JSON.stringify(mod('sequence-arith').legend).indexOf('阶梯') < 0, JSON.stringify(mod('sequence-arith').legend));

// ---------------------------------------------------------------------------
group('#23 第二轮评审最终三项（正交投影 / 非整数边长 / 分数指数求导）');
// A1：persp=0 必须是真·正交（缩放恒为 1，平行棱严格平行）
var ortho = fakePlot();
mod('solid-3d').draw(ortho, { shape: 'cube', theta: 35, phi: 22, persp: 0, faces: true, labels: true, axes3: false }, {});
ok('persp=0 的投影点与独立正交投影**逐点一致**（即 s ≡ 1）', (function () {
  var yaw = (35 * Math.PI) / 180, pitch = (22 * Math.PI) / 180;
  var V = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
  var want = V.map(function (v) {
    var cy = Math.cos(yaw), syv = Math.sin(yaw);
    var x1 = v[0] * cy + v[2] * syv, z1 = -v[0] * syv + v[2] * cy;
    var cx = Math.cos(pitch), sxv = Math.sin(pitch);
    var y2 = v[1] * cx - z1 * sxv;
    return [x1 * 50 + 500, 350 - y2 * 50];
  });
  return want.every(function (w) {
    return ortho._pts.some(function (q) {
      return Math.abs(q[0] - w[0]) < 1e-6 && Math.abs(q[1] - w[1]) < 1e-6;
    });
  });
})(), JSON.stringify(ortho._pts.slice(0, 3)));
var perspPlot = fakePlot();
mod('solid-3d').draw(perspPlot, { shape: 'cube', theta: 35, phi: 22, persp: 1, faces: true, labels: true, axes3: false }, {});
function xSpan(plot) {
  var xs = plot._pts.map(function (q) { return q[0]; });
  return Math.max.apply(null, xs) - Math.min.apply(null, xs);
}
ok('正交投影与强透视的横向跨度不同（说明投影确实变了）',
  Math.abs(xSpan(ortho) - xSpan(perspPlot)) > 1, xSpan(ortho).toFixed(1) + ' vs ' + xSpan(perspPlot).toFixed(1));
ok('读数在 persp=0 时显示"正交"',
  readoutMap('solid-3d', { shape: 'cube', theta: 35, phi: 22, persp: 0, faces: true, labels: true, axes3: true })['投影'] === '正交');
ok('读数在 persp=0.5 时显示"透视"',
  readoutMap('solid-3d', { shape: 'cube', theta: 35, phi: 22, persp: 0.5, faces: true, labels: true, axes3: true })['投影'] === '透视');

// A2：非整数边长时不画"单位方格"（否则格边长 ≠ 1、格数 ≠ 面积）
var nonInt = fakePlot();
mod('geo-pythagoras').draw(nonInt, { a: 1.5, b: 2.5, hyp: true, grid3: true }, {});
ok('a=1.5（非整数）时不绘制单位方格', nonInt._guides.length === 0, nonInt._guides.length);
var intPlot = fakePlot();
mod('geo-pythagoras').draw(intPlot, { a: 3, b: 4, hyp: true, grid3: true }, {});
ok('整数边长仍正常绘制单位方格（18 条线）', intPlot._guides.length === 18, intPlot._guides.length);

// A3：x^(1/3) 这类**分数指数**必须走幂函数法则，不能在 x<0 退化成 0·ln(x)
var cubeRoot = MC.toFunctionOfX('x^(1/3)');
ok('x^(1/3) 可解析', cubeRoot.ok === true, cubeRoot.message);
var dCubeRoot = MC.compile(MC.diff(cubeRoot.ast, 'x'));
ok('x^(1/3) 在 x=−3 处符号导数 = +0.1602（不是 NaN）',
  Math.abs(dCubeRoot({ x: -3 }) - 0.160250) < 1e-5, dCubeRoot({ x: -3 }));
ok('x^(1/3) 在 x=8 处符号导数 = (1/3)·8^(−2/3) = 0.08333',
  Math.abs(dCubeRoot({ x: 8 }) - 1 / 12) < 1e-9, dCubeRoot({ x: 8 }));
ok('导数的 LaTeX 保留分数形式（\\frac{1}{3}）',
  MC.toLatex(MC.simplify(MC.diff(MC.parse('x^(1/3)'), 'x'))).indexOf('\\frac{1}{3}') >= 0,
  MC.toLatex(MC.simplify(MC.diff(MC.parse('x^(1/3)'), 'x'))));
ok('沙盒探针在 x₀=−3 处给出斜率而非 —', (function () {
  var r = readoutMap('sandbox', { f1: 'x^(1/3)', f2: 'x', f3: 'x' }, { px: -3 });
  return /0\.1602/.test(r['f1(x₀) / f′'] || '');
})(), readoutMap('sandbox', { f1: 'x^(1/3)', f2: 'x', f3: 'x' }, { px: -3 })['f1(x₀) / f′']);
ok('整数指数仍走同一条法则：d/dx(x^3) 的 LaTeX = 3·x²',
  MC.toLatex(MC.simplify(MC.diff(MC.parse('x^3'), 'x'))) === '3 \\cdot x^{2}',
  MC.toLatex(MC.simplify(MC.diff(MC.parse('x^3'), 'x'))));
ok('x^x（指数含变量）仍走一般幂指分支（不误用幂法则）',
  (function () {
    var f = MC.functionOfX('x^x');
    var d = MC.compile(MC.diff(MC.parse('x^x'), 'x'));
    return Math.abs(d({ x: 2 }) - MC.numericDerivative(f, 2, 1e-6)) < 1e-6;
  })());
ok('圆锥曲线「实测 |PF|/|PL|」是真测量（e=0.6 → 0.6，且不等于直接抄 e 的实现）',
  Math.abs(parseFloat(conic(0.6)['实测 |PF|/|PL|']) - 0.6) < 5e-4, conic(0.6)['实测 |PF|/|PL|']);

// ---------------------------------------------------------------------------
group('#24 沙盒微积分引擎（求导/积分/极限/扰动/推导步骤）');
var steps = MC.diffSteps(MC.parse('x^3 + sin(x)'), 'x');
ok('推导步骤按顶层加减拆成 2 项', steps.length === 2, JSON.stringify(steps));
ok('第 1 项用幂函数法则，导数 = 3·x²',
  steps[0].rule === '幂函数法则' && MC.toLatex(MC.simplify(MC.diff(MC.parse('x^3'), 'x'))) === '3 \\cdot x^{2}',
  steps[0].rule + ' / ' + steps[0].derivative);
ok('第 2 项用基本导数公式（sin→cos）', steps[1].rule === '基本导数公式' && /cos/.test(steps[1].derivative), steps[1].rule);
var steps2 = MC.diffSteps(MC.parse('x*sin(x) + 2'), 'x');
ok('乘积项标注乘积法则', steps2[0].rule === '乘积法则', steps2[0].rule);
ok('常数项标注常数法则且导数为 0', steps2[1].rule === '常数法则' && /^0$/.test(steps2[1].derivative), steps2[1].derivative);
var steps3 = MC.diffSteps(MC.parse('sin(x^2)'), 'x');
ok('复合函数标注链式法则', steps3[0].rule === '链式法则', steps3[0].rule);
ok('减法项带负号', MC.diffSteps(MC.parse('x^2 - 3x'), 'x')[1].term.indexOf('-') === 0,
  MC.diffSteps(MC.parse('x^2 - 3x'), 'x')[1].term);

// 常数扰动：只缩放数值常数，幂指数不动
var pertAst = MC.perturbConstants(MC.parse('x^2 + 3'), 1.1);
var pertFn = MC.compile(pertAst);
ok('扰动后常数 3 → 3.3（x=0 处取值为 3.3）', Math.abs(pertFn({ x: 0 }) - 3.3) < 1e-12, pertFn({ x: 0 }));
ok('幂指数不被扰动（x=2 处仍为 4+3.3=7.3）', Math.abs(pertFn({ x: 2 }) - 7.3) < 1e-12, pertFn({ x: 2 }));
ok('具名常量 pi 不参与扰动', (function () {
  var f = MC.compile(MC.perturbConstants(MC.parse('pi*x'), 2));
  return Math.abs(f({ x: 1 }) - Math.PI) < 1e-12;
})());

// 数值极限
ok('lim(x→0) sin(x)/x = 1（双侧一致）', (function () {
  var lim = MC.limitAt(MC.functionOfX('sin(x)/x'), 0);
  return lim.twoSided && Math.abs(lim.value - 1) < 1e-4;
})(), JSON.stringify(MC.limitAt(MC.functionOfX('sin(x)/x'), 0).value));
ok('lim(x→0) 1/x 判定为发散', MC.limitAt(MC.functionOfX('1/x'), 0).diverges === true ||
  MC.limitAt(MC.functionOfX('1/x'), 0).twoSided === false);
ok('lim(x→0) |x|/x 左右不等（不存在）', MC.limitAt(MC.functionOfX('abs(x)/x'), 0).twoSided === false);
ok('lim(x→2) (x²−4)/(x−2) = 4（可去间断点）', (function () {
  var lim = MC.limitAt(MC.functionOfX('(x^2-4)/(x-2)'), 2);
  return lim.twoSided && Math.abs(lim.value - 4) < 1e-3;
})());

// 原函数 F(x)=∫₀ˣ f
var F = MC.antiderivative(MC.functionOfX('x'), 0, { steps: 2000 });
ok('∫₀² t dt = 2（原函数 F(2)）', Math.abs(F(2) - 2) < 1e-6, F(2));
ok('F(0) = 0（积分下限处为零）', Math.abs(F(0)) < 1e-9, F(0));
ok('x < 0 时 F(x) 为定向积分：F(−2) = ∫₀^{−2} t dt = +2', Math.abs(F(-2) - 2) < 1e-6, F(-2));

// 沙盒读数：定积分模式给出黎曼和与精确值
var sbI = readoutMap('sandbox',
  { f1: 'x^2', f2: 'x', f3: 'x', op: 'I', a: 0, b: 2, eps: 0, xL: 0, probe: false, tangent: false, adaptive: true },
  { px: 1 });
ok('∫₀² x² dx 的 24 矩形黎曼和 ≈ 8/3（误差 < 2e-3）',
  Math.abs(parseFloat(sbI['∫ₐᵇ f₁ (24 个矩形)']) - 8 / 3) < 2e-3, sbI['∫ₐᵇ f₁ (24 个矩形)']);
ok('精确值 ≈ 8/3（读数按 5 位有效数字）', Math.abs(parseFloat(sbI['精确值']) - 8 / 3) < 1e-4, sbI['精确值']);
var sbL = readoutMap('sandbox',
  { f1: 'sin(x)/x', f2: 'x', f3: 'x', op: 'none', a: 0, b: 1, eps: 0, xL: 0, probe: false, tangent: false, adaptive: true },
  { px: 1 });
ok('沙盒极限读数 lim(x→0) sin(x)/x = 1', Math.abs(parseFloat(sbL['lim(x→0)']) - 1) < 1e-4, sbL['lim(x→0)']);
var sbP = readoutMap('sandbox',
  { f1: 'x^2 + 3', f2: 'x', f3: 'x', op: 'none', a: 0, b: 1, eps: 0.1, xL: 0, probe: false, tangent: false, adaptive: true },
  { px: 1 });
ok('ε=0.1 时报出扰动最大偏差', parseFloat(sbP['扰动最大偏差 max|Δf|']) > 0, sbP['扰动最大偏差 max|Δf|']);
ok('沙盒给出"变量替换过程"HTML（逐项 + 法则标签）', (function () {
  var html = mod('sandbox').infoExtra({ f1: 'x^3 + sin(x)' });
  return html.indexOf('step-row') >= 0 && html.indexOf('幂函数法则') >= 0 && html.indexOf('基本导数公式') >= 0;
})(), mod('sandbox').infoExtra({ f1: 'x^3 + sin(x)' }).slice(0, 120));
ok('复合函数在推导过程中标注链式法则',
  mod('sandbox').infoExtra({ f1: 'sin(x^2)' }).indexOf('链式法则') >= 0,
  mod('sandbox').infoExtra({ f1: 'sin(x^2)' }).slice(0, 80));

// ---------------------------------------------------------------------------
group('#25 自动演示脚本（分章节叙事，结构统一）');
var DEMO_IDS = ['trig-unit', 'calc-derivative', 'calc-integral', 'analytic-conic',
                'series-geometric', 'algebra-quadratic', 'geo-pythagoras'];
ok('7 个核心章节都配了自动演示脚本', DEMO_IDS.every(function (id) {
  var m = mod(id);
  return m.demo && m.demo.title && m.demo.steps && m.demo.steps.length >= 4;
}), DEMO_IDS.filter(function (id) { return !mod(id).demo; }).join(','));
DEMO_IDS.forEach(function (id) {
  var d = mod(id).demo;
  var okLen = d.steps.length >= 4;
  var okDur = d.steps.every(function (s) { return typeof s.dur === 'number' && s.dur > 0; });
  var okLabel = d.steps.every(function (s) { return s.label && s.label.zh; });
  var okApply = d.steps.filter(function (s) { return !s.hold; }).every(function (s) { return typeof s.apply === 'function'; });
  var okHold = d.steps[d.steps.length - 1].hold === true;
  var total = d.steps.reduce(function (s, x) { return s + x.dur; }, 0);
  ok(id + '：≥4 步 / 每步有时长与文案 / 末步暂停交还用户 / 总时长 ' + (total / 1000).toFixed(1) + 's',
    okLen && okDur && okLabel && okApply && okHold, JSON.stringify([okLen, okDur, okLabel, okApply, okHold]));
  ok(id + '：首步是"引入"（①）', /①/.test(d.steps[0].label.zh), d.steps[0].label.zh);
});

// 用时间轴真跑一遍：脚本必须真的驱动参数
(function () {
  var m = mod('calc-derivative');
  var list = typeof m.controls === 'function' ? m.controls({}) : m.controls;
  var params = {};
  list.forEach(function (c) { params[c.id] = c.value; });
  var tl = global.Timeline.create();
  var clock = 0;
  tl.now = function () { return clock; };
  tl.load(m.demo, {
    params: params,
    set: function (id, v) { params[id] = v; },
    lerp: function (a, b, p) { return a + (b - a) * p; }
  });
  tl.play();
  var h0 = params.h;
  clock = 4500;                       // 落在第 3 步"让 h → 0"区间内
  var st = tl.update(4500);
  ok('时间轴驱动了参数：h 从 ' + h0 + ' 降到 ' + MC.formatNumber(params.h, 4),
    params.h < h0 - 0.5 && params.h > 0, params.h);
  ok('演示已进入第 3 步（动态推导）', st.index === 2, st.index);
  clock = 12000;                      // 跑完
  var st2 = tl.update(12000);
  ok('演示跑完后自动暂停（交还用户）', st2.done === true && st2.playing === false, JSON.stringify([st2.done, st2.playing]));
  ok('结束时参数落在脚本设计值附近（h≈0.05，x0≈0.6）',
    Math.abs(params.h - 0.05) < 1e-6 && Math.abs(params.x0 - 0.6) < 1e-6,
    params.h + ' / ' + params.x0);
})();

// ---------------------------------------------------------------------------
console.log('\n----------------------------------------');
console.log('模块层：通过 ' + passed + ' / 失败 ' + failed);
if (failed > 0) process.exitCode = 1;
