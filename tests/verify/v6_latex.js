/*!
 * v6_latex.js — toLatex 的独立语义核对
 *   1) 用 KaTeX 实际渲染（语法合法性）
 *   2) 把 toLatex 的输出用独立实现的 LaTeX→AST 翻译器解析回表达式，逐点比较取值
 *      （不依赖被测代码的任何函数，除了 MC.parse/compile 作为求值器）
 *   3) 覆盖大量随机 AST + 定向构造（负号/幂/嵌套/函数/绝对值/根号/分式）
 */
'use strict';
var MC = require('../../src/core/math-core.js');
var katex = null;
try { katex = require('katex'); } catch (e) { }
var checks = 0, fails = [];

/* ---------------- 独立 LaTeX 子集解析器（还原 toLatex 的输出） ---------------- */
function texToAst(src) {
  var s = String(src).replace(/\s+/g, '');
  var i = 0;
  function peek() { return s[i]; }
  function eat(tok) { if (s.substr(i, tok.length) === tok) { i += tok.length; return true; } return false; }
  function expect(tok) { if (!eat(tok)) throw new Error('期望 "' + tok + '" @' + i + ' in ' + s); }

  var FNS = ['\\arcsin', '\\arccos', '\\arctan', '\\sinh', '\\cosh', '\\tanh', '\\sin', '\\cos', '\\tan',
    '\\exp', '\\ln', '\\log_{2}', '\\log', '\\sqrt', '\\left|', '\\operatorname{sgn}', '\\min', '\\max'];

  function expr() {
    var node = term();
    for (;;) {
      if (peek() === '+' && s[i + 1] !== undefined) { i++; node = { t: '+', l: node, r: term() }; }
      else if (peek() === '-') { i++; node = { t: '-', l: node, r: term() }; }
      else return node;
    }
  }
  function term() {
    var node = unary();
    for (;;) {
      if (eat('\\cdot')) { node = { t: '*', l: node, r: unary() }; continue; }
      // 隐式相乘（toLatex 不产生，但 tau 会输出 "2\pi"）
      var c = peek();
      if (c !== undefined && (c === '(' || c === '\\' || /[0-9a-z]/.test(c))) {
        // 只有当下一段确实是一个原子（而不是运算符）时才按隐式乘法处理
        if (s.substr(i, 6) !== '\\right' && s.substr(i, 5) !== '\\left') { node = { t: '*', l: node, r: unary() }; continue; }
      }
      return node;
    }
  }
  function unary() {
    if (peek() === '-') { i++; return { t: 'neg', a: unary() }; }
    if (peek() === '+') { i++; return unary(); }
    return power();
  }
  function power() {
    var base = atom();
    while (s.substr(i, 2) === '^{') {
      i += 2;
      var e = expr();
      expect('}');
      base = { t: '^', l: base, r: e };
    }
    return base;
  }
  function atom() {
    if (eat('\\left(')) { var e = expr(); expect('\\right)'); return e; }
    if (eat('(')) { var e2 = expr(); expect(')'); return e2; }
    if (eat('\\frac{')) { var n = expr(); expect('}'); expect('{'); var d = expr(); expect('}'); return { t: '/', l: n, r: d }; }
    if (eat('\\sqrt{')) { var a = expr(); expect('}'); return { t: 'call', n: 'sqrt', a: [a] }; }
    if (eat('\\left|')) { var a2 = expr(); expect('\\right|'); return { t: 'call', n: 'abs', a: [a2] }; }
    if (eat('\\pi')) return { t: 'num', v: Math.PI };
    if (eat('\\infty')) return { t: 'num', v: Infinity };
    for (var k = 0; k < FNS.length; k++) {
      if (FNS[k] === '\\left|' || FNS[k] === '\\sqrt') continue;
      if (eat(FNS[k])) {
        var name = FNS[k].replace('\\', '').replace('_{2}', '2');
        if (name === 'operatorname{sgn}') name = 'sign';
        name = { arcsin: 'asin', arccos: 'acos', arctan: 'atan' }[name] || name;
        expect('\\left(');
        var args = [expr()];
        while (peek() === ',') { i++; args.push(expr()); }
        expect('\\right)');
        return { t: 'call', n: name, a: args };
      }
    }
    var m = /^-?[0-9]+(\.[0-9]+)?(e[+-][0-9]+)?/i.exec(s.slice(i));
    if (m) { i += m[0].length; return { t: 'num', v: Number(m[0]) }; }
    if (peek() === 'x') { i++; return { t: 'var', n: 'x' }; }
    if (peek() === 'e') { i++; return { t: 'num', v: Math.E }; }
    if (/^[a-z]/i.test(peek() || '')) { var v = peek(); i++; return { t: 'var', n: v }; }
    throw new Error('无法翻译 @' + i + ' 附近: ' + s.slice(i, i + 20) + '  (全文 ' + s + ')');
  }
  var ast = expr();
  if (i !== s.length) throw new Error('翻译后仍有剩余: ' + s.slice(i) + '  (全文 ' + s + ')');
  return ast;
}
function astToSrc(n) {
  switch (n.t) {
    case 'num': return '(' + n.v + ')';
    case 'var': return n.n;
    case 'neg': return '(-' + astToSrc(n.a) + ')';
    case '+': case '-': case '*': case '/': case '^':
      return '(' + astToSrc(n.l) + n.t + astToSrc(n.r) + ')';
    case 'call': return n.n + '(' + n.a.map(astToSrc).join(',') + ')';
  }
  throw new Error('bad ast node ' + JSON.stringify(n));
}
function astVal(n, x) { return MC.functionOfX(astToSrc(n))(x); }

