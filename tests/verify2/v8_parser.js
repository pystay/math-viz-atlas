/*!
 * tests/verify2/v8_parser.js — 自由输入管线（toFunctionOfX / parseSafe / sandbox 探针）独立复核
 * 运行：node tests/verify2/v8_parser.js
 */
'use strict';
var H = require('./harness.js');
var MC = H.MC;

var checks = 0, bad = [], frag = [];
function ck(label, cond, detail) { checks++; if (!cond) bad.push({ label: label, detail: detail }); return cond; }
function frag_(label, detail) { frag.push({ label: label, detail: detail }); }

/* ---------------------------------------------- 1. 接受/拒绝清单 + 数值正确性 */
console.log('[1] 应接受 / 应拒绝的输入：');
var accept = [
  ['sin(x)*e^(-x/3)', 'complex'], ['2x', 'implicit mult'], ['(x+1)(x-1)', 'implicit mult'],
  ['x^(1/3)', 'rational power'], ['abs(x)', 'abs'], ['min(x,2)', '2-ary min'],
  ['atan2(x,1)', '2-ary atan2'], ['logb(x,2)', 'log base b'], ['pi', 'constant'],
  ['e', 'constant'], ['tau', 'constant'], ['1e-3', 'scientific'], ['.5', 'leading dot'],
  ['2.5e2', 'scientific'], ['-x^2', 'unary minus'], ['2^3^2', 'right assoc'],
  ['2e', '2·e'], ['x x', 'implicit mult vars'], ['2 3', 'implicit mult nums'],
  ['sin(x)cos(x)', 'implicit mult functions'], ['x/2x', 'div then implicit'], ['sqrt(x^2+1)', 'nested'],
  ['max(x,-x)', 'max'], ['floor(x)+ceil(x)', 'floor/ceil'], ['sign(x)', 'sign'], ['round(x)', 'round'],
  ['log(x)', 'log10'], ['log2(x)', 'log2'], ['x^2e-3', 'mixed'], ['3(x+1)', 'number paren']
];
var acceptBad = 0;
accept.forEach(function (t) {
  var r = MC.toFunctionOfX(t[0]);
  if (!r.ok) { acceptBad++; console.log('    ✗ 被拒绝: "' + t[0] + '" (' + t[1] + ') → ' + r.message + ' @' + r.index); }
});
console.log('    应接受 ' + accept.length + ' 例，被误拒 ' + acceptBad);
ck('合法输入不被拒绝', acceptBad === 0, acceptBad);

var reject = [
  ['si(x)', '拼错函数名', true], ['sin', '缺括号', false], ['y+1', '多变量', false],
  ['sin(x', '缺右括号', false], ['x^2 +', '意外结束', false], ['2 +* 3', '连续运算符', false],
  ['1.2.3', '非法数字', false], ['x))', '多余右括号', false], ['(*)', '空括号', false],
  ['x!', '非法字符', false], ['', '空输入', false], ['   ', '空白', false],
  ['min(x)', '元数错误', false], ['atan2(x)', '元数错误', false], ['x_1', '下标非法', false],
  ['2^^3', '连续幂', false], ['x/', '缺分母', false], ['()', '空括号', false]
];
var rejectBad = 0;
reject.forEach(function (t) {
  var r = MC.toFunctionOfX(t[0]);
  if (r.ok) { rejectBad++; console.log('    ✗ 被错误接受: "' + t[0] + '" (' + t[1] + ')'); }
  else console.log('    ✓ 拒绝 "' + t[0] + '" → ' + r.message + '（index=' + r.index + '）');
});
console.log('    应拒绝 ' + reject.length + ' 例，被误收 ' + rejectBad);
ck('非法输入全部被拒绝', rejectBad === 0, rejectBad);

