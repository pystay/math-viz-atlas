/*!
 * modules/overview.js — 项目总览：可交互知识图谱（画布内嵌的总览视图）
 * ---------------------------------------------------------------------------
 * 把"这个应用有哪些模块、怎么组织"本身做成一张可交互画布：
 *   · 中心 = 自由探索沙盒（+ 微积分引擎）
 *   · 8 个学段节点沿放射线分布，**点击任意节点立即跳转到对应模块**
 *   · 鼠标悬停放大并高亮；键盘 ←/→ 在节点间移动、回车跳转（无障碍）
 *   · 支持"自动巡游"（总览本身的自动演示脚本驱动 hover）
 *   · "跳转目标"文本框：在中心（沙盒）上点击时，若填了合法模块 id 就跳到它，
 *     否则默认进入沙盒 —— 这就是"自由输入-实时解析-动态渲染"总回路的入口
 *
 * 本模块与其他 19 个模块使用同一份模块契约，因此：
 *   · 自动出现在导航地图（stage = 'overview'）
 *   · 有概念闭环（定义/几何意义/代数操作/实际应用）
 *   · 可被自动演示系统接管（demo）
 *   · 复用背景活力层、曲线揭示、相机过渡
 */
(function (root) {
  'use strict';
  var MS = root.MS, P = root.Plot.PALETTE, MC = root.MathCore;
  function pick(o) { return root.I18N.pick(o); }

  // 8 个学段节点（数学核心圈）：target 指向真实模块
  var MATH_NODES = [
    { target: 'arith-add',         label: { zh: '小学·算术', en: 'Arithmetic' },
      sub: { zh: '加法（集合并）· 乘法（矩阵阵列）', en: 'Sets union · Array product' },
      color: P.cobalt, angle: -130 },
    { target: 'algebra-linear',    label: { zh: '初中·代数', en: 'Algebra' },
      sub: { zh: '线性 / 二次 / 指数对数 / 不等式', en: 'Linear · Quadratic · Exp/Log · Ineq.' },
      color: P.mint, angle: -90 },
    { target: 'geo-pythagoras',    label: { zh: '平面几何', en: 'Geometry' },
      sub: { zh: '勾股定理 · 正多边形逼近圆', en: 'Pythagoras · Polygons → circle' },
      color: P.violet, angle: -55 },
    { target: 'solid-3d',          label: { zh: '立体几何', en: 'Solid 3D' },
      sub: { zh: '正方体 / 正四面体 / 正八面体', en: 'Cube · Tetra · Octa' },
      color: P.coral, angle: -15 },
    { target: 'trig-unit',         label: { zh: '三角·向量', en: 'Trig · Vectors' },
      sub: { zh: '单位圆展开成正弦曲线', en: 'Unit circle → sine wave' },
      color: P.mint, angle: 15 },
    { target: 'analytic-conic',    label: { zh: '圆锥曲线', en: 'Conics' },
      sub: { zh: '椭圆 / 抛物线 / 双曲线', en: 'Ellipse · Parabola · Hyperbola' },
      color: P.cobalt, angle: 55 },
    { target: 'series-geometric',  label: { zh: '数列·统计', en: 'Seq · Stats' },
      sub: { zh: '等差 / 等比 / 调和 · 直方图', en: 'Arith · Geom · Harmonic · Hist.' },
      color: P.violet, angle: 130 },
    { target: 'calc-derivative',   label: { zh: '大学·微积分', en: 'Calculus' },
      sub: { zh: '导数 · 定积分（黎曼和）', en: 'Derivative · Definite integral' },
      color: P.coral, angle: 95 }
  ];
  // 多学科扩展圈（规划中）：K-12 语文/英语/科学 + 物理/化学/生物 + 计算机/历史/地理/道法
  var SUBJ_NODES = [
    { target: null, label: { zh: '语文', en: 'Language' },  sub: { zh: '汉字 · 笔画 · 古诗意境', en: 'Hanzi · Strokes · Poetry' }, color: P.violet, angle: -150 },
    { target: null, label: { zh: '英语', en: 'English' },  sub: { zh: '发音 · 场景对话 · 词汇', en: 'Phonics · Dialogues' }, color: P.cobalt, angle: -125 },
    { target: null, label: { zh: '科学', en: 'Science' },  sub: { zh: '植物生长 · 物质变化', en: 'Growth · Change' }, color: P.mint, angle: -100 },
    { target: null, label: { zh: '物理', en: 'Physics' },  sub: { zh: '声 · 光 · 热 · 力', en: 'Sound · Light · Heat · Force' }, color: P.coral, angle: 120 },
    { target: null, label: { zh: '化学', en: 'Chemistry' }, sub: { zh: '分子结构 · 反应 · 周期', en: 'Molecules · Reactions' }, color: P.violet, angle: 145 },
    { target: null, label: { zh: '生物', en: 'Biology' },  sub: { zh: '细胞 · 代谢 · 进化', en: 'Cells · Metabolism' }, color: P.mint, angle: 170 },
    { target: null, label: { zh: '计算机', en: 'CS' },     sub: { zh: '数据结构 · 算法 · 状态机', en: 'Algorithms · State machines' }, color: P.cobalt, angle: 195 },
    { target: null, label: { zh: '历史', en: 'History' },  sub: { zh: '时间轴 · 中外脉络', en: 'Timeline' }, color: P.ink, angle: 215 },
    { target: null, label: { zh: '地理', en: 'Geography' }, sub: { zh: '地球运动 · 板块 · 地图', en: 'Earth · Plates · Maps' }, color: P.coral, angle: 240 },
    { target: null, label: { zh: '道德与法治', en: 'Civics' }, sub: { zh: '案例 · 社会认知', en: 'Cases · Society' }, color: P.ink, angle: 265 }
  ];
  var NODES = MATH_NODES.concat(SUBJ_NODES);   // 兼容旧引用：前 8 = 数学，后 10 = 多学科
  var N = MATH_NODES.length;                     // 数学节点数（tour / 键盘 / 图例都用它）
  var NALL = NODES.length;                       // 全部节点（命中检测用）
  var HUB = 'sandbox';

  // 节点位置：数学核心圈半径 0.30，多学科外圈 0.44
  function nodePos(plot, i) {
    var cx = plot.size.w / 2, cy = plot.size.h / 2;
    var isSubj = i >= N;
    var R = Math.min(plot.size.w, plot.size.h) * (isSubj ? 0.52 : 0.28);
    var a = NODES[i].angle * Math.PI / 180;
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  }
  function hitIndex(plot, mx, my) {
    var cx = plot.size.w / 2, cy = plot.size.h / 2;
    if (Math.abs(mx - cx) < 78 && Math.abs(my - cy) < 78) return -1; // 中心
    for (var i = 0; i < NALL; i++) {
      var p = nodePos(plot, i), dx = mx - p.x, dy = my - p.y;
      if (dx * dx + dy * dy < 56 * 56) return i;
    }
    return -2; // 未命中
  }
  function clientPx(ev, plot) {
    var rect = (ev && ev.target && ev.target.getBoundingClientRect) ? ev.target.getBoundingClientRect()
             : { left: 0, top: 0 };
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  MS.register({
    id: 'overview',
    stage: 'overview',
    order: 0,
    zoomable: false,
    title: { zh: '项目总览 · 可交互知识图谱', en: 'Overview · Interactive knowledge map' },
    caption: { zh: '点击任意学段节点 → 立即跳转该章节', en: 'Click any node to jump to that chapter' },
    formula: function () {
      return '\\text{19 modules} + \\text{calculus sandbox} + \\text{7 auto-play demos}';
    },
    controls: [
      { id: 'showLines', type: 'toggle', label: { zh: '显示放射连线', en: 'Radial links' }, value: true },
      { id: 'showSub', type: 'toggle', label: { zh: '显示学段说明', en: 'Node captions' }, value: true },
      { id: 'tour', type: 'toggle', label: { zh: '自动巡游（逐个高亮学段）', en: 'Auto tour' }, value: false },
      {
        id: 'jump', type: 'text', label: { zh: '中心点击跳转目标', en: 'Center click target' },
        value: '', placeholder: '默认沙盒；可填任意模块 id，如 calc-integral'
      }
    ],
    // 总览是屏幕图，不需要世界视窗（view 缺省即可）
    legend: function (p) {
      var out = [
        { color: P.coral, label: { zh: '自由输入沙盒（中心 = 微积分引擎入口）', en: 'Sandbox (center = calculus entry)' } },
        { color: P.cobalt, label: { zh: '小学·算术 / 圆锥曲线', en: 'Arithmetic / Conics' } },
        { color: P.mint, label: { zh: '初中·代数 / 三角·向量', en: 'Algebra / Trig·Vectors' } },
        { color: P.violet, label: { zh: '平面几何 / 数列·统计', en: 'Geometry / Seq·Stats' } }
      ];
      if (p.showLines) out.push({ color: P.ink, label: { zh: '放射连线：模块同属一张知识图谱', en: 'Radial links: one knowledge graph' } });
      return out;
    },
    init: function (state) {
      state.hover = -2;    // -2 = 无；-1 = 中心；0..7 = 数学节点；8..17 = 多学科节点
      state.t = 0;
    },
    animate: function (state, p, dt) {
      if (!p.tour) return false;
      state.t += dt / 1000;
      // 自动巡游只在数学核心圈（含中心）之间推进，避免把"规划中"的多学科节点当成已实现
      var next = Math.floor(state.t / 2.4) % (N + 1) - 1;
      if (next !== state.hover) { state.hover = next; return true; }
      return false;
    },
    onPointer: function (state, p, world, ev) {
      var plot = root.MS.getPlot();
      var px = clientPx(ev, plot);
      state.hover = hitIndex(plot, px.x, px.y);
      return true;
    },
    onClick: function (state, p, world, ev) {
      var plot = root.MS.getPlot();
      var px = clientPx(ev, plot);
      var hit = hitIndex(plot, px.x, px.y);
      if (hit === -1) {
        // 中心：优先用"跳转目标"文本框里填的模块 id（实时解析：非法 id 回退沙盒）
        var t = String(p.jump || '').trim();
        if (t) { MS.gotoModule(MS.byId(t) ? t : HUB); }
        else { MS.gotoModule(HUB); }
        return;
      }
      if (hit >= 0) {
        var node = NODES[hit];
        if (node.target) MS.gotoModule(node.target);
        else MS.gotoModule(HUB);   // 多学科节点（规划中）：回落沙盒，不崩
        return;
      }
    },
    onKey: function (state, p, key, step, shift) {
      // 焦点顺序：-2(无) → -1(中心) → 0..7(数学) → 8..17(多学科)；左右循环
      var total = NALL + 1;  // 中心 + 全部节点
      function fwd() {
        if (state.hover === -2) state.hover = -1;
        else if (state.hover < NALL - 1) state.hover = state.hover + 1;
      }
      function back() {
        if (state.hover === -2) state.hover = -1;
        else if (state.hover > -1) state.hover = state.hover - 1;
      }
      if (key === 'ArrowRight') { fwd(); return true; }
      if (key === 'ArrowLeft')  { back(); return true; }
      if (key === 'Enter' && state.hover !== -2) {
        if (state.hover === -1) {
          var t = String(p.jump || '').trim();
          MS.gotoModule((t && MS.byId(t)) ? t : HUB);
        } else {
          var nd = NODES[state.hover];
          MS.gotoModule(nd.target ? nd.target : HUB);
        }
        return true;
      }
      return false;
    },
    draw: function (plot, p, state) {
      var ctx = plot.ctx, i;
      var cx = plot.size.w / 2, cy = plot.size.h / 2;
      // 标签描边：先描纸色底再填色，任何背景下都清晰（视觉修复，不影响命中逻辑）
      var _fillText = ctx.fillText.bind(ctx);
      ctx.fillText = function (text, x, y, maxW) {
        var _lw = ctx.lineWidth;
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#FBF7EF';
        ctx.strokeText(text, x, y, maxW);
        ctx.lineWidth = _lw;
        _fillText(text, x, y, maxW);
      };

      // ---- 放射连线（数学圈 0.30 + 多学科圈 0.44，全部从中心发出）----
      if (p.showLines) {
        ctx.save();
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        // 数学圈：较实
        ctx.strokeStyle = P.ink;
        ctx.globalAlpha = 0.30;
        for (i = 0; i < N; i++) {
          var np = nodePos(plot, i);
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(np.x, np.y); ctx.stroke();
        }
        // 多学科外圈：更淡（规划中）
        ctx.globalAlpha = 0.12;
        ctx.setLineDash([2, 6]);
        for (i = N; i < NALL; i++) {
          var sp = nodePos(plot, i);
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(sp.x, sp.y); ctx.stroke();
        }
        ctx.restore();
      }

      // ---- 多学科外圈（先画，垫在底层；半径 0.44，整体更淡表示"规划中"）----
      for (i = N; i < NALL; i++) {
        var snode = NODES[i];
        var spos = nodePos(plot, i);
        var shovered = (state.hover === i);
        ctx.beginPath();
        ctx.arc(spos.x, spos.y, shovered ? 38 : 32, 0, Math.PI * 2);
        ctx.fillStyle = snode.color;
        ctx.globalAlpha = shovered ? 0.95 : 0.55;
        ctx.fill();
        ctx.globalAlpha = 1;
        if (shovered) { ctx.lineWidth = 2; ctx.strokeStyle = P.ink; ctx.stroke(); }
        // 半透明圆内白字不可读：标签沿半径向外推 38px，落在两圈之间的空白处
        var _la = snode.angle * Math.PI / 180;
        var _lx = spos.x + 38 * Math.cos(_la);
        var _ly = spos.y + 38 * Math.sin(_la) + 4;
        ctx.textAlign = 'center';
        ctx.font = '700 11px Consolas, monospace';
        ctx.fillStyle = P.ink;
        ctx.globalAlpha = 0.92;
        ctx.fillText(pick(snode.label), _lx, _ly);
        if (p.showSub) {
          ctx.font = '9px Consolas, monospace';
          ctx.fillStyle = P.ink;
          ctx.globalAlpha = 0.5;
          var ss = pick(snode.sub);
          if (ss.length > 13) ss = ss.slice(0, 12) + '…';
          ctx.fillText(ss, _lx, _ly + 12);
        }
        ctx.globalAlpha = 1;
      }

      // ---- 数学核心圈节点（半径 0.30，实心）----
      for (i = 0; i < N; i++) {
        var node = NODES[i];
        var pos = nodePos(plot, i);
        var hovered = (state.hover === i);
        var r = hovered ? 50 : 42;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.globalAlpha = hovered ? 1 : 0.92;
        ctx.fill();
        ctx.globalAlpha = 1;
        if (hovered) {
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = P.ink;
          ctx.stroke();
        }
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.font = '700 13px Consolas, monospace';
        ctx.fillText(pick(node.label), pos.x, pos.y + 1);
        if (p.showSub) {
          ctx.font = '11px Consolas, monospace';
          ctx.globalAlpha = 0.85;
          var sub = pick(node.sub);
          if (sub.length > 16) sub = sub.slice(0, 15) + '…';
          ctx.fillText(sub, pos.x, pos.y + 16);
          ctx.globalAlpha = 1;
        }
      }

      // ---- 中心：自由探索沙盒（三层同心圆，呼应"自由输入-实时解析-动态渲染"）----
      ctx.save();
      // 外环（虚线，暗示可继续扩展）
      ctx.beginPath();
      ctx.arc(cx, cy, 84, 0, Math.PI * 2);
      ctx.strokeStyle = P.coral;
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.setLineDash([]);
      // 主圆
      ctx.beginPath();
      ctx.arc(cx, cy, 64, 0, Math.PI * 2);
      ctx.fillStyle = P.coral;
      ctx.globalAlpha = state.hover === -1 ? 1 : 0.94;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (state.hover === -1) {
        ctx.lineWidth = 2.5; ctx.strokeStyle = P.ink; ctx.stroke();
      }
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = '700 15px Consolas, monospace';
      ctx.fillText('自由探索沙盒', cx, cy - 10);
      ctx.font = '11px Consolas, monospace';
      ctx.globalAlpha = 0.95;
      ctx.fillText('<100ms 输入→渲染', cx, cy + 8);
      ctx.fillText('+ 微积分引擎', cx, cy + 24);
      ctx.globalAlpha = 1;
      ctx.restore();

      // ---- 画布内标题（左上，低调）----
      ctx.save();
      ctx.textAlign = 'left';
      ctx.fillStyle = P.ink;
      ctx.font = '700 22px Consolas, monospace';
      ctx.globalAlpha = 0.9;
      ctx.fillText('Math Viz Atlas', 24, 34);
      ctx.font = '12px Consolas, monospace';
      ctx.globalAlpha = 0.55;
      ctx.fillText('零构建 · 零 CDN · 双击 index.html 即跑 · 19 个模块 + 沙盒微积分 + 自动演示', 24, 54);
      ctx.globalAlpha = 1;
      ctx.restore();

      // ---- 画布内脚注（底部一行）----
      ctx.save();
      ctx.textAlign = 'right';
      ctx.fillStyle = P.ink;
      ctx.globalAlpha = 0.5;
      ctx.font = '11px Consolas, monospace';
      ctx.fillText('点节点跳转 · ← → 移动焦点 · 回车进入 · 中心填"跳转目标"可直达任意模块',
        plot.size.w - 20, plot.size.h - 16);
      ctx.globalAlpha = 1;
      ctx.restore();
    },
    readouts: function (p, state) {
      var out = [
        { label: { zh: '焦点', en: 'Focus' },
          value: state.hover === -1 ? '中心（沙盒）'
               : (state.hover >= 0 ? pick(NODES[state.hover].label) : '—') },
        { label: { zh: '中心跳转目标', en: 'Center target' }, value: p.jump ? String(p.jump) : '默认沙盒' }
      ];
      if (state.hover >= 0) {
        out.push({ label: { zh: '该学段模块', en: 'Module' }, value: NODES[state.hover].target });
      }
      return out;
    },
    info: {
      definition: {
        zh: '这是**整张知识图谱的导航入口**：中心是自由探索沙盒（含微积分引擎），外围 8 个学段节点覆盖小学算术到大学微积分的 **19 个模块**。它不是一个"信息图"，而是**可点击的画布**——每个节点都通向真实模块。',
        en: 'The **navigation entry point** of the whole atlas: the center is the sandbox (with calculus engine), the 8 outer nodes span **19 modules** from primary arithmetic to university calculus. It is a **clickable canvas**, not a static infographic.'
      },
      geometry: {
        zh: '放射布局：中心到各节点距离相等（$R = 0.34\\min(w,h)$），节点按学段顺序绕中心分布。点击任意节点 $\\to$ `MS.gotoModule(id)`，由 app.js 做**相机过渡 + 曲线揭示**地切过去。',
        en: 'Radial layout: all nodes sit at equal radius $R = 0.34\\min(w,h)$, ordered by curriculum stage. Clicking a node calls `MS.gotoModule(id)` — app.js flies the camera and reveals curves.'
      },
      algebra: {
        zh: '模块契约复用：本模块注册了 `onPointer/onClick/onKey`（其他模块少见的全套交互钩子）。**中心"跳转目标"文本框做实时解析**——填合法 id 就直达，填错自动回退沙盒，绝不让输入把应用带崩。',
        en: 'Full interaction contract: this module wires `onPointer/onClick/onKey`. The center "jump target" text input is **parsed live** — valid ids jump there, invalid ones fall back to the sandbox without ever crashing.'
      },
      application: {
        zh: '它是**学段渐进式路径的可视化**：小学→初中→高中→大学沿放射线排开；配"自动巡游"可逐个高亮学段（自动演示脚本驱动 hover），让"从算术到微积分"这条学习链路本身成为可播放的叙事。',
        en: 'It is the **visual form of the progressive learning path** — primary→secondary→high→university around the spokes. The "auto tour" mode highlights each stage in turn, turning the curriculum chain itself into a playable narrative.'
      }
    }
  });

  // 本模块的自动演示脚本（总览巡游）
  var m = MS.byId('overview');
  m.demo = {
    title: { zh: '总览：从一个节点走遍全图谱', en: 'Overview: walk the whole atlas' },
    steps: [
      { label: { zh: '① 中心：自由探索沙盒 + 微积分引擎', en: '① Center: sandbox + calculus engine' },
        dur: 2000, apply: function (p, ctx) { ctx.set('tour', true); } },
      { label: { zh: '② 小学 → 初中 → 平面几何', en: '② Primary → Secondary → Geometry' },
        dur: 3200, apply: function () { /* tour 逐 2.4s 推进 hover */ } },
      { label: { zh: '③ 立体 → 三角 → 圆锥曲线', en: '③ Solid → Trig → Conics' },
        dur: 3200, apply: function () { } },
      { label: { zh: '④ 数列·统计 → 大学微积分', en: '④ Seq·Stats → Calculus' },
        dur: 3000, apply: function () { } },
      { label: { zh: '⑤ 结论：点任意节点即可进入该章节', en: '⑤ Click any node to dive in' },
        dur: 1600, hold: true, apply: function (p, ctx) { ctx.set('tour', false); } }
    ]
  };
})(window);
