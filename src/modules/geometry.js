/*!
 * modules/geometry.js — 几何：用正多边形逼近圆（极限思想的几何入口）
 */
(function (root) {
  'use strict';
  var MS = root.MS, P = root.Plot.PALETTE, MC = root.MathCore;

  MS.register({
    id: 'geo-circle',
    stage: 'geometry',
    order: 1,
    title: { zh: '正多边形逼近圆：π 的来历', en: 'Polygons approaching a circle' },
    caption: { zh: 'n 越大，面积越接近 π', en: 'As n grows, area → π' },
    formula: function (p) {
      var n = Math.round(p.n);
      return 'S_{\\text{内}} = \\frac{' + n + '}{2}\\sin\\frac{2\\pi}{' + n + '},\\qquad S_{\\text{外}} = ' + n + '\\tan\\frac{\\pi}{' + n + '}';
    },
    controls: [
      { id: 'n', type: 'range', label: { zh: '边数 n', en: 'Sides n' }, min: 3, max: 96, step: 1, value: 6 },
      { id: 'outer', type: 'toggle', label: { zh: '显示外切多边形（上界）', en: 'Show circumscribed (upper bound)' }, value: true },
      { id: 'animate', type: 'toggle', label: { zh: '自动增加边数', en: 'Auto-increase n' }, value: false }
    ],
    square: { cx: 0, cy: 0, halfWidth: 1.5 },
    legend: [
      { color: P.ink, label: { zh: '单位圆（半径 1）', en: 'Unit circle' } },
      { color: P.cobalt, label: { zh: '内接正 n 边形（下界）', en: 'Inscribed n-gon (lower bound)' } },
      { color: P.coral, label: { zh: '外切正 n 边形（上界）', en: 'Circumscribed n-gon (upper bound)' } }
    ],
    init: function (state) { state.t = 0; state.autoN = 3; },
    animate: function (state, params, dt) {
      if (!params.animate) return false;
      state.t += dt / 1000;
      var span = 96 - 3;
      var n = 3 + Math.round((span * (state.t % 8)) / 8);
      if (n === state.autoN) return false;
      state.autoN = n;
      params.n = n; // 回写参数，让滑块与读数保持同步
      return 'params';
    },
    draw: function (plot, p, state) {
      plot.grid(); plot.axes();
      var n = Math.max(3, Math.round(p.n));

      // 单位圆（手绘墨迹，呼应参考视频的轨道环）
      var pts = root.Sketch.wobblyEllipse(plot.sx(0), plot.sy(0), plot.sx(1) - plot.sx(0), plot.sy(0) - plot.sy(1), { seed: 5, amp: 0.006 });
      root.Sketch.stroke(plot.ctx, pts, { color: P.ink, width: 1.6, close: true });

      var i, ang;
      if (p.outer) {
        var outerPts = [];
        for (i = 0; i < n; i++) {
          ang = (i / n) * Math.PI * 2;
          outerPts.push([Math.cos(ang) / Math.cos(Math.PI / n), Math.sin(ang) / Math.cos(Math.PI / n)]);
        }
        plot.ctx.save();
        plot.ctx.beginPath();
        outerPts.forEach(function (q, k) { k ? plot.ctx.lineTo(plot.sx(q[0]), plot.sy(q[1])) : plot.ctx.moveTo(plot.sx(q[0]), plot.sy(q[1])); });
        plot.ctx.closePath();
        plot.ctx.fillStyle = 'rgba(206,88,72,0.06)';
        plot.ctx.fill();
        plot.ctx.restore();
        root.Sketch.stroke(plot.ctx, outerPts.map(function (q) { return [plot.sx(q[0]), plot.sy(q[1])]; }),
          { color: P.coral, width: 1.2, dash: [5, 4], close: true });
      }

      var inner = [];
      for (i = 0; i < n; i++) {
        ang = (i / n) * Math.PI * 2;
        inner.push([Math.cos(ang), Math.sin(ang)]);
      }
      plot.ctx.save();
      plot.ctx.beginPath();
      inner.forEach(function (q, k) { k ? plot.ctx.lineTo(plot.sx(q[0]), plot.sy(q[1])) : plot.ctx.moveTo(plot.sx(q[0]), plot.sy(q[1])); });
      plot.ctx.closePath();
      plot.ctx.fillStyle = 'rgba(74,98,136,0.16)';
      plot.ctx.fill();
      plot.ctx.restore();
      root.Sketch.stroke(plot.ctx, inner.map(function (q) { return [plot.sx(q[0]), plot.sy(q[1])]; }),
        { color: P.cobalt, width: 1.6, close: true });

      // 半径与圆心
      plot.segment(0, 0, 1, 0, { color: P.ink, width: 1.2, dash: [4, 3] });
      plot.point(0, 0, { r: 3, fill: P.ink });
      plot.label(0.5, 0, 'r = 1', { align: 'center', dy: -12, font: '12px Consolas, monospace', color: P.ink });

      var innerArea = (n / 2) * Math.sin((2 * Math.PI) / n);
      var outerArea = n * Math.tan(Math.PI / n);
      plot.label(-1.45, -1.3, '内接 ' + MC.formatNumber(innerArea, 5) + ' → π', { color: P.cobalt, font: '12px Consolas, monospace' });
      if (p.outer) {
        plot.label(-1.45, -1.45, '外切 ' + MC.formatNumber(outerArea, 5) + ' → π', { color: P.coral, font: '12px Consolas, monospace' });
      }
    },
    readouts: function (p) {
      var n = Math.max(3, Math.round(p.n));
      var innerArea = (n / 2) * Math.sin((2 * Math.PI) / n);
      var outerArea = n * Math.tan(Math.PI / n);
      return [
        { label: { zh: '边数 n', en: 'n' }, value: String(n) },
        { label: { zh: '内接面积', en: 'inscribed' }, value: MC.formatNumber(innerArea, 6) },
        { label: { zh: '外切面积', en: 'circumscribed' }, value: MC.formatNumber(outerArea, 6) },
        { label: { zh: 'π', en: 'π' }, value: MC.formatNumber(Math.PI, 7) },
        { label: { zh: '内接误差', en: 'error' }, value: MC.formatNumber(Math.PI - innerArea, 3) },
        { label: { zh: '外切误差', en: 'outer error' }, value: MC.formatNumber(outerArea - Math.PI, 3) }
      ];
    },
    info: {
      definition: {
        zh: '圆周长与直径之比恒为 $\\pi$。把圆内接正 $n$ 边形的面积记作 $S_n$，当 $n\\to\\infty$ 时 $S_n \\to \\pi$——这就是“极限”的最初形态。',
        en: 'The circumference-to-diameter ratio is always $\\pi$. An inscribed $n$-gon with area $S_n$ satisfies $S_n\\to\\pi$ as $n\\to\\infty$ — the earliest form of a limit.'
      },
      geometry: {
        zh: '内接多边形始终**在圆内**（面积是下界），外切多边形始终**包住圆**（面积是上界）。两者从两侧夹住 π，这叫“夹逼”。',
        en: 'The inscribed polygon sits inside the circle (lower bound) and the circumscribed one encloses it (upper bound); they squeeze $\\pi$ from both sides.'
      },
      algebra: {
        zh: '把内接多边形切成 $n$ 个等腰三角形，得 $S_n = \\dfrac{n}{2}\\sin\\dfrac{2\\pi}{n}$；外切多边形为 $S_n = n\\tan\\dfrac{\\pi}{n}$。',
        en: 'Splitting into $n$ isosceles triangles gives $S_n=\\frac{n}{2}\\sin\\frac{2\\pi}{n}$ inscribed, and $n\\tan\\frac{\\pi}{n}$ circumscribed.'
      },
      application: {
        zh: '数值计算中用多边形/矩形逼近曲线（计算机图形学的圆也是多边形）、有限元网格、蒙特卡洛求 π 都是同一思想。',
        en: 'Polygon/rectangle approximation of curves, finite-element meshes, GPU circle tessellation and Monte-Carlo estimation of $\\pi$ all use this idea.'
      }
    }
  });
})(window);
