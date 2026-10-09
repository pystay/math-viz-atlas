/*!
 * modules/geometry2.js — 平面几何（勾股定理）与立体几何（点·线·面）
 */
(function (root) {
  'use strict';
  var MS = root.MS, P = root.Plot.PALETTE, MC = root.MathCore;

  // ======================================================= 勾股定理（面积证明）
  MS.register({
    id: 'geo-pythagoras',
    stage: 'geometry',
    order: 2,
    title: { zh: '勾股定理：面积证明', en: 'Pythagoras by area' },
    caption: { zh: '两条直角边上的正方形面积之和 = 斜边上的正方形面积', en: 'a² + b² = c²' },
    formula: function (p) {
      var a = p.a, b = p.b, c = Math.hypot(a, b);
      return 'a^{2} + b^{2} = ' + MC.formatFixed(a * a, 2) + ' + ' + MC.formatFixed(b * b, 2) +
        ' = ' + MC.formatFixed(a * a + b * b, 2) + ' = c^{2},\\quad c = ' + MC.formatNumber(c, 5);
    },
    controls: [
      { id: 'a', type: 'range', label: { zh: '直角边 a', en: 'Leg a' }, min: 1, max: 5, step: 0.1, value: 3 },
      { id: 'b', type: 'range', label: { zh: '直角边 b', en: 'Leg b' }, min: 1, max: 5, step: 0.1, value: 4 },
      { id: 'hyp', type: 'toggle', label: { zh: '显示斜边上的正方形', en: 'Square on hypotenuse' }, value: true },
      { id: 'grid3', type: 'toggle', label: { zh: '显示单位方格（边长取整数时）', en: 'Unit squares (integer sides)' }, value: false }
    ],
    // 三块正方形都要装进画布，同时保持 x/y 等比例（否则正方形会被拉成长方形）
    square: function (p, plot) {
      var a = p.a, b = p.b, c = Math.hypot(a, b);
      var xMin = -b - 0.8, xMax = a + c + 0.8;
      var yMin = -a - 0.8, yMax = b + c + 0.8;
      var aspect = plot.size.h / plot.size.w;
      var halfW = Math.max((xMax - xMin) / 2, ((yMax - yMin) / 2) / Math.max(0.2, aspect));
      return { cx: (xMin + xMax) / 2, cy: (yMin + yMax) / 2, halfWidth: halfW };
    },
    legend: [
      { color: P.cobalt, label: { zh: '直角边 a 的正方形（面积 a²）', en: 'Square on a' } },
      { color: P.coral, label: { zh: '直角边 b 的正方形（面积 b²）', en: 'Square on b' } },
      { color: P.mint, label: { zh: '斜边 c 的正方形（面积 c²）', en: 'Square on c' } }
    ],
    draw: function (plot, p) {
      plot.grid(); plot.axes();
      var a = p.a, b = p.b;
      var c = Math.hypot(a, b);

      function unitSquares(pts, color, side) {
        if (!p.grid3) return;
        // 单位方格只在**边长为整数**时才名副其实（否则格子边长 ≠ 1、格子数 ≠ 面积）
        if (Math.abs(side - Math.round(side)) > 1e-9) return;
        var n = Math.round(side);
        if (n < 1 || n > 25) return;
        for (var i = 1; i < n; i++) {
          var t = i / n;
          plot.guide(pts[0][0] + (pts[1][0] - pts[0][0]) * t, pts[0][1] + (pts[1][1] - pts[0][1]) * t,
            pts[3][0] + (pts[2][0] - pts[3][0]) * t, pts[3][1] + (pts[2][1] - pts[3][1]) * t,
            { color: color, dash: [] });
          plot.guide(pts[0][0] + (pts[3][0] - pts[0][0]) * t, pts[0][1] + (pts[3][1] - pts[0][1]) * t,
            pts[1][0] + (pts[2][0] - pts[1][0]) * t, pts[1][1] + (pts[2][1] - pts[1][1]) * t,
            { color: color, dash: [] });
        }
      }

      /**
       * 在以 p0→p1 为边的外侧作正方形。
       * 三角形按 A→B→C 逆时针给出，因此**统一把边向量顺时针转 90°**
       * 就得到外侧方向：(vx,vy) → (vy,−vx)。所以 b 边的正方形必须用
       * 有向边 C→A（而不是 A→C），否则会画到三角形内部去。
       */
      function squareOn(p0, p1, color, fill, side) {
        var vx = p1[0] - p0[0], vy = p1[1] - p0[1];
        var rx = vy, ry = -vx;
        var pts = [p0, p1, [p1[0] + rx, p1[1] + ry], [p0[0] + rx, p0[1] + ry]];
        plot.ctx.save();
        plot.ctx.beginPath();
        pts.forEach(function (q, i) { i ? plot.ctx.lineTo(plot.sx(q[0]), plot.sy(q[1])) : plot.ctx.moveTo(plot.sx(q[0]), plot.sy(q[1])); });
        plot.ctx.closePath();
        plot.ctx.fillStyle = fill;
        plot.ctx.fill();
        plot.ctx.restore();
        for (var i = 0; i < 4; i++) {
          plot.segment(pts[i][0], pts[i][1], pts[(i + 1) % 4][0], pts[(i + 1) % 4][1], { color: color, width: 1.6 });
        }
        unitSquares(pts, color, side);
        return pts;
      }

      var A = [0, 0], B = [a, 0], C = [0, b];
      // 三块正方形：分别建在 a 边、b 边、斜边的**外侧**（有向边 A→B、C→A、B→C）
      squareOn(A, B, P.cobalt, 'rgba(74,98,136,0.16)', a);
      squareOn(C, A, P.coral, 'rgba(206,88,72,0.16)', b);
      if (p.hyp) squareOn(B, C, P.mint, 'rgba(47,158,126,0.16)', c);

      // 直角三角形
      plot.ctx.save();
      plot.ctx.beginPath();
      plot.ctx.moveTo(plot.sx(A[0]), plot.sy(A[1]));
      plot.ctx.lineTo(plot.sx(B[0]), plot.sy(B[1]));
      plot.ctx.lineTo(plot.sx(C[0]), plot.sy(C[1]));
      plot.ctx.closePath();
      plot.ctx.fillStyle = 'rgba(32,38,47,0.10)';
      plot.ctx.fill();
      plot.ctx.restore();
      plot.segment(A[0], A[1], B[0], B[1], { color: P.ink, width: 2 });
      plot.segment(A[0], A[1], C[0], C[1], { color: P.ink, width: 2 });
      plot.segment(B[0], B[1], C[0], C[1], { color: P.ink, width: 2.4 });
      // 直角标记
      plot.segment(0.35, 0, 0.35, 0.35, { color: P.ink, width: 1.2 });
      plot.segment(0, 0.35, 0.35, 0.35, { color: P.ink, width: 1.2 });

      plot.label(a / 2, 0, 'a = ' + MC.formatFixed(a, 1), { dy: 16, align: 'center', color: P.cobalt, font: '12px Consolas, monospace' });
      plot.label(-b / 2, b / 2, 'b = ' + MC.formatFixed(b, 1), { align: 'center', color: P.coral, font: '12px Consolas, monospace' });
      plot.label(a / 2, b / 2, 'c = ' + MC.formatNumber(c, 4), { dx: 12, dy: -12, color: P.mint, font: '12px Consolas, monospace' });
      plot.label(plot.view.xMin + 0.4, plot.view.yMax - 0.5,
        'a² + b² = ' + MC.formatFixed(a * a + b * b, 2) + ' = c²', { color: P.ink, font: '13px Consolas, monospace' });
      plot.point(A[0], A[1], { r: 4, fill: P.ink });
      plot.point(B[0], B[1], { r: 4, fill: P.ink });
      plot.point(C[0], C[1], { r: 4, fill: P.ink });
    },
    readouts: function (p) {
      var a = p.a, b = p.b, c = Math.hypot(a, b);
      return [
        { label: { zh: 'a²', en: 'a²' }, value: MC.formatFixed(a * a, 2) },
        { label: { zh: 'b²', en: 'b²' }, value: MC.formatFixed(b * b, 2) },
        { label: { zh: 'a² + b²', en: 'a²+b²' }, value: MC.formatFixed(a * a + b * b, 2) },
        { label: { zh: 'c²', en: 'c²' }, value: MC.formatNumber(c * c, 6) },
        { label: { zh: 'c', en: 'c' }, value: MC.formatNumber(c, 6) }
      ];
    },
    info: {
      definition: {
        zh: '直角三角形两条直角边 $a,b$ 与斜边 $c$ 满足 $a^2+b^2=c^2$。图中三块正方形的面积就是这三条边的平方。',
        en: 'For a right triangle, $a^2+b^2=c^2$; the three squares in the figure have exactly those areas.'
      },
      geometry: {
        zh: '把 $a^2$ 与 $b^2$ 两块正方形"剪开重拼"，可以恰好铺满斜边上的 $c^2$ 正方形——这就是面积证明的直观含义。打开"单位方格"（边长取整数时）可以看到面积等于单位方格个数。',
        en: 'The two smaller squares can be dissected and reassembled to tile the largest square — the area proof made visible.'
      },
      algebra: {
        zh: '由 $c^2=a^2+b^2$ 得 $c=\\sqrt{a^2+b^2}$；反过来，若三边满足该式，则三角形必为直角三角形（判定定理）。',
        en: 'It gives $c=\\sqrt{a^2+b^2}$; conversely the identity characterises right triangles.'
      },
      application: {
        zh: '测量不可直接到达的距离（建筑放线、导航最短路径）、坐标系两点距离公式 $d=\\sqrt{(x_2-x_1)^2+(y_2-y_1)^2}$ 都源自它。',
        en: 'Surveying, navigation and the distance formula all come from it.'
      }
    }
  });

  // ======================================================= 立体几何（点·线·面）
  var SOLIDS = {
    cube: {
      name: { zh: '正方体', en: 'Cube' },
      v: [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
      f: [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 3, 7, 4]],
      labels: ['A', 'B', 'C', 'D', 'A₁', 'B₁', 'C₁', 'D₁']
    },
    tetra: {
      name: { zh: '正四面体', en: 'Tetrahedron' },
      v: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]],
      f: [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]],
      labels: ['A', 'B', 'C', 'D']
    },
    octa: {
      name: { zh: '正八面体', en: 'Octahedron' },
      v: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
      f: [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]],
      labels: ['A', 'B', 'C', 'D', 'E', 'F']
    }
  };

  function edgesOf(faces) {
    var seen = {}, out = [];
    faces.forEach(function (f) {
      for (var i = 0; i < f.length; i++) {
        var a = f[i], b = f[(i + 1) % f.length];
        var key = Math.min(a, b) + '-' + Math.max(a, b);
        if (!seen[key]) { seen[key] = 1; out.push([Math.min(a, b), Math.max(a, b)]); }
      }
    });
    return out;
  }

  MS.register({
    id: 'solid-3d',
    stage: 'solid3d',
    order: 1,
    title: { zh: '立体几何：点、线、面', en: 'Solid geometry: points, lines, faces' },
    caption: { zh: '三维旋转 + 透视投影', en: '3D rotation + perspective projection' },
    formula: function (p) {
      var s = SOLIDS[p.shape] || SOLIDS.cube;
      return '\\text{' + s.name.zh + '}:\\; V=' + s.v.length + ',\\; E=' + edgesOf(s.f).length + ',\\; F=' + s.f.length +
        ' \\quad\\Rightarrow\\quad V-E+F=2';
    },
    controls: [
      {
        id: 'shape', type: 'segment', label: { zh: '几何体', en: 'Solid' }, value: 'cube',
        options: [
          { value: 'cube', label: { zh: '正方体', en: 'Cube' } },
          { value: 'tetra', label: { zh: '正四面体', en: 'Tetra' } },
          { value: 'octa', label: { zh: '正八面体', en: 'Octa' } }
        ]
      },
      { id: 'theta', type: 'range', label: { zh: '绕 y 轴旋转 θ', en: 'Yaw θ' }, min: 0, max: 360, step: 1, value: 35 },
      { id: 'phi', type: 'range', label: { zh: '俯仰角 φ', en: 'Pitch φ' }, min: -80, max: 80, step: 1, value: 22 },
      { id: 'persp', type: 'range', label: { zh: '透视强度（0 = 正交）', en: 'Perspective (0 = orthographic)' }, min: 0, max: 1, step: 0.05, value: 0.5 },
      { id: 'faces', type: 'toggle', label: { zh: '显示面', en: 'Show faces' }, value: true },
      { id: 'labels', type: 'toggle', label: { zh: '顶点标注', en: 'Vertex labels' }, value: true },
      { id: 'axes3', type: 'toggle', label: { zh: '坐标轴', en: 'Axes' }, value: true }
    ],
    square: { cx: 0, cy: 0, halfWidth: 2.0 },
    legend: [
      { color: P.ink, label: { zh: '点：顶点', en: 'Points: vertices' } },
      { color: P.cobalt, label: { zh: '线：棱', en: 'Lines: edges' } },
      { color: P.coral, label: { zh: '面：多边形面', en: 'Faces' } }
    ],
    draw: function (plot, p) {
      plot.grid();
      var S = SOLIDS[p.shape] || SOLIDS.cube;
      var yaw = (p.theta * Math.PI) / 180;
      var pitch = (p.phi * Math.PI) / 180;
      var persp = p.persp;
      // 相机距离由「透视强度」反推：persp=1 → D=6（强透视）；persp→0 → D→∞（真·正交）
      var orthographic = persp < 0.02;
      var D = orthographic ? Infinity : 6 / persp;

      function rotate(v) {
        // 先绕 y 轴偏航，再绕 x 轴俯仰
        var cy = Math.cos(yaw), sy = Math.sin(yaw);
        var x1 = v[0] * cy + v[2] * sy;
        var z1 = -v[0] * sy + v[2] * cy;
        var cx = Math.cos(pitch), sx = Math.sin(pitch);
        var y2 = v[1] * cx - z1 * sx;
        var z2 = v[1] * sx + z1 * cx;
        return [x1, y2, z2];
      }
      function project(v) {
        // 正交时缩放恒为 1（平行棱严格保持平行）；透视时按 D/(D−z) 缩放
        var s = orthographic ? 1 : D / Math.max(0.2, D - v[2]);
        return { x: v[0] * s, y: v[1] * s, z: v[2], s: s };
      }

      var verts = S.v.map(function (v) { return rotate(v); });
      var proj = verts.map(project);
      var edges = edgesOf(S.f);

      if (p.axes3) {
        var O = project([0, 0, 0]);
        ['x', 'y', 'z'].forEach(function (axis, i) {
          var tip = [0, 0, 0]; tip[i] = 1.45;
          var tp = project(rotate(tip));
          plot.arrow(O.x, O.y, tp.x, tp.y, { color: 'rgba(107,114,128,0.85)', width: 1.4, head: 7 });
          plot.label(tp.x, tp.y, axis, { dx: 6, dy: -6, color: P.muted, font: '12px Consolas, monospace' });
        });
      }

      // 画家算法：先画远处的面（z 小 = 更远），再画近处的面
      if (p.faces) {
        var order = S.f.map(function (f, i) {
          var z = f.reduce(function (s, idx) { return s + verts[idx][2]; }, 0) / f.length;
          return { i: i, z: z };
        }).sort(function (a, b) { return a.z - b.z; });

        order.forEach(function (item) {
          var f = S.f[item.i];
          plot.ctx.save();
          plot.ctx.beginPath();
          f.forEach(function (idx, k) {
            var q = proj[idx];
            k ? plot.ctx.lineTo(plot.sx(q.x), plot.sy(q.y)) : plot.ctx.moveTo(plot.sx(q.x), plot.sy(q.y));
          });
          plot.ctx.closePath();
          // 越近的面越亮：用 z 做一点明暗层次
          var t = (item.z + 1.5) / 3;
          plot.ctx.fillStyle = 'rgba(206,88,72,' + (0.07 + 0.13 * t).toFixed(3) + ')';
          plot.ctx.fill();
          plot.ctx.restore();
        });
      }

      edges.forEach(function (e) {
        var a = proj[e[0]], b = proj[e[1]];
        var near = (verts[e[0]][2] + verts[e[1]][2]) / 2;
        var w = near > 0 ? 2 : 1.2;
        plot.segment(a.x, a.y, b.x, b.y, { color: P.cobalt, width: w, alpha: near > 0 ? 1 : 0.55 });
      });

      proj.forEach(function (q, i) {
        plot.point(q.x, q.y, { r: 4, fill: P.ink, stroke: P.paper, width: 1.2 });
        if (p.labels) {
          plot.label(q.x, q.y, S.labels[i] || String(i), { dx: 8, dy: -8, color: P.ink, font: '12px Georgia, serif' });
        }
      });

      plot.label(plot.view.xMin + 0.15, plot.view.yMax - 0.2,
        orthographic ? '正交投影（s ≡ 1，平行棱严格平行）'
                     : '透视投影（相机距离 D = ' + MC.formatFixed(D, 2) + '）',
        { color: P.muted, font: '11px Consolas, monospace' });
    },
    readouts: function (p) {
      var S = SOLIDS[p.shape] || SOLIDS.cube;
      var e = edgesOf(S.f).length;
      return [
        { label: { zh: '顶点 V', en: 'V' }, value: String(S.v.length) },
        { label: { zh: '棱 E', en: 'E' }, value: String(e) },
        { label: { zh: '面 F', en: 'F' }, value: String(S.f.length) },
        { label: { zh: 'V − E + F（欧拉）', en: 'V−E+F' }, value: String(S.v.length - e + S.f.length) },
        { label: { zh: '投影', en: 'projection' }, value: p.persp < 0.02 ? '正交' : '透视' }
      ];
    },
    info: {
      definition: {
        zh: '空间中的基本元素就是**点、线、面**：顶点是点，棱是线（两个面的交线），面是平面多边形。旋转三维体后投到屏幕，需要"投影"这一步。',
        en: 'Space is built from **points, lines and faces**: vertices are points, edges are lines (face intersections), faces are polygons. Rendering requires a projection step.'
      },
      geometry: {
        zh: '透视投影按 $x\'=x\\cdot\\dfrac{D}{D-z}$ 缩放：离相机近（$z$ 大）的顶点放大，远的缩小，于是平行棱在画面上"汇聚"；把透视强度调到 0 就退化为正交投影（平行棱保持平行）。画家算法按面的平均深度排序，先画远的、后画近的，才不会被看穿。',
        en: 'Perspective scales by $D/(D-z)$ so near vertices enlarge and parallel edges converge; at zero it degenerates to orthographic. Face sorting (painter’s algorithm) is what makes occlusion look right.'
      },
      algebra: {
        zh: '旋转 = 依次乘两个旋转矩阵（绕 y 轴偏航、绕 x 轴俯仰）；欧拉公式 $V-E+F=2$ 对一切凸多面体成立（图中读数实时验证）。',
        en: 'Rotation is two rotation matrices (yaw about y, pitch about x); Euler’s $V-E+F=2$ is verified live for every convex solid shown.'
      },
      application: {
        zh: '3D 建模、CAD、游戏引擎与数据可视化的相机管线（模型矩阵 → 视图矩阵 → 投影矩阵）就是这三步的推广。',
        en: 'The camera pipeline of CAD, game engines and 3D visualisation (model → view → projection) generalises exactly these three steps.'
      }
    }
  });
})(window);
