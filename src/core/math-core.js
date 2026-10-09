/*!
 * math-core.js — 数学逻辑层（Math Logic Layer）
 * ---------------------------------------------------------------------------
 * 纯计算，不依赖 DOM，可在浏览器（全局 MathCore）与 Node（require）中运行，
 * 因此可以被单元测试直接导入做数学正确性验收。
 *
 * 能力：
 *   1. 表达式解析（递归下降）→ AST，支持隐式乘法、右结合幂运算
 *   2. 数值求值（compile → 普通 JS 函数，热路径无 AST 遍历开销）
 *   3. 符号求导（diff）——不是数值差分，而是精确的代数求导
 *   4. 化简（simplify）+ LaTeX 输出（toLatex）
 *   5. 微积分工具：黎曼和、数值导数（仅用于交叉验证）、级数部分和
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MathCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // -------------------------------------------------------------------------
  // 1. 词法分析
  // -------------------------------------------------------------------------
  var FUNCTIONS = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    exp: Math.exp, ln: Math.log, log2: Math.log2,
    log: function (x) { return Math.log10 ? Math.log10(x) : Math.log(x) / Math.LN10; },
    logb: function (x, b) { return Math.log(x) / Math.log(b); },
    sqrt: Math.sqrt, abs: Math.abs, sign: Math.sign,
    floor: Math.floor, ceil: Math.ceil, round: Math.round,
    min: Math.min, max: Math.max
  };
  var CONSTANTS = { pi: Math.PI, PI: Math.PI, e: Math.E, tau: Math.PI * 2 };

  var ARITY = {
    sin: 1, cos: 1, tan: 1, asin: 1, acos: 1, atan: 1, sinh: 1, cosh: 1, tanh: 1,
    exp: 1, ln: 1, log: 1, log2: 1, logb: 2, sqrt: 1, abs: 1, sign: 1,
    floor: 1, ceil: 1, round: 1, min: 2, max: 2, atan2: 2
  };

  function tokenize(src) {
    var tokens = [];
    var i = 0;
    function fail(msg, at) {
      var e = new SyntaxError(msg);
      e.index = at;
      throw e;
    }
    while (i < src.length) {
      var ch = src[i];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
      if (/[0-9.]/.test(ch)) {
        var start = i;
        while (i < src.length && /[0-9.]/.test(src[i])) i++;
        // 科学计数法：仅当 e/E 后面确实跟着指数时才算（2e 仍是 2·e）
        if (i < src.length && (src[i] === 'e' || src[i] === 'E')) {
          var j = i + 1;
          if (src[j] === '+' || src[j] === '-') j++;
          if (j < src.length && /[0-9]/.test(src[j])) {
            while (j < src.length && /[0-9]/.test(src[j])) j++;
            i = j;
          }
        }
        var text = src.slice(start, i);
        if ((text.match(/\./g) || []).length > 1) fail('非法数字: ' + text, start);
        var value = parseFloat(text);
        if (!isFinite(value)) fail('非法数字: ' + text, start);
        tokens.push({ type: 'num', value: value, start: start });
        continue;
      }
      if (/[A-Za-z_]/.test(ch)) {
        var s2 = i;
        while (i < src.length && /[A-Za-z_0-9]/.test(src[i])) i++;
        tokens.push({ type: 'ident', value: src.slice(s2, i), start: s2 });
        continue;
      }
      if ('+-*/^(),'.indexOf(ch) >= 0) {
        tokens.push({ type: ch === ',' ? 'comma' : 'op', value: ch, start: i });
        i++;
        continue;
      }
      fail('无法识别的字符: ' + ch, i);
    }
    return tokens;
  }

  // -------------------------------------------------------------------------
  // 2. 语法分析（递归下降）
  //    expr  := term (('+' | '-') term)*
  //    term  := unary (('*' | '/') unary | <隐式乘法> unary)*
  //    unary := ('-' | '+') unary | power
  //    power := atom ('^' unary)?          // 右结合：2^3^2 = 512
  // -------------------------------------------------------------------------
  function parse(src) {
    var tokens = tokenize(String(src));
    var pos = 0;

    function peek() { return tokens[pos]; }
    function next() { return tokens[pos++]; }
    /** 抛出带字符位置的语法错误，供输入框做"错误定位"提示。 */
    function fail(msg, token) {
      var e = new SyntaxError(msg);
      e.index = token && typeof token.start === 'number' ? token.start : String(src).length;
      throw e;
    }
    function expectOp(op) {
      var tk = tokens[pos];
      if (tk && tk.type === 'op' && tk.value === op) { pos++; return true; }
      return false;
    }
    function startsPrimary(tk) {
      if (!tk) return false;
      if (tk.type === 'num' || tk.type === 'ident') return true;
      return tk.type === 'op' && tk.value === '(';
    }

    function parseExpr() {
      var node = parseTerm();
      while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
        var op = next().value;
        node = { type: 'bin', op: op, l: node, r: parseTerm() };
      }
      return node;
    }

    function parseTerm() {
      var node = parseUnary();
      for (;;) {
        var tk = peek();
        if (tk && tk.type === 'op' && (tk.value === '*' || tk.value === '/')) {
          pos++;
          node = { type: 'bin', op: tk.value, l: node, r: parseUnary() };
          continue;
        }
        // 隐式乘法：2x、3sin(x)、(x+1)(x-1)
        if (startsPrimary(tk)) {
          node = { type: 'bin', op: '*', l: node, r: parseUnary(), implicit: true };
          continue;
        }
        return node;
      }
    }

    function parseUnary() {
      var tk = peek();
      if (tk && tk.type === 'op' && (tk.value === '-' || tk.value === '+')) {
        pos++;
        var arg = parseUnary();
        return tk.value === '-' ? { type: 'un', op: '-', arg: arg } : arg;
      }
      return parsePower();
    }

    function parsePower() {
      var base = parseAtom();
      if (peek() && peek().type === 'op' && peek().value === '^') {
        pos++;
        return { type: 'bin', op: '^', l: base, r: parseUnary() };
      }
      return base;
    }

    function parseAtom() {
      var tk = next();
      if (!tk) fail('表达式意外结束', null);
      if (tk.type === 'num') return { type: 'num', value: tk.value };
      if (tk.type === 'op' && tk.value === '(') {
        var inner = parseExpr();
        if (!expectOp(')')) fail('缺少右括号', peek() || tk);
        return inner;
      }
      if (tk.type === 'ident') {
        var name = tk.value;
        // 只有已知函数名 + '(' 才解析为函数调用；否则 x(x+1) 之类的写法
        // 交给 term 层的隐式乘法处理（这是数学手写里的常见记号）。
        if (peek() && peek().type === 'op' && peek().value === '(' &&
            Object.prototype.hasOwnProperty.call(FUNCTIONS, name)) {
          pos++;
          var args = [];
          if (!(peek() && peek().type === 'op' && peek().value === ')')) {
            args.push(parseExpr());
            while (peek() && peek().type === 'comma') { pos++; args.push(parseExpr()); }
          }
          if (!expectOp(')')) fail('函数 ' + name + ' 缺少右括号', peek() || tk);
          var want = ARITY[name];
          if (args.length !== want) {
            fail(name + ' 需要 ' + want + ' 个参数，收到 ' + args.length + ' 个', tk);
          }
          return { type: 'call', name: name, args: args };
        }
        if (Object.prototype.hasOwnProperty.call(CONSTANTS, name)) {
          return { type: 'num', value: CONSTANTS[name], name: name };
        }
        return { type: 'var', name: name, start: tk.start };
      }
      fail('意外的记号: ' + JSON.stringify(tk.value), tk);
    }

    var ast = parseExpr();
    if (pos !== tokens.length) fail('表达式尾部有多余内容', tokens[pos]);
    return ast;
  }

  // -------------------------------------------------------------------------
  // 3. 求值
  // -------------------------------------------------------------------------

  /**
   * 实数域幂运算。
   * JS 的 Math.pow 对「负底数 + 非整数指数」一律返回 NaN，但分母为奇数的
   * 有理指数在实数域是有定义的：(-8)^(1/3) = -2。这里按 p/q（q 为奇数）还原。
   */
  function powReal(a, b) {
    if (a >= 0 || Number.isInteger(b)) return Math.pow(a, b);
    for (var q = 3; q <= 21; q += 2) {
      var p = b * q;
      var rp = Math.round(p);
      if (Math.abs(p - rp) < 1e-9 && Math.abs(rp) <= 64) {
        return Math.pow(Math.abs(a), b) * (rp % 2 !== 0 ? -1 : 1);
      }
    }
    return Math.pow(a, b); // 保持 NaN（如 (-4)^(1/2)，实数域确实无定义）
  }

  function evalNode(node, scope) {
    switch (node.type) {
      case 'num': return node.value;
      case 'var': {
        if (scope && Object.prototype.hasOwnProperty.call(scope, node.name)) return scope[node.name];
        throw new ReferenceError('未定义的变量: ' + node.name);
      }
      case 'un': return -evalNode(node.arg, scope);
      case 'bin': {
        var a = evalNode(node.l, scope);
        var b = evalNode(node.r, scope);
        switch (node.op) {
          case '+': return a + b;
          case '-': return a - b;
          case '*': return a * b;
          case '/': return a / b;
          case '^': return powReal(a, b);
          default: throw new SyntaxError('未知运算符: ' + node.op);
        }
      }
      case 'call': {
        var fn = FUNCTIONS[node.name];
        var args = node.args.map(function (a) { return evalNode(a, scope); });
        return fn.apply(null, args);
      }
      default: throw new SyntaxError('未知节点: ' + node.type);
    }
  }

  function evaluate(ast, scope) { return evalNode(ast, scope); }

  /** 编译为一次性闭包，热路径（每帧上千次采样）用这个。 */
  function compile(ast) {
    switch (ast.type) {
      case 'num': { var v = ast.value; return function () { return v; }; }
      case 'var': {
        var n = ast.name;
        // 与 evalNode 保持一致：未绑定的变量要报错，而不是静默返回 undefined/NaN
        return function (scope) {
          var v = scope[n];
          if (v === undefined) throw new ReferenceError('未定义的变量: ' + n);
          return v;
        };
      }
      case 'un': { var a0 = compile(ast.arg); return function (s) { return -a0(s); }; }
      case 'bin': {
        var l = compile(ast.l), r = compile(ast.r);
        switch (ast.op) {
          case '+': return function (s) { return l(s) + r(s); };
          case '-': return function (s) { return l(s) - r(s); };
          case '*': return function (s) { return l(s) * r(s); };
          case '/': return function (s) { return l(s) / r(s); };
          case '^': return function (s) { return powReal(l(s), r(s)); };
        }
        break;
      }
      case 'call': {
        var fn = FUNCTIONS[ast.name];
        var args = ast.args.map(compile);
        if (args.length === 1) { var a1 = args[0]; return function (s) { return fn(a1(s)); }; }
        if (args.length === 2) { var b1 = args[0], b2 = args[1]; return function (s) { return fn(b1(s), b2(s)); }; }
        return function (s) { return fn.apply(null, args.map(function (f) { return f(s); })); };
      }
    }
    throw new SyntaxError('无法编译: ' + ast.type);
  }

  /** 便捷：把表达式源码编译成 f(x) */
  function functionOfX(src) {
    var ast = parse(src);
    var f = compile(ast);
    return function (x) { return f({ x: x }); };
  }

  /** 收集表达式中的自由变量 → { 变量名: 首次出现的字符位置 }。 */
  function collectVars(node, out) {
    out = out || {};
    switch (node.type) {
      case 'var':
        if (out[node.name] === undefined || out[node.name] === null) {
          out[node.name] = typeof node.start === 'number' ? node.start : null;
        }
        break;
      case 'un': collectVars(node.arg, out); break;
      case 'bin': collectVars(node.l, out); collectVars(node.r, out); break;
      case 'call': node.args.forEach(function (a) { collectVars(a, out); }); break;
    }
    return out;
  }

  /**
   * 永不抛错的解析入口 —— 「自由输入」的实时管线调用它。
   * 成功：{ ok:true, ast, latex, vars, fn }
   * 失败：{ ok:false, message, index }（index 用于在输入框里指出出错字符位置）
   */
  function parseSafe(src) {
    var raw = String(src === null || src === undefined ? '' : src);
    var text = raw.trim();
    // 前导空白偏移：错误定位必须相对**用户看到的原始字符串**，否则插入符会错位
    var offset = raw.length - raw.replace(/^\s+/, '').length;
    if (!text) return { ok: false, message: '表达式为空', index: 0 };
    try {
      var ast = parse(text);
      return {
        ok: true, ast: ast, latex: toLatex(ast),
        vars: Object.keys(collectVars(ast, {})), fn: compile(ast)
      };
    } catch (e) {
      return {
        ok: false, message: e.message,
        index: typeof e.index === 'number' ? e.index + offset : null
      };
    }
  }

  /**
   * 把用户输入变成可绘制的一元函数 f(x)。
   * 失败时给出**人话**的原因与字符位置：拼错函数名（si(x)）会被识别为
   * "未定义的函数或变量"，而不是让曲线静默消失。
   */
  function toFunctionOfX(src) {
    var raw = String(src === null || src === undefined ? '' : src);
    var text = raw.trim();
    var offset = raw.length - raw.replace(/^\s+/, '').length;
    if (!text) return { ok: false, message: '表达式为空', index: 0 };
    var ast;
    try {
      ast = parse(text);
    } catch (e) {
      return {
        ok: false, message: e.message,
        index: typeof e.index === 'number' ? e.index + offset : null
      };
    }
    var vars = collectVars(ast, {});
    var other = Object.keys(vars).filter(function (v) { return v !== 'x'; });
    if (other.length) {
      var bad = other[0];
      var msg;
      if (Object.prototype.hasOwnProperty.call(FUNCTIONS, bad)) {
        msg = '函数 ' + bad + ' 缺少括号，例如 ' + bad + '(x)';
      } else if (bad.length > 1) {
        msg = '未定义的函数或变量：' + bad;
      } else {
        msg = '暂只支持单变量 x（发现了变量 ' + bad + '）';
      }
      return {
        ok: false, message: msg,
        index: typeof vars[bad] === 'number' ? vars[bad] + offset : null
      };
    }
    return { ok: true, ast: ast, latex: toLatex(ast), vars: ['x'], fn: compile(ast) };
  }

  // -------------------------------------------------------------------------
  // 4. 符号求导（精确代数求导，非数值差分）
  // -------------------------------------------------------------------------
  var num = function (v) { return { type: 'num', value: v }; };
  var isNum = function (n) { return n.type === 'num'; };

  /** 若表达式不含自由变量，返回其数值；否则返回 null（用于识别"常数指数"）。 */
  function constValue(node) {
    if (!node) return null;
    if (Object.keys(collectVars(node, {})).length > 0) return null;
    try {
      var v = evalNode(node, {});
      return isFinite(v) ? v : null;
    } catch (e) {
      return null;
    }
  }

  /** 常数指数减一：分数写法保留分数形式（1/3 → −2/3），便于显示。 */
  function constMinusOne(node, value) {
    if (node.type === 'bin' && node.op === '/' && isNum(node.l) && isNum(node.r)) {
      return { type: 'bin', op: '/', l: num(node.l.value - node.r.value), r: num(node.r.value) };
    }
    return num(value - 1);
  }

  function diff(node, v) {
    v = v || 'x';
    switch (node.type) {
      case 'num': return num(0);
      case 'var': return num(node.name === v ? 1 : 0);
      case 'un': return { type: 'un', op: '-', arg: diff(node.arg, v) };
      case 'bin': {
        var u = node.l, w = node.r, du = diff(u, v), dw = diff(w, v);
        switch (node.op) {
          case '+': return { type: 'bin', op: '+', l: du, r: dw };
          case '-': return { type: 'bin', op: '-', l: du, r: dw };
          case '*': // (uv)' = u'v + uv'
            return { type: 'bin', op: '+',
              l: { type: 'bin', op: '*', l: du, r: w },
              r: { type: 'bin', op: '*', l: u, r: dw } };
          case '/': // (u/w)' = (u'w - uw') / w^2
            return { type: 'bin', op: '/',
              l: { type: 'bin', op: '-',
                l: { type: 'bin', op: '*', l: du, r: w },
                r: { type: 'bin', op: '*', l: u, r: dw } },
              r: { type: 'bin', op: '^', l: w, r: num(2) } };
          case '^': {
            // 指数是**常数**（含 x^(1/3) 这类分数写法）→ 幂函数法则 (u^n)' = n·u^(n−1)·u'
            var wv = constValue(w);
            if (wv !== null) {
              return { type: 'bin', op: '*',
                l: { type: 'bin', op: '*', l: w, r: { type: 'bin', op: '^', l: u, r: constMinusOne(w, wv) } },
                r: du };
            }
            // 底数要先化简再判断符号：(-2) 在 AST 里是 un(-,2)，isNum 直接判断会漏掉
            var constBase = simplify(u);
            if (isNum(constBase)) {
              if (constBase.value < 0) {
                throw new SyntaxError('负底数的幂指函数在实数域不可导: ' + constBase.value + '^x');
              }
              // 指数法则：(a^w)' = a^w·ln(a)·w'
              return { type: 'bin', op: '*',
                l: { type: 'bin', op: '*', l: node, r: num(Math.log(constBase.value)) },
                r: dw };
            }
            // 一般幂指函数：(u^w)' = u^w·(w'·ln u + w·u'/u)
            return { type: 'bin', op: '*',
              l: node,
              r: { type: 'bin', op: '+',
                l: { type: 'bin', op: '*', l: dw, r: { type: 'call', name: 'ln', args: [u] } },
                r: { type: 'bin', op: '*', l: w, r: { type: 'bin', op: '/', l: du, r: u } } } };
          }
        }
        break;
      }
      case 'call': {
        var a = node.args[0];
        var da = diff(a, v);
        var chain = function (outer) { return { type: 'bin', op: '*', l: outer, r: da }; };
        switch (node.name) {
          case 'sin': return chain({ type: 'call', name: 'cos', args: [a] });
          case 'cos': return chain({ type: 'un', op: '-', arg: { type: 'call', name: 'sin', args: [a] } });
          case 'tan': return chain({ type: 'bin', op: '/', l: num(1),
            r: { type: 'bin', op: '^', l: { type: 'call', name: 'cos', args: [a] }, r: num(2) } });
          case 'exp': return chain({ type: 'call', name: 'exp', args: [a] });
          case 'ln': return { type: 'bin', op: '/', l: da, r: a };
          case 'log': return { type: 'bin', op: '/', l: da,
            r: { type: 'bin', op: '*', l: a, r: num(Math.LN10) } };
          case 'log2': return { type: 'bin', op: '/', l: da,
            r: { type: 'bin', op: '*', l: a, r: num(Math.LN2) } };
          case 'sqrt': return { type: 'bin', op: '/', l: da,
            r: { type: 'bin', op: '*', l: num(2), r: { type: 'call', name: 'sqrt', args: [a] } } };
          case 'abs': // |u|' = u/|u| · u'（x=0 处不可导，符合定义）
            return chain({ type: 'bin', op: '/', l: a, r: { type: 'call', name: 'abs', args: [a] } });
          case 'asin': return chain({ type: 'bin', op: '/', l: num(1),
            r: { type: 'call', name: 'sqrt', args: [{ type: 'bin', op: '-', l: num(1),
              r: { type: 'bin', op: '^', l: a, r: num(2) } }] } });
          case 'acos': return chain({ type: 'un', op: '-', arg: { type: 'bin', op: '/', l: num(1),
            r: { type: 'call', name: 'sqrt', args: [{ type: 'bin', op: '-', l: num(1),
              r: { type: 'bin', op: '^', l: a, r: num(2) } }] } } });
          case 'atan': return chain({ type: 'bin', op: '/', l: num(1),
            r: { type: 'bin', op: '+', l: num(1), r: { type: 'bin', op: '^', l: a, r: num(2) } } });
          default:
            throw new SyntaxError('暂不支持对 ' + node.name + ' 符号求导');
        }
      }
    }
    throw new SyntaxError('无法求导的节点: ' + node.type);
  }

  // -------------------------------------------------------------------------
  // 5. 化简
  // -------------------------------------------------------------------------
  var near = function (a, b) { return Math.abs(a - b) < 1e-12; };

  /**
   * 判断表达式是否对**一切实数**都有定义。
   * 化简规则 0·X → 0 只在 X 处处有定义时才成立；否则会把 NaN/∞ 掩盖成 0
   * （例如 0·ln(x) 在 x<0 处是 NaN，不是 0）。这是化简器的定义域护栏。
   */
  function isTotal(node) {
    switch (node.type) {
      case 'num':
      case 'var':
        return true;
      case 'un':
        return isTotal(node.arg);
      case 'bin':
        if (node.op === '/') return false;                       // 可能除以 0
        if (node.op === '^') {                                   // 仅非负整数次幂恒有定义
          return isTotal(node.l) && isNum(node.r) &&
            node.r.value >= 0 && Number.isInteger(node.r.value);
        }
        return isTotal(node.l) && isTotal(node.r);
      case 'call':
        if (node.name === 'ln' || node.name === 'log' || node.name === 'log2' ||
            node.name === 'logb' || node.name === 'sqrt' || node.name === 'asin' ||
            node.name === 'acos' || node.name === 'tan') return false;
        return node.args.every(isTotal);
      default:
        return false;
    }
  }

  function simplify(node) {
    if (node.type === 'num' || node.type === 'var') return node;
    if (node.type === 'un') {
      var arg = simplify(node.arg);
      if (isNum(arg)) return num(-arg.value);
      if (arg.type === 'un') return arg.arg; // --x = x
      return { type: 'un', op: '-', arg: arg };
    }
    if (node.type === 'call') {
      var args = node.args.map(simplify);
      if (args.every(isNum) && ARITY[node.name] === args.length && node.name !== 'round') {
        try {
          var val = FUNCTIONS[node.name].apply(null, args.map(function (a) { return a.value; }));
          if (isFinite(val)) return num(val);
        } catch (e) { /* 保持符号形式 */ }
      }
      return { type: 'call', name: node.name, args: args };
    }
    // bin
    var l = simplify(node.l), r = simplify(node.r), op = node.op;

    if (l.type === 'num' && r.type === 'num' && op !== '/') {
      var folded;
      if (op === '+') folded = l.value + r.value;
      else if (op === '-') folded = l.value - r.value;
      else if (op === '*') folded = l.value * r.value;
      else folded = Math.pow(l.value, r.value);
      if (isFinite(folded)) return num(folded);
    }

    if (op === '+') {
      if (isNum(l) && near(l.value, 0)) return r;
      if (isNum(r) && near(r.value, 0)) return l;
    }
    if (op === '-') {
      if (isNum(r) && near(r.value, 0)) return l;
      if (isNum(l) && near(l.value, 0)) return { type: 'un', op: '-', arg: r };
    }
    if (op === '*') {
      if (isNum(l) && near(l.value, 0) && isTotal(r)) return num(0);
      if (isNum(r) && near(r.value, 0) && isTotal(l)) return num(0);
      if (isNum(l) && near(l.value, 1)) return r;
      if (isNum(r) && near(r.value, 1)) return l;
      // 常数合并：2*(3*x) → 6*x ；(x*3)*2 → 6*x（带溢出护栏）
      if (isNum(l) && r.type === 'bin' && r.op === '*' && isNum(r.l)) {
        var m1 = l.value * r.l.value;
        if (isFinite(m1)) return simplify({ type: 'bin', op: '*', l: num(m1), r: r.r });
      }
      if (isNum(r) && l.type === 'bin' && l.op === '*' && isNum(l.l)) {
        var m2 = l.l.value * r.value;
        if (isFinite(m2)) return simplify({ type: 'bin', op: '*', l: num(m2), r: l.r });
      }
    }
    if (op === '/') {
      if (isNum(r) && near(r.value, 1)) return l;
      // 0/X = 0 只在 X 是非零常数时无条件成立（X 含变量时可能为 0）
      if (isNum(l) && near(l.value, 0) && isNum(r) && !near(r.value, 0)) return num(0);
    }
    if (op === '^') {
      if (isNum(r) && near(r.value, 1)) return l;
      if (isNum(r) && near(r.value, 0)) return num(1);
    }
    return { type: 'bin', op: op, l: l, r: r };
  }

  // -------------------------------------------------------------------------
  // 6. LaTeX 输出
  // -------------------------------------------------------------------------
  var LATEX_FN = {
    sin: '\\sin', cos: '\\cos', tan: '\\tan', asin: '\\arcsin', acos: '\\arccos',
    atan: '\\arctan', sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh',
    exp: '\\exp', ln: '\\ln', log: '\\log', log2: '\\log_{2}', sqrt: '\\sqrt',
    abs: '\\left|', sign: '\\operatorname{sgn}', min: '\\min', max: '\\max'
  };

  function prec(node) {
    if (node.type === 'bin') {
      if (node.op === '+' || node.op === '-') return 1;
      if (node.op === '*' || node.op === '/') return 2;
      if (node.op === '^') return 4;
    }
    if (node.type === 'un') return 3;
    return 5;
  }

  function fmtNum(v) {
    if (Number.isInteger(v)) return String(v);
    var s = v.toPrecision(6).replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }

  function toLatex(node, parentPrec) {
    parentPrec = parentPrec || 0;
    var selfPrec = prec(node);
    var out;
    switch (node.type) {
      case 'num':
        if (node.name === 'pi') out = '\\pi';
        else if (node.name === 'e') out = 'e';
        else if (node.name === 'tau') out = '2\\pi';
        else out = fmtNum(node.value);
        break;
      case 'var':
        out = node.name === 'pi' ? '\\pi' : node.name;
        break;
      case 'un':
        // 参数按 parentPrec=4 传入：-(-x) 会打成 -\left(-x\right)，不会出现 --x
        out = '-' + toLatex(node.arg, 4);
        break;
      case 'call': {
        var name = LATEX_FN[node.name] || ('\\operatorname{' + node.name + '}');
        if (node.name === 'abs') out = '\\left|' + toLatex(node.args[0], 0) + '\\right|';
        else if (node.name === 'sqrt') out = '\\sqrt{' + toLatex(node.args[0], 0) + '}';
        else out = name + '\\left(' + node.args.map(function (a) { return toLatex(a, 0); }).join(', ') + '\\right)';
        break;
      }
      case 'bin': {
        var p = selfPrec;
        if (node.op === '/') {
          out = '\\frac{' + toLatex(node.l, 0) + '}{' + toLatex(node.r, 0) + '}';
        } else if (node.op === '^') {
          // 底数按 parentPrec=p+1：(-x)^2 必须写成 \left(-x\right)^{2}，
          // 连续幂 (x^2)^3 也必须加括号（LaTeX 里 x^{2}^{3} 非法）
          out = toLatex(node.l, p + 1) + '^{' + toLatex(node.r, 0) + '}';
        } else {
          var symbol = node.op === '*' ? ' \\cdot ' : ' ' + node.op + ' ';
          // 右操作数是一元负号时加括号，避免出现 "x - -x"、"2 \cdot -x" 这类悬挂负号
          var rightPrec = node.r.type === 'un' ? 4 : p + 1;
          out = toLatex(node.l, p) + symbol + toLatex(node.r, rightPrec);
        }
        break;
      }
      default:
        out = '?';
    }
    // 统一在最外层判断是否需要括号：一元负号、函数调用同样适用
    if (selfPrec < parentPrec) out = '\\left(' + out + '\\right)';
    return out;
  }

  // -------------------------------------------------------------------------
  // 7. 微积分与级数数值工具
  // -------------------------------------------------------------------------

  /**
   * 黎曼和：把 [a,b] 分成 n 份。
   * mode: 'left' | 'right' | 'mid'（左端点/右端点/中点）
   * 返回 { value, rectangles:[{x0,x1,h}], n }
   */
  function riemann(f, a, b, n, mode) {
    mode = mode || 'mid';
    n = Math.max(1, Math.floor(n));
    var dx = (b - a) / n;
    var sum = 0;
    var rects = [];
    for (var i = 0; i < n; i++) {
      var x0 = a + i * dx;
      var x1 = x0 + dx;
      var sample = mode === 'left' ? x0 : mode === 'right' ? x1 : (x0 + x1) / 2;
      var h = f(sample);
      sum += h * dx;
      rects.push({ x0: x0, x1: x1, h: h, sample: sample });
    }
    return { value: sum, rectangles: rects, n: n, dx: dx };
  }

  /** 数值导数（中心差分）——只用于交叉验证符号求导，不参与教学展示。 */
  function numericDerivative(f, x, h) {
    h = h || 1e-6;
    return (f(x + h) - f(x - h)) / (2 * h);
  }

  /** 复合辛普森积分：作为定积分参考值。 */
  function simpson(f, a, b, n) {
    n = Math.max(2, Math.floor(n || 1000));
    if (n % 2 === 1) n += 1;
    var h = (b - a) / n;
    var s = f(a) + f(b);
    for (var i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
    return (s * h) / 3;
  }

  /** 几何级数部分和：Σ_{k=0}^{n-1} a·r^k */
  function geometricPartial(a, r, n) {
    var sum = 0, term = a, terms = [];
    for (var k = 0; k < n; k++) { sum += term; terms.push(term); term *= r; }
    return { value: sum, terms: terms };
  }

  /** 调和级数部分和：Σ_{k=1}^{n} 1/k */
  function harmonicPartial(n) {
    var sum = 0, terms = [];
    for (var k = 1; k <= n; k++) { sum += 1 / k; terms.push(1 / k); }
    return { value: sum, terms: terms };
  }

  /** 数值极限：h 递减序列上的外推，仅用于展示“逼近”过程。 */
  function approach(f, h0, steps) {
    steps = steps || 12;
    var out = [];
    for (var i = 0; i < steps; i++) out.push(h0 * Math.pow(0.5, i));
    return out;
  }

  // -------------------------------------------------------------------------
  // 8. 教学辅助：推导步骤、参数扰动、数值极限
  // -------------------------------------------------------------------------

  /** 判定一条求导用了哪条法则（用于"变量替换过程"的分步展示）。 */
  function ruleName(node) {
    switch (node.type) {
      case 'num': return '常数法则';
      case 'var': return '基本导数';
      case 'un': return '常数倍法则';
      case 'bin':
        if (node.op === '+') return '和法则';
        if (node.op === '-') return '差法则';
        if (node.op === '*') return '乘积法则';
        if (node.op === '/') return '商法则';
        if (node.op === '^') return isNum(node.r) ? '幂函数法则' : '幂指函数法则';
        return '四则运算';
      case 'call':
        return node.args[0] && node.args[0].type === 'var' ? '基本导数公式' : '链式法则';
      default: return '';
    }
  }

  /**
   * 把求导结果拆成**逐步过程**：按顶层加减号拆分每一项，
   * 给出该项、它的导数以及所用法则。沙盒的"变量替换过程"面板用它。
   */
  function diffSteps(ast, v) {
    v = v || 'x';
    var terms = [];
    (function flatten(node, sign) {
      if (node.type === 'bin' && (node.op === '+' || node.op === '-')) {
        flatten(node.l, sign);
        flatten(node.r, node.op === '-' ? -sign : sign);
      } else {
        terms.push({ node: node, sign: sign });
      }
    })(ast, 1);

    return terms.map(function (t) {
      var out = { term: (t.sign < 0 ? '-' : '') + toLatex(t.node), rule: ruleName(t.node) };
      try {
        var d = simplify(diff(t.node, v));
        out.derivative = (t.sign < 0 ? '-' : '') + toLatex(d);
      } catch (e) {
        out.derivative = '—';
        out.rule = '暂不支持符号求导';
      }
      return out;
    });
  }

  /**
   * 常数扰动：把所有数值常量乘以 factor（幂指数的底数除外，指数本身不动），
   * 用于观察"常数项微小变化对图形（极值、渐近线）的影响"。
   * 具名常量（pi、e）不参与扰动。
   */
  function perturbConstants(node, factor) {
    switch (node.type) {
      case 'num':
        if (node.name) return { type: 'num', value: node.value, name: node.name };
        return num(node.value * factor);
      case 'var':
        return { type: 'var', name: node.name, start: node.start };
      case 'un':
        return { type: 'un', op: node.op, arg: perturbConstants(node.arg, factor) };
      case 'bin':
        // 指数不动（否则会改变次数，超出"常数扰动"的语义）
        if (node.op === '^') {
          return { type: 'bin', op: '^', l: perturbConstants(node.l, factor), r: node.r };
        }
        return { type: 'bin', op: node.op, l: perturbConstants(node.l, factor), r: perturbConstants(node.r, factor) };
      case 'call':
        return { type: 'call', name: node.name, args: node.args.map(function (a) { return perturbConstants(a, factor); }) };
      default:
        return node;
    }
  }

  /**
   * 数值极限：h 递减序列上的左右逼近。
   * 返回 { left:[...], right:[...], leftLimit, rightLimit, value, twoSided, diverges }
   */
  function limitAt(f, x0, opts) {
    opts = opts || {};
    var hs = opts.hs || [1e-1, 1e-2, 1e-3, 1e-4, 1e-5, 1e-6];
    var left = hs.map(function (h) { return f(x0 - h); });
    var right = hs.map(function (h) { return f(x0 + h); });
    var l = left[left.length - 1], r = right[right.length - 1];
    var diverges = !isFinite(l) || !isFinite(r) ||
      Math.abs(l) > 1e6 || Math.abs(r) > 1e6;
    var twoSided = !diverges && isFinite(l) && isFinite(r) &&
      Math.abs(l - r) <= 1e-3 * Math.max(1, Math.abs(l));
    return {
      left: left, right: right,
      leftLimit: l, rightLimit: r,
      value: twoSided ? (l + r) / 2 : NaN,
      twoSided: twoSided, diverges: diverges
    };
  }

  /** 原函数 F(x) = ∫_{x0}^{x} f(t) dt（数值积分，F(x0)=0），用于沙盒的"求积分"。 */
  function antiderivative(f, x0, opts) {
    opts = opts || {};
    var steps = opts.steps || 400;
    return function (x) {
      if (!isFinite(x)) return NaN;
      var a = Math.min(x0, x), b = Math.max(x0, x);
      var v = simpson(f, a, b, steps);
      return x < x0 ? -v : v;
    };
  }

  function formatNumber(v, digits) {
    digits = digits === undefined ? 4 : digits;
    if (!isFinite(v)) return v > 0 ? '+∞' : (v < 0 ? '−∞' : 'NaN');
    if (v === 0) return '0';
    // 极小但非零的量不能显示成 0（否则误差读数会出现 100% 的相对偏差）
    if (Math.abs(v) < 1e-12) return v.toExponential(1);
    return String(Number(v.toPrecision(digits)));
  }

  /**
   * 定点小数格式化：用于展示**参数**（与滑块 step 对齐）。
   * 与 formatNumber 的区别是后者按有效数字（1.05 → "1.1"），
   * 这里按小数位（1.05 → "1.05"），保证“显示的参数 = 绘图的参数”。
   */
  function formatFixed(v, digits) {
    if (!isFinite(v)) return formatNumber(v, digits);
    var d = digits === undefined ? 2 : digits;
    var s = Number(v).toFixed(d);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    if (s === '-0') s = '0';
    return s;
  }

  // -------------------------------------------------------------------------
  // 8. 统计与数据处理（初高中「统计与概率」与自由输入采样使用）
  // -------------------------------------------------------------------------
  function sortedCopy(arr) {
    return arr.slice().sort(function (a, b) { return a - b; });
  }

  /** 分位数：线性插值，与 R-7 / Excel PERCENTILE.INC 一致。 */
  function quantile(arr, q) {
    var s = sortedCopy(arr);
    if (!s.length) return NaN;
    if (s.length === 1) return s[0];
    var pos = (s.length - 1) * q;
    var lo = Math.floor(pos), hi = Math.ceil(pos);
    if (lo === hi) return s[lo];
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
  }

  /** 五数概括：最小值、下四分位、中位数、上四分位、最大值。 */
  function fiveNumber(arr) {
    var s = sortedCopy(arr);
    if (!s.length) return { min: NaN, q1: NaN, median: NaN, q3: NaN, max: NaN, iqr: NaN };
    var q1 = quantile(s, 0.25), med = quantile(s, 0.5), q3 = quantile(s, 0.75);
    return { min: s[0], q1: q1, median: med, q3: q3, max: s[s.length - 1], iqr: q3 - q1 };
  }

  function mean(arr) {
    if (!arr.length) return NaN;
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  /** 样本标准差（分母 n−1）。 */
  function stdev(arr) {
    var n = arr.length;
    if (n < 2) return NaN;
    var m = mean(arr), s = 0;
    for (var i = 0; i < n; i++) { var d = arr[i] - m; s += d * d; }
    return Math.sqrt(s / (n - 1));
  }

  /**
   * 直方图分箱。binCount 为箱数；lo/hi 省略时自动取数据范围。
   * 返回 { bins:[{x0,x1,count,density}], max, width, lo, hi }
   */
  function histogram(arr, binCount, lo, hi) {
    var n = Math.max(1, Math.floor(binCount || 10));
    var s = sortedCopy(arr);
    if (!s.length) return { bins: [], max: 0, width: 0, lo: 0, hi: 1 };
    var a = (lo === undefined || lo === null) ? s[0] : lo;
    var b = (hi === undefined || hi === null) ? s[s.length - 1] : hi;
    if (!(b > a)) { b = a + 1; }
    var w = (b - a) / n;
    var bins = [];
    for (var i = 0; i < n; i++) bins.push({ x0: a + i * w, x1: a + (i + 1) * w, count: 0, density: 0 });
    for (var k = 0; k < s.length; k++) {
      var idx = Math.floor((s[k] - a) / w);
      if (idx < 0) idx = 0;
      if (idx >= n) idx = n - 1;          // 最大值并入最后一箱
      bins[idx].count++;
    }
    var max = 0;
    bins.forEach(function (bin) {
      bin.density = bin.count / (s.length * w);
      if (bin.count > max) max = bin.count;
    });
    return { bins: bins, max: max, width: w, lo: a, hi: b, n: s.length };
  }

  /** 等距取样点。 */
  function linspace(a, b, n) {
    var out = [];
    var m = Math.max(2, Math.floor(n || 2));
    for (var i = 0; i < m; i++) out.push(a + ((b - a) * i) / (m - 1));
    return out;
  }

  /** 用种子随机数生成一组近似正态的样本（Box–Muller）。 */
  function sampleNormal(count, mu, sigma, seed) {
    var rand = (function (a) {
      return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        var t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    })(seed === undefined ? 42 : seed);
    var out = [];
    for (var i = 0; i < count; i++) {
      var u1 = Math.max(1e-9, rand()), u2 = rand();
      var z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      out.push(mu + sigma * z);
    }
    return out;
  }

  return {
    // 解析与求值
    parse: parse, evaluate: evaluate, compile: compile, functionOfX: functionOfX,
    parseSafe: parseSafe, toFunctionOfX: toFunctionOfX, collectVars: collectVars,
    // 符号运算
    diff: diff, simplify: simplify, toLatex: toLatex,
    // 数值工具
    riemann: riemann, numericDerivative: numericDerivative, simpson: simpson,
    geometricPartial: geometricPartial, harmonicPartial: harmonicPartial,
    approach: approach, formatNumber: formatNumber, formatFixed: formatFixed,
    powReal: powReal,
    // 统计与采样
    quantile: quantile, fiveNumber: fiveNumber, mean: mean, stdev: stdev,
    histogram: histogram, linspace: linspace, sampleNormal: sampleNormal,
    // 教学辅助
    diffSteps: diffSteps, ruleName: ruleName, perturbConstants: perturbConstants,
    limitAt: limitAt, antiderivative: antiderivative,
    // 元信息
    FUNCTIONS: FUNCTIONS, CONSTANTS: CONSTANTS
  };
});
