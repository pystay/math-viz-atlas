/*!
 * modules/algebra.js — 代数：线性、二次、指数与对数
 * 每个模块都给出「定义 / 几何意义 / 代数操作 / 实际应用」四维闭环。
 */
(function (root) {
  'use strict';
  var MS = root.MS, P = root.Plot.PALETTE, MC = root.MathCore;

  // ------------------------------------------------------------ 线性函数
  MS.register({
    id: 'algebra-linear',
    stage: 'algebra',
    order: 1,
    title: { zh: '线性函数 y = kx + b', en: 'Linear y = kx + b' },
    caption: { zh: '斜率 k 决定倾斜，截距 b 决定抬升', en: 'k = slope, b = intercept' },
    formula: function (p) {
      return 'y = ' + MC.formatFixed(p.k, 2) + 'x ' + (p.b >= 0 ? '+ ' : '- ') + MC.formatFixed(Math.abs(p.b), 2);
    },
    controls: [
      { id: 'k', type: 'range', label: { zh: '斜率 k', en: 'Slope k' }, min: -3, max: 3, step: 0.05, value: 1 },
      { id: 'b', type: 'range', label: { zh: '截距 b', en: 'Intercept b' }, min: -4, max: 4, step: 0.05, value: 1 }
    ],
    view: { xMin: -6, xMax: 6, yMin: -5, yMax: 5 },
    legend: [
      { color: P.cobalt, label: { zh: '直线 y = kx + b', en: 'Line y = kx + b' } },
      { color: P.coral, label: { zh: 'y 轴截距 (0, b)', en: 'y-intercept (0, b)' } },
      { color: P.mint, label: { zh: '斜率三角形 Δy / Δx', en: 'Slope triangle Δy / Δx' } }
    ],
    draw: function (plot, p) {
      plot.grid(); plot.axes();
      var f = function (x) { return p.k * x + p.b; };
      plot.curve(f, { color: P.cobalt, width: 2.2 });
      plot.slopeTriangle(0, p.b, 1, p.k, { color: P.mint });
      plot.point(0, p.b, { r: 5, fill: P.coral, stroke: P.paper });
      plot.label(0, p.b, 'b = ' + MC.formatNumber(p.b, 3), { dx: 10, dy: -14, color: P.coral, font: '12px Consolas, monospace' });
      if (Math.abs(p.k) > 1e-6) {
        var zero = -p.b / p.k;
        if (zero > plot.view.xMin && zero < plot.view.xMax) {
          plot.point(zero, 0, { r: 4, fill: P.paper, stroke: P.cobalt, width: 1.6 });
          plot.label(zero, 0, '零点 ' + MC.formatNumber(zero, 3), { dx: 8, dy: 16, color: P.cobalt, font: '12px Consolas, monospace' });
        }
      }
    },
    readouts: function (p) {
      return [
        { label: { zh: '斜率 k', en: 'slope k' }, value: MC.formatNumber(p.k, 3) },
        { label: { zh: '截距 b', en: 'intercept b' }, value: MC.formatNumber(p.b, 3) },
        { label: { zh: '零点', en: 'root' }, value: Math.abs(p.k) < 1e-6 ? '不存在' : MC.formatNumber(-p.b / p.k, 3) },
        { label: { zh: 'f(2)', en: 'f(2)' }, value: MC.formatNumber(2 * p.k + p.b, 3) }
      ];
    },
    info: {
      definition: {
        zh: '线性函数 $y = kx + b$：自变量每增加 1，函数值固定增加 k。k 叫**斜率**，b 叫**截距**，两者是完全不同的量。',
        en: '$y=kx+b$: each unit increase of x changes y by exactly k. k is the **slope**, b the **intercept** — different quantities.'
      },
      geometry: {
        zh: '斜率 = 纵向变化 ÷ 横向变化（图中的绿色三角形 $\\Delta y/\\Delta x$）；截距 = 直线与 y 轴交点的**高度** $(0, b)$。把 k 调大，直线变陡；把 b 调大，直线整体上移而倾角不变。',
        en: 'Slope = rise over run (the green $\\Delta y/\\Delta x$ triangle); the intercept is the height where the line crosses the y-axis, $(0,b)$.'
      },
      algebra: {
        zh: '已知两点 $(x_1,y_1),(x_2,y_2)$ 时 $k=\\dfrac{y_2-y_1}{x_2-x_1}$；令 $y=0$ 解得零点 $x=-\\dfrac{b}{k}$。',
        en: 'From two points, $k=\\dfrac{y_2-y_1}{x_2-x_1}$; setting $y=0$ gives the root $x=-\\dfrac{b}{k}$.'
      },
      application: {
        zh: '匀速运动的位移 $s = vt + s_0$、计价 $y =$ 单价 $\\times$ 数量 $+$ 起步价、线性回归预测，都是同一模型。',
        en: 'Uniform motion $s=vt+s_0$, pricing with a base fee, and linear regression all share this model.'
      }
    }
  });

  // ------------------------------------------------------------ 二次函数
  // a = 0 时不是抛物线而是直线；这里统一用一个判据，保证
  // 公式 / 绘图 / 读数 / "开口" 四处口径完全一致（独立评审发现的口径矛盾）。
  function isDegenerate(p) { return Math.abs(p.a) < 1e-9; }

  MS.register({
    id: 'algebra-quadratic',
    stage: 'algebra',
    order: 2,
    title: { zh: '二次函数 y = ax² + bx + c', en: 'Quadratic y = ax² + bx + c' },
    caption: { zh: '顶点、对称轴与判别式', en: 'Vertex, axis, discriminant' },
    formula: function (p) {
      if (isDegenerate(p)) {   // a = 0：诚实显示为直线，不做"夹紧成小抛物线"的伪装
        return 'y = ' + MC.formatFixed(p.b, 2) + 'x ' + (p.c >= 0 ? '+ ' : '- ') + MC.formatFixed(Math.abs(p.c), 2);
      }
      return 'y = ' + MC.formatFixed(p.a, 2) + 'x^{2} ' +
        (p.b >= 0 ? '+ ' : '- ') + MC.formatFixed(Math.abs(p.b), 2) + 'x ' +
        (p.c >= 0 ? '+ ' : '- ') + MC.formatFixed(Math.abs(p.c), 2);
    },
    controls: [
      { id: 'a', type: 'range', label: { zh: '二次项 a', en: 'a' }, min: -2, max: 2, step: 0.05, value: 1 },
      { id: 'b', type: 'range', label: { zh: '一次项 b', en: 'b' }, min: -4, max: 4, step: 0.1, value: 0 },
      { id: 'c', type: 'range', label: { zh: '常数项 c', en: 'c' }, min: -4, max: 4, step: 0.1, value: -1 }
    ],
    view: { xMin: -6, xMax: 6, yMin: -6, yMax: 8 },
    legend: [
      { color: P.cobalt, label: { zh: '抛物线', en: 'Parabola' } },
      { color: P.coral, label: { zh: '顶点', en: 'Vertex' } },
      { color: P.mint, label: { zh: '实根', en: 'Real roots' } }
    ],
    draw: function (plot, p) {
      plot.grid(); plot.axes();
      var a = p.a;

      if (isDegenerate(p)) {
        // a = 0：直线（与公式、读数保持一致）
        plot.curve(function (x) { return p.b * x + p.c; }, { color: P.cobalt, width: 2.2 });
        var zero = Math.abs(p.b) > 1e-9 ? -p.c / p.b : null;
        if (zero !== null && zero > plot.view.xMin && zero < plot.view.xMax) {
          plot.point(zero, 0, { r: 5, fill: P.mint, stroke: P.paper });
          plot.label(zero, 0, '根 ' + MC.formatNumber(zero, 3), { dx: 8, dy: -14, color: P.mint, font: '12px Consolas, monospace' });
        }
        plot.label(plot.view.xMin + 0.3, plot.view.yMax - 0.4,
          'a = 0：退化为直线，无顶点、无对称轴，判别式不适用',
          { color: P.coral, font: '12px Consolas, monospace' });
        return;
      }

      var f = function (x) { return a * x * x + p.b * x + p.c; };
      plot.curve(f, { color: P.cobalt, width: 2.2 });

      var vx = -p.b / (2 * a), vy = p.c - (p.b * p.b) / (4 * a);
      plot.guide(vx, plot.view.yMin, vx, plot.view.yMax, { color: 'rgba(74,98,136,0.5)', dash: [6, 5] });
      plot.label(vx, plot.view.yMax, '对称轴 x = ' + MC.formatNumber(vx, 3), { align: 'center', dy: -6, color: P.cobalt, font: '12px Consolas, monospace' });
      plot.point(vx, vy, { r: 5.5, fill: P.coral, stroke: P.paper });
      plot.label(vx, vy, '顶点 (' + MC.formatNumber(vx, 2) + ', ' + MC.formatNumber(vy, 2) + ')',
        { dx: 12, dy: a > 0 ? 18 : -18, color: P.coral, font: '12px Consolas, monospace' });

      var disc = p.b * p.b - 4 * a * p.c;
      if (disc >= 0) {
        var r1 = (-p.b - Math.sqrt(disc)) / (2 * a), r2 = (-p.b + Math.sqrt(disc)) / (2 * a);
        [r1, r2].forEach(function (x) {
          if (x > plot.view.xMin && x < plot.view.xMax) {
            plot.point(x, 0, { r: 5, fill: P.mint, stroke: P.paper });
          }
        });
      }
    },
    readouts: function (p) {
      var a = p.a;
      if (isDegenerate(p)) {
        var root = Math.abs(p.b) > 1e-9 ? MC.formatNumber(-p.c / p.b, 3) : '无（水平线）';
        return [
          { label: { zh: '二次项 a', en: 'a' }, value: '0（直线）' },
          { label: { zh: '判别式 Δ', en: 'Δ' }, value: '不适用' },
          { label: { zh: '实根', en: 'root' }, value: root },
          { label: { zh: '开口', en: 'opening' }, value: '—' }
        ];
      }
      var disc = p.b * p.b - 4 * a * p.c;
      var vx = -p.b / (2 * a), vy = p.c - (p.b * p.b) / (4 * a);
      var roots = disc > 1e-9
        ? MC.formatNumber((-p.b - Math.sqrt(disc)) / (2 * a), 3) + ', ' + MC.formatNumber((-p.b + Math.sqrt(disc)) / (2 * a), 3)
        : (Math.abs(disc) <= 1e-9 ? MC.formatNumber(vx, 3) + '（重根）' : '无实根');
      return [
        { label: { zh: '判别式 Δ', en: 'Δ' }, value: MC.formatNumber(disc, 3) },
        { label: { zh: '顶点', en: 'vertex' }, value: '(' + MC.formatNumber(vx, 2) + ', ' + MC.formatNumber(vy, 2) + ')' },
        { label: { zh: '实根', en: 'roots' }, value: roots },
        { label: { zh: '开口', en: 'opening' }, value: a > 0 ? '向上' : '向下' }
      ];
    },
    info: {
      definition: {
        zh: '二次函数 $y = ax^2+bx+c\\ (a\\neq 0)$，图像是抛物线。判别式 $\\Delta=b^2-4ac$ 决定它与 x 轴的交点个数。',
        en: 'A quadratic $y=ax^2+bx+c\\ (a\\neq0)$ graphs as a parabola; $\\Delta=b^2-4ac$ decides how many times it meets the x-axis.'
      },
      geometry: {
        zh: '顶点是抛物线的最高/最低点，对称轴 $x=-\\dfrac{b}{2a}$ 把图像左右镜像；$\\Delta>0$ 两个实根，$\\Delta=0$ 相切（重根），$\\Delta<0$ 与 x 轴不相交。',
        en: 'The vertex is the extremum, the axis $x=-\\frac{b}{2a}$ mirrors the curve; $\\Delta>0,=0,<0$ give two, one, or no real roots.'
      },
      algebra: {
        zh: '配方法：$ax^2+bx+c = a\\left(x+\\dfrac{b}{2a}\\right)^2 + \\dfrac{4ac-b^2}{4a}$，顶点坐标由此直接读出；求根公式 $x=\\dfrac{-b\\pm\\sqrt{\\Delta}}{2a}$。',
        en: 'Completing the square gives $a\\left(x+\\frac{b}{2a}\\right)^2+\\frac{4ac-b^2}{4a}$; the quadratic formula is $x=\\frac{-b\\pm\\sqrt{\\Delta}}{2a}$.'
      },
      application: {
        zh: '抛体运动高度、利润最大化、最优定价、抛物线天线，都归结为求顶点或求根。',
        en: 'Projectile height, profit maximisation, optimal pricing and dish antennas all reduce to vertex or roots.'
      }
    }
  });

  // ------------------------------------------------------------ 指数与对数
  // 反函数对要求 a > 0 且 a ≠ 1；滑块恰好能取到 a = 1，必须显式处理。
  function isInvalidBase(p) { return Math.abs(p.a - 1) < 1e-9; }

  MS.register({
    id: 'algebra-explog',
    stage: 'algebra',
    order: 3,
    title: { zh: '指数与对数互为反函数', en: 'exp and log are inverses' },
    caption: { zh: '关于 y = x 对称', en: 'Mirror images about y = x' },
    formula: function (p) {
      if (isInvalidBase(p)) {
        // 底数 1 的诚实表述：1^x ≡ 1 不是单射，因此没有反函数，log_1 无定义
        return 'a = 1:\\quad 1^{x}\\equiv 1 \\;\\text{（非单射，无反函数）},\\qquad \\log_{1}x \\;\\text{无定义}';
      }
      return 'y = ' + MC.formatFixed(p.a, 2) + '^{x} \\quad\\Longleftrightarrow\\quad y = \\log_{' + MC.formatFixed(p.a, 2) + '} x';
    },
    controls: [
      { id: 'a', type: 'range', label: { zh: '底数 a', en: 'Base a' }, min: 0.25, max: 3, step: 0.05, value: 2 },
      { id: 'mirror', type: 'toggle', label: { zh: '显示镜像点', en: 'Show mirror points' }, value: true }
    ],
    square: { cx: 1.6, cy: 1.6, halfWidth: 5.4 },
    legend: [
      { color: P.cobalt, label: { zh: 'y = aˣ', en: 'y = a^x' } },
      { color: P.coral, label: { zh: 'y = logₐx', en: 'y = log_a x' } },
      { color: P.muted, label: { zh: 'y = x（镜面）', en: 'y = x (mirror)' } }
    ],
    draw: function (plot, p) {
      plot.grid(); plot.axes();
      var a = p.a;

      if (isInvalidBase(p)) {
        // a = 1：只画 y = 1（这才是 1^x 的真实图像），并明确说明对数无定义
        plot.curve(function () { return 1; }, { color: P.cobalt, width: 2.2 });
        plot.label(plot.view.xMin + 0.3, 1.35, 'y = 1ˣ ≡ 1（水平线，非单射 → 无反函数）',
          { color: P.cobalt, font: '12px Consolas, monospace' });
        plot.label(plot.view.xMin + 0.3, 0.55, 'log₁x 在实数域无定义（不绘制）',
          { color: P.coral, font: '12px Consolas, monospace' });
        return;
      }

      plot.guide(plot.view.xMin, plot.view.xMin, plot.view.xMax, plot.view.xMax, { color: 'rgba(107,114,128,0.7)', dash: [7, 5] });
      plot.curve(function (x) { return Math.pow(a, x); }, { color: P.cobalt, width: 2.2 });
      plot.curve(function (x) { return x > 0 ? Math.log(x) / Math.log(a) : NaN; }, { color: P.coral, width: 2.2 });
      if (p.mirror) {
        var y0 = Math.pow(a, 1); // (1, a)
        if (y0 < plot.view.yMax) {
          plot.point(1, y0, { r: 4.5, fill: P.cobalt, stroke: P.paper });
          plot.label(1, y0, '(1, a)', { dx: -8, dy: -12, align: 'right', color: P.cobalt, font: '12px Consolas, monospace' });
        }
        if (a < plot.view.xMax) {
          plot.point(a, 1, { r: 4.5, fill: P.coral, stroke: P.paper });
          plot.label(a, 1, '(a, 1)', { dx: 10, dy: 12, color: P.coral, font: '12px Consolas, monospace' });
        }
        plot.guide(1, y0, a, 1, { color: 'rgba(122,90,168,0.75)', dash: [3, 4] });
      }
      plot.label(plot.view.xMax - 0.3, 6, 'y = aˣ', { align: 'right', color: P.cobalt, font: '13px "Cambria Math", Georgia, serif' });
    },
    readouts: function (p) {
      if (isInvalidBase(p)) {
        return [
          { label: { zh: '底数 a', en: 'base a' }, value: '1（不合法的底数）' },
          { label: { zh: 'aˣ', en: 'a^x' }, value: '恒为 1' },
          { label: { zh: 'logₐ x', en: 'log_a x' }, value: '无定义' },
          { label: { zh: '反函数', en: 'inverse' }, value: '不存在' }
        ];
      }
      return [
        { label: { zh: '底数 a', en: 'base a' }, value: MC.formatFixed(p.a, 2) },
        { label: { zh: 'a⁰', en: 'a^0' }, value: '1' },
        { label: { zh: 'logₐ a', en: 'log_a a' }, value: '1' },
        { label: { zh: 'logₐ 1', en: 'log_a 1' }, value: '0' }
      ];
    },
    info: {
      definition: {
        zh: '$y=a^x$ 与 $y=\\log_a x$ 互为反函数：一个把指数变成结果，另一个把结果还原成指数。',
        en: '$y=a^x$ and $y=\\log_a x$ are inverse functions: one turns an exponent into a value, the other recovers the exponent.'
      },
      geometry: {
        zh: '把图像沿直线 $y=x$ 翻折，指数曲线就变成对数曲线——图中紫色虚线连接的 $(1,a)$ 与 $(a,1)$ 正是这样一对镜像点。',
        en: 'Reflecting across $y=x$ turns the exponential into the logarithm; the purple dashed segment joins the mirror pair $(1,a)$ and $(a,1)$.'
      },
      algebra: {
        zh: '$a^{x+y}=a^x a^y$，$\\log_a(xy)=\\log_a x+\\log_a y$，$\\log_a x = \\dfrac{\\ln x}{\\ln a}$。换底公式让任意底数都能算。',
        en: '$a^{x+y}=a^xa^y$, $\\log_a(xy)=\\log_ax+\\log_ay$, and $\\log_ax=\\frac{\\ln x}{\\ln a}$ (change of base).'
      },
      application: {
        zh: '复利与人口增长（指数）、地震震级、声音分贝、算法复杂度与信息熵（对数）都用这一对函数。',
        en: 'Compound interest and population growth (exponential); earthquake magnitude, decibels, complexity and entropy (logarithm).'
      }
    }
  });
})(window);