/* ---------------------------------------------- 2. 数值正确性（求值抽查） */
console.log('\n[2] 关键取值：');
[
  ['2x', 3, 6], ['(x+1)(x-1)', 3, 8], ['x^(1/3)', -8, -2], ['(-8)^(1/3)', 0, -2],
  ['2^3^2', 0, 512], ['2e', 0, 2 * Math.E], ['1e-3', 0, 0.001], ['.5', 0, 0.5],
  ['2 3', 0, 6], ['sin(x)cos(x)', 0.7, Math.sin(0.7) * Math.cos(0.7)], ['-x^2', 3, -9],
  ['x/2x', 4, 8], ['x^2e-3', 2, Math.pow(2, 0.002)], ['min(x,2)', 5, 2], ['logb(x,2)', 8, 3],
  ['x x', 3, 9], ['3(x+1)', 2, 9], ['abs(-x)', -4, 4]
].forEach(function (t) {
  var res = MC.toFunctionOfX(t[0]);
  var got = res.ok ? res.fn({ x: t[1] }) : NaN;
  var ok = Math.abs(got - t[2]) < 1e-12;
  if (!ok) { ck('取值不符 "' + t[0] + '" @x=' + t[1], false, got + ' vs ' + t[2]); }
  console.log('    ' + t[0] + ' @x=' + t[1] + ' = ' + got + (ok ? ' ✓' : ' ✗ 期望 ' + t[2]));
});
frag.push({ label: '隐式乘法优先级：x^2y 解析为 (x²)·y、x/2x 解析为 (x/2)·x（与 Desmos 一致，但与 x^(2y)、x/(2x) 的手写习惯相左）', detail: "MC.toFunctionOfX('x^2y') 因含 y 被拒；'x^2x' @x=2 = " + MC.toFunctionOfX('x^2x').fn({ x: 2 }) + "（若按 x^(2x) 应为 16）" });
console.log('    x^2x @x=2 = ' + MC.toFunctionOfX('x^2x').fn({ x: 2 }) + '（若按 x^(2x) 应为 16；模块给 (x²)·x = 8）');
console.log('    1/2x @x=3 = ' + MC.toFunctionOfX('1/2x').fn({ x: 3 }) + '（若按 1/(2x) 应为 0.1667；模块给 (1/2)·x = 1.5）');

/* ---------------------------------------------- 3. 报错定位（trim 偏移） */
console.log('\n[3] 报错字符位置：index 是「原文绝对位置」还是「trim 后位置」（app.js:286 直接用 raw + index 画 ^）');
var cases = [
  { raw: 'x^2 + si(x)', note: '无前导空格' },
  { raw: '   x^2 + si(x)', note: '3 个前导空格' },
  { raw: '  y+1', note: '2 个前导空格 + 多变量' },
  { raw: '\t x^2 + ', note: 'tab+空格 前导 + 尾部意外结束' },
  { raw: ' x!', note: '1 个前导空格 + 非法字符' },
  { raw: 'x + sin(', note: '缺右括号' },
  { raw: '(x+1', note: '未闭合左括号' },
  { raw: 'x^2 + *3', note: '连续运算符' },
  { raw: '1.2.3', note: '非法数字' },
  { raw: 'x))', note: '多余括号' }
];
var idxBad = 0, convention = { absolute: 0, trimRelative: 0, unclear: 0 };
cases.forEach(function (c) {
  var res = MC.toFunctionOfX(c.raw);
  var trimmed = c.raw.trim();
  var lead = c.raw.length - c.raw.replace(/^\s+/, '').length;
  var i = res.index;
  // 输入末尾类错误（意外结束）允许 index 落在 trim 末尾附近（原文坐标系下 ≥ lead+len−1）
  var endOfInput = (i >= trimmed.length);
  var isAbsolute = (lead === 0) || (endOfInput ? (i >= trimmed.length + lead - 1) : (i - lead >= 0 && i < c.raw.length && c.raw[i] === trimmed[i - lead]));
  var isTrimRel = (lead === 0) || (c.raw[i + lead] === trimmed[i]);
  if (lead === 0) { convention.absolute++; } else if (isAbsolute) convention.absolute++; else if (isTrimRel) convention.trimRelative++; else convention.unclear++;
  console.log('    "' + c.raw.replace(/\t/g, '\\t') + '"（' + c.note + '）→ index=' + i + '，前导空白 ' + lead +
    '；按原文定位=' + isAbsolute + '，按 trim 后定位=' + isTrimRel + '；raw[' + i + ']=' + JSON.stringify(c.raw[i]) +
    '，trimmed[' + (i - lead) + ']=' + JSON.stringify(trimmed[i - lead]));
  if (lead > 0 && !isAbsolute) { idxBad++; }
});
console.log('    约定统计：原文绝对位置 ' + convention.absolute + ' 例，trim 相对位置 ' + convention.trimRelative + ' 例（若 >0 则 app.js:286 的 ^ 会偏移）');
ck('报错 index 可直接用于原始输入定位（含前导空白）', idxBad === 0, idxBad + ' 例偏移');
console.log('    错误信息指向的是"出问题的记号首字符"：si→si 起始位、x!→! 位、2+*3→* 位、未闭合括号→左括号位/输入末尾');

