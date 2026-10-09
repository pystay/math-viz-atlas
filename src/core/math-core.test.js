/*!
 * math-core.test.js — 数学逻辑层验收测试（Node 运行：node src/core/math-core.test.js）
 * 覆盖：解析优先级、隐式乘法、符号求导（与数值导数交叉验证）、
 *       黎曼和收敛、辛普森积分、级数部分和。
 */
'use strict';

var MC = require('./math-core.js');

var passed = 0, failed = 0, groups = [];

function group(name) { groups.push(name); console.log('\n== ' + name + ' =='); }

function ok(label, cond, extra) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; console.log('  ✗ ' + label + (extra !== undefined ? '  → ' + extra : '')); }
}

function close(a, b, tol) {
  tol = tol === undefined ? 1e-9 : tol;
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
}

function evalAt(src, x) {
  return MC.functionOfX(src)(x);
}

// ---------------------------------------------------------------------------
group('1. 解析与求值（运算优先级 / 结合性 / 隐式乘法）');

ok('1 + 2 * 3 = 7（乘法优先）', evalAt('1 + 2 * 3', 0) === 7, evalAt('1 + 2 * 3', 0));
ok('(1 + 2) * 3 = 9（括号）', evalAt('(1 + 2) * 3', 0) === 9);
ok('2 ^ 3 ^ 2 = 512（幂右结合）', evalAt('2 ^ 3 ^ 2', 0) === 512, evalAt('2 ^ 3 ^ 2', 0));
ok('-x^2 在 x=3 时为 -9（一元负号低于幂）', evalAt('-x^2', 3) === -9, evalAt('-x^2', 3));
ok('2x + 1 在 x=4 时为 9（隐式乘法）', evalAt('2x + 1', 4) === 9);
ok('(x+1)(x-1) 在 x=3 时为 8（括号隐式乘法）', evalAt('(x+1)(x-1)', 3) === 8);
ok('1/2 为 0.5（浮点除法）', evalAt('1/2', 0) === 0.5);
ok('sin(pi/2) = 1', close(evalAt('sin(pi/2)', 0), 1));
ok('ln(e) = 1', close(evalAt('ln(e)', 0), 1));
ok('log(1000) = 3（常用对数，底 10）', close(evalAt('log(1000)', 0), 3, 1e-12));
ok('log2(8) = 3', close(evalAt('log2(8)', 0), 3));
ok('sqrt(x^2) 在 x=-5 时为 5', evalAt('sqrt(x^2)', -5) === 5);
ok('abs(x) 在 x=-3 时为 3', evalAt('abs(x)', -3) === 3);
ok('非法表达式 "x +" 抛错', (function () {
  try { MC.parse('x +'); return false; } catch (e) { return e instanceof SyntaxError; }
})());
ok('"foo(x)" 视作隐式乘法（解析成功），求值时抛未定义变量', (function () {
  try { MC.parse('foo(x)'); } catch (e) { return false; }
  try { MC.functionOfX('foo(x)')(0); return false; } catch (e) { return e instanceof ReferenceError; }
})());
ok('x(x+1) 按隐式乘法 = 12（x=3）', evalAt('x(x+1)', 3) === 12, evalAt('x(x+1)', 3));
ok('科学计数法 1e3 = 1000', evalAt('1e3', 0) === 1000, evalAt('1e3', 0));
ok('2e3 + 1 = 2001（指数不与常量 e 混淆）', evalAt('2e3 + 1', 0) === 2001, evalAt('2e3 + 1', 0));
ok('2e 仍解析为 2·e（e 后无指数）', close(evalAt('2e', 0), 2 * Math.E));
ok('compile 对未绑定变量抛 ReferenceError（与 evaluate 行为一致）', (function () {
  try { MC.compile(MC.parse('y'))({ x: 1 }); return false; } catch (e) { return e instanceof ReferenceError; }
})());
ok('函数参数个数校验 "sin(x, 2)" 抛错', (function () {
  try { MC.parse('sin(x, 2)'); return false; } catch (e) { return true; }
})());

// ---------------------------------------------------------------------------
group('2. 符号求导：精确形式');

function latexOfDiff(src) {
  return MC.toLatex(MC.simplify(MC.diff(MC.parse(src), 'x')));
}

ok('d/dx(x^3) = 3·x^2', latexOfDiff('x^3') === '3 \\cdot x^{2}', latexOfDiff('x^3'));
ok('d/dx(5) = 0', latexOfDiff('5') === '0', latexOfDiff('5'));
ok('d/dx(x) = 1', latexOfDiff('x') === '1', latexOfDiff('x'));
ok('d/dx(sin(x)) = cos(x)', latexOfDiff('sin(x)') === '\\cos\\left(x\\right)', latexOfDiff('sin(x)'));
ok('d/dx(e^x) = e^x', latexOfDiff('e^x') === 'e^{x}', latexOfDiff('e^x'));
ok('d/dx(ln(x)) = 1/x', latexOfDiff('ln(x)') === '\\frac{1}{x}', latexOfDiff('ln(x)'));
ok('d/dx(2x+1) = 2', latexOfDiff('2x+1') === '2', latexOfDiff('2x+1'));
ok('d/dx(x^2) 中的系数合并为 2·x', latexOfDiff('x^2') === '2 \\cdot x', latexOfDiff('x^2'));

