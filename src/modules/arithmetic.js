/*!
 * modules/arithmetic.js — 算术：加法的集合并、乘法的阵列
 * 视觉原则：先给对象与动作，再给算式（避免符号堆砌）。
 */
(function (root) {
  'use strict';
  var MS = root.MS, P = root.Plot.PALETTE;

  function gridPositions(count, cols, cx, cy, gap) {
    var rows = Math.ceil(count / cols);
    var out = [];
    for (var i = 0; i < count; i++) {
      var r = Math.floor(i / cols), c = i % cols;
      var rowCount = Math.min(cols, count - r * cols);
      out.push([
        cx + (c - (rowCount - 1) / 2) * gap,
        cy + (r - (rows - 1) / 2) * gap
      ]);
    }
    return out;
  }

  // --------------------------------------------------------------- 加法
  MS.register({
    id: 'arith-add',
    stage: 'arith',
    order: 1,
    title: { zh: '加法：集合的合并', en: 'Addition: merging sets' },
    caption: { zh: '1 + 1 = 2', en: '1 + 1 = 2' },
    formula: function (p) { return p.a + ' + ' + p.b + ' = ' + (p.a + p.b); },
    controls: [
      { id: 'a', type: 'range', label: { zh: '第一组数量 a', en: 'Group a' }, min: 1, max: 8, step: 1, value: 3 },
      { id: 'b', type: 'range', label: { zh: '第二组数量 b', en: 'Group b' }, min: 1, max: 8, step: 1, value: 2 },
      { id: 'merge', type: 'toggle', label: { zh: '合并动画', en: 'Animate merge' }, value: true }
    ],
    view: { xMin: 0, xMax: 10, yMin: 0, yMax: 6 },
    legend: [
      { color: P.cobalt, label: { zh: '第一组', en: 'Group A' } },
      { color: P.coral, label: { zh: '第二组', en: 'Group B' } },
      { color: P.mint, label: { zh: '合并后的集合', en: 'Union' } }
    ],
    init: function (state) { state.t = 0; state.p = 0; },
    animate: function (state, params, dt) {
      if (!params.merge) { state.p = 0; return false; }
      state.t += dt / 1000;
      var cycle = 3.6, u = state.t % cycle;
      var p = u < 1.4 ? u / 1.4 : 1;           // 1.4s 合并 → 保持 2.2s
      p = p < 0 ? 0 : p > 1 ? 1 : p;
      if (p === state.p) return false;
      state.p = p;
      return true;
    },
    draw: function (plot, p, state) {
      var a = Math.round(p.a), b = Math.round(p.b), total = a + b;
      var srcA = gridPositions(a, 4, 2.1, 4.35, 0.62);
      var srcB = gridPositions(b, 4, 7.9, 4.35, 0.62);
      var pad = 0.55;
      var span = 10 - pad * 2;
      var targets = [];
      for (var i = 0; i < total; i++) {
        targets.push([pad + (total === 1 ? span / 2 : (span * i) / (total - 1)), 1.5]);
      }
      var pA = Math.min(1, state.p / 0.6);
      var pB = Math.max(0, Math.min(1, (state.p - 0.25) / 0.6));
      var ease = function (t) { return t * t * (3 - 2 * t); };

      // 运算符号
      plot.label(5, 4.35, '+', { align: 'center', font: '30px "Cambria Math", Georgia, serif', color: P.muted });
      if (total > 1) {
        plot.guide(pad, 0.95, 10 - pad, 0.95, { color: 'rgba(120,110,96,0.35)', dash: [3, 5] });
      }

      for (var k = 0; k < a; k++) {
        var e = ease(pA);
        var x = srcA[k][0] + (targets[k][0] - srcA[k][0]) * e;
        var y = srcA[k][1] + (targets[k][1] - srcA[k][1]) * e;
        plot.point(x, y, { rWorld: 0.19, fill: e > 0.6 ? P.mint : P.cobalt, stroke: 'rgba(255,253,248,0.9)', width: 1.2 });
      }
      for (var j = 0; j < b; j++) {
        var e2 = ease(pB);
        var idx = a + j;
        var x2 = srcB[j][0] + (targets[idx][0] - srcB[j][0]) * e2;
        var y2 = srcB[j][1] + (targets[idx][1] - srcB[j][1]) * e2;
        plot.point(x2, y2, { rWorld: 0.19, fill: e2 > 0.6 ? P.mint : P.coral, stroke: 'rgba(255,253,248,0.9)', width: 1.2 });
      }

      plot.label(2.1, 5.35, 'a = ' + a, { align: 'center', color: P.cobalt, font: '13px Consolas, monospace' });
      plot.label(7.9, 5.35, 'b = ' + b, { align: 'center', color: P.coral, font: '13px Consolas, monospace' });
      if (state.p > 0.85) {
        plot.label(5, 0.45, '合并后有 ' + total + ' 个对象：' + a + ' + ' + b + ' = ' + total,
          { align: 'center', color: P.ink, font: '13px "Microsoft YaHei", system-ui, sans-serif' });
      }
    },
    readouts: function (p) {
      var a = Math.round(p.a), b = Math.round(p.b);
      return [
        { label: { zh: '第一组', en: 'a' }, value: String(a) },
        { label: { zh: '第二组', en: 'b' }, value: String(b) },
        { label: { zh: '合并', en: 'a + b' }, value: String(a + b) }
      ];
    },
    info: {
      definition: {
        zh: '加法是把两个集合的**元素合并**、再数一遍总数。$a + b$ 表示「先取 a 个对象，再接上 b 个对象，一共有多少个」。',
        en: 'Addition merges the elements of two sets and counts the union: $a+b$ is how many objects you have after joining a objects with b objects.'
      },
      geometry: {
        zh: '在数轴上，$a + b$ 就是「从 a 出发，向右移动 b 个单位」得到的落点。合并动画里每个点移动的终点，就是它们在数轴上的位置。',
        en: 'On the number line, $a+b$ means starting at $a$ and moving $b$ units to the right.'
      },
      algebra: {
        zh: '加法满足交换律 $a+b=b+a$ 与结合律 $(a+b)+c=a+(b+c)$——把滑块 a、b 互换，结果不变，这正是交换律的可视化证据。',
        en: 'Addition is commutative $a+b=b+a$ and associative $(a+b)+c=a+(b+c)$; swapping the sliders leaves the total unchanged.'
      },
      application: {
        zh: '计数、结算金额、合并库存都属于加法模型；编程中的数组拼接（concat）也是同一个结构。',
        en: 'Counting, totalling money and concatenating arrays are all the same merge structure.'
      }
    }
  });

  // --------------------------------------------------------------- 乘法
  MS.register({
    id: 'arith-mul',
    stage: 'arith',
    order: 2,
    title: { zh: '乘法：矩形阵列', en: 'Multiplication: array' },
    caption: { zh: 'a × b = ab', en: 'a × b = ab' },
    formula: function (p) { return p.a + ' \\times ' + p.b + ' = ' + p.a * p.b; },
    controls: [
      { id: 'a', type: 'range', label: { zh: '列数 a', en: 'Columns a' }, min: 1, max: 8, step: 1, value: 4 },
      { id: 'b', type: 'range', label: { zh: '行数 b', en: 'Rows b' }, min: 1, max: 8, step: 1, value: 3 },
      { id: 'animate', type: 'toggle', label: { zh: '逐行出现', en: 'Reveal row by row' }, value: true }
    ],
    view: { xMin: -1.6, xMax: 9.6, yMin: -1.6, yMax: 8.6 },
    legend: [
      { color: P.cobalt, label: { zh: '每一行 = 一组 a', en: 'Each row = one group of a' } },
      { color: P.coral, label: { zh: '行数 = b', en: 'Row count = b' } }
    ],
    init: function (state) { state.t = 0; state.rows = 99; },
    animate: function (state, params, dt) {
      if (!params.animate) { state.rows = 99; return false; }
      state.t += dt / 1000;
      var cycle = 4.2, u = state.t % cycle;
      var rows = Math.min(Math.round(params.b), Math.floor(u / 0.28) + 1);
      if (rows === state.rows) return false;
      state.rows = rows;
      return true;
    },
    draw: function (plot, p, state) {
      var a = Math.round(p.a), b = Math.round(p.b);
      var gap = Math.min(0.72, 6.6 / Math.max(a, 1));
      var shownRows = Math.min(b, state.rows);
      for (var r = 0; r < shownRows; r++) {
        var y = 6.4 - r * gap;
        for (var c = 0; c < a; c++) {
          var x = 1.1 + c * gap;
          var isFirstRow = r === 0;
          plot.point(x, y, { rWorld: gap * 0.3, fill: isFirstRow ? P.cobalt : P.coral });
        }
      }
      // 尺寸标注
      var width = (a - 1) * gap;
      var height = (b - 1) * gap;
      plot.guide(1.1, 6.4 + gap * 0.9, 1.1 + width, 6.4 + gap * 0.9, { color: P.cobalt, dash: [] });
      plot.label(1.1 + width / 2, 6.4 + gap * 1.5, 'a = ' + a + ' 列', { dx: 0, align: 'center', color: P.cobalt, font: '12px Consolas, monospace' });
      if (b > 1) {
        plot.guide(1.1 - gap * 0.9, 6.4, 1.1 - gap * 0.9, 6.4 - height, { color: P.coral, dash: [] });
        plot.label(1.1 - gap * 1.3, 6.4 - height / 2, 'b = ' + b, { align: 'right', color: P.coral, font: '12px Consolas, monospace' });
      }
      plot.label(4.6, -0.7, '共 ' + b + ' 行 × 每行 ' + a + ' 个 → ' + a + ' × ' + b + ' = ' + (a * b) + ' 个',
        { align: 'center', color: P.ink, font: '13px "Microsoft YaHei", system-ui, sans-serif' });
    },
    readouts: function (p) {
      var a = Math.round(p.a), b = Math.round(p.b);
      return [
        { label: { zh: '列 × 行', en: 'cols × rows' }, value: a + ' × ' + b },
        { label: { zh: '总数', en: 'total' }, value: String(a * b) },
        { label: { zh: '交换后', en: 'swapped' }, value: b + ' × ' + a + ' = ' + a * b }
      ];
    },
    info: {
      definition: {
        zh: '乘法是**重复的加法**：$a \\times b$ 表示 b 个 a 相加，$a \\times b = \\underbrace{a + a + \\cdots + a}_{b\\text{ 个}}$。',
        en: 'Multiplication is repeated addition: $a\\times b$ means adding a to itself b times.'
      },
      geometry: {
        zh: '把 a 个点排成一行、重复 b 行，就得到 $a\\times b$ 的矩形阵列；阵列的点数等于矩形面积（单位方格数）。',
        en: 'Arranging a points per row for b rows gives an $a\\times b$ array whose point count equals the rectangle’s area.'
      },
      algebra: {
        zh: '交换律 $a\\times b=b\\times a$ 在阵列上表现为「把矩形转 90°」——点数不变；分配律 $a(b+c)=ab+ac$ 表现为「把矩形切成两块再拼回」。',
        en: 'Commutativity is rotating the array 90°; distributivity is cutting the rectangle into two blocks.'
      },
      application: {
        zh: '面积、排列组合、批量计算（如图片像素总数 = 宽 × 高）都直接使用乘法模型。',
        en: 'Area, combinatorics and batch sizes (image pixels = width × height) are multiplication models.'
      }
    }
  });
})(window);
