/*!
 * modules/algebra2.js — 初中代数（一元二次不等式）与高中解析几何（圆锥曲线）
 */
(function (root) {
  'use strict';
  var MS = root.MS, P = root.Plot.PALETTE, MC = root.MathCore;

  // ==================================================== 一元二次不等式（数轴解集）
  /**
   * 解析求解 a x² + b x + c (op) 0。**不扫描、不近似**：
   *   · a ≠ 0：按判别式分三种情形给出区间
   *   · a = 0：退化为一次不等式（滑块可达，必须正确求解，否则会给出 NaN 解集）
   * 每个解集由若干区间片段 parts 组成，片段带端点开闭；
   * ±∞ 端点永远是开的（∞ 不可能被取到）。
   */
  function solveQuad(a, b, c, op) {
    var strict = op === '>' || op === '<';
    var wantPositive = op === '>' || op === '>=';
    var fmt = MC.formatNumber;

    function all() { return { type: 'all', parts: [{ lo: -Infinity, hi: Infinity, loOpen: true, hiOpen: true }], marks: [], latex: '\\mathbb{R}', text: '全体实数' }; }
    function empty() { return { type: 'empty', parts: [], marks: [], latex: '\\varnothing', text: '空集' }; }
    function part(lo, hi, loOpen, hiOpen) { return { lo: lo, hi: hi, loOpen: loOpen, hiOpen: hiOpen }; }
    function describe(parts, marks) {
      var latex = parts.map(function (p) {
        var l = p.lo === -Infinity ? '-\\infty' : fmt(p.lo, 4);
        var h = p.hi === Infinity ? '+\\infty' : fmt(p.hi, 4);
        return (p.lo === -Infinity || p.loOpen ? '(' : '[') + l + ',\\, ' + h + (p.hi === Infinity || p.hiOpen ? ')' : ']');
      }).join(' \\cup ');
      var text = parts.map(function (p) {
        var minus = function (s) { return String(s).replace(/-/g, '−'); };   // 显示用排版减号
        var l = p.lo === -Infinity ? '−∞' : minus(fmt(p.lo, 4));
        var h = p.hi === Infinity ? '+∞' : minus(fmt(p.hi, 4));
        return (p.lo === -Infinity || p.loOpen ? '(' : '[') + l + ', ' + h + (p.hi === Infinity || p.hiOpen ? ')' : ']');
      }).join(' ∪ ');
      var type = parts.length > 1 ? 'union' : (parts.length === 0 ? 'empty' : 'interval');
      if (parts.length === 1 && parts[0].lo === parts[0].hi) type = 'point';
      if (parts.length === 2 && parts[0].lo === -Infinity && parts[1].hi === Infinity &&
          parts[0].hi === parts[1].lo && parts[0].hiOpen && parts[1].loOpen) type = 'punctured';
      return { type: type, parts: parts, marks: marks || [], latex: latex, text: text };
    }

    // ---------- a = 0：一次不等式（或常数不等式） ----------
    if (Math.abs(a) < 1e-12) {
      if (Math.abs(b) < 1e-12) {
        var holds = wantPositive ? (c > 0 || (!strict && Math.abs(c) < 1e-12))
                                 : (c < 0 || (!strict && Math.abs(c) < 1e-12));
        return holds ? all() : empty();
      }
      var r0 = -c / b;
      var toRight = (wantPositive === (b > 0));      // b>0 且要求为正 → x > r
      var pt = toRight ? part(r0, Infinity, strict, true) : part(-Infinity, r0, true, strict);
      var res = describe([pt], [{ x: r0, closed: !strict }]);
      res.linear = true;
      return res;
    }

    // ---------- a ≠ 0：二次不等式 ----------
    var disc = b * b - 4 * a * c;

    if (disc < -1e-12) {
      return (a > 0) === wantPositive ? all() : empty();
    }
    var sq = Math.sqrt(Math.max(0, disc));
    var r1 = (-b - sq) / (2 * a), r2 = (-b + sq) / (2 * a);
    if (r1 > r2) { var t = r1; r1 = r2; r2 = t; }

    if (Math.abs(disc) < 1e-12) {                    // 重根：与 x 轴相切
      if ((a > 0) === wantPositive) {
        return strict
          ? describe([part(-Infinity, r1, true, true), part(r1, Infinity, true, true)], [{ x: r1, closed: false }])
          : all();
      }
      return strict ? empty() : describe([part(r1, r1, false, false)], [{ x: r1, closed: true }]);
    }

    var positiveOutside = a > 0;                     // a>0：两根之外为正
    if (wantPositive === positiveOutside) {
      return describe(
        [part(-Infinity, r1, true, strict), part(r2, Infinity, strict, true)],
        [{ x: r1, closed: !strict }, { x: r2, closed: !strict }]
      );
    }
    return describe([part(r1, r2, strict, strict)], [{ x: r1, closed: !strict }, { x: r2, closed: !strict }]);
  }

  var OP_TEXT = { '>': '>', '<': '<', '>=': '\\geq', '<=': '\\leq' };

  MS.register({
    id: 'algebra-inequality',
    stage: 'algebra',
    order: 4,
    title: { zh: '一元二次不等式：数轴上的解集', en: 'Quadratic inequalities on the number line' },
    caption: { zh: '抛物线与 x 轴的位置关系决定解集', en: 'Where the parabola sits decides the solution set' },
    formula: function (p) {
      var a = p.a, b = p.b, c = p.c;
      var lhs = MC.formatFixed(a, 2) + 'x^{2} ' + (b >= 0 ? '+ ' : '- ') + MC.formatFixed(Math.abs(b), 2) +
        'x ' + (c >= 0 ? '+ ' : '- ') + MC.formatFixed(Math.abs(c), 2);
      var sol = solveQuad(a, b, c, p.op);
      return lhs + ' ' + OP_TEXT[p.op] + ' 0 \\quad\\Longrightarrow\\quad x \\in ' + sol.latex;
    },
    controls: [
      { id: 'a', type: 'range', label: { zh: '二次项 a', en: 'a' }, min: -2, max: 2, step: 0.1, value: 1 },
      { id: 'b', type: 'range', label: { zh: '一次项 b', en: 'b' }, min: -6, max: 6, step: 0.1, value: -1 },
      { id: 'c', type: 'range', label: { zh: '常数项 c', en: 'c' }, min: -6, max: 6, step: 0.1, value: -2 },
      {
        id: 'op', type: 'segment', label: { zh: '不等号', en: 'Inequality' }, value: '>',
        options: [
          { value: '>', label: { zh: '> 0', en: '> 0' } },
          { value: '>=', label: { zh: '≥ 0', en: '≥ 0' } },
          { value: '<', label: { zh: '< 0', en: '< 0' } },
          { value: '<=', label: { zh: '≤ 0', en: '≤ 0' } }
        ]
      }
    ],
    view: { xMin: -8, xMax: 8, yMin: -5.4, yMax: 9 },
    legend: [
      { color: P.cobalt, label: { zh: '抛物线 y = ax²+bx+c', en: 'Parabola' } },
      { color: P.coral, label: { zh: '满足不等式的解集', en: 'Solution set' } },
      { color: P.ink, label: { zh: '实根（空心＝不含端点）', en: 'Roots (hollow = excluded)' } }
    ],
    draw: function (plot, p) {
      plot.grid(); plot.axes();
      var a = p.a, b = p.b, c = p.c;
      var linear = Math.abs(a) < 1e-12;                  // a = 0：退化保护（与 solveQuad 同一判据）
      var sol = solveQuad(a, b, c, p.op);
      var lineY = -3.6;                                  // 数轴位置：避开底部公式卡

      // 函数图像：a = 0 时是直线，绝不"夹紧成小抛物线"来伪装
      plot.curve(function (x) { return linear ? b * x + c : a * x * x + b * x + c; },
        { color: P.cobalt, width: 2.2, adaptive: true });

      if (!linear) {
        var disc = b * b - 4 * a * c;
        if (disc >= 0) {
          var sq = Math.sqrt(disc);
          [(-b - sq) / (2 * a), (-b + sq) / (2 * a)].forEach(function (r) {
            plot.guide(r, lineY, r, 0, { color: 'rgba(107,114,128,0.45)', dash: [4, 4] });
          });
        }
      }

      // 数轴
      plot.segment(plot.view.xMin + 0.3, lineY, plot.view.xMax - 0.3, lineY, { color: P.ink, width: 1.6 });
      plot.label(plot.view.xMax - 0.3, lineY, 'x', { dx: -6, dy: -14, color: P.muted, font: '13px Georgia, serif' });

      // 解集区间：在数轴上画粗色段
      sol.parts.forEach(function (pt) {
        var lo = Math.max(pt.lo, plot.view.xMin + 0.3);
        var hi = Math.min(pt.hi, plot.view.xMax - 0.3);
        if (!(hi > lo)) return;
        plot.segment(lo, lineY, hi, lineY, { color: 'rgba(206,88,72,0.95)', width: 7 });
      });

      // 端点：实心＝取到，空心＝不取
      sol.marks.forEach(function (mk) {
        if (mk.x < plot.view.xMin || mk.x > plot.view.xMax) return;
        plot.point(mk.x, lineY, {
          r: 6,
          fill: mk.closed ? P.coral : P.paper,
          stroke: P.coral, width: 2
        });
        plot.label(mk.x, lineY, MC.formatNumber(mk.x, 3),
          { dy: 22, align: 'center', color: P.coral, font: '11px Consolas, monospace' });
      });

      plot.label(plot.view.xMin + 0.3, lineY + 0.85, '解集：', { color: P.ink, font: '12px "Microsoft YaHei", sans-serif' });
      plot.label(plot.view.xMin + 1.6, lineY + 0.85, sol.text,
        { color: P.coral, font: '12px Consolas, monospace' });
      if (linear) {
        plot.label(plot.view.xMin + 0.4, plot.view.yMax - 0.5,
          'a = 0：不是二次不等式，按一次不等式求解', { color: P.coral, font: '12px Consolas, monospace' });
      }
    },
    readouts: function (p) {
      var a = p.a, b = p.b, c = p.c;
      var disc = b * b - 4 * a * c;
      var sol = solveQuad(a, b, c, p.op);
      var linear = Math.abs(a) < 1e-12;
      var kind = linear ? '不是二次（a = 0）' : (disc > 1e-9 ? '两不等实根' : (disc > -1e-9 ? '重根' : '无实根'));
      var typeText = { all: '全体实数', empty: '空集', punctured: '挖去端点', point: '单点', union: '两支并集', interval: '一段区间' }[sol.type];
      return [
        { label: { zh: '判别式 Δ', en: 'Δ' }, value: linear ? '—' : MC.formatNumber(disc, 3) },
        { label: { zh: '根的情况', en: 'roots' }, value: kind },
        { label: { zh: '解集类型', en: 'solution' }, value: typeText },
        { label: { zh: '解集', en: 'set' }, value: sol.text }
      ];
    },
    info: {
      definition: {
        zh: '二次不等式 $ax^2+bx+c>0$（或 $<0$、$\\geq0$、$\\leq0$）的解集，是使抛物线落在 x 轴上方（或下方）的 $x$ 的集合。',
        en: 'The solution set of a quadratic inequality is the set of $x$ where the parabola lies above (or below) the x-axis.'
      },
      geometry: {
        zh: '开口向上时：$\\Delta>0$ 则"大于 0"取**两根之外**、"小于 0"取**两根之间**；$\\Delta=0$ 时抛物线与轴相切（除切点外全部为正）；$\\Delta<0$ 则整条在轴上方。开口向下时结论相反。数轴上的珊瑚色粗段就是解集，空心圆表示端点不取。',
        en: 'For $a>0$: outside the roots when $>0$, between them when $<0$; tangent when $\\Delta=0$; entirely above when $\\Delta<0$. The coral segments on the number line are the solution set, hollow dots mean excluded.'
      },
      algebra: {
        zh: '与方程 $ax^2+bx+c=0$ 共用判别式 $\\Delta=b^2-4ac$：不等式解集的**端点**正是方程的根，含不含端点由不等号严格性决定。',
        en: 'It shares $\\Delta=b^2-4ac$ with the equation: the equation’s roots are exactly the interval endpoints, included or not according to strictness.'
      },
      application: {
        zh: '物理中的"何时高于某高度"、经济中的"利润何时为正"、算法中的可行性区间，都是把条件写成二次不等式再求区间。',
        en: '“When is the height above X”, “when is profit positive”, feasibility ranges — all reduce to quadratic inequalities.'
      }
    }
  });

  // ==================================================== 圆锥曲线（离心率统一）
  /** 圆锥曲线类型：用严格判据（滑块步长 0.02，e=1.00 可精确取到）。 */
  function conicKind(e) {
    if (Math.abs(e - 1) < 1e-9) return { zh: '抛物线', en: 'parabola' };
    return e < 1 ? { zh: '椭圆', en: 'ellipse' } : { zh: '双曲线', en: 'hyperbola' };
  }

  MS.register({
    id: 'analytic-conic',
    stage: 'analytic',
    order: 1,
    title: { zh: '圆锥曲线：离心率统一定义', en: 'Conic sections via eccentricity' },
    caption: { zh: '到焦点距离 ÷ 到准线距离 = e 恒定', en: 'distance to focus ÷ distance to directrix = e' },
    formula: function (p) {
      var e = MC.formatFixed(p.e, 2), d = MC.formatNumber(p.p / p.e, 4);
      return 'r = \\frac{p}{1 + e\\cos\\theta},\\qquad e = ' + e + ',\\quad \\text{准线 } x = \\frac{p}{e} = ' + d;
    },
    controls: [
      { id: 'e', type: 'range', label: { zh: '离心率 e', en: 'Eccentricity e' }, min: 0.2, max: 1.8, step: 0.02, value: 0.6 },
      { id: 'p', type: 'range', label: { zh: '半通径 p', en: 'Semi-latus rectum p' }, min: 1, max: 3, step: 0.05, value: 1.6 },
      { id: 'dir', type: 'toggle', label: { zh: '显示准线', en: 'Show directrix' }, value: true },
      { id: 'ratio', type: 'toggle', label: { zh: '显示距离比 |PF|/|PL|', en: 'Show |PF|/|PL|' }, value: true }
    ],
    square: { cx: 2.4, cy: 0, halfWidth: 7 },
    legend: [
      { color: P.cobalt, label: { zh: '圆锥曲线（焦点在原点）', en: 'Conic (focus at origin)' } },
      { color: P.coral, label: { zh: '焦点 F', en: 'Focus F' } },
      { color: P.mint, label: { zh: '准线 L 与垂足', en: 'Directrix and foot' } }
    ],
    draw: function (plot, p) {
      plot.grid(); plot.axes();
      var e = p.e, p0 = p.p;
      var d = p0 / e;                                   // 准线 x = p/e
      var pts = [];
      for (var i = 0; i <= 1440; i++) {
        var th = (i / 1440) * Math.PI * 2;
        var den = 1 + e * Math.cos(th);
        // den → 0 是渐近方向（断开）；r 允许为负 —— 负号对应的正是双曲线的**另一支**
        if (Math.abs(den) < 1e-4) { pts.push(null); continue; }
        var r = p0 / den;
        if (Math.abs(r) > 40) { pts.push(null); continue; }
        pts.push([r * Math.cos(th), r * Math.sin(th)]);
      }
      // 分段描线（渐近线处自动断开）
      var seg = [];
      pts.forEach(function (q) {
        if (q) seg.push(q);
        else { strokePath(plot, seg, P.cobalt); seg = []; }
      });
      strokePath(plot, seg, P.cobalt);

      if (p.dir) {
        var yy = Math.min(6, (plot.view.yMax - plot.view.yMin) / 2);
        plot.segment(d, -yy, d, yy, { color: P.mint, width: 1.6, dash: [6, 4] });
        plot.label(d, yy, '准线 x = ' + MC.formatNumber(d, 3), { align: 'right', dy: -10, color: P.mint, font: '12px Consolas, monospace' });
      }
      plot.point(0, 0, { r: 5.5, fill: P.coral, stroke: P.paper });
      plot.label(0, 0, 'F(0,0) 焦点', { dx: 10, dy: 14, color: P.coral, font: '12px Consolas, monospace' });

      if (p.ratio) {
        var th0 = (62 * Math.PI) / 180;
        var r0 = p0 / (1 + e * Math.cos(th0));
        if (isFinite(r0) && r0 < 30) {
          var qx = r0 * Math.cos(th0), qy = r0 * Math.sin(th0);
          plot.segment(0, 0, qx, qy, { color: P.coral, width: 1.5 });                 // |PF|
          plot.segment(qx, qy, d, qy, { color: P.mint, width: 1.5 });                 // 到准线的垂线
          plot.point(qx, qy, { r: 4.5, fill: P.ink, stroke: P.paper });
          var PF = Math.abs(r0);
          var PL = Math.abs(d - qx);
          plot.label(qx, qy, 'P', { dx: 8, dy: -8, color: P.ink, font: '12px Georgia, serif' });
          plot.label((qx + d) / 2, qy, '|PF|/|PL| = ' + MC.formatNumber(PF / PL, 4),
            { dx: 0, dy: -12, align: 'center', color: P.ink, font: '11px Consolas, monospace' });
        }
      }
      var kind = conicKind(e).zh;
      plot.label(plot.view.xMin + 0.3, plot.view.yMax - 0.4,
        'e = ' + MC.formatFixed(e, 2) + ' → ' + kind, { color: P.ink, font: '13px Consolas, monospace' });
    },
    readouts: function (p) {
      var e = p.e;
      var kind = conicKind(e).zh + (Math.abs(e - 1) < 1e-9 ? ' (e = 1)' : (e < 1 ? ' (0 < e < 1)' : ' (e > 1)'));
      // 与图上同一条测线（θ₀ = 62°）真实测量 |PF|/|PL|，而不是直接抄 e
      var d = p.p / e;
      var th0 = (62 * Math.PI) / 180;
      var den0 = 1 + e * Math.cos(th0);
      var ratio = Math.abs(den0) > 1e-6
        ? Math.abs(p.p / den0) / Math.abs(d - (p.p / den0) * Math.cos(th0))
        : NaN;
      return [
        { label: { zh: '离心率 e', en: 'e' }, value: MC.formatFixed(e, 2) },
        { label: { zh: '类型', en: 'type' }, value: kind },
        { label: { zh: '准线 x = p/e', en: 'directrix' }, value: MC.formatNumber(d, 4) },
        { label: { zh: '焦点', en: 'focus' }, value: '(0, 0)' },
        { label: { zh: '实测 |PF|/|PL|', en: 'measured ratio' }, value: MC.formatNumber(ratio, 4) }
      ];
    },
    info: {
      definition: {
        zh: '圆锥曲线的**统一**定义：平面内到定点（焦点）的距离与到定直线（准线）的距离之比等于常数 $e$ 的点的轨迹。$0<e<1$ 椭圆，$e=1$ 抛物线，$e>1$ 双曲线。',
        en: 'A unified definition: the locus where the ratio of the distance to a fixed point (focus) and to a fixed line (directrix) equals a constant $e$.'
      },
      geometry: {
        zh: '拖动离心率滑块可以连续看到曲线从"闭合椭圆"被拉长、在 $e=1$ 张开成抛物线、再变成双曲线的两支——三条曲线本是同一个定义的不同取值。图中右边的绿色虚线就是准线，粉色段与绿色段之比恒为 $e$。',
        en: 'Dragging $e$ elongates the ellipse, opens it into a parabola at $e=1$, then splits it into a hyperbola — one definition, three curves. The pink and green segments always keep the ratio $e$.'
      },
      algebra: {
        zh: '极坐标形式 $r=\\dfrac{p}{1+e\\cos\\theta}$（焦点在极点、准线 $x=p/e$）。当 $e<1$ 时它就是标准椭圆 $\\dfrac{(x-c)^2}{a^2}+\\dfrac{y^2}{b^2}=1$，且 $e=\\dfrac{c}{a}$。',
        en: 'The polar form $r=\\frac{p}{1+e\\cos\\theta}$ (focus at the pole, directrix $x=p/e$); for $e<1$ it is the standard ellipse with $e=c/a$.'
      },
      application: {
        zh: '开普勒定律与行星轨道（椭圆）、卫星逃逸速度（$e\\geq1$ 的双曲轨道）、抛物面天线与探照灯（抛物线聚焦）都直接使用离心率。',
        en: 'Kepler orbits, escape trajectories, parabolic dishes and searchlights are all governed by $e$.'
      }
    }
  });

  /** 世界坐标折线（参数曲线用；超界点自动断开）。 */
  function strokePath(plot, pts, color) {
    if (!pts || pts.length < 2) return;
    var ctx = plot.ctx;
    ctx.save();
    ctx.beginPath();
    var started = false;
    pts.forEach(function (q) {
      var px = plot.sx(q[0]), py = plot.sy(q[1]);
      if (!isFinite(px) || !isFinite(py)) { started = false; return; }
      if (!started) { ctx.moveTo(px, py); started = true; }
      else ctx.lineTo(px, py);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  }
})(window);
