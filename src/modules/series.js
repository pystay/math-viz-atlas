/*!
 * modules/series.js — 级数：几何级数的收敛、调和级数的发散
 */
(function (root) {
  'use strict';
  var MS = root.MS, P = root.Plot.PALETTE, MC = root.MathCore;
  var EULER_GAMMA = 0.5772156649015329;

  function polyline(plot, pts, style) {
    var ctx = plot.ctx;
    ctx.save();
    ctx.beginPath();
    pts.forEach(function (q, i) { i ? ctx.lineTo(plot.sx(q[0]), plot.sy(q[1])) : ctx.moveTo(plot.sx(q[0]), plot.sy(q[1])); });
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.width || 1.8;
    if (style.dash) ctx.setLineDash(style.dash);
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  }

  // ------------------------------------------------------ 几何级数
  MS.register({
    id: 'series-geometric',
    stage: 'series',
    order: 1,
    title: { zh: '几何级数：收敛的阶梯', en: 'Geometric series: a converging staircase' },
    caption: { zh: '|r| < 1 时部分和有极限 1/(1−r)', en: 'For |r| < 1 the partial sums converge to 1/(1−r)' },
    formula: function (p) {
      var r = MC.formatFixed(p.r, 2);
      if (Math.abs(p.r - 1) < 1e-9) {
        // r = 1 时闭式 (1-1ⁿ)/(1-1) 是 0/0；诚实给出真实的部分和
        return 'r = 1:\\quad S_n = \\sum_{k=0}^{n-1} 1 = n \\quad\\text{（发散，闭式 }\\tfrac{1-r^{n}}{1-r}\\text{ 失效）}';
      }
      return 'S_n = \\sum_{k=0}^{n-1} ' + r + '^{k} \\;=\\; \\frac{1-' + r + '^{n}}{1-' + r + '}';
    },
    controls: [
      { id: 'r', type: 'range', label: { zh: '公比 r', en: 'Ratio r' }, min: -0.9, max: 1.1, step: 0.01, value: 0.5 },
      { id: 'n', type: 'range', label: { zh: '项数 n', en: 'Terms n' }, min: 1, max: 30, step: 1, value: 8 },
      { id: 'limit', type: 'toggle', label: { zh: '显示极限线', en: 'Show limit line' }, value: true }
    ],
    view: function (p) { return { xMin: -1, xMax: Math.round(p.n) + 1, yMin: -1.4, yMax: 2.6 }; },
    legend: [
      { color: P.coral, label: { zh: '每一项 rᵏ', en: 'Term r^k' } },
      { color: P.mint, label: { zh: '部分和 Sₙ（阶梯）', en: 'Partial sum Sₙ' } },
      { color: P.cobalt, label: { zh: '极限 1/(1−r)', en: 'Limit 1/(1−r)' } }
    ],
    draw: function (plot, p) {
      plot.grid(); plot.axes();
      var n = Math.max(1, Math.round(p.n)), r = p.r;
      var g = MC.geometricPartial(1, r, n);
      var converging = Math.abs(r) < 1;
      var limit = converging ? 1 / (1 - r) : null;

      // 每一项：柱
      g.terms.forEach(function (term, k) {
        plot.rect(k - 0.34, 0, k + 0.34, term, {
          fill: term >= 0 ? 'rgba(206,88,72,0.22)' : 'rgba(206,88,72,0.28)',
          stroke: 'rgba(206,88,72,0.8)', width: 1
        });
      });
      // 部分和阶梯
      var steps = [];
      for (var k = 0; k < n; k++) {
        var s = 0;
        for (var j = 0; j <= k; j++) s += Math.pow(r, j);
        steps.push([k, s]);
        steps.push([k + 1, s]);
      }
      polyline(plot, steps, { color: P.mint, width: 2.2 });
      steps.filter(function (_, i) { return i % 2 === 0; }).forEach(function (q) {
        plot.point(q[0], q[1], { r: 3.4, fill: P.mint, stroke: P.paper });
      });

      if (limit !== null && p.limit) {
        plot.guide(plot.view.xMin, limit, plot.view.xMax, limit, { color: 'rgba(74,98,136,0.9)', dash: [7, 5] });
        plot.label(plot.view.xMax, limit, '极限 = ' + MC.formatNumber(limit, 5),
          { align: 'right', dy: -12, color: P.cobalt, font: '12px Consolas, monospace' });
      }
      plot.label(plot.view.xMin + 0.2, plot.view.yMax - 0.3,
        converging ? '|r| < 1 → 收敛' : '|r| ≥ 1 → 发散（部分和无界）',
        { color: converging ? P.mint : P.coral, font: '12px Consolas, monospace' });
    },
    readouts: function (p) {
      var n = Math.max(1, Math.round(p.n)), r = p.r;
      var g = MC.geometricPartial(1, r, n);
      var converging = Math.abs(r) < 1;
      return [
        { label: { zh: 'Sₙ', en: 'Sₙ' }, value: MC.formatNumber(g.value, 6) },
        { label: { zh: '末项', en: 'last term' }, value: MC.formatNumber(g.terms[n - 1], 5) },
        { label: { zh: '极限', en: 'limit' }, value: converging ? MC.formatNumber(1 / (1 - r), 6) : '不存在' },
        // 精确余项 |rⁿ/(1−r)|（比 |r|ⁿ/(1−|r|) 更紧，r<0 时不再高出十几倍）
        { label: { zh: '余项 |rⁿ/(1−r)|', en: 'remainder' },
          value: converging ? MC.formatNumber(Math.pow(Math.abs(r), n) / Math.abs(1 - r), 3) : '—' }
      ];
    },
    info: {
      definition: {
        zh: '几何级数 $\\sum\\limits_{k=0}^{\\infty} r^k$：每一项都是前一项的 $r$ 倍。$|r|<1$ 时收敛到 $\\dfrac{1}{1-r}$，否则发散。',
        en: 'A geometric series $\\sum r^k$ multiplies each term by $r$; it converges to $\\frac{1}{1-r}$ iff $|r|<1$.'
      },
      geometry: {
        zh: '珊瑚色柱子是每一项（越来越短），绿色阶梯是累加过程；柱子的“剩余高度”就是余项。极限线是阶梯永远够不到但无限接近的高度。',
        en: 'Coral bars are the terms, the green staircase is the running total, and the dashed line is the height it approaches but never reaches.'
      },
      algebra: {
        zh: '求和公式 $S_n=\\dfrac{1-r^n}{1-r}$（$r\\neq1$）。余项 $\\dfrac{r^n}{1-r}$ 随 $n$ 指数衰减——这就是收敛的代数证据。',
        en: 'Closed form $S_n=\\frac{1-r^n}{1-r}$; the tail $\\frac{r^n}{1-r}$ decays exponentially — the algebraic proof of convergence.'
      },
      application: {
        zh: '循环小数 $0.\\overline{3}=\\frac{1/3}{1-1/10}$、银行乘数效应、等比折现、递归算法的成本分析。',
        en: 'Repeating decimals, the bank multiplier effect, geometric discounting and recursive algorithm cost analysis.'
      }
    }
  });

  // ------------------------------------------------------ 调和级数
  MS.register({
    id: 'series-harmonic',
    stage: 'series',
    order: 2,
    title: { zh: '调和级数：缓慢地发散', en: 'Harmonic series: diverging slowly' },
    caption: { zh: '项趋于 0，但和趋于无穷', en: 'Terms → 0, yet the sum → ∞' },
    formula: function (p) {
      return 'H_n = \\sum_{k=1}^{' + Math.round(p.n) + '} \\frac{1}{k}';
    },
    controls: [
      { id: 'n', type: 'range', label: { zh: '项数 n', en: 'Terms n' }, min: 1, max: 500, step: 1, value: 24 },
      { id: 'compare', type: 'toggle', label: { zh: '对比 ln n + γ', en: 'Compare with ln n + γ' }, value: true }
    ],
    view: function (p) {
      var n = Math.max(1, Math.round(p.n));
      var H = MC.harmonicPartial(n).value;
      var top = Math.max(H, Math.log(n) + EULER_GAMMA, 1.2) * 1.15;
      return { xMin: -1, xMax: n + 1, yMin: 0, yMax: top };
    },
    legend: [
      { color: P.mint, label: { zh: '部分和 Hₙ', en: 'Partial sum Hₙ' } },
      { color: P.cobalt, label: { zh: 'ln n + γ（渐近线）', en: 'ln n + γ (asymptote)' } },
      { color: P.coral, label: { zh: '每一项 1/k', en: 'Term 1/k' } }
    ],
    draw: function (plot, p) {
      plot.grid(); plot.axes();
      var n = Math.max(1, Math.round(p.n));
      if (n <= 80) {
        for (var k = 1; k <= n; k++) {
          plot.rect(k - 0.35, 0, k + 0.35, 1 / k, { fill: 'rgba(206,88,72,0.20)', stroke: 'rgba(206,88,72,0.7)', width: 1 });
        }
      }
      var pts = [], sum = 0;
      for (var i = 1; i <= n; i++) { sum += 1 / i; pts.push([i, sum]); }
      polyline(plot, pts, { color: P.mint, width: 2.4 });
      pts.filter(function (_, i) { return n <= 60 || i % Math.ceil(n / 60) === 0; })
        .forEach(function (q) { plot.point(q[0], q[1], { r: 3, fill: P.mint, stroke: P.paper }); });

      if (p.compare) {
        var ref = [];
        for (var x = 1; x <= n; x++) ref.push([x, Math.log(x) + EULER_GAMMA]);
        polyline(plot, ref, { color: P.cobalt, width: 1.6, dash: [7, 5] });
      }
      var last = pts[pts.length - 1];
      plot.point(last[0], last[1], { r: 5, fill: P.mint, stroke: P.paper, width: 1.4 });
      plot.label(last[0], last[1], 'H(' + n + ') = ' + MC.formatNumber(last[1], 4),
        { dx: -10, dy: -14, align: 'right', color: P.mint, font: '12px Consolas, monospace' });
      plot.label(plot.view.xMin + 0.2, plot.view.yMax - plot.view.yMax * 0.06,
        '每项 → 0，但总和无界：级数发散', { color: P.coral, font: '12px Consolas, monospace' });
    },
    readouts: function (p) {
      var n = Math.max(1, Math.round(p.n));
      var H = MC.harmonicPartial(n).value;
      var approx = Math.log(n) + EULER_GAMMA;
      return [
        { label: { zh: 'H(n)', en: 'H(n)' }, value: MC.formatNumber(H, 6) },
        { label: { zh: 'ln n + γ', en: 'ln n + γ' }, value: MC.formatNumber(approx, 6) },
        { label: { zh: '差', en: 'difference' }, value: MC.formatNumber(H - approx, 5) },
        { label: { zh: '末项 1/n', en: 'last term' }, value: MC.formatNumber(1 / n, 6) }
      ];
    },
    info: {
      definition: {
        zh: '调和级数 $\\sum\\limits_{k=1}^{\\infty}\\dfrac{1}{k}$：虽然每一项都趋于 0，但部分和无界增长，因此**发散**。',
        en: 'The harmonic series $\\sum 1/k$ has terms tending to 0 yet its partial sums grow without bound — it diverges.'
      },
      geometry: {
        zh: '柱子高度 $1/k$ 越来越矮，但每次新增的面积累计起来仍然足够把曲线不断抬高；绿色部分和曲线始终在上升，没有水平渐近线。',
        en: 'Bars shrink like $1/k$, yet the accumulated area keeps lifting the green partial-sum curve; it never flattens.'
      },
      algebra: {
        zh: '分组证明：$1+\\frac12+\\left(\\frac13+\\frac14\\right)+\\cdots > 1+\\frac12+\\frac12+\\frac12+\\cdots$，每组都不少于 $\\frac12$。渐近近似 $H_n=\\ln n+\\gamma+O(1/n)$。',
        en: 'Grouping gives $1+\\frac12+\\left(\\frac13+\\frac14\\right)+\\cdots>1+\\frac12+\\frac12+\\cdots$; asymptotically $H_n=\\ln n+\\gamma+O(1/n)$.'
      },
      application: {
        zh: '“项趋于 0”并不能保证收敛（这是初学最常见的误区）；在算法分析中，调和级数出现在快速排序平均复杂度与调和数的期望里。',
        en: 'Terms → 0 does not imply convergence; harmonic numbers appear in average-case quicksort and hashing analyses.'
      }
    }
  });
  // ------------------------------------------------------ 等差数列
  MS.register({
    id: 'sequence-arith',
    stage: 'series',
    order: 0,
    title: { zh: '等差数列：递推与求和', en: 'Arithmetic sequence' },
    caption: { zh: 'aₙ = a₁ + (n−1)d，Sₙ = n(a₁+aₙ)/2', en: 'aₙ = a₁ + (n−1)d' },
    formula: function (p) {
      var a1 = MC.formatFixed(p.a1, 1), d = MC.formatFixed(p.d, 1);
      return 'a_n = ' + a1 + ' + (n-1)\\cdot ' + d + ',\\qquad S_n = \\frac{n\\,(a_1 + a_n)}{2}';
    },
    controls: [
      { id: 'a1', type: 'range', label: { zh: '首项 a₁', en: 'First term a₁' }, min: -6, max: 6, step: 0.5, value: 2 },
      { id: 'd', type: 'range', label: { zh: '公差 d', en: 'Common difference d' }, min: -3, max: 3, step: 0.1, value: 1 },
      { id: 'n', type: 'range', label: { zh: '项数 n', en: 'Terms n' }, min: 1, max: 30, step: 1, value: 10 },
      { id: 'sumline', type: 'toggle', label: { zh: '显示部分和曲线 Sₖ', en: 'Partial-sum curve Sₖ' }, value: true }
    ],
    view: function (p) {
      var n = Math.max(1, Math.round(p.n));
      var top = p.a1, bot = p.a1;
      for (var k = 1; k <= n; k++) {
        var a = p.a1 + (k - 1) * p.d;
        var s = (k * (2 * p.a1 + (k - 1) * p.d)) / 2;
        top = Math.max(top, a, p.sumline ? s : a);
        bot = Math.min(bot, a, p.sumline ? s : a);
      }
      var pad = Math.max(1, (top - bot) * 0.12);
      return { xMin: -1, xMax: n + 1, yMin: bot - pad, yMax: top + pad };
    },
    legend: [
      { color: P.coral, label: { zh: '每一项 aₖ（等差递增/递减）', en: 'Term aₖ' } },
      { color: P.mint, label: { zh: '部分和 Sₖ 曲线（Sₖ 随 k 二次增长）', en: 'Partial sum Sₖ' } }
    ],
    draw: function (plot, p) {
      plot.grid(); plot.axes();
      var n = Math.max(1, Math.round(p.n));
      var terms = [], sums = [];
      for (var k = 1; k <= n; k++) {
        var a = p.a1 + (k - 1) * p.d;
        var s = (k * (2 * p.a1 + (k - 1) * p.d)) / 2;
        terms.push([k, a]);
        sums.push([k, s]);
        plot.rect(k - 0.3, 0, k + 0.3, a, {
          fill: a >= 0 ? 'rgba(206,88,72,0.20)' : 'rgba(74,98,136,0.22)',
          stroke: 'rgba(206,88,72,0.75)', width: 1
        });
      }
      // 通项在一条直线上（等差 = 一次函数）
      plot.segment(1, terms[0][1], n, terms[n - 1][1], { color: P.coral, width: 2 });
      terms.forEach(function (q) { plot.point(q[0], q[1], { r: 3.6, fill: P.coral, stroke: P.paper }); });

      if (p.sumline) {
        var steps = [];
        sums.forEach(function (q) { steps.push([q[0], q[1]]); });
        polyline(plot, steps, { color: P.mint, width: 2.2 });
        sums.forEach(function (q) { plot.point(q[0], q[1], { r: 3.2, fill: P.mint, stroke: P.paper }); });
      }
      plot.label(n, terms[n - 1][1], 'a' + n + ' = ' + MC.formatNumber(terms[n - 1][1], 3),
        { dx: -8, dy: -12, align: 'right', color: P.coral, font: '11px Consolas, monospace' });
      if (p.sumline) {
        plot.label(n, sums[n - 1][1], 'S' + n + ' = ' + MC.formatNumber(sums[n - 1][1], 4),
          { dx: -8, dy: -12, align: 'right', color: P.mint, font: '11px Consolas, monospace' });
      }
    },
    readouts: function (p) {
      var n = Math.max(1, Math.round(p.n));
      var an = p.a1 + (n - 1) * p.d;
      var sn = (n * (2 * p.a1 + (n - 1) * p.d)) / 2;
      return [
        { label: { zh: '首项 a₁', en: 'a₁' }, value: MC.formatFixed(p.a1, 2) },
        { label: { zh: '公差 d', en: 'd' }, value: MC.formatFixed(p.d, 2) },
        { label: { zh: 'aₙ', en: 'aₙ' }, value: MC.formatNumber(an, 4) },
        { label: { zh: 'Sₙ', en: 'Sₙ' }, value: MC.formatNumber(sn, 5) }
      ];
    },
    info: {
      definition: {
        zh: '等差数列：从第二项起，每一项与前一项的差都等于同一个常数 $d$，即 $a_{n+1}-a_n=d$；通项 $a_n=a_1+(n-1)d$。',
        en: 'An arithmetic sequence has a constant difference: $a_{n+1}-a_n=d$ and $a_n=a_1+(n-1)d$.'
      },
      geometry: {
        zh: '把 $a_n$ 看成 $n$ 的函数，它就是一次函数（直线）；柱子的高度线性变化，所以"部分和"按 $n^2$ 增长——绿色曲线因此是一条弯曲向上的折线。',
        en: 'Seen as a function of $n$ the terms lie on a straight line; the partial sums therefore grow like $n^2$, which is the curve of the staircase.'
      },
      algebra: {
        zh: '求和用"倒序相加"：$S_n=\\dfrac{n(a_1+a_n)}{2}$，也可以写成 $S_n=na_1+\\dfrac{n(n-1)}{2}d$。',
        en: 'Summing by pairing terms gives $S_n=\\frac{n(a_1+a_n)}{2}=\\frac{n(2a_1+(n-1)d)}{2}$.'
      },
      application: {
        zh: '等额分期还款的本金部分、堆叠物体的总数、均匀加速的位移（$s=v_0t+\\frac12at^2$ 的离散版）都是等差模型。',
        en: 'Equal-instalment principal, stacking counts and uniformly accelerated motion in discrete form are arithmetic models.'
      }
    }
  });

})(window);