/* ---------------- 检查单个表达式 ---------------- */
var XS = [3, 0.5, -2, 1.7, -0.25];
function checkTex(src, depth) {
  checks++;
  var ast, tex, back, bad = [];
  try { ast = MC.parse(src); tex = MC.toLatex(ast); }
  catch (e) { fails.push({ src: src, why: 'toLatex 抛错: ' + e.message }); return; }
  if (katex) {
    try { katex.renderToString(tex); }
    catch (e) { fails.push({ src: src, why: 'KaTeX 拒绝渲染: ' + e.message.split('\n')[0], tex: tex }); return; }
  }
  try { back = texToAst(tex); }
  catch (e) { fails.push({ src: src, why: '翻译器无法解析 toLatex 输出: ' + e.message, tex: tex }); return; }
  XS.forEach(function (x) {
    checks++;
    var a, b;
    try { a = MC.compile(ast)({ x: x }); } catch (e) { a = NaN; }
    try { b = astVal(back, x); } catch (e) { b = NaN; }
    var same = (a === b) || (Number.isNaN(a) && Number.isNaN(b)) ||
      (isFinite(a) && isFinite(b) && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a)));
    if (!same) bad.push('x=' + x + ' AST=' + a + ' 显示式=' + b);
  });
  if (bad.length) fails.push({ src: src, tex: tex, why: '显示式与 AST 不同值: ' + bad.slice(0, 2).join('; ') });
  if (depth) console.log('  ' + pad(src, 14) + ' → ' + pad(tex, 34) + (bad.length ? '  ❌ ' + bad[0] : '  ✓'));
}

console.log('== 1. 定向构造：负号 / 幂 / 嵌套 ==');
['x^2', '(-x)^2', '(-x)^3', '(-x)^4', '-(x)^2', '0-x^2', '(x^2)^3', '(x^3)^2', 'x^(2^3)', 'x^(x^2)',
  '(2x)^2', '(-2x)^2', '(1/x)^2', '(1/x)^(-1)', 'x^(-2)', '(-x)^(-2)', '2^-x', '2^(-x^2)', 'x*(-x)', '(-x)*x',
  '1/(-x)', '-(-x)', '-(-(-x))', '-(x+1)', '-(x-1)', 'x-(-y)', 'x-(-x)', '2*(-x)', '(-x)-(-x)',
  '(-x+1)^2', '(x+1)^(-2)', 'sqrt(-x)', 'abs(-x)', 'abs(x)^2', 'sqrt(x)^2', 'exp(-x)', 'exp(-x^2)',
  'sin(-x)', 'sin(x)^2', 'tan(x)^2', 'ln(-x)', 'log2(x)', 'log(x^2)', 'atan(x/2)', 'asin(x/3)', 'abs(x)^(-1)'
].forEach(function (s) { checkTex(s, true); });

