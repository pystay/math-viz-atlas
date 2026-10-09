/*!
 * modules/stats.js — 统计：直方图 + 箱线图（初中-高中"统计与概率"）
 * 数据用种子随机生成（Box–Muller 正态样本），因此每次渲染完全一致、可复现。
 */
(function (root) {
  'use strict';
  var MS = root.MS, P = root.Plot.PALETTE, MC = root.MathCore;

  function dataset(p) {
    return MC.sampleNormal(Math.round(p.n), p.mu, p.sigma, 20261009);
  }
  function maxDensity(p) {
    var h = MC.histogram(dataset(p), Math.round(p.bins));
    var peak = 1 / (p.sigma * Math.sqrt(2 * Math.PI));
    return Math.max(h.bins.reduce(function (m, b) { return Math.max(m, b.density); }, 0), peak);
  }

  MS.register({
    id: 'stats-histogram',
    stage: 'stats',
    order: 1,
    title: { zh: '统计：直方图与箱线图', en: 'Histogram and box plot' },
    caption: { zh: '同一批数据的两种"分布画像"', en: 'Two views of the same distribution' },
    formula: function (p) {
      var d = dataset(p);
      return '\\bar x = ' + MC.formatNumber(MC.mean(d), 4) + ',\\qquad s = ' + MC.formatNumber(MC.stdev(d), 4) +
        ',\\qquad n = ' + d.length;
    },
    controls: [
      { id: 'n', type: 'range', label: { zh: '样本量 n', en: 'Sample size n' }, min: 30, max: 800, step: 10, value: 200 },
      { id: 'mu', type: 'range', label: { zh: '总体均值 μ', en: 'Mean μ' }, min: -4, max: 14, step: 0.2, value: 5 },
      { id: 'sigma', type: 'range', label: { zh: '总体标准差 σ', en: 'Std dev σ' }, min: 0.3, max: 3, step: 0.05, value: 1.2 },
      { id: 'bins', type: 'range', label: { zh: '直方图箱数', en: 'Bins' }, min: 5, max: 25, step: 1, value: 12 },
      { id: 'normal', type: 'toggle', label: { zh: '叠加理论正态曲线', en: 'Overlay normal curve' }, value: true },
      { id: 'outlier', type: 'toggle', label: { zh: '标出离群点（1.5×IQR）', en: 'Mark outliers' }, value: true }
    ],
    view: function (p) {
      var m = maxDensity(p) * 1.15;
      return {
        xMin: p.mu - 4 * p.sigma, xMax: p.mu + 4 * p.sigma,
        yMin: -0.62 * m, yMax: m
      };
    },
    legend: [
      { color: P.cobalt, label: { zh: '直方图（密度）', en: 'Histogram (density)' } },
      { color: P.coral, label: { zh: '理论正态密度曲线', en: 'Normal density' } },
      { color: P.mint, label: { zh: '箱线图：中位数与四分位', en: 'Box plot' } }
    ],
    draw: function (plot, p) {
      plot.grid(); plot.axes();
      var d = dataset(p);
      var h = MC.histogram(d, Math.round(p.bins));
      var five = MC.fiveNumber(d);
      var m = maxDensity(p);
      var bandMid = -0.36 * m, bandH = 0.16 * m;

      // 直方图
      h.bins.forEach(function (b) {
        if (b.count === 0) return;
        plot.rect(b.x0, 0, b.x1, b.density, {
          fill: 'rgba(74,98,136,0.22)', stroke: 'rgba(74,98,136,0.85)', width: 1
        });
      });

      // 理论正态曲线
      if (p.normal) {
        var mu = p.mu, sg = p.sigma;
        plot.curve(function (x) {
          return Math.exp(-((x - mu) * (x - mu)) / (2 * sg * sg)) / (sg * Math.sqrt(2 * Math.PI));
        }, { color: P.coral, width: 2, adaptive: true });
      }

      // 箱线图（下方独立色带）
      var fences = {
        lo: five.q1 - 1.5 * five.iqr,
        hi: five.q3 + 1.5 * five.iqr
      };
      var inliers = d.filter(function (v) { return v >= fences.lo && v <= fences.hi; });
      var whiskLo = Math.min.apply(null, inliers);
      var whiskHi = Math.max.apply(null, inliers);
      var outliers = d.filter(function (v) { return v < fences.lo || v > fences.hi; });

      // 须
      plot.segment(whiskLo, bandMid, five.q1, bandMid, { color: P.mint, width: 1.6 });
      plot.segment(five.q3, bandMid, whiskHi, bandMid, { color: P.mint, width: 1.6 });
      plot.segment(whiskLo, bandMid - bandH / 2, whiskLo, bandMid + bandH / 2, { color: P.mint, width: 1.6 });
      plot.segment(whiskHi, bandMid - bandH / 2, whiskHi, bandMid + bandH / 2, { color: P.mint, width: 1.6 });
      // 箱体（Q1–Q3）
      plot.rect(five.q1, bandMid - bandH / 2, five.q3, bandMid + bandH / 2, {
        fill: 'rgba(47,158,126,0.22)', stroke: P.mint, width: 1.6
      });
      // 中位数
      plot.segment(five.median, bandMid - bandH / 2, five.median, bandMid + bandH / 2, { color: P.mint, width: 2.6 });
      // 均值
      var mean = MC.mean(d);
      plot.point(mean, bandMid, { r: 4.5, fill: P.paper, stroke: P.coral, width: 2 });

      if (p.outlier) {
        outliers.forEach(function (v) {
          plot.point(v, bandMid, { r: 3.6, fill: 'rgba(206,88,72,0.85)' });
        });
      }

      // 注意：label 的 dy 是**屏幕像素**偏移，不能用密度单位（否则会重叠）
      plot.label(five.q1, bandMid, 'Q₁ ' + MC.formatNumber(five.q1, 3), { dy: 20, align: 'center', color: P.mint, font: '11px Consolas, monospace' });
      plot.label(five.q3, bandMid, 'Q₃ ' + MC.formatNumber(five.q3, 3), { dy: 20, align: 'center', color: P.mint, font: '11px Consolas, monospace' });
      plot.label(five.median, bandMid, '中位数 ' + MC.formatNumber(five.median, 3), { dy: -18, align: 'center', color: P.mint, font: '11px Consolas, monospace' });
      plot.label(mean, bandMid, '均值 ' + MC.formatNumber(mean, 3), { dy: -34, align: 'center', color: P.coral, font: '11px Consolas, monospace' });
      plot.label(plot.view.xMin + (plot.view.xMax - plot.view.xMin) * 0.01, bandMid, '箱线图',
        { dy: 34, color: P.muted, font: '11px Consolas, monospace' });
    },
    readouts: function (p) {
      var d = dataset(p);
      var five = MC.fiveNumber(d);
      return [
        { label: { zh: '均值 x̄', en: 'mean' }, value: MC.formatNumber(MC.mean(d), 4) },
        { label: { zh: '标准差 s', en: 'std' }, value: MC.formatNumber(MC.stdev(d), 4) },
        { label: { zh: '中位数', en: 'median' }, value: MC.formatNumber(five.median, 4) },
        { label: { zh: 'Q₁ / Q₃', en: 'Q1 / Q3' }, value: MC.formatNumber(five.q1, 3) + ' / ' + MC.formatNumber(five.q3, 3) },
        { label: { zh: 'IQR', en: 'IQR' }, value: MC.formatNumber(five.iqr, 4) }
      ];
    },
    info: {
      definition: {
        zh: '直方图把数据按区间分箱、用**柱高**表示频数（或密度）；箱线图用五个数概括分布：最小值、$Q_1$、中位数、$Q_3$、最大值。',
        en: 'A histogram bins data and shows frequency (or density) by bar height; a box plot summarises a distribution by five numbers: min, $Q_1$, median, $Q_3$, max.'
      },
      geometry: {
        zh: '箱体长度 = $IQR=Q_3-Q_1$，它包含中间 50% 的数据；须延伸到 $1.5\\times IQR$ 之内的最远点，越界的点作为离群点单独标出。均值（空心圆）与中位数（粗线）距离越远，分布越偏斜。',
        en: 'The box spans $IQR=Q_3-Q_1$ (the middle 50%); whiskers reach the furthest point within $1.5\\times IQR$; beyond that are outliers. A large mean–median gap signals skew.'
      },
      algebra: {
        zh: '样本标准差 $s=\\sqrt{\\dfrac{1}{n-1}\\sum(x_i-\\bar x)^2}$（分母 $n-1$ 是无偏估计）；正态分布密度 $\\dfrac{1}{\\sigma\\sqrt{2\\pi}}e^{-(x-\\mu)^2/2\\sigma^2}$，约 68% 的数据落在 $\\bar x\\pm s$ 内。',
        en: 'Sample SD uses the $n-1$ denominator (unbiased); the normal density is $\\frac{1}{\\sigma\\sqrt{2\\pi}}e^{-(x-\\mu)^2/2\\sigma^2}$, with ~68% of data inside $\\bar x\\pm s$.'
      },
      application: {
        zh: '考试成绩分析、质量控制（六西格玛）、A/B 实验、金融风险度量，都先用这两张图判断分布形态与异常值。',
        en: 'Exam analysis, quality control, A/B testing and risk measurement all start with these two charts.'
      }
    }
  });
})(window);
