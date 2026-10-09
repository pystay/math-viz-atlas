/*!
 * modules/calculus.js — 微积分：导数（切线斜率）与积分（黎曼和）
 * 导数使用 math-core 的符号求导：显示的 f′(x) 是精确的代数结果，不是数值近似。
 */
(function (root) {
  'use strict';
  var MS = root.MS, P = root.Plot.PALETTE, MC = root.MathCore;

  var FUNCS = [
    { id: 'x2', src: 'x^2', tex: 'x^{2}' },
    { id: 'x3', src: 'x^3', tex: 'x^{3}' },
    { id: 'sin', src: 'sin(x)', tex: '\\sin x' },
    { id: 'exp', src: 'e^x', tex: 'e^{x}' },
    { id: 'ln', src: 'ln(x)', tex: '\\ln x' }
  ];
  function funcById(id) {
    for (var i = 0; i < FUNCS.length; i++) if (FUNCS[i].id === id) return FUNCS[i];
    return FUNCS[0];
  }
  function viewFor(id) {
    if (id === 'ln') return { xMin: -0.5, xMax: 6.5, yMin: -3, yMax: 5 };
    if (id === 'exp') return { xMin: -3, xMax: 3, yMin: -1, yMax: 9 };
    return { xMin: -3.2, xMax: 3.2, yMin: -4, yMax: 6 };
  }

  /** 切点 x₀ 的可选范围必须落在函数定义域内（ln(x) 在 x ≤ 0 无定义）。 */
  function x0RangeFor(id) {
    return id === 'ln' ? { min: 0.1, max: 4, value: 1 } : { min: -2.5, max: 2.5, value: 1 };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // ------------------------------------------------------------- 导数
  MS.register({
    id: 'calc-derivative',
    stage: 'calculus',
    order: 1,
    title: { zh: '导数：割线 → 切线', en: 'Derivative: secant → tangent' },
    caption: { zh: 'h → 0 时割线斜率趋于切线斜率', en: 'As h → 0 the secant slope becomes the tangent slope' },
    formula: function (p) {
      var f = funcById(p.func);
      try {
        var d = MC.simplify(MC.diff(MC.parse(f.src), 'x'));
        return "f(x) = " + f.tex + ",\\qquad f'(x) = " + MC.toLatex(d);
      } catch (e) {
        return 'f(x) = ' + f.tex;
      }
    },
    controls: function (p) {
      var dom = x0RangeFor(p.func);
      return [
        {
          id: 'func', type: 'segment', label: { zh: '函数 f(x)', en: 'Function f(x)' }, value: p.func,
          options: FUNCS.map(function (f) { return { value: f.id, label: { zh: f.tex.replace(/\\/g, ''), en: f.tex.replace(/\\/g, '') } }; })
        },
        {
          id: 'x0', type: 'range', label: { zh: '切点 x₀', en: 'Point x₀' },
          min: dom.min, max: dom.max, step: 0.05,
          value: typeof p.x0 === 'number' ? clamp(p.x0, dom.min, dom.max) : dom.value
        },
        { id: 'h', type: 'range', label: { zh: '增量 h', en: 'Step h' }, min: 0.02, max: 2, step: 0.01, value: typeof p.h === 'number' ? p.h : 0.8 },
        { id: 'play', type: 'toggle', label: { zh: 'h → 0 动画', en: 'Animate h → 0' }, value: p.play !== undefined ? p.play : true }
      ];
    },
    view: function (p) { return viewFor(p.func); },
    legend: [
      { color: P.cobalt, label: { zh: 'f(x)', en: 'f(x)' } },
      { color: P.coral, label: { zh: '割线（h 不为 0）', en: 'Secant (h ≠ 0)' } },
      { color: P.mint, label: { zh: '切线（h = 0 的极限）', en: 'Tangent (limit h = 0)' } }
    ],
    init: function (state) { state.t = 0; },
    animate: function (state, params, dt) {
      if (!params.play) return false;
      state.t += dt / 1000;
      var u = state.t % 4;                       // 4s 一轮
      var h = u < 2.6 ? 1.6 * Math.pow(0.28, u / 0.9) : 1.6;
      h = Math.max(0.02, Math.min(2, h));
      if (Math.abs(h - params.h) < 0.005) return false;
      params.h = h;
      return 'params';
    },
    draw: function (plot, p) {
      plot.grid(); plot.axes();
      var fn = funcById(p.func);
      var f = MC.functionOfX(fn.src);
      var df = MC.compile(MC.diff(MC.parse(fn.src), 'x'));
      var x0 = p.x0, h = Math.max(1e-3, p.h);

      plot.curve(f, { color: P.cobalt, width: 2.4 });

      var y0 = f(x0), y1 = f(x0 + h);

      // 定义域护栏：x₀ 或 x₀+h 越出定义域时不画割线/切线，避免"画出不存在的切线"
      if (!isFinite(y0)) {
        plot.guide(x0, plot.view.yMin, x0, plot.view.yMax, { color: 'rgba(206,88,72,0.7)', dash: [5, 4] });
        plot.label(x0, 1,
          'x₀ = ' + MC.formatNumber(x0, 2) + ' 在 f 的定义域之外（' + fn.src + '）',
          { align: 'center', background: 'rgba(255,253,248,0.92)', color: P.coral, font: '12px Consolas, monospace' });
        return;
      }

      var kSec = isFinite(y1) ? (y1 - y0) / h : NaN;
      var kTan = df({ x: x0 });

      var span = (plot.view.xMax - plot.view.xMin) * 0.45;
      if (isFinite(kSec)) {
        plot.segment(x0 - span, y0 - kSec * span, x0 + span, y0 + kSec * span,
          { color: P.coral, width: 1.6, dash: [7, 5] });
      }
      if (isFinite(kTan)) {
        plot.segment(x0 - span, y0 - kTan * span, x0 + span, y0 + kTan * span,
          { color: P.mint, width: 2 });
      }
      plot.guide(x0, 0, x0, y0, { color: 'rgba(107,114,128,0.6)', dash: [3, 4] });
      plot.point(x0, y0, { r: 5, fill: P.mint, stroke: P.paper });
      plot.label(x0, y0, 'f(x₀)', { dx: -8, dy: -12, align: 'right', color: P.mint, font: '12px Consolas, monospace' });

      if (isFinite(y1)) {
        plot.point(x0 + h, y1, { r: 5, fill: P.coral, stroke: P.paper });
        plot.guide(x0 + h, 0, x0 + h, y1, { color: 'rgba(206,88,72,0.6)', dash: [3, 4] });
        plot.label(x0 + h, y1, 'f(x₀+h)', { dx: 8, dy: -12, color: P.coral, font: '12px Consolas, monospace' });
      } else {
        plot.label(x0 + h, y0, 'x₀+h 越界', { dx: 8, dy: 14, color: P.coral, font: '12px Consolas, monospace' });
      }

      plot.label(plot.view.xMin + 0.3, plot.view.yMax - 0.4,
        '割线斜率 ' + MC.formatNumber(kSec, 4) + '　切线斜率 ' + MC.formatNumber(kTan, 4),
        { color: P.ink, font: '12px Consolas, monospace' });
    },
    readouts: function (p) {
      var fn = funcById(p.func);
      var f = MC.functionOfX(fn.src);
      var df = MC.compile(MC.diff(MC.parse(fn.src), 'x'));
      var h = Math.max(1e-3, p.h);
      var y0 = f(p.x0), y1 = f(p.x0 + h);

      if (!isFinite(y0)) {
        return [
          { label: { zh: '割线斜率', en: 'secant slope' }, value: '定义域外' },
          { label: { zh: "切线斜率 f′(x₀)", en: 'tangent slope' }, value: '定义域外' },
          { label: { zh: '差值', en: 'difference' }, value: '—' },
          { label: { zh: 'h', en: 'h' }, value: MC.formatNumber(h, 4) }
        ];
      }
      var kSec = isFinite(y1) ? (y1 - y0) / h : NaN;
      var kTan = df({ x: p.x0 });
      return [
        { label: { zh: '割线斜率', en: 'secant slope' }, value: isFinite(kSec) ? MC.formatNumber(kSec, 5) : 'x₀+h 越界' },
        { label: { zh: "切线斜率 f′(x₀)", en: 'tangent slope' }, value: MC.formatNumber(kTan, 5) },
        { label: { zh: '差值', en: 'difference' }, value: isFinite(kSec) ? MC.formatNumber(Math.abs(kSec - kTan), 5) : '—' },
        { label: { zh: 'h', en: 'h' }, value: MC.formatNumber(h, 4) }
      ];
    },
    info: {
      definition: {
        zh: "导数定义：$f'(x_0)=\\lim\\limits_{h\\to 0}\\dfrac{f(x_0+h)-f(x_0)}{h}$——割线斜率的极限。",
        en: "$f'(x_0)=\\lim\\limits_{h\\to 0}\\frac{f(x_0+h)-f(x_0)}{h}$ — the limit of secant slopes."
      },
      geometry: {
        zh: '红色割线连接曲线上两点；当 $h\\to 0$ 时两点重合，割线变成绿色切线。切线斜率就是该点的**瞬时变化率**。',
        en: 'The red secant joins two points; as $h\\to0$ they merge and the secant becomes the green tangent, whose slope is the instantaneous rate of change.'
      },
      algebra: {
        zh: '本页显示的 $f\'(x)$ 由符号求导精确算出（如 $x^3 \\to 3x^2$），不是数值差分；可切换函数验证幂法则、链式法则。',
        en: "$f'(x)$ here is computed symbolically (e.g. $x^3 \\to 3x^2$), not by numeric differencing."
      },
      application: {
        zh: '速度是位移的导数、边际成本是成本的导数、梯度下降沿导数反方向走——优化与物理全靠它。',
        en: 'Velocity is the derivative of position, marginal cost of cost, and gradient descent walks against the derivative.'
      }
    }
  });

  // ------------------------------------------------------------- 积分
  MS.register({
    id: 'calc-integral',
    stage: 'calculus',
    order: 2,
    title: { zh: '定积分：黎曼和', en: 'Definite integral: Riemann sums' },
    caption: { zh: '矩形越窄，面积和越接近真值', en: 'Thinner rectangles approximate the area better' },
    formula: function (p) {
      var f = funcById(p.func);
      // 保持用户给定的上下限方向：a > b 时这就是一个反向积分（结果为负）
      return '\\int_{' + MC.formatFixed(p.a, 2) + '}^{' + MC.formatFixed(p.b, 2) + '} ' + f.tex +
        '\\,dx \\;\\approx\\; \\sum_{i=1}^{' + Math.round(p.n) + '} f(\\xi_i)\\,\\Delta x';
    },
    controls: [
      {
        id: 'func', type: 'segment', label: { zh: '被积函数 f(x)', en: 'Integrand f(x)' }, value: 'x2',
        options: FUNCS.map(function (f) { return { value: f.id, label: { zh: f.tex.replace(/\\/g, ''), en: f.tex.replace(/\\/g, '') } }; })
      },
      { id: 'a', type: 'range', label: { zh: '下限 a', en: 'Lower limit a' }, min: -2.5, max: 2.5, step: 0.1, value: 0 },
      { id: 'b', type: 'range', label: { zh: '上限 b', en: 'Upper limit b' }, min: -2.5, max: 2.5, step: 0.1, value: 1.5 },
      { id: 'n', type: 'range', label: { zh: '矩形数 n', en: 'Rectangles n' }, min: 1, max: 80, step: 1, value: 8 },
      {
        id: 'mode', type: 'segment', label: { zh: '取样点', en: 'Sample point' }, value: 'mid',
        options: [
          { value: 'left', label: { zh: '左端点', en: 'Left' } },
          { value: 'mid', label: { zh: '中点', en: 'Mid' } },
          { value: 'right', label: { zh: '右端点', en: 'Right' } }
        ]
      }
    ],
    view: function (p) { return viewFor(p.func); },
    legend: [
      { color: P.cobalt, label: { zh: 'f(x)', en: 'f(x)' } },
      { color: P.coral, label: { zh: '正面积（x 轴上方）', en: 'Positive area' } },
      { color: P.cobalt, label: { zh: '负面积（x 轴下方）', en: 'Negative area' } }
    ],
    draw: function (plot, p) {
      plot.grid(); plot.axes();
      var fn = funcById(p.func);
      var f = MC.functionOfX(fn.src);
      var a = p.a, b = p.b;                 // 不做静默交换：方向由用户决定
      var n = Math.max(1, Math.round(p.n));
      var r = MC.riemann(f, a, b, n, p.mode);
      var reversed = b < a;

      r.rectangles.forEach(function (rc) {
        if (!isFinite(rc.h)) return;
        var positive = rc.h >= 0;
        plot.rect(rc.x0, 0, rc.x1, rc.h, {
          fill: positive ? 'rgba(206,88,72,0.20)' : 'rgba(74,98,136,0.24)',
          stroke: positive ? 'rgba(206,88,72,0.85)' : 'rgba(74,98,136,0.85)',
          width: 1
        });
      });
      plot.curve(f, { color: P.ink, width: 2.4 });
      plot.guide(a, plot.view.yMin, a, plot.view.yMax, { color: 'rgba(47,158,126,0.8)', dash: [] });
      plot.guide(b, plot.view.yMin, b, plot.view.yMax, { color: 'rgba(47,158,126,0.8)', dash: [] });
      plot.label(a, plot.view.yMin, 'a = ' + MC.formatFixed(a, 1) + (reversed ? '（上限侧）' : ''),
        { align: 'center', dy: -10, color: P.mint, font: '12px Consolas, monospace' });
      plot.label(b, plot.view.yMin, 'b = ' + MC.formatFixed(b, 1) + (reversed ? '（下限侧）' : ''),
        { align: 'center', dy: -10, color: P.mint, font: '12px Consolas, monospace' });

      var finite = isFinite(r.value);
      plot.label(plot.view.xMin + 0.3, plot.view.yMax - 0.4,
        finite ? 'Sₙ = ' + MC.formatNumber(r.value, 6) + '　Δx = ' + MC.formatNumber(r.dx, 4)
               : '定义域外：f 在该区间上无定义',
        { color: finite ? P.ink : P.coral, font: '12px Consolas, monospace' });
      if (reversed) {
        plot.label(plot.view.xMin + 0.3, plot.view.yMax - 0.85,
          'b < a：反向积分，数值等于正向积分的相反数',
          { color: P.coral, font: '12px Consolas, monospace' });
      }
    },
    readouts: function (p) {
      var fn = funcById(p.func);
      var f = MC.functionOfX(fn.src);
      var a = p.a, b = p.b;
      var n = Math.max(1, Math.round(p.n));
      var r = MC.riemann(f, a, b, n, p.mode);
      var exact = MC.simpson(f, a, b, 2000);

      if (!isFinite(r.value) || !isFinite(exact)) {
        return [
          { label: { zh: '黎曼和（代数和）', en: 'Riemann sum' }, value: '定义域外' },
          { label: { zh: '参考值', en: 'reference' }, value: '定义域外' },
          { label: { zh: '误差', en: 'error' }, value: '—' },
          { label: { zh: '提示', en: 'note' }, value: 'f 在 [' + MC.formatFixed(a, 1) + ', ' + MC.formatFixed(b, 1) + '] 上无定义' }
        ];
      }

      // 正/负面积按几何意义统计（与积分方向无关），与"代数和"读数区分开
      var pos = 0, neg = 0;
      r.rectangles.forEach(function (rc) {
        if (!isFinite(rc.h)) return;
        var area = Math.abs(rc.h * r.dx);
        if (rc.h >= 0) pos += area; else neg += area;
      });
      return [
        { label: { zh: '黎曼和（代数和）', en: 'Riemann sum' }, value: MC.formatNumber(r.value, 6) },
        { label: { zh: '参考值', en: 'reference' }, value: MC.formatNumber(exact, 6) },
        { label: { zh: '误差', en: 'error' }, value: MC.formatNumber(Math.abs(r.value - exact), 3) },
        { label: { zh: '正 / 负面积', en: 'pos / neg' }, value: MC.formatNumber(pos, 4) + ' / ' + MC.formatNumber(neg, 4) }
      ];
    },
    info: {
      definition: {
        zh: '定积分是黎曼和的极限：$\\int_a^b f(x)\\,dx=\\lim\\limits_{n\\to\\infty}\\sum_{i=1}^{n}f(\\xi_i)\\Delta x$。',
        en: 'A definite integral is the limit of Riemann sums: $\\int_a^b f=\\lim_{n\\to\\infty}\\sum f(\\xi_i)\\Delta x$.'
      },
      geometry: {
        zh: '矩形的**代数和**就是积分值：x 轴上方的矩形记正（珊瑚色），下方记负（蓝色）。因此 $\\int_{-1}^{1}x\\,dx=0$——两块面积相互抵消，而不是“面积为零”。',
        en: 'Rectangles above the axis count positive (coral), below negative (blue): $\\int_{-1}^{1}x\\,dx=0$ because the signed areas cancel.'
      },
      algebra: {
        zh: '牛顿–莱布尼茨公式：$\\int_a^b f(x)\\,dx=F(b)-F(a)$，其中 $F\'=f$。中点法误差为 $O(1/n^2)$，比左右端点法（$O(1/n)$）更快收敛。',
        en: 'Newton–Leibniz: $\\int_a^b f=F(b)-F(a)$ with $F\'=f$. Midpoint error is $O(1/n^2)$, faster than left/right ($O(1/n)$).'
      },
      application: {
        zh: '变速运动的位移、变力做功、概率密度求概率、图像与信号的能量，都通过积分得到。',
        en: 'Displacement under varying speed, work by a varying force, probabilities from densities, and signal energy are all integrals.'
      }
    }
  });
})(window);
