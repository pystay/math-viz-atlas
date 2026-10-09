/*!
 * modules/trig.js — 三角：单位圆上的旋转如何“展开”成正弦曲线
 *
 * 数学模型（保证横轴语义正确）：
 *   横轴 = 时间 t，曲线 y = A·sin(ωt + φ)
 *   圆的转角 θ = ωt + φ，圆心纵坐标为 0，半径 = A
 *   ⇒ 圆上点的纵坐标恒等于曲线在 t 处的高度（红色虚线即这条等高水平线）
 *   因此 ω 改变频率、φ 改变初相、A 改变振幅，三者都能在图上被直接看见。
 */
(function (root) {
  'use strict';
  var MS = root.MS, P = root.Plot.PALETTE, MC = root.MathCore;

  var WINDOW = 6.3;   // 横轴时间窗口（秒）
  var CX = -1.8;      // 圆心横坐标
  var X0 = 0.6;       // 曲线起点横坐标

  MS.register({
    id: 'trig-unit',
    stage: 'trig',
    order: 1,
    title: { zh: '单位圆与正弦曲线', en: 'Unit circle and sine wave' },
    caption: { zh: '圆的旋转 → 波浪的展开', en: 'Rotation unfolds into a wave' },
    formula: function (p) {
      // 用定点小数而非"有效数字"：滑块步长 0.05，显示 1.05 必须就是 1.05（不能是 1.1）
      return 'y = ' + MC.formatFixed(p.A, 2) + '\\sin\\!\\left(' + MC.formatFixed(p.w, 2) + 't ' +
        (p.phi >= 0 ? '+ ' : '- ') + MC.formatFixed(Math.abs(p.phi), 2) + '\\right)';
    },
    controls: [
      { id: 'A', type: 'range', label: { zh: '振幅 A', en: 'Amplitude A' }, min: 0.2, max: 1.8, step: 0.05, value: 1 },
      { id: 'w', type: 'range', label: { zh: '角频率 ω', en: 'Angular frequency ω' }, min: 0.4, max: 3, step: 0.05, value: 1 },
      { id: 'phi', type: 'range', label: { zh: '初相 φ', en: 'Phase φ' }, min: -3.14, max: 3.14, step: 0.05, value: 0 },
      { id: 'play', type: 'toggle', label: { zh: '旋转动画', en: 'Animate rotation' }, value: true }
    ],
    square: { cx: 2.2, cy: 0, halfWidth: 6.2 },
    legend: [
      { color: P.cobalt, label: { zh: '半径为 A 的旋转向量', en: 'Rotating vector (radius A)' } },
      { color: P.mint, label: { zh: '正弦曲线 y = A sin(ωt+φ)', en: 'Sine curve' } },
      { color: P.coral, label: { zh: '等高点（圆 → 曲线）', en: 'Equal-height link' } }
    ],
    init: function (state) { state.t = 0; },
    animate: function (state, params, dt) {
      if (!params.play) return false;
      state.t += (dt / 1000) * 1.1;
      if (state.t > WINDOW) state.t -= WINDOW;
      return true;
    },
    draw: function (plot, p, state) {
      plot.grid();
      plot.segment(plot.view.xMin, 0, plot.view.xMax, 0, { color: 'rgba(44,50,60,0.45)', width: 1.2 });
      plot.segment(CX, plot.view.yMin, CX, plot.view.yMax, { color: 'rgba(44,50,60,0.45)', width: 1.2 });

      // 旋转圆（手绘椭圆，呼应参考视频的轨道环语言）
      var circle = root.Sketch.wobblyEllipse(
        plot.sx(CX), plot.sy(0),
        plot.sx(p.A) - plot.sx(0), plot.sy(0) - plot.sy(p.A),
        { seed: 9, amp: 0.012, steps: 90 }
      );
      root.Sketch.stroke(plot.ctx, circle, { color: 'rgba(74,98,136,0.75)', width: 1.5, close: true });

      // 正弦曲线：横轴是时间 t
      plot.curve(function (xw) {
        var t = xw - X0;
        if (t < 0 || t > WINDOW) return NaN;
        return p.A * Math.sin(p.w * t + p.phi);
      }, { color: P.mint, width: 2.4, from: X0, to: X0 + WINDOW });

      var t = state.t;
      var theta = p.w * t + p.phi;
      var px = CX + p.A * Math.cos(theta);
      var py = p.A * Math.sin(theta);          // 与曲线高度严格相等
      var qx = X0 + t;
      var qy = p.A * Math.sin(p.w * t + p.phi);

      plot.segment(CX, 0, px, py, { color: P.cobalt, width: 2 });
      plot.point(px, py, { r: 5, fill: P.cobalt, stroke: P.paper });
      plot.guide(px, py, qx, qy, { color: 'rgba(206,88,72,0.8)', dash: [5, 4] });
      plot.point(qx, qy, { r: 6, fill: P.coral, stroke: P.paper, width: 1.4 });
      plot.guide(qx, qy, qx, 0, { color: 'rgba(107,114,128,0.55)', dash: [3, 4] });

      plot.label(CX, -p.A - 0.4, '单位圆（半径 A）', { align: 'center', font: '12px Consolas, monospace', color: P.muted });
      plot.label(X0 + WINDOW, p.A + 0.3, 'y = A sin(ωt + φ)', { align: 'right', font: '13px "Cambria Math", Georgia, serif', color: P.mint });
      plot.label(X0 + WINDOW / 2, -p.A - 0.55, '时间 t →', { align: 'center', font: '12px Consolas, monospace', color: P.muted });
      plot.label(qx, qy, 'θ = ' + MC.formatNumber(theta, 2), { dx: 8, dy: -16, font: '12px Consolas, monospace', color: P.coral });
    },
    readouts: function (p, state) {
      var t = state.t;
      var theta = p.w * t + p.phi;
      return [
        { label: { zh: '时间 t', en: 't' }, value: MC.formatNumber(t, 3) + ' s' },
        { label: { zh: '转角 θ', en: 'θ' }, value: MC.formatNumber(theta, 3) + ' rad' },
        { label: { zh: 'sin θ', en: 'sin θ' }, value: MC.formatNumber(Math.sin(theta), 4) },
        { label: { zh: '周期 T', en: 'T' }, value: MC.formatNumber((2 * Math.PI) / p.w, 3) + ' s' },
        { label: { zh: '初相 φ', en: 'φ' }, value: MC.formatFixed(p.phi, 2) }
      ];
    },
    info: {
      definition: {
        zh: '一个半径 $A$ 的点以角速度 $\\omega$ 绕原点旋转，其**纵坐标**随时间的变化就是 $y=A\\sin(\\omega t+\\varphi)$。',
        en: 'A point of radius $A$ rotating at angular speed $\\omega$ has vertical coordinate $y=A\\sin(\\omega t+\\varphi)$.'
      },
      geometry: {
        zh: '圆的旋转被“铺开”成横轴为时间的波浪：振幅 $A$ 决定高度，$\\omega$ 决定疏密（周期 $T=2\\pi/\\omega$），$\\varphi$ 决定整体左右平移。红色虚线表示圆上点与曲线上点**等高**，这就是两者的几何联系。',
        en: 'Unrolling the rotation makes the horizontal axis time: $A$ sets the height, $\\omega$ the spacing ($T=2\\pi/\\omega$), $\\varphi$ the horizontal shift. The red dashed link marks equal heights.'
      },
      algebra: {
        zh: '关键恒等式 $\\sin^2\\theta+\\cos^2\\theta=1$（即勾股定理）；和角公式 $\\sin(\\alpha+\\beta)=\\sin\\alpha\\cos\\beta+\\cos\\alpha\\sin\\beta$，可用来解释“同频叠加仍是同频正弦”。',
        en: 'Key identities: $\\sin^2\\theta+\\cos^2\\theta=1$ (Pythagoras) and the addition formula $\\sin(\\alpha+\\beta)=\\sin\\alpha\\cos\\beta+\\cos\\alpha\\sin\\beta$.'
      },
      application: {
        zh: '交流电与声波、简谐振动、傅里叶分析、游戏与图形学中的旋转动画，都由这条曲线描述。',
        en: 'AC current, sound, harmonic motion, Fourier analysis and graphics rotations are described by this curve.'
      }
    }
  });
})(window);