/* ---------------------------------------------- 4. parseSafe 与 toFunctionOfX 一致性 */
console.log('\n[4] parseSafe 与 toFunctionOfX 的 index/ok 一致性（仅比较两者都失败的情形）：');
var mismatch = 0;
var all = accept.map(function (t) { return t[0]; }).concat(reject.map(function (t) { return t[0]; }));
all.forEach(function (s) {
  var a = MC.parseSafe(s), b = MC.toFunctionOfX(s);
  if (!a.ok && !b.ok && a.index !== b.index) {
    mismatch++;
    console.log('    index 不一致 "' + s + '": parseSafe=' + a.index + ' toFunctionOfX=' + b.index);
  }
});
ck('两者在语法失败时 index 一致', mismatch === 0, mismatch);
console.log('    parseSafe("y+1").ok = ' + MC.parseSafe('y+1').ok + '（parseSafe 只做语法，不做单变量校验，故 ok=true 属预期）');
console.log('    parseSafe("si(x)").ok = ' + MC.parseSafe('si(x)').ok + '（同理：si 被当作变量名，多变量校验由 toFunctionOfX 负责）');

/* ---------------------------------------------- 5. 沙盒探针：符号求导 vs 数值导数 */
console.log('\n[5] 沙盒（sandbox.js）探针：符号导数 vs 中心差分');
var mods = H.loadModule('src/modules/sandbox.js');
var sb = H.byId(mods, 'sandbox');
console.log('    模块 sandbox 注册:', !!sb);
var fx = ['sin(x)*e^(-x/3)', 'x^2/4 - 1', '1/x', 'x^3-3x', 'ln(x)', 'sqrt(x)', 'tan(x)', 'abs(x)', 'exp(sin(x))', 'x^(1/3)'];
var probeBad = 0, probeCases = 0;
fx.forEach(function (f) {
  [-3, -1.5, -0.5, 0.3, 1.2, 2.7, 5].forEach(function (x0) {
    var r = MC.toFunctionOfX(f);
    if (!r.ok) return;
    var d = null;
    try { d = MC.compile(MC.diff(r.ast, 'x')); } catch (e) { d = null; }
    if (!d) return;
    var sym = d({ x: x0 });
    var f1 = MC.functionOfX(f);
    if (!isFinite(f1(x0))) return;
    var num = MC.numericDerivative(f1, x0, 1e-6);
    probeCases++;
    var tol = 1e-5 * Math.max(1, Math.abs(sym));
    if (!(Math.abs(sym - num) <= tol)) {
      probeBad++;
      if (probeBad < 8) console.log('      ✗ ' + f + ' @' + x0 + '：符号 ' + sym + ' vs 数值 ' + num);
    }
  });
});
console.log('    有效对照 ' + probeCases + ' 组，超出容差 ' + probeBad);
ck('沙盒符号导数与数值导数一致（含 abs/tan/ln 等）', probeBad === 0, probeBad);
// 探针读数格式
var rm = {};
sb.readouts({ f1: 'x^2', f2: 'x', f3: 'x^3', probe: true }, { px: 2 }).forEach(function (r) { rm[r.label.zh] = r.value; });
console.log('    读数样例（x₀=2）：' + JSON.stringify(rm));
ck('探针读数 f₁′(2)=4、f₃′(2)=12', rm['f1(x₀) / f′'] === '4 / 4' && rm['f3(x₀) / f′'] === '8 / 12', JSON.stringify(rm));
var rbad = {};
sb.readouts({ f1: 'si(x)', f2: '1/x', f3: 'sin(x)', probe: true }, { px: 0 }).forEach(function (r) { rbad[r.label.zh] = r.value; });
console.log('    x₀=0 且 f₂=1/x 时的读数：' + JSON.stringify(rbad));

/* ---------------------------------------------- 6. 其它潜在误收 */
console.log('\n[6] 边界输入：');
[
  'sin()', 'sin(x,)', 'min(x,2,3)', 'x^-2', '2^(1/2)x', '(x)(x)(x)', '((x))', 'x^(2^3)', '1/0', 'sqrt(-1)',
  'ln(-1)', '1e', 'e1', 'x1', '1x', '2pi', 'pi2', '\u00d7x', 'x\u00b2'
].forEach(function (s) {
  var r = MC.toFunctionOfX(s);
  var val = null;
  if (r.ok) { try { val = r.fn({ x: 2 }); } catch (e) { val = 'ERR:' + e.message; } }
  console.log('    ' + JSON.stringify(s) + ' → ok=' + r.ok + (r.ok ? '，f(2)=' + val : '，' + r.message + ' @' + r.index));
});

console.log('\n[7] 结论：独立检查 ' + checks + ' 项，不符 ' + bad.length + ' 项');
bad.forEach(function (b) { console.log('  [WRONG] ' + b.label + ' → ' + b.detail); });
frag.forEach(function (b) { console.log('  [FRAGILE] ' + b.label + ' → ' + b.detail); });
