/*!
 * v2_parser.js — 解析器：优先级 / 结合性 / 隐式乘法 / 函数元数 / 负底数
 */
'use strict';
var MC = require('../../src/core/math-core.js');
var checks = 0, issues = [];

function ev(src, x) { checks++; try { return MC.functionOfX(src)(x === undefined ? 0 : x); } catch (e) { return 'ERR:' + e.name; } }
function expect(src, x, want, why, sev, category) {
  checks++;
  var got = ev(src, x);
  var okv = (typeof want === 'number' && typeof got === 'number')
    ? (Number.isNaN(want) ? Number.isNaN(got) : Math.abs(got - want) <= 1e-12 * Math.max(1, Math.abs(want)))
    : got === want;
  if (!okv) issues.push({ src: src, x: x, got: got, want: want, why: why, sev: sev, cat: category });
  console.log('  ' + (okv ? ' ok ' : 'FAIL') + '  ' + pad(src, 16) + ' @x=' + x + '  = ' + got + (okv ? '' : '   want=' + want + '  [' + why + ']'));
  return got;
}

console.log('== 1. 幂的右结合 / 一元负号 ==');
expect('2^3^2', 0, 512, '右结合', 'blocker', 'wrong');
expect('2^2^3', 0, 256, '2^(2^3)=256，非 (2^2)^3=64', 'blocker', 'wrong');
expect('-2^2', 0, -4, '一元负号低于幂', 'blocker', 'wrong');
expect('(-2)^2', 0, 4, '括号内为底', 'blocker', 'wrong');
expect('-3^2', 0, -9, '', 'blocker', 'wrong');
expect('2^-1', 0, 0.5, '负指数', 'blocker', 'wrong');
expect('2^-3^2', 0, Math.pow(2, -9), '2^(-(3^2))', 'medium', 'fragile');
expect('-x^2', 3, -9, '一元负号低于幂（x=3）', 'blocker', 'wrong');
expect('x^-2', 2, 0.25, '', 'blocker', 'wrong');
expect('2*x^2', 3, 18, '', 'blocker', 'wrong');
expect('2x^2', 3, 18, '隐式乘法绑定幂', 'blocker', 'wrong');
expect('x^2x', 3, 27, '(x^2)*x', 'low', 'fragile');

console.log('\n== 2. 隐式乘法 ==');
expect('2x', 4, 8, '', 'blocker', 'wrong');
expect('2(x+1)', 4, 10, '', 'blocker', 'wrong');
expect('(x+1)(x-1)', 3, 8, '', 'blocker', 'wrong');
expect('2pi', 0, 2 * Math.PI, '常数隐式乘法', 'blocker', 'wrong');
expect('(x)(x)', 3, 9, '', 'blocker', 'wrong');
expect('x(x+1)', 3, 12, '变量后接括号=隐式乘法', 'medium', 'fragile');
expect('2 3', 0, 6, '空格分隔数字隐式乘法', 'low', 'fragile');
expect('1/2x', 4, 2, '(1/2)*x —— 与手写惯例 1/(2x) 不同', 'low', 'fragile');
expect('1/2/x', 4, 0.125, '除法左结合 (1/2)/x', 'low', 'fragile');
expect('2^-x', 0, 1, '2^0=1', 'low', 'fragile');

console.log('\n== 3. 负底数 / 分数次幂 ==');
expect('(-8)^(1/3)', 0, NaN, 'JS Math.pow(-8,1/3)=NaN；数学实根为 -2', 'medium', 'fragile');
expect('(-8)^2', 0, 64, '', 'blocker', 'wrong');
expect('(-8)^(0.5)', 0, NaN, '实数域无定义，NaN 可接受', 'low', 'ok');
expect('(-1)^x', 2, 1, 'JS 整数指数', 'low', 'ok');
expect('(-2)^x', 1.5, NaN, '', 'low', 'ok');
expect('sqrt(-4)', 0, NaN, '', 'low', 'ok');
expect('e^(ln(-1))', 0, NaN, '', 'low', 'ok');