// ---------------------------------------------------------------------------
group('3. 符号求导 vs 数值导数（交叉验证，容差 1e-6）');

var cases = [
  'x^3 - 2x + 7', 'sin(x)', 'cos(2x)', 'tan(x)', 'exp(x) * sin(x)',
  'x * ln(x)', '(x^2+1)/(x-2)', 'sqrt(x^2+1)', 'ln(x^2+1)',
  'x^2 * sin(x)', 'e^(-x^2)', 'sin(x)*cos(x)', 'x^5', '1/(1+x^2)'
];

cases.forEach(function (src) {
  try {
    var f = MC.functionOfX(src);
    var d = MC.compile(MC.diff(MC.parse(src), 'x'));
    var worst = 0, worstAt = 0;
    [0.3, 0.7, 1.1, 1.9, 2.7].forEach(function (x) {
      var symbolic = d({ x: x });
      var numeric = MC.numericDerivative(f, x, 1e-6);
      var rel = Math.abs(symbolic - numeric) / Math.max(1, Math.abs(numeric));
      if (rel > worst) { worst = rel; worstAt = x; }
    });
    ok('d/dx(' + src + ') 与数值导数一致（最大相对误差 ' + worst.toExponential(2) + '）', worst < 1e-6, 'x=' + worstAt);
  } catch (e) {
    ok('d/dx(' + src + ')', false, e.message);
  }
});

// ---------------------------------------------------------------------------
group('4. 黎曼和收敛到定积分');

var f2 = function (x) { return x * x; };
var exact = 1 / 3; // ∫₀¹ x² dx
[4, 16, 64, 256, 1024].forEach(function (n) {
  var mid = MC.riemann(f2, 0, 1, n, 'mid').value;
  ok('中点黎曼和 n=' + n + ' 误差 < ' + (1 / (24 * n * n) * 4).toExponential(1),
    Math.abs(mid - exact) < 1 / (24 * n * n) * 4, '误差 ' + Math.abs(mid - exact).toExponential(3));
});
ok('中点法比左端点法更接近真值（n=64）',
  Math.abs(MC.riemann(f2, 0, 1, 64, 'mid').value - exact) <
  Math.abs(MC.riemann(f2, 0, 1, 64, 'left').value - exact));
ok('左端点和 < 真值 < 右端点和（单调递增函数）',
  MC.riemann(f2, 0, 1, 50, 'left').value < exact &&
  MC.riemann(f2, 0, 1, 50, 'right').value > exact);
ok('黎曼和矩形的总面积 = Σ h·dx',
  (function () {
    var r = MC.riemann(f2, 0, 1, 32, 'mid');
    var manual = r.rectangles.reduce(function (s, rc) { return s + rc.h * r.dx; }, 0);
    return close(manual, r.value, 1e-12);
  })());
ok('辛普森积分 ∫₀¹ x² dx 精确到 1e-12', close(MC.simpson(f2, 0, 1, 1000), exact, 1e-12),
  MC.simpson(f2, 0, 1, 1000));
// 有正负面积的函数，验证“代数和”语义
var f3 = function (x) { return x; };
ok('∫₋₁¹ x dx = 0（正负面积抵消，代数和语义）', close(MC.simpson(f3, -1, 1, 1000), 0, 1e-12));
ok('∫₀¹ x dx = 0.5', close(MC.simpson(f3, 0, 1, 1000), 0.5, 1e-12));

// ---------------------------------------------------------------------------
group('5. 级数部分和');

var g = MC.geometricPartial(1, 0.5, 30);
ok('几何级数 Σ(1/2)^k (k=0..29) 逼近 2', close(g.value, 2, 1e-8), g.value);
ok('几何级数部分和 < 2 且单调递增', g.value < 2 && g.value > MC.geometricPartial(1, 0.5, 10).value);
var h1 = MC.harmonicPartial(1000);
var h2 = MC.harmonicPartial(10000);
ok('调和级数发散：H(10000) > H(1000)', h2.value > h1.value, h1.value.toFixed(4) + ' → ' + h2.value.toFixed(4));
ok('H(1000) ≈ 7.4855（±0.01）', Math.abs(h1.value - 7.4855) < 0.01, h1.value);
ok('H(n) > ln(n)+0.5（下界）', h2.value > Math.log(10000) + 0.5, h2.value + ' vs ' + (Math.log(10000) + 0.5));

// ---------------------------------------------------------------------------
group('6. 数值格式化与边界');

