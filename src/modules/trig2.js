/*!
 * modules/trig2.js — 向量：平行四边形法则与分解（高中）
 */
(function (root) {
  'use strict';
  var MS = root.MS, P = root.Plot.PALETTE, MC = root.MathCore;

  /** 两向量夹角（度）：零向量返回 NaN，并抹掉 0°/180° 附近的浮点噪声。 */
  function angleBetween(a, b) {
    var la = Math.hypot(a[0], a[1]), lb = Math.hypot(b[0], b[1]);
    if (la < 1e-9 || lb < 1e-9) return NaN;
    var c = (a[0] * b[0] + a[1] * b[1]) / (la * lb);
    var deg = (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
    if (deg < 1e-3) deg = 0;
    if (Math.abs(deg - 180) < 1e-3) deg = 180;
    return deg;
  }

  MS.register({
    id: 'vector-parallelogram',
    stage: 'vector',
    order: 1,
    title: { zh: '向量加法：平行四边形法则', en: 'Vector addition: parallelogram law' },
    caption: { zh: 'a + b 是以 a、b 为邻边的平行四边形的对角线', en: 'a + b is the diagonal of the parallelogram' },
    formula: function (p) {
      var sx = p.ax + p.bx, sy = p.ay + p.by;
      return '\\vec a + \\vec b = (' + MC.formatFixed(sx, 1) + ',\\ ' + MC.formatFixed(sy, 1) + '),\\qquad ' +
        '\\vec a\\cdot\\vec b = ' + MC.formatFixed(p.ax * p.bx + p.ay * p.by, 2);
    },
    controls: [
      { id: 'ax', type: 'range', label: { zh: 'a 的 x 分量', en: 'aₓ' }, min: -4, max: 4, step: 0.1, value: 3 },
      { id: 'ay', type: 'range', label: { zh: 'a 的 y 分量', en: 'a_y' }, min: -4, max: 4, step: 0.1, value: 1 },
      { id: 'bx', type: 'range', label: { zh: 'b 的 x 分量', en: 'bₓ' }, min: -4, max: 4, step: 0.1, value: 0.5 },
      { id: 'by', type: 'range', label: { zh: 'b 的 y 分量', en: 'b_y' }, min: -4, max: 4, step: 0.1, value: 3 },
      { id: 'para', type: 'toggle', label: { zh: '平行四边形', en: 'Parallelogram' }, value: true },
      { id: 'decomp', type: 'toggle', label: { zh: '分量分解（虚线）', en: 'Components' }, value: true }
    ],
    square: { cx: 0.5, cy: 0.5, halfWidth: 5.6 },
    legend: [
      { color: P.cobalt, label: { zh: '向量 a', en: 'Vector a' } },
      { color: P.coral, label: { zh: '向量 b', en: 'Vector b' } },
      { color: P.mint, label: { zh: '和向量 a + b', en: 'Sum a + b' } }
    ],
    draw: function (plot, p) {
      plot.grid(); plot.axes();
      var a = [p.ax, p.ay], b = [p.bx, p.by];
      var sum = [a[0] + b[0], a[1] + b[1]];

      // 平行四边形（把 b 平移到 a 的终点、把 a 平移到 b 的终点）
      if (p.para) {
        plot.ctx.save();
        plot.ctx.beginPath();
        plot.ctx.moveTo(plot.sx(0), plot.sy(0));
        plot.ctx.lineTo(plot.sx(a[0]), plot.sy(a[1]));
        plot.ctx.lineTo(plot.sx(sum[0]), plot.sy(sum[1]));
        plot.ctx.lineTo(plot.sx(b[0]), plot.sy(b[1]));
        plot.ctx.closePath();
        plot.ctx.fillStyle = 'rgba(47,158,126,0.10)';
        plot.ctx.fill();
        plot.ctx.restore();
        plot.segment(a[0], a[1], sum[0], sum[1], { color: P.coral, width: 1.4, dash: [6, 4], alpha: 0.8 });
        plot.segment(b[0], b[1], sum[0], sum[1], { color: P.cobalt, width: 1.4, dash: [6, 4], alpha: 0.8 });
      }

      // 分量分解（虚线直角边）
      if (p.decomp) {
        [[a, P.cobalt], [b, P.coral], [sum, P.mint]].forEach(function (item) {
          var v = item[0], c = item[1];
          plot.guide(0, v[1], v[0], v[1], { color: c, dash: [3, 4] });
          plot.guide(v[0], 0, v[0], v[1], { color: c, dash: [3, 4] });
        });
      }

      plot.arrow(0, 0, a[0], a[1], { color: P.cobalt, width: 2.6 });
      plot.arrow(0, 0, b[0], b[1], { color: P.coral, width: 2.6 });
      plot.arrow(0, 0, sum[0], sum[1], { color: P.mint, width: 3 });

      // 夹角弧
      var la = Math.hypot(a[0], a[1]), lb = Math.hypot(b[0], b[1]);
      if (la > 1e-6 && lb > 1e-6) {
        var t0 = Math.atan2(a[1], a[0]), t1 = Math.atan2(b[1], b[0]);
        var dth = t1 - t0;
        while (dth > Math.PI) dth -= 2 * Math.PI;
        while (dth < -Math.PI) dth += 2 * Math.PI;
        var pts = [];
        for (var i = 0; i <= 40; i++) {
          var t = t0 + (dth * i) / 40;
          pts.push([Math.cos(t) * 0.9, Math.sin(t) * 0.9]);
        }
        var ctx = plot.ctx;
        ctx.save();
        ctx.beginPath();
        pts.forEach(function (q, k) { k ? ctx.lineTo(plot.sx(q[0]), plot.sy(q[1])) : ctx.moveTo(plot.sx(q[0]), plot.sy(q[1])); });
        ctx.strokeStyle = 'rgba(122,90,168,0.9)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.restore();
        var deg2 = angleBetween(a, b);
        plot.label(Math.cos(t0 + dth / 2) * 1.25, Math.sin(t0 + dth / 2) * 1.25,
          (isFinite(deg2) ? MC.formatNumber(deg2, 4) : '—') + '°',
          { align: 'center', color: P.violet, font: '12px Consolas, monospace' });
      }

      plot.label(a[0], a[1], 'a', { dx: 10, dy: -10, color: P.cobalt, font: 'italic 15px Georgia, serif' });
      plot.label(b[0], b[1], 'b', { dx: 10, dy: -10, color: P.coral, font: 'italic 15px Georgia, serif' });
      plot.label(sum[0], sum[1], 'a + b', { dx: 10, dy: -10, color: P.mint, font: 'italic 15px Georgia, serif' });
      plot.point(0, 0, { r: 4, fill: P.ink });
    },
    readouts: function (p) {
      var a = [p.ax, p.ay], b = [p.bx, p.by];
      var la = Math.hypot(a[0], a[1]), lb = Math.hypot(b[0], b[1]);
      var dot = a[0] * b[0] + a[1] * b[1];
      var deg = angleBetween(a, b);
      return [
        { label: { zh: '|a|', en: '|a|' }, value: MC.formatNumber(la, 4) },
        { label: { zh: '|b|', en: '|b|' }, value: MC.formatNumber(lb, 4) },
        { label: { zh: 'a·b', en: 'a·b' }, value: MC.formatFixed(dot, 2) },
        { label: { zh: '夹角', en: 'angle' }, value: isFinite(deg) ? MC.formatNumber(deg, 4) + '°' : '未定义（零向量）' },
        { label: { zh: '|a+b|', en: '|a+b|' }, value: MC.formatNumber(Math.hypot(a[0] + b[0], a[1] + b[1]), 4) }
      ];
    },
    info: {
      definition: {
        zh: '向量加法按**首尾相接**（三角形法则）或**共起点作平行四边形**（平行四边形法则）进行，坐标运算就是分量相加：$\\vec a+\\vec b=(a_x+b_x,\\ a_y+b_y)$。',
        en: 'Vector addition is tip-to-tail (triangle law) or parallelogram law; in coordinates it is componentwise addition.'
      },
      geometry: {
        zh: '和向量是从公共起点出发的**对角线**。两边上的虚线表示"把 $\\vec b$ 平移到 $\\vec a$ 的终点"——平移不改变向量，这正是法则成立的原因。紫色弧是两向量夹角，用于判断方向关系。',
        en: 'The sum is the diagonal from the common origin; the dashed edges show $\\vec b$ translated to the tip of $\\vec a$. The violet arc is the angle between them.'
      },
      algebra: {
        zh: '数量积 $\\vec a\\cdot\\vec b=|\\vec a||\\vec b|\\cos\\theta=a_xb_x+a_yb_y$；夹角 $\\cos\\theta=\\dfrac{\\vec a\\cdot\\vec b}{|\\vec a||\\vec b|}$。$\\vec a\\cdot\\vec b=0 \\iff$ 两向量垂直。',
        en: 'The dot product is $|a||b|\\cos\\theta=a_xb_x+a_yb_y$, giving $\\cos\\theta$; orthogonal vectors have zero dot product.'
      },
      application: {
        zh: '力的合成与分解、速度叠加（渡河问题）、位移与功的计算、机器学习中的特征向量投影，都用同一套法则。',
        en: 'Force composition, velocity addition, work and feature projection in machine learning all use it.'
      }
    }
  });
})(window);
