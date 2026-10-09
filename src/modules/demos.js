/*!
 * modules/demos.js — 自动演示脚本（分章节叙事）
 * ---------------------------------------------------------------------------
 * 每个脚本遵循统一叙事结构：
 *   ① 引入（场景初始化）→ ② 定义（几何/代数含义）→ ③ 动态推导（参数扫描）
 *   → ④ 结论（关键性质高亮）→ ⑤ 自动暂停，把控制权交还用户
 *
 * 脚本只描述"时间 → 参数"的映射，播放/暂停/倍速/进度/中断由
 * render/timeline.js 与 ui/app.js 负责。这样章节作者不必关心播放器实现。
 */
(function (root) {
  'use strict';
  var MS = root.MS;

  function lerp(a, b, p) { return a + (b - a) * p; }

  /** 注册一个演示脚本到已存在的模块上。 */
  function demo(id, title, steps) {
    var m = MS.byId(id);
    if (!m) return;
    m.demo = { title: title, steps: steps };
  }

  // ---------------------------------------------------------------- 三角
  demo('trig-unit',
    { zh: '单位圆如何"展开"成正弦曲线', en: 'How the unit circle unfolds into a sine wave' },
    [
      { label: { zh: '① 引入：圆上一点的旋转', en: '① A point rotating on a circle' }, dur: 1600,
        apply: function (p, ctx) { ctx.set('play', true); ctx.set('A', 0.35); ctx.set('w', 0.5); ctx.set('phi', 0); } },
      { label: { zh: '② 定义：纵坐标就是 sin θ', en: '② The vertical coordinate is sin θ' }, dur: 1800,
        apply: function (p, ctx) { ctx.set('A', lerp(0.35, 1, p)); } },
      { label: { zh: '③ 参数扫描：ω 决定周期（T = 2π/ω）', en: '③ ω sets the period' }, dur: 2400,
        apply: function (p, ctx) { ctx.set('w', lerp(0.5, 2.5, p)); } },
      { label: { zh: '④ 初相 φ 让曲线整体左右平移', en: '④ Phase φ shifts the curve' }, dur: 2000,
        apply: function (p, ctx) { ctx.set('phi', lerp(0, -3.14, p)); } },
      { label: { zh: '⑤ 结论：y = A sin(ωt + φ)', en: '⑤ y = A sin(ωt + φ)' }, dur: 1800,
        apply: function (p, ctx) { ctx.set('phi', lerp(-3.14, 0, p)); ctx.set('w', lerp(2.5, 1, p)); ctx.set('A', lerp(1, 1, p)); } },
      { label: { zh: '演示结束：可拖动滑块自由探索', en: 'Done — explore freely' }, dur: 1200, hold: true }
    ]);

  // ---------------------------------------------------------------- 导数
  demo('calc-derivative',
    { zh: '从割线到切线：导数的定义', en: 'From secant to tangent: the derivative' },
    [
      { label: { zh: '① 引入：曲线上取两点', en: '① Two points on the curve' }, dur: 1500,
        apply: function (p, ctx) { ctx.set('play', false); ctx.set('h', 2); ctx.set('x0', -1.5); } },
      { label: { zh: '② 定义：割线斜率 = Δy/Δx', en: '② Secant slope = Δy/Δx' }, dur: 2000,
        apply: function (p, ctx) { ctx.set('x0', lerp(-1.5, 1.2, p)); } },
      { label: { zh: '③ 动态推导：让 h → 0', en: '③ Let h → 0' }, dur: 3000, ease: 'easeOutCubic',
        apply: function (p, ctx) { ctx.set('h', lerp(2, 0.05, p)); } },
      { label: { zh: '④ 结论：割线趋于切线，斜率趋于 f′(x₀)', en: '④ The secant becomes the tangent' }, dur: 1900,
        apply: function (p, ctx) { ctx.set('h', 0.05); ctx.set('x0', lerp(1.2, 0.6, p)); } },
      { label: { zh: '演示结束：拖动 x₀ 看斜率如何变化', en: 'Done — drag x₀' }, dur: 1200, hold: true }
    ]);

  // ---------------------------------------------------------------- 定积分
  demo('calc-integral',
    { zh: '黎曼和如何逼近定积分', en: 'Riemann sums approaching the integral' },
    [
      { label: { zh: '① 引入：曲线下的面积是多少？', en: '① What is the area under the curve?' }, dur: 1500,
        apply: function (p, ctx) { ctx.set('func', 'x2'); ctx.set('mode', 'left'); ctx.set('n', 2); ctx.set('a', 0); ctx.set('b', 1.5); } },
      { label: { zh: '② 定义：用矩形面积和近似', en: '② Approximate with rectangles' }, dur: 2000,
        apply: function (p, ctx) { ctx.set('n', Math.round(lerp(2, 8, p))); } },
      { label: { zh: '③ 动态推导：n 增大，矩形变窄', en: '③ More, thinner rectangles' }, dur: 3000,
        apply: function (p, ctx) { ctx.set('n', Math.round(lerp(8, 48, p))); } },
      { label: { zh: '④ 结论：黎曼和 → 定积分（改看中点法）', en: '④ The sum converges; try midpoints' }, dur: 2000,
        apply: function (p, ctx) { ctx.set('mode', 'mid'); ctx.set('n', Math.round(lerp(48, 80, p))); } },
      { label: { zh: '演示结束：拖动 n 观察误差变化', en: 'Done — drag n' }, dur: 1200, hold: true }
    ]);

  // ---------------------------------------------------------------- 圆锥曲线
  demo('analytic-conic',
    { zh: '离心率如何统一定义三种圆锥曲线', en: 'One eccentricity, three conics' },
    [
      { label: { zh: '① 引入：一个焦点、一条准线', en: '① One focus, one directrix' }, dur: 1600,
        apply: function (p, ctx) { ctx.set('e', 0.35); ctx.set('p', 1.6); ctx.set('dir', true); ctx.set('ratio', true); } },
      { label: { zh: '② 椭圆：0 < e < 1（闭合、有界）', en: '② Ellipse: 0 < e < 1' }, dur: 2200,
        apply: function (p, ctx) { ctx.set('e', lerp(0.35, 0.9, p)); } },
      { label: { zh: '③ 临界：e = 1 时为抛物线', en: '③ e = 1 gives a parabola' }, dur: 1800,
        apply: function (p, ctx) { ctx.set('e', lerp(0.9, 1, p)); } },
      { label: { zh: '④ 双曲线：e > 1 时张开成两支', en: '④ e > 1: a two-branch hyperbola' }, dur: 2400,
        apply: function (p, ctx) { ctx.set('e', lerp(1, 1.5, p)); } },
      { label: { zh: '演示结束：连续拖动 e 观察三种曲线的过渡', en: 'Done — drag e continuously' }, dur: 1400, hold: true }
    ]);

  // ---------------------------------------------------------------- 几何级数
  demo('series-geometric',
    { zh: '收敛与发散的分界', en: 'The boundary between convergence and divergence' },
    [
      { label: { zh: '① 引入：每一项都是前一项的 r 倍', en: '① Each term is r times the previous' }, dur: 1600,
        apply: function (p, ctx) { ctx.set('r', 0.5); ctx.set('n', 1); ctx.set('limit', true); } },
      { label: { zh: '② 部分和曲线逐步逼近极限', en: '② Partial sums approach the limit' }, dur: 2600,
        apply: function (p, ctx) { ctx.set('n', Math.round(lerp(1, 14, p))); } },
      { label: { zh: '③ 收敛：|r| < 1 时极限为 1/(1−r)', en: '③ |r| < 1 converges to 1/(1−r)' }, dur: 1800,
        apply: function (p, ctx) { ctx.set('n', Math.round(lerp(14, 24, p))); } },
      { label: { zh: '④ 发散：r ≥ 1 时部分和无界', en: '④ r ≥ 1 diverges' }, dur: 2400,
        apply: function (p, ctx) { ctx.set('r', lerp(0.5, 1.05, p)); } },
      { label: { zh: '演示结束：拖动 r 找到收敛与发散的分界', en: 'Done — find the boundary' }, dur: 1400, hold: true }
    ]);

  // ---------------------------------------------------------------- 二次函数
  demo('algebra-quadratic',
    { zh: '开口、对称轴与判别式', en: 'Opening, axis and discriminant' },
    [
      { label: { zh: '① 引入：一条抛物线有哪三个要素？', en: '① Three features of a parabola' }, dur: 1600,
        apply: function (p, ctx) { ctx.set('a', 1); ctx.set('b', 0); ctx.set('c', -4); } },
      { label: { zh: '② 对称轴随 b 移动：x = −b/2a', en: '② The axis moves with b' }, dur: 2200,
        apply: function (p, ctx) { ctx.set('b', lerp(0, 3, p)); } },
      { label: { zh: '③ 判别式 Δ 决定实根个数（2 → 1 → 0）', en: '③ Δ decides the number of roots' }, dur: 2600,
        apply: function (p, ctx) { ctx.set('c', lerp(-4, 3, p)); } },
      { label: { zh: '④ 开口方向由 a 的符号决定', en: '④ The sign of a sets the opening' }, dur: 2000,
        apply: function (p, ctx) { ctx.set('a', lerp(1, -0.6, p)); } },
      { label: { zh: '演示结束：三个滑块分别控制开口、对称轴、截距', en: 'Done — three sliders' }, dur: 1400, hold: true }
    ]);

  // ---------------------------------------------------------------- 勾股定理
  demo('geo-pythagoras',
    { zh: '三块正方形与勾股定理', en: 'Three squares and Pythagoras' },
    [
      { label: { zh: '① 引入：直角三角形与两条直角边', en: '① A right triangle' }, dur: 1600,
        apply: function (p, ctx) { ctx.set('a', 1.4); ctx.set('b', 1.8); ctx.set('hyp', true); ctx.set('grid3', false); } },
      { label: { zh: '② 定义：三条边上各作一个正方形', en: '② Squares on all three sides' }, dur: 2200,
        apply: function (p, ctx) { ctx.set('a', lerp(1.4, 3, p)); ctx.set('b', lerp(1.8, 4, p)); } },
      { label: { zh: '③ 打开单位方格：面积 = 格子数', en: '③ Unit squares: area = cell count' }, dur: 1800,
        apply: function (p, ctx) { ctx.set('grid3', true); } },
      { label: { zh: '④ 结论：a² + b² = c²', en: '④ a² + b² = c²' }, dur: 2000,
        apply: function (p, ctx) { ctx.set('a', 3); ctx.set('b', 4); } },
      { label: { zh: '演示结束：拖动 a、b 观察三块面积的关系', en: 'Done — drag a and b' }, dur: 1400, hold: true }
    ]);
})(window);