ok('formatNumber(1/3) 输出 0.3333', MC.formatNumber(1 / 3, 4) === '0.3333', MC.formatNumber(1 / 3, 4));
ok('formatNumber(0) 输出 0 而非 -0', MC.formatNumber(0) === '0', MC.formatNumber(0));
ok('formatNumber(Infinity) 输出 +∞', MC.formatNumber(Infinity) === '+∞');
ok('1/0 = Infinity（不抛错）', evalAt('1/x', 0) === Infinity);

// ---------------------------------------------------------------------------
group('2b. LaTeX 输出的语义等价（显示式必须与表达式同值，独立评审发现的问题）');

function latex(src) { return MC.toLatex(MC.parse(src)); }

ok('(-x)^2 显示为 \\left(-x\\right)^{2}（不能显示成 -x²）',
  latex('(-x)^2') === '\\left(-x\\right)^{2}', latex('(-x)^2'));
ok('(-x)^3 显示带括号', latex('(-x)^3') === '\\left(-x\\right)^{3}', latex('(-x)^3'));
ok('(x^2)^3 显示带括号（LaTeX 中 x^{2}^{3} 非法）',
  latex('(x^2)^3') === '\\left(x^{2}\\right)^{3}', latex('(x^2)^3'));
ok('-(x)^2 显示为 -x^{2}（负号在幂之外，语义正确）', latex('-(x)^2') === '-x^{2}', latex('-(x)^2'));
ok('2^-x 指数带花括号', latex('2^-x') === '2^{-x}', latex('2^-x'));
ok('嵌套负号 -(-x) 显示为 -\\left(-x\\right)', latex('-(-x)') === '-\\left(-x\\right)', latex('-(-x)'));

// 逐条比对：显示式的“可读含义”与 AST 在同一 x 上的取值必须一致
(function () {
  var samples = ['(-x)^2', '(-x)^3', '-(x)^2', '(x^2)^3', '(2x)^2', 'x*(-x)', '1/(-x)', '(-x+1)^2', '2^-x'];
  var mismatch = [];
  samples.forEach(function (src) {
    var ast = MC.parse(src);
    var shown = latex(src);
    // 用 KaTeX 无关的等价形式核对：把 AST 与显示式分别求值
    var astVal = MC.evaluate(ast, { x: 3 });
    // 显示式再解析回来（\cdot / \frac / \left 等需要转回普通记号）后求值
    var reborn = shown
      .replace(/\\left\(/g, '(').replace(/\\right\)/g, ')')
      .replace(/\\cdot/g, '*')
      .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '(($1)/($2))')
      .replace(/\^\{([^{}]*)\}/g, '^($1)');
    var shownVal;
    try { shownVal = MC.evaluate(MC.parse(reborn), { x: 3 }); } catch (e) { shownVal = NaN; }
    if (!(Math.abs(astVal - shownVal) < 1e-9)) mismatch.push(src + ' AST=' + astVal + ' 显示式=' + shown + ' → ' + shownVal);
  });
  ok('9 个含括号/负号/幂的表达式：显示式与 AST 同值', mismatch.length === 0, mismatch.join(' | '));
})();

// ---------------------------------------------------------------------------
group('2c. 化简的定义域护栏（不能把 NaN / ∞ 化简成 0）');

ok('0*ln(x) 不化简为 0（x<0 时是 NaN）',
  MC.toLatex(MC.simplify(MC.parse('0*ln(x)'))) !== '0', MC.toLatex(MC.simplify(MC.parse('0*ln(x)'))));
ok('0/x 不化简为 0（x 可能为 0）',
  MC.toLatex(MC.simplify(MC.parse('0/x'))) !== '0', MC.toLatex(MC.simplify(MC.parse('0/x'))));
ok('0/5 化简为 0（分母是非零常数）',
  MC.toLatex(MC.simplify(MC.parse('0/5'))) === '0', MC.toLatex(MC.simplify(MC.parse('0/5'))));
ok('0*x^2 化简为 0（多项式处处有定义）',
  MC.toLatex(MC.simplify(MC.parse('0*x^2'))) === '0', MC.toLatex(MC.simplify(MC.parse('0*x^2'))));
ok('0*sqrt(x) 不化简为 0（x<0 时无定义）',
  MC.toLatex(MC.simplify(MC.parse('0*sqrt(x)'))) !== '0', MC.toLatex(MC.simplify(MC.parse('0*sqrt(x)'))));
ok('常数合并不产生 Infinity 溢出',
  MC.toLatex(MC.simplify(MC.parse('10^300*(10^300*x)'))).indexOf('Infinity') === -1,
  MC.toLatex(MC.simplify(MC.parse('10^300*(10^300*x)'))));

// ---------------------------------------------------------------------------
console.log('\n----------------------------------------');
console.log('通过 ' + passed + ' / 失败 ' + failed);
if (failed > 0) process.exitCode = 1;