console.log('\n== 4. 函数元数 / 未知函数 / 常量 ==');
expect('log(1000)', 0, 3, 'log 是常用对数', 'blocker', 'wrong');
expect('log2(8)', 0, 3, '', 'blocker', 'wrong');
expect('logb(8,2)', 0, 3, '两参数对数', 'blocker', 'wrong');
expect('min(3,2)', 0, 2, '', 'blocker', 'wrong');
expect('max(3,2)', 0, 3, '', 'blocker', 'wrong');
expect('atan2(1,1)', 0, Math.PI / 4, '', 'blocker', 'wrong');
expect('tau', 0, 2 * Math.PI, '', 'blocker', 'wrong');
expect('PI', 0, Math.PI, '', 'blocker', 'wrong');
expect('E', 0, 'ERR:ReferenceError', 'E 不是常量（只有小写 e）；现已抛 ReferenceError', 'low', 'ok');
expect('ln(e)', 0, 1, '', 'blocker', 'wrong');
expect('sin e', 0, 'ERR:ReferenceError', 'sin 无括号 → 变量 sin 未定义 → 抛错', 'low', 'ok');
expect('sin^2(x)', 3, 'ERR:ReferenceError', 'sin^2(x) 被解析为 (sin^2)*x；现已抛 ReferenceError', 'low', 'ok');
expect('sin(x)^2', 3, Math.pow(Math.sin(3), 2), '正确写法', 'blocker', 'wrong');
expect('1e3', 0, 1000, '科学计数法（19:01 版本新增支持）', 'low', 'ok');
expect('1e-3', 0, 0.001, '负指数科学计数法', 'low', 'ok');
expect('2e', 0, 2 * Math.E, '2e 无指数 → 2·e', 'low', 'ok');
expect('1e999', 0, 'ERR:SyntaxError', '溢出为 Infinity → 判为非法数字', 'low', 'ok');
expect('0x10', 0, 'ERR:ReferenceError', '十六进制不支持 → 变量 x10 未定义', 'low', 'ok');

console.log('\n== 5. 语法错误处理 ==');
[
  ['x +', '尾部运算符'], ['(x', '缺右括号'], ['sin(x', '函数缺右括号'],
  ['foo(x)', '未知函数'], ['sin(x,2)', '元数不符'], ['sin()', '空参数'],
  ['1..2', '非法数字'], ['x @ 2', '非法字符'], ['x)', '多余右括号'],
  ['x y z', '多变量（可解析但求值需 scope）'], ['', '空表达式'], ['   ', '空白']
].forEach(function (p) {
  checks++;
  var threw = null;
  try { MC.parse(p[0]); } catch (e) { threw = e.name; }
  console.log('  ' + p[0] + '  → ' + (threw ? '抛 ' + threw : '未抛错'));
});

console.log('\n== 6. 求值器与编译器的行为一致性 ==');
['x^2+1', 'sin(x)/x', '2x^3-4x+1', 'abs(x-2)', 'log(x+1)', 'x^x'].forEach(function (src) {
  var ast = MC.parse(src);
  var f = MC.compile(ast);
  [0.3, 1.7, 3.1, -0.4].forEach(function (x) {
    checks++;
    var a = MC.evaluate(ast, { x: x }), b = f({ x: x });
    if (!(a === b || (Number.isNaN(a) && Number.isNaN(b)))) {
      issues.push({ src: src, x: x, got: b, want: a, why: 'evaluate vs compile 不一致', sev: 'high', cat: 'wrong' });
      console.log('  FAIL ' + src + ' @' + x + ' evaluate=' + a + ' compile=' + b);
    }
  });
});
console.log('  evaluate/compile 一致性检查完成');

console.log('\n== 7. 未绑定变量的行为（compile 路径，模块绘图实际使用） ==');
['e3', 'y', 'sin', 'x*y'].forEach(function (src) {
  checks++;
  var viaCompile, viaEvaluate;
  try { viaCompile = String(MC.functionOfX(src)(2)); } catch (e) { viaCompile = 'throws ' + e.name; }
  try { viaEvaluate = String(MC.evaluate(MC.parse(src), { x: 2 })); } catch (e) { viaEvaluate = 'throws ' + e.name; }
  var inconsistent = (viaCompile !== viaEvaluate);
  console.log('  ' + pad(src, 6) + ' compile→' + pad(viaCompile, 18) + ' evaluate→' + viaEvaluate + (inconsistent ? '   <-- 不一致' : ''));
  if (inconsistent) issues.push({ src: src, x: 2, got: viaCompile, want: viaEvaluate, why: 'compile 静默返回 NaN/undefined，evaluate 抛 ReferenceError', sev: 'low', cat: 'fragile' });
});

function pad(s, n) { while (s.length < n) s += ' '; return s; }
console.log('\n----------------------------------------');
console.log('v2 checks=' + checks + '  issues=' + issues.length);
issues.forEach(function (i) { console.log('  [' + i.sev + '/' + i.cat + '] ' + i.src + ' @' + i.x + ' got=' + i.got + ' want=' + i.want + ' (' + i.why + ')'); });