console.log('\n== 2. 随机 AST 语料（500 条）==');
var seed = 424242;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function pick(a) { return a[Math.floor(rnd() * a.length)]; }
function gen(d) {
  if (d <= 0 || rnd() < 0.22) return rnd() < 0.55 ? 'x' : String(pick([0, 1, 2, 3, 0.5, 7, 10]));
  var r = rnd();
  if (r < 0.3) return pick(['sin', 'cos', 'exp', 'abs', 'sqrt', 'ln', 'atan', 'tan']) + '(' + gen(d - 1) + ')';
  var op = pick(['+', '-', '*', '/', '^']);
  var l = gen(d - 1), rr = gen(d - 1);
  if (op === '^') rr = String(pick([0, 1, 2, 3, -1, 0.5]));
  if (rnd() < 0.35) l = '(-' + l + ')';
  return '(' + l + ')' + op + '(' + rr + ')';
}
var corpus = [];
for (var q = 0; q < 500; q++) corpus.push(gen(3));
corpus.forEach(function (s) { checkTex(s, false); });
console.log('  500 条随机表达式中，KaTeX 语法/语义失败: ' + fails.length + ' 条');
fails.slice(0, 8).forEach(function (f) { console.log('   - ' + f.src + '  → ' + (f.tex || '') + '  ' + f.why); });

/* ---------------- 化简器的定义域护栏是否严密 ---------------- */
console.log('\n== 3. 新化简护栏 isTotal 的反例搜索 ==');
var guard = [
  '0*ln(x)', '0/x', '0/5', '0*x^2', '0*sqrt(x)', '0*abs(x)', '0*exp(x)', '0*sin(x)', '0*tan(x)',
  '0*exp(1000)', '0*(10^400)', '0*(x^400)', '0*(x^1000)', '0*(exp(x)*exp(x))', '0/(x-x)',
  '0*(x^2+1)/(x^2+1)', '0*(1/(x^2+1))', '0*logb(x,2)', '0*round(x)', '0*floor(x)', '0*sign(x)'
];
var holes = 0;
guard.forEach(function (src) {
  checks++;
  var ast = MC.parse(src), simp = MC.simplify(ast);
  var f0 = MC.compile(ast), f1 = MC.compile(simp);
  var bad = [];
  [-3.3, -1, 0, 0.5, 1, 3, 100, 1000].forEach(function (x) {
    var a = f0({ x: x }), b = f1({ x: x });
    var same = (Number.isNaN(a) && Number.isNaN(b)) || (a === b) ||
      (isFinite(a) && isFinite(b) && Math.abs(a - b) <= 1e-12);
    if (!same) bad.push('x=' + x + ': ' + a + ' → ' + b);
  });
  if (bad.length) {
    holes++;
    console.log('  HOLE  ' + pad(src, 14) + ' → ' + pad(MC.toLatex(simp).slice(0, 22), 24) + bad.join(' | '));
    fails.push({ src: src, why: '新护栏仍改值: ' + bad.join(' | '), tex: MC.toLatex(simp) });
  }
});
console.log('  护栏反例: ' + holes + ' / ' + guard.length);

/* ---------------- 模块实际公式 ---------------- */
console.log('\n== 4. 模块（calculus.js）实际显示的导数公式 ==');
[['x2', 'x^2'], ['x3', 'x^3'], ['sin', 'sin(x)'], ['exp', 'e^x'], ['ln', 'ln(x)']].forEach(function (f) {
  checks++;
  var d = MC.simplify(MC.diff(MC.parse(f[1]), 'x'));
  var tex = MC.toLatex(d);
  var r = 'ok';
  if (katex) { try { katex.renderToString(tex); } catch (e) { r = 'KaTeX FAIL ' + e.message.split('\n')[0]; } }
  console.log('  f=' + pad(f[1], 8) + " f'=" + pad(tex, 24) + r);
  if (r !== 'ok') fails.push({ src: f[1], why: r });
});

function pad(s, n) { while (s.length < n) s += ' '; return s; }
console.log('\n----------------------------------------');
console.log('v6 checks=' + checks + '  failures=' + fails.length);
fails.slice(0, 20).forEach(function (f) { console.log('  FAIL ' + f.src + '  ' + (f.tex || '') + '  ' + f.why); });
