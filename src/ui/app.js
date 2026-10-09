/*!
 * app.js — UI 交互层
 * ---------------------------------------------------------------------------
 * 职责：路由（知识地图）、参数控件、公式/读数渲染、动画循环、无障碍与 i18n。
 * 不包含任何数学定义（math-core）与任何绘制原语（plot/sketch）。
 *
 * 渲染策略：
 *   - 参数变化 → 置 dirty，rAF 统一重绘（避免一帧内多次重绘）
 *   - 带动画的模块 → 每帧调用 module.animate 推进状态，只在状态真的变化时重绘
 *   - KaTeX 排版只在参数变化时重算（动画帧只更新读数文本）
 */
(function (root) {
  'use strict';
  var MS = root.MS, MC = root.MathCore, I18N = root.I18N, P = root.Plot.PALETTE;

  var STAGE_ORDER = [
    'sandbox', 'arith', 'algebra', 'geometry', 'solid3d', 'trig',
    'vector', 'analytic', 'series', 'stats', 'calculus'
  ];
  var INFO_TABS = ['definition', 'geometry', 'algebra', 'application'];

  var canvas = document.getElementById('plot');
  var stageEl = document.getElementById('stage');
  var plot = root.Plot.create(canvas);

  var el = {
    map: document.getElementById('map'),
    title: document.getElementById('stage-title'),
    readouts: document.getElementById('readouts'),
    formula: document.getElementById('formula'),
    caption: document.getElementById('formula-caption'),
    controls: document.getElementById('controls'),
    tabs: document.getElementById('tabs'),
    tabpanel: document.getElementById('tabpanel'),
    legend: document.getElementById('legend'),
    hint: document.getElementById('hint'),
    fps: document.getElementById('fps')
  };

  var current = null;
  var params = {};
  var state = {};
  var paramsByModule = {};
  var stateByModule = {};
  var controlRefs = {};
  var activeTab = 'definition';
  var dirty = true;
  var uiDirty = true;
  var lastTs = 0;
  var viewOverride = null;   // 用户滚轮缩放后的视窗（重置按钮清空）
  var fpsAcc = 0, fpsFrames = 0, fpsElapsed = 0;

  // ---- 动效状态 -----------------------------------------------------------
  var motion = root.Motion.create();
  var RESET_MS = 420;        // 重置回退时长（与 tokens.css 的 --motion-reset-dur 一致）
  var DRAW_MS = 650;         // 曲线描边生成时长
  var CAMERA_MS = 380;       // 模块切换的相机过渡时长
  var cameraTween = false;   // 是否正在做相机过渡
  var ambientTime = 0;       // 活力层相位（秒）
  var ambientAccum = 0;      // 活力层刷新节流累加器
  var AMBIENT_TICK_MS = 68;  // 活力层视觉刷新周期：约 15Hz（光斑 24s 才走一圈，15Hz 已完全连贯）
  var reduceMotion = false;  // 用户开关 / prefers-reduced-motion
  var perfDegraded = false;  // 因性能不足自动降级
  var ambientUserSet = false;// 用户显式设置过动效开关（此后不再自动降级）
  var fpsWindow = { sum: 0, n: 0 };
  var degradeStrikes = 0;
  var recoverStrikes = 0;
  var elapsedTotal = 0;
  var BOOT_GRACE_MS = 3000;  // 启动前 3 秒不参与降级判定（首屏加载/字体/KaTeX 会拖低瞬时帧率）
  var resetPlan = null;      // 重置回退中的计划：{ nonNumeric: {...} }

  // ---- 自动演示（叙事时间轴）------------------------------------------------
  var timeline = root.Timeline.create();
  var demoOn = false;        // 播放器是否展开（含暂停态）
  var demoUiAccum = 0;
  var demoDoneHandled = false;
  var demoEls = {};

  // ------------------------------------------------------------- 工具
  function pick(obj) { return I18N.pick(obj); }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /**
   * 支持 **粗体** 与 $行内公式$ 的富文本。
   * 关键：先把数学片段切出来（不参与 HTML 转义），再对纯文本转义，
   * 否则 TeX 里的 ' 会变成 &#39; 送进 KaTeX 导致排版失败。
   */
  function richText(str) {
    var parts = String(str).split(/(\$[^$]+\$)/g);
    return parts.map(function (part) {
      if (part.length > 1 && part.charAt(0) === '$' && part.charAt(part.length - 1) === '$') {
        var tex = part.slice(1, -1);
        if (root.katex) {
          try { return root.katex.renderToString(tex, { throwOnError: false }); } catch (e) { /* 回退 */ }
        }
        return '<code>' + escapeHtml(tex) + '</code>';
      }
      return escapeHtml(part).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    }).join('');
  }

  function renderTex(target, latex) {
    if (!target) return;
    if (root.katex) {
      try {
        root.katex.render(String(latex), target, { throwOnError: false, displayMode: false });
        return;
      } catch (e) { /* 回退为纯文本 */ }
    }
    target.textContent = String(latex);
  }

  function fmtVal(v, c) {
    if (typeof v === 'boolean') return v ? '✓' : '✗';
    if (typeof v === 'string') return v;
    var decimals = c && c.step && c.step < 1 ? (c.step < 0.05 ? 2 : 1) : 0;
    return Number(v).toFixed(decimals);
  }

  function modulesOf(stageId) {
    return MS.modules.filter(function (m) { return m.stage === stageId; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }

  /** 模块的**目标视窗**（不修改 plot，用于相机过渡的终点计算）。 */
  function targetViewFor(m, p) {
    var v = typeof m.view === 'function' ? m.view(p, plot) : m.view;
    if (v) return { xMin: v.xMin, xMax: v.xMax, yMin: v.yMin, yMax: v.yMax };
    var sq = typeof m.square === 'function' ? m.square(p, plot) : m.square;
    if (sq) {
      var hh = sq.halfWidth * (plot.size.h / Math.max(1, plot.size.w));
      return { xMin: sq.cx - sq.halfWidth, xMax: sq.cx + sq.halfWidth, yMin: sq.cy - hh, yMax: sq.cy + hh };
    }
    return null;
  }

  function snapshotView() {
    return { xMin: plot.view.xMin, xMax: plot.view.xMax, yMin: plot.view.yMin, yMax: plot.view.yMax };
  }

  /** 相机过渡：把视窗从 from 补间到 to（模块切换 / 重置回退都用它）。 */
  function tweenCamera(from, to, dur) {
    if (!from || !to || reduceMotion) { cameraTween = false; return; }
    var same = Math.abs(from.xMin - to.xMin) < 1e-9 && Math.abs(from.xMax - to.xMax) < 1e-9 &&
               Math.abs(from.yMin - to.yMin) < 1e-9 && Math.abs(from.yMax - to.yMax) < 1e-9;
    var ease = 'easeInOutCubic';
    var d = dur === undefined ? CAMERA_MS : dur;
    ['xMin', 'xMax', 'yMin', 'yMax'].forEach(function (k) {
      motion.to('view.' + k, to[k], { from: from[k], dur: d, ease: ease });
    });
    cameraTween = !same;
  }

  /** 曲线描边生成（只在切换模块/重置时播放，参数修改保持即时渲染）。 */
  function playReveal() {
    if (reduceMotion) { plot.setReveal(1); return; }
    plot.setReveal(0);
    motion.to('reveal', 1, { from: 0, dur: DRAW_MS, ease: 'easeOutCubic' });
  }

  /** 模块的控件清单：支持静态数组，也支持「随参数变化」的函数形式
   *  （例如导数模块按所选函数给出不同的切点定义域）。 */
  function controlList() {
    if (!current) return [];
    return typeof current.controls === 'function' ? current.controls(params) : (current.controls || []);
  }

  /** 把参数夹回控件定义域，并补齐缺失项——避免出现"滑块值"与"绘图值"不一致。 */
  function clampParams(list) {
    list.forEach(function (c) {
      var v = params[c.id];
      if (c.type === 'range') {
        if (typeof v !== 'number' || !isFinite(v)) v = c.value;
        if (v < c.min) v = c.min;
        if (v > c.max) v = c.max;
        params[c.id] = v;
      } else if (v === undefined) {
        params[c.id] = c.value;
      }
    });
  }

  function flatModules() {
    var out = [];
    STAGE_ORDER.forEach(function (s) { out = out.concat(modulesOf(s)); });
    return out;
  }

  // ------------------------------------------------------------- 导航
  function buildNav() {
    el.map.innerHTML = '';
    STAGE_ORDER.forEach(function (stageId) {
      var mods = modulesOf(stageId);
      if (!mods.length) return;
      var sec = document.createElement('section');
      sec.className = 'map-stage';
      var h = document.createElement('h2');
      h.textContent = I18N.t('stage.' + stageId);
      sec.appendChild(h);
      var thread = document.createElement('div');
      thread.className = 'thread';
      sec.appendChild(thread);
      mods.forEach(function (m, i) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'map-node';
        btn.setAttribute('aria-current', String(!!current && current.id === m.id));
        var dot = document.createElement('span');
        dot.className = 'dot';
        dot.textContent = String(i + 1);
        var txt = document.createElement('span');
        txt.className = 'txt';
        var strong = document.createElement('strong');
        strong.textContent = pick(m.title);
        var sub = document.createElement('span');
        sub.textContent = m.caption ? pick(m.caption) : '';
        txt.appendChild(strong);
        txt.appendChild(sub);
        btn.appendChild(dot);
        btn.appendChild(txt);
        btn.addEventListener('click', function () { select(m.id); });
        sec.appendChild(btn);
      });
      el.map.appendChild(sec);
    });
  }

  // ------------------------------------------------------------- 控件
  function buildControls() {
    el.controls.innerHTML = '';
    controlRefs = {};
    var list = controlList();
    if (!list.length) {
      el.controls.innerHTML = '<p class="hint">' + escapeHtml(current.caption ? pick(current.caption) : '—') + '</p>';
      return;
    }
    clampParams(list);
    list.forEach(function (c) {
      var wrap = document.createElement('div');
      wrap.className = 'control';

      if (c.type === 'segment') {
        var row = document.createElement('div');
        row.className = 'row';
        var lab = document.createElement('span');
        lab.className = 'value';
        lab.id = 'lbl-' + c.id;
        lab.style.color = 'var(--ink-soft)';
        lab.textContent = pick(c.label);
        row.appendChild(lab);
        wrap.appendChild(row);
        var seg = document.createElement('div');
        seg.className = 'seg';
        seg.setAttribute('role', 'group');
        seg.setAttribute('aria-labelledby', 'lbl-' + c.id);
        var btns = [];
        c.options.forEach(function (opt) {
          var b = document.createElement('button');
          b.type = 'button';
          b.textContent = pick(opt.label);
          b.setAttribute('aria-pressed', String(params[c.id] === opt.value));
          b.addEventListener('click', function () {
            motion.cancel('p:' + c.id);
            pauseDemo();
            params[c.id] = opt.value;
            dirty = true; uiDirty = true;
            // 选项切换可能改变其它控件（如切点定义域），需要重建控件并夹紧参数
            if (typeof current.controls === 'function') buildControls();
            else syncControls();
          });
          btns.push({ el: b, value: opt.value });
          seg.appendChild(b);
        });
        wrap.appendChild(seg);
        controlRefs[c.id] = { type: 'segment', buttons: btns };

      } else if (c.type === 'toggle') {
        var lab2 = document.createElement('label');
        lab2.className = 'toggle';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!params[c.id];
        cb.setAttribute('aria-label', pick(c.label));
        cb.addEventListener('change', function () {
          motion.cancel('p:' + c.id);
          pauseDemo();
          params[c.id] = cb.checked;
          dirty = true; uiDirty = true;
        });
        var sp = document.createElement('span');
        sp.textContent = pick(c.label);
        lab2.appendChild(cb);
        lab2.appendChild(sp);
        wrap.appendChild(lab2);
        controlRefs[c.id] = { type: 'toggle', input: cb };

      } else if (c.type === 'text') {
        // 自由输入：即时解析 + 错误定位 + LaTeX 回显
        var rowT = document.createElement('div');
        rowT.className = 'row';
        var labT = document.createElement('label');
        labT.textContent = pick(c.label);
        labT.htmlFor = 'in-' + current.id + '-' + c.id;
        var status = document.createElement('span');
        status.className = 'status';
        rowT.appendChild(labT);
        rowT.appendChild(status);
        wrap.appendChild(rowT);

        var inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'text-input';
        inp.id = 'in-' + current.id + '-' + c.id;
        inp.value = String(params[c.id]);
        inp.spellcheck = false;
        inp.setAttribute('autocomplete', 'off');
        inp.setAttribute('aria-label', pick(c.label));
        if (c.color) inp.style.borderLeftColor = c.color;
        wrap.appendChild(inp);

        var help = document.createElement('div');
        help.className = 'help';
        help.id = 'help-' + current.id + '-' + c.id;
        inp.setAttribute('aria-describedby', help.id);
        wrap.appendChild(help);

        var caret = document.createElement('pre');
        caret.className = 'caret-line';
        wrap.appendChild(caret);

        var tex = document.createElement('div');
        tex.className = 'tex-preview';
        wrap.appendChild(tex);

        var refresh = function () {
          var raw = inp.value;
          params[c.id] = raw;
          var res = MC.toFunctionOfX(raw);
          var bad = !res.ok;
          inp.classList.toggle('invalid', bad);
          inp.setAttribute('aria-invalid', bad ? 'true' : 'false');
          status.textContent = bad ? '✗' : '✓';
          status.className = 'status ' + (bad ? 'bad' : 'good');
          help.textContent = bad ? res.message : '已识别为单变量函数，可绘制';
          if (bad && typeof res.index === 'number') {
            caret.style.display = 'block';
            caret.textContent = raw + '\n' + new Array(res.index + 1).join(' ') + '^';
          } else {
            caret.style.display = 'none';
            caret.textContent = '';
          }
          if (res.ok) renderTex(tex, res.latex);
          else tex.textContent = '';
        };
        inp.addEventListener('input', function () { pauseDemo(); refresh(); dirty = true; uiDirty = true; });
        controlRefs[c.id] = { type: 'text', input: inp, status: status, help: help, preview: tex, caret: caret, refresh: refresh };
        refresh();

      } else {
        var row2 = document.createElement('div');
        row2.className = 'row';
        var lab3 = document.createElement('label');
        lab3.textContent = pick(c.label);
        lab3.htmlFor = 'in-' + current.id + '-' + c.id;
        var val = document.createElement('span');
        val.className = 'value';
        val.textContent = fmtVal(params[c.id], c) + (c.unit || '');
        row2.appendChild(lab3);
        row2.appendChild(val);
        wrap.appendChild(row2);
        var inp = document.createElement('input');
        inp.type = 'range';
        inp.id = 'in-' + current.id + '-' + c.id;
        inp.min = String(c.min);
        inp.max = String(c.max);
        inp.step = String(c.step);
        inp.value = String(params[c.id]);
        inp.setAttribute('aria-label', pick(c.label));
        inp.addEventListener('input', function () {
          motion.cancel('p:' + c.id);          // 用户输入立刻接管，与回退动画平滑交接
          pauseDemo();                          // 演示进行中则暂停，把控制权交还用户
          params[c.id] = parseFloat(inp.value);
          val.textContent = fmtVal(params[c.id], c) + (c.unit || '');
          dirty = true; uiDirty = true;
        });
        wrap.appendChild(inp);
        controlRefs[c.id] = { type: 'range', input: inp, valueEl: val, def: c };
      }
      el.controls.appendChild(wrap);
    });

    var reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'btn';
    reset.style.marginTop = '10px';
    reset.textContent = I18N.t('btn.reset');
    reset.addEventListener('click', function () { resetAnimated(); });
    el.controls.appendChild(reset);

    // 自动演示入口（章节若配有脚本才显示；减少动效时禁用）
    if (current.demo) {
      var demoBtn = document.createElement('button');
      demoBtn.type = 'button';
      demoBtn.className = 'btn primary';
      demoBtn.style.marginTop = '10px';
      demoBtn.style.width = '100%';
      demoBtn.disabled = reduceMotion;
      demoBtn.textContent = I18N.t(reduceMotion ? 'demo.blocked' : (timeline.state().done ? 'demo.replay' : 'demo.start'));
      demoBtn.addEventListener('click', function () {
        if (reduceMotion) return;
        if (timeline.state().done || !demoOn) startDemo();
        else timeline.toggle(), updateDemoBar();
      });
      el.controls.appendChild(demoBtn);
    }

    if (current.zoomable) {
      var resetView = document.createElement('button');
      resetView.type = 'button';
      resetView.className = 'btn';
      resetView.style.marginTop = '10px';
      resetView.style.marginLeft = '8px';
      resetView.textContent = I18N.t('btn.resetView');
      resetView.addEventListener('click', function () {
        viewOverride = null; dirty = true; uiDirty = true;
      });
      el.controls.appendChild(resetView);
    }
  }

  function syncControls() {
    Object.keys(controlRefs).forEach(function (id) {
      var ref = controlRefs[id];
      if (ref.type === 'range') {
        if (document.activeElement !== ref.input) ref.input.value = String(params[id]);
        ref.valueEl.textContent = fmtVal(params[id], ref.def) + (ref.def.unit || '');
      } else if (ref.type === 'toggle') {
        ref.input.checked = !!params[id];
      } else if (ref.type === 'segment') {
        ref.buttons.forEach(function (b) { b.el.setAttribute('aria-pressed', String(params[id] === b.value)); });
      } else if (ref.type === 'text') {
        if (document.activeElement !== ref.input) {
          ref.input.value = String(params[id]);
          ref.refresh();
        }
      }
    });
  }

  function applyDefaults() {
    var list = controlList();
    params = {};
    list.forEach(function (c) { params[c.id] = c.value; });
    paramsByModule[current.id] = params;
  }

  // ---------------------------------------------------------- 自动演示系统
  /** 启动当前章节的自动演示（脚本定义见 modules/demos.js）。 */
  function startDemo() {
    if (!current || !current.demo || reduceMotion) return;
    demoOn = true;
    demoUiAccum = 999;
    timeline.load(current.demo, {
      params: params,
      state: state,
      set: function (id, v) { params[id] = v; },
      get: function (id) { return params[id]; },
      lerp: function (a, b, p) { return a + (b - a) * p; }
    });
    if (demoEls.bar) demoEls.bar.hidden = false;
    timeline.play();
    updateDemoBar();
    el.hint.textContent = I18N.t('demo.playing');
    dirty = true; uiDirty = true;
  }

  /** 用户一动手就暂停演示，把控制权交还给他（"支持随时介入交互"）。 */
  function pauseDemo() {
    if (!demoOn) return;
    timeline.pause();
    updateDemoBar();
    el.hint.textContent = I18N.t('demo.takenOver');
  }

  function closeDemo() {
    demoOn = false;
    timeline.clear();
    if (demoEls.bar) demoEls.bar.hidden = true;
    el.hint.textContent = I18N.t(ambientOn() ? 'hint' : 'hint.reduced');
    buildControls();
    dirty = true; uiDirty = true;
  }

  function updateDemoBar(st) {
    if (!demoOn || !demoEls.bar) return;
    var s = st || timeline.state();
    if (demoEls.label) demoEls.label.textContent = s.label ? pick(s.label) : (s.title ? pick(s.title) : '—');
    if (demoEls.progress && document.activeElement !== demoEls.progress) {
      demoEls.progress.value = String(s.duration ? Math.round((s.t / s.duration) * 1000) : 0);
    }
    if (demoEls.time) {
      demoEls.time.textContent = (s.t / 1000).toFixed(1) + ' / ' + (s.duration / 1000).toFixed(1) + 's';
    }
    if (demoEls.toggle) {
      demoEls.toggle.textContent = s.playing ? '❚❚' : '▶';
      demoEls.toggle.setAttribute('aria-label', s.playing ? I18N.t('btn.pause') : I18N.t('btn.play'));
    }
  }

  /**
   * 重置回退（Reverse Easing）：不瞬跳，而是把每个数值参数补间回默认值，
   * 滑块、曲线、相机同时回退，营造"时间倒流"的秩序感（420ms，easeInOutCubic）。
   * 非数值控件（开关/分段/文本）在数值回退结束后统一恢复。
   */
  function resetAnimated() {
    var list = controlList();
    var defaults = {};
    list.forEach(function (c) { defaults[c.id] = c.value; });

    if (reduceMotion) {
      // 无障碍：用户要求减少动效时直接恢复，不做补间
      var from0 = snapshotView();
      applyDefaults();
      viewOverride = null;
      motion.cancelAll();
      cameraTween = false;
      plot.setReveal(1);
      var to0 = targetViewFor(current, defaults);
      if (to0) { /* 直接落到默认视窗 */ }
      buildControls();
      dirty = true; uiDirty = true;
      return;
    }

    var fromView = snapshotView();
    var nonNumeric = {};
    list.forEach(function (c) {
      if (c.type === 'range') {
        var cur = typeof params[c.id] === 'number' && isFinite(params[c.id]) ? params[c.id] : c.value;
        if (Math.abs(cur - c.value) > 1e-9) {
          motion.to('p:' + c.id, c.value, { from: cur, dur: RESET_MS, ease: 'easeInOutCubic' });
        } else {
          params[c.id] = c.value;
        }
      } else {
        nonNumeric[c.id] = c.value;
      }
    });
    resetPlan = { nonNumeric: nonNumeric };

    viewOverride = null;
    var to = targetViewFor(current, defaults);
    if (to) tweenCamera(fromView, to, RESET_MS);
    playReveal();
    dirty = true; uiDirty = true;
  }

  // ------------------------------------------------------------- 说明面板
  function buildInfo() {
    el.tabs.innerHTML = '';
    INFO_TABS.forEach(function (k) {
      var b = document.createElement('button');
      b.type = 'button';
      b.id = 'tab-' + k;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(activeTab === k));
      b.textContent = I18N.t('tab.' + k);
      b.addEventListener('click', function () { activeTab = k; buildInfo(); });
      el.tabs.appendChild(b);
    });
    var body = current.info ? current.info[activeTab] : null;
    // 沙盒的"变量替换过程"挂在「代数操作」页：按顶层加减逐项给出导数与法则
    var extra = (activeTab === 'algebra' && typeof current.infoExtra === 'function')
      ? current.infoExtra(params) : '';
    el.tabpanel.innerHTML = (body ? richText(pick(body)) : '') + extra;
    el.tabpanel.setAttribute('aria-labelledby', 'tab-' + activeTab);
  }

  function buildLegend() {
    el.legend.innerHTML = '';
    var items = typeof current.legend === 'function' ? current.legend(params) : (current.legend || []);
    if (!items.length) {
      el.legend.innerHTML = '<p class="hint">—</p>';
      return;
    }
    items.forEach(function (it) {
      var row = document.createElement('div');
      row.className = 'item';
      var sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = it.color;
      var tx = document.createElement('span');
      tx.textContent = pick(it.label);
      row.appendChild(sw);
      row.appendChild(tx);
      el.legend.appendChild(row);
    });
    el.hint.textContent = I18N.t('hint');
  }

  // ------------------------------------------------------------- 渲染
  function renderFormula() {
    var latex = typeof current.formula === 'function' ? current.formula(params) : current.formula;
    renderTex(el.formula, latex);
    el.caption.textContent = current.caption ? pick(current.caption) : '';
  }

  function updateReadouts() {
    var items = current.readouts ? current.readouts(params, state) : [];
    el.readouts.innerHTML = '';
    items.forEach(function (r) {
      var span = document.createElement('span');
      span.className = 'readout';
      span.innerHTML = escapeHtml(pick(r.label)) + ' <b>' + escapeHtml(r.value) + '</b>';
      el.readouts.appendChild(span);
    });
  }

  function draw() {
    if (!current) return;
    // 视窗优先级：相机过渡 > 用户手动缩放 > 模块默认视窗
    if (cameraTween) {
      plot.setView({
        xMin: motion.value('view.xMin', plot.view.xMin),
        xMax: motion.value('view.xMax', plot.view.xMax),
        yMin: motion.value('view.yMin', plot.view.yMin),
        yMax: motion.value('view.yMax', plot.view.yMax)
      });
    } else if (viewOverride) {
      plot.setView(viewOverride);
    } else {
      var view = typeof current.view === 'function' ? current.view(params, plot) : current.view;
      if (view) plot.setView(view);
      var sq = typeof current.square === 'function' ? current.square(params, plot) : current.square;
      if (sq) plot.setSquareView(sq.cx, sq.cy, sq.halfWidth);
    }
    plot.frame(function () { current.draw(plot, params, state); });
  }

  /** 背景活力层是否开启（用户开关 / 无障碍 / 性能降级 / 页面不可见 都会关掉它）。 */
  function ambientOn() {
    return !reduceMotion && !perfDegraded && !document.hidden;
  }

  function updateMotionButton() {
    var b = document.getElementById('motion-toggle');
    var on = ambientOn();
    if (document.body && document.body.classList) document.body.classList.toggle('motion-off', !on);
    if (!b) return;
    b.setAttribute('aria-pressed', String(on));
    b.textContent = I18N.t(on ? 'motion.on' : 'motion.off') +
      (perfDegraded ? I18N.t('motion.degraded') : '');
  }

  // ------------------------------------------------------------- 主循环
  function loop(ts) {
    var dt = lastTs ? Math.min(64, ts - lastTs) : 16;
    lastTs = ts;

    // ---- 1. 补间推进（重置回退 / 相机过渡 / 描边生成）----
    motion.update(ts);
    if (cameraTween && !motion.has('view.xMin')) cameraTween = false;
    if (motion.has('reveal')) plot.setReveal(motion.value('reveal', 1));

    // ---- 2. 参数回退：把补间中的数值写回 params 并同步滑块（可见的"时间倒流"）----
    var active = motion.activeKeys();
    var paramKeys = active.filter(function (k) { return k.indexOf('p:') === 0; });
    if (paramKeys.length) {
      paramKeys.forEach(function (k) {
        var id = k.slice(2);
        params[id] = motion.value(k, params[id]);
      });
      syncControls();
      dirty = true;
    } else if (resetPlan) {
      // 数值回退结束：恢复非数值控件（开关/分段/文本）并重建控件
      Object.keys(resetPlan.nonNumeric).forEach(function (id) { params[id] = resetPlan.nonNumeric[id]; });
      resetPlan = null;
      buildControls();
      dirty = true; uiDirty = true;
    }

    // ---- 3. 背景活力层（极低频、低对比度）----
    // 两个优化：① 视觉刷新节流到 ~15Hz（光斑 24s 才走一圈，观感无差别）；
    //          ② 过渡动画期间暂停绘制光斑——此时注意力在曲线/相机上，且已逐帧重绘。
    var amb = ambientOn();
    var transitionActive = motion.animating();
    if (amb) {
      ambientTime += dt / 1000;
      ambientAccum += dt;
      if (!transitionActive && ambientAccum >= AMBIENT_TICK_MS) {
        ambientAccum = 0;
        dirty = true;
      }
    } else {
      ambientAccum = 0;
    }
    plot.setAmbient({ on: amb && !transitionActive, t: ambientTime });

    // ---- 4. 模块自身的动画 ----
    if (current && typeof current.animate === 'function') {
      var changed = current.animate(state, params, dt);
      if (changed) {
        dirty = true;
        if (changed === 'params') syncControls();
      }
    }

    // ---- 4b. 自动演示：时间轴驱动参数，UI 与画布跟着走 ----
    if (demoOn) {
      var st = timeline.update(ts);
      updateDemoBar(st);
      if (st.playing) {                     // 暂停时绝不回写参数，保证用户的手动修改生效
        syncControls();                     // 脚本改了参数 → 滑块同步移动
        dirty = true;
        demoUiAccum += dt;
        if (demoUiAccum >= 110) {           // 公式/推导面板按 ~9Hz 重排，避免每帧 KaTeX
          demoUiAccum = 0;
          uiDirty = true;
        }
      }
      if (st.done) {
        el.hint.textContent = I18N.t('demo.done');
        if (!demoDoneHandled) { demoDoneHandled = true; buildControls(); }   // 按钮变为"重播"
      } else {
        demoDoneHandled = false;
      }
    }
    if (motion.animating()) dirty = true;

    if (dirty) {
      draw();
      updateReadouts();
      if (uiDirty) {
        renderFormula();
        if (typeof current.infoExtra === 'function') buildInfo();
        uiDirty = false;
      }
      dirty = false;
    }

    // ---- 5. FPS 统计 + 低端设备自动降级（带启动宽限与迟滞，避免误伤）----
    fpsAcc += dt; fpsFrames++; fpsElapsed += dt; elapsedTotal += dt;
    if (fpsElapsed >= 500) {
      var avg = 1000 / (fpsAcc / fpsFrames);
      el.fps.textContent = Math.round(avg) + ' ' + I18N.t('fps');
      fpsAcc = 0; fpsFrames = 0; fpsElapsed = 0;
      updateMotionButton();     // 每 0.5s 与 ambientOn() 对齐（页面可见性等外部状态也会影响它）
      if (elapsedTotal > BOOT_GRACE_MS && !ambientUserSet && !reduceMotion) {
        if (avg < 45) { degradeStrikes++; recoverStrikes = 0; }
        else if (avg > 52) { recoverStrikes++; degradeStrikes = 0; }
        if (!perfDegraded && degradeStrikes >= 6) {          // 连续 ~3 秒低于 45FPS → 降级
          perfDegraded = true;
          updateMotionButton();
        } else if (perfDegraded && recoverStrikes >= 6) {    // 恢复后又能稳住 → 重新开启
          perfDegraded = false;
          updateMotionButton();
        }
      }
    }
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------- 路由
  function select(id, opts) {
    var m = MS.byId(id) || flatModules()[0];
    if (!m) return;
    var fromView = snapshotView();                 // 切换前的相机位置（用于过渡）
    var sameModule = !!current && current.id === m.id;
    // 切到别的章节时关闭演示播放器
    if (demoOn && !sameModule) {
      demoOn = false;
      timeline.clear();
      if (demoEls.bar) demoEls.bar.hidden = true;
    }
    current = m;
    if (!stateByModule[m.id]) {
      stateByModule[m.id] = {};
      if (typeof m.init === 'function') m.init(stateByModule[m.id]);
    }
    state = stateByModule[m.id];
    if (paramsByModule[m.id]) {
      params = paramsByModule[m.id];
    } else {
      params = {};
      var list = typeof m.controls === 'function' ? m.controls(params) : (m.controls || []);
      list.forEach(function (c) { params[c.id] = c.value; });
      paramsByModule[m.id] = params;
    }
    activeTab = 'definition';
    viewOverride = null;
    el.title.textContent = pick(m.title);
    canvas.setAttribute('aria-label', pick(m.title) + (m.zoomable ? '（可用滚轮缩放）' : ''));
    buildControls();
    buildInfo();
    buildLegend();
    buildNav();
    if (!opts || opts.hash !== false) {
      try { history.replaceState(null, '', '#' + m.id); } catch (e) { /* file:// 下忽略 */ }
    }
    // 模块切换的动效：相机平滑过渡到新视窗 + 曲线从左到右"画"出来
    if (!sameModule) {
      var toView = targetViewFor(m, params);
      if (toView) tweenCamera(fromView, toView, CAMERA_MS);
      playReveal();
    }
    dirty = true; uiDirty = true;
    el.hint.textContent = I18N.t(ambientOn() ? 'hint' : 'hint.reduced');
  }

  function step(delta) {
    var list = flatModules();
    var idx = list.indexOf(current);
    if (idx < 0) idx = 0;
    var next = list[(idx + delta + list.length) % list.length];
    if (next) select(next.id);
  }

  // ------------------------------------------------------------- i18n
  function applyStaticI18n() {
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = I18N.t(nodes[i].getAttribute('data-i18n'));
    }
  }

  function setLang(lang) {
    I18N.set(lang);
    document.getElementById('lang-zh').setAttribute('aria-pressed', String(lang === 'zh'));
    document.getElementById('lang-en').setAttribute('aria-pressed', String(lang === 'en'));
  }

  // ------------------------------------------------------------- 启动
  function boot() {
    plot.resize();
    applyStaticI18n();

    document.getElementById('lang-zh').addEventListener('click', function () { setLang('zh'); });
    document.getElementById('lang-en').addEventListener('click', function () { setLang('en'); });

    I18N.onChange(function () {
      applyStaticI18n();
      updateMotionButton();
      if (!current) return;
      el.title.textContent = pick(current.title);
      buildNav(); buildControls(); buildInfo(); buildLegend();
      dirty = true; uiDirty = true;
    });

    // ---- 动效开关（无障碍：前庭功能障碍用户可暂停背景活力层）----
    if (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      reduceMotion = true;
    }
    var mbtn = document.getElementById('motion-toggle');
    if (mbtn) {
      mbtn.addEventListener('click', function () {
        reduceMotion = !reduceMotion;
        ambientUserSet = true;               // 用户显式设定后不再自动降级
        if (reduceMotion) {
          perfDegraded = false;
          motion.cancelAll();
          cameraTween = false;
          plot.setReveal(1);
          if (demoOn) closeDemo();      // 减少动效同时暂停自动演示（无障碍要求）
        }
        updateMotionButton();
        if (current) {
          el.hint.textContent = I18N.t(ambientOn() ? 'hint' : 'hint.reduced');
          buildControls();          // 演示入口的可用状态要立刻反映"减少动效"开关
        }
        dirty = true;
      });
    }
    updateMotionButton();
    document.addEventListener('visibilitychange', function () {
      updateMotionButton();
      dirty = true;
    });

    // ---- 自动演示播放器（Play/Pause/进度/倍速/关闭）----
    demoEls = {
      bar: document.getElementById('demo-bar'),
      toggle: document.getElementById('demo-toggle'),
      label: document.getElementById('demo-label'),
      progress: document.getElementById('demo-progress'),
      time: document.getElementById('demo-time'),
      close: document.getElementById('demo-close')
    };
    if (demoEls.toggle) {
      demoEls.toggle.addEventListener('click', function () {
        if (!demoOn) { startDemo(); return; }
        timeline.toggle();
        updateDemoBar();
      });
    }
    if (demoEls.progress) {
      demoEls.progress.addEventListener('input', function () {
        if (!demoOn) return;
        timeline.seek((parseFloat(demoEls.progress.value) / 1000) * timeline.duration());
        timeline.pause();                     // 拖进度即暂停，避免与用户抢时间轴
        updateDemoBar();
      });
    }
    if (demoEls.close) demoEls.close.addEventListener('click', closeDemo);
    var speedBtns = document.querySelectorAll('.demo-speed button');
    Array.prototype.forEach.call(speedBtns, function (b) {
      b.addEventListener('click', function () {
        timeline.setSpeed(parseFloat(b.getAttribute('data-speed')));
        Array.prototype.forEach.call(speedBtns, function (o) {
          o.setAttribute('aria-pressed', String(o === b));
        });
        updateDemoBar();
      });
    });

    if (root.ResizeObserver) {
      new root.ResizeObserver(function () { plot.resize(); dirty = true; }).observe(stageEl);
    }
    root.addEventListener('resize', function () { plot.resize(); dirty = true; });

    // ---- 画布交互：探针（pointermove）/ 滚轮缩放 / 键盘探针 ----
    canvas.setAttribute('tabindex', '0');
    canvas.setAttribute('role', 'application');

    function worldAt(ev) {
      var rect = canvas.getBoundingClientRect();
      return { x: plot.wx(ev.clientX - rect.left), y: plot.wy(ev.clientY - rect.top) };
    }

    canvas.addEventListener('pointermove', function (ev) {
      if (!current || typeof current.onPointer !== 'function') return;
      if (current.onPointer(state, params, worldAt(ev), ev)) dirty = true;
    });
    canvas.addEventListener('pointerdown', function (ev) {
      try { canvas.focus({ preventScroll: true }); } catch (e) { canvas.focus(); }
      if (current && typeof current.onPointer === 'function' && current.onPointer(state, params, worldAt(ev), ev)) dirty = true;
    });
    canvas.addEventListener('wheel', function (ev) {
      if (!current || !current.zoomable) return;
      ev.preventDefault();
      var w = worldAt(ev);
      var factor = ev.deltaY > 0 ? 1.12 : 1 / 1.12;
      if (plot.zoomAt(w.x, w.y, factor)) {
        viewOverride = { xMin: plot.view.xMin, xMax: plot.view.xMax, yMin: plot.view.yMin, yMax: plot.view.yMax };
        dirty = true; uiDirty = true;
      }
    }, { passive: false });
    canvas.addEventListener('keydown', function (ev) {
      if (!current || typeof current.onKey !== 'function') return;
      var step = (plot.view.xMax - plot.view.xMin) / 48;
      if (current.onKey(state, params, ev.key, step, ev.shiftKey)) {
        ev.preventDefault();
        dirty = true; uiDirty = true;
      }
    });

    document.addEventListener('keydown', function (e) {
      var tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === '[') { step(-1); }
      else if (e.key === ']') { step(1); }
      else if (e.key === ' ' && demoOn) { timeline.toggle(); updateDemoBar(); e.preventDefault(); }
      else if (e.key === 'p' || e.key === 'P') {
        var seg = controlList().filter(function (c) { return c.type === 'toggle'; })[0];
        if (seg) { params[seg.id] = !params[seg.id]; syncControls(); dirty = true; }
      }
    });

    root.addEventListener('hashchange', function () {
      var id = (location.hash || '').replace(/^#\/?/, '');
      if (id && (!current || current.id !== id)) select(id, { hash: false });
    });

    var id = (location.hash || '').replace(/^#\/?/, '');
    select(MS.byId(id) ? id : (flatModules()[0] || {}).id);

    requestAnimationFrame(loop);

    // 暴露给自动化测试/截图脚本
    root.MS.gotoModule = function (mid) { select(mid, { hash: false }); };
    root.MS.getPlot = function () { return plot; };
    root.MS.getParams = function () { return params; };
    root.MS.ready = true;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
