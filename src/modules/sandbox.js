/*!
 * modules/sandbox.js — 自由探索沙盒（含微积分实时计算）
 * ---------------------------------------------------------------------------
 * 「自由输入 → 实时解析 → 动态渲染」+「输入 → 微分/积分/极限 → 即时可视化」：
 *   · 3 个函数槽，任意表达式（隐式乘法、幂、内置函数、科学计数法、分数幂）
 *   · 输入即时解析：KaTeX 回显 + 出错字符定位（由 app.js 的 text 控件负责）
 *   · 微积分运算栏：求导 f′、原函数 ∫f、定积分 ∫ₐᵇ（可调上下限）
 *   · 极限：在观察点两侧按 h 递减逼近，给出左右极限与是否双侧一致
 *   · 常数扰动 ε：把表达式里的数值常数统一缩放，观察极值/渐近线如何移动
 *   · 变量替换过程：按顶层加减拆项，逐项给出导数与所用法则（幂法则/链式法则…）
 *   · 探针：鼠标/方向键沿 x 移动，实时显示各曲线的 f(x₀) 与 f′(x₀)
 *   · 滚轮缩放（app.js 的 zoomable 支持）
 */
(function (root) {
  'use strict';
  var MS = root.MS, P = root.Plot.PALETTE, MC = root.MathCore;

  var SLOTS = [
    { id: 'f1', color: P.cobalt, def: 'sin(x)*e^(-x/3)' },
    { id: 'f2', color: P.coral, def: 'x^2/4 - 1' },
    { id: 'f3', color: P.mint, def: '1/x' }
  ];

  /** 解析一个槽位：返回 {ok, fn, derivative, ast, latex}，永不抛错。 */
  function slot(params, id) {
    var res = MC.toFunctionOfX(params[id]);
    if (!res.ok) return res;
    var compiled = res.fn;                       // compile 出来的是 f(scope)，包成 f(x)
    var fn = function (x) { return compiled({ x: x }); };
    var d = null;
    try {
      d = MC.compile(MC.diff(res.ast, 'x'));
    } catch (e) {
      d = null;   // 个别函数不支持符号求导时退回数值导数
    }
    return {
      ok: true, fn: fn, latex: res.latex, ast: res.ast, dfn: d,
      derivative: function (x) {
        return d ? d({ x: x }) : MC.numericDerivative(fn, x, 1e-6);
      }
    };
  }

  function firstValid(params) {
    for (var i = 0; i < SLOTS.length; i++) {
      var r = slot(params, SLOTS[i].id);
      if (r.ok) return { r: r, slot: SLOTS[i], index: i };
    }
    return null;
  }

  /** ε 扰动后的 f₁（只缩放数值常数，幂指数不动）。 */
  function perturbedFn(src, factor) {
    var res = MC.toFunctionOfX(src);
    if (!res.ok) return null;
    try {
      var ast2 = MC.perturbConstants(res.ast, factor);
      var c = MC.compile(ast2);
      return function (x) { return c({ x: x }); };
    } catch (e) {
      return null;
    }
  }

  function tex(src) {
    if (root.katex) {
      try { return root.katex.renderToString(src, { throwOnError: false }); } catch (e) { /* fall through */ }
    }
    return '<code>' + String(src) + '</code>';
  }

  MS.register({
    id: 'sandbox',
    stage: 'sandbox',
    order: 0,
    zoomable: true,
    title: { zh: '自由探索沙盒', en: 'Free-form sandbox' },
    caption: { zh: '输入任意函数，实时解析、求导、积分并绘制', en: 'Type any function — parse, differentiate, integrate, plot' },
    formula: function (p) {
      var r = slot(p, 'f1');
      return r.ok ? 'f_1(x) = ' + r.latex : 'f_1(x)\\ \\text{← 输入有误}';
    },
    controls: [
      { id: 'f1', type: 'text', label: { zh: 'f₁(x) =', en: 'f₁(x) =' }, value: SLOTS[0].def, color: SLOTS[0].color },
      { id: 'f2', type: 'text', label: { zh: 'f₂(x) =', en: 'f₂(x) =' }, value: SLOTS[1].def, color: SLOTS[1].color },
      { id: 'f3', type: 'text', label: { zh: 'f₃(x) =', en: 'f₃(x) =' }, value: SLOTS[2].def, color: SLOTS[2].color },
      {
        id: 'op', type: 'segment', label: { zh: '微积分运算', en: 'Calculus op' }, value: 'none',
        options: [
          { value: 'none', label: { zh: '无', en: 'None' } },
          { value: 'd', label: { zh: '求导 f′', en: "f′" } },
          { value: 'F', label: { zh: '原函数 ∫f', en: '∫f' } },
          { value: 'I', label: { zh: '定积分 ∫ₐᵇ', en: '∫ₐᵇ' } }
        ]
      },
      { id: 'a', type: 'range', label: { zh: '积分下限 a', en: 'Lower a' }, min: -6, max: 6, step: 0.1, value: -1 },
      { id: 'b', type: 'range', label: { zh: '积分上限 b', en: 'Upper b' }, min: -6, max: 6, step: 0.1, value: 2 },
      { id: 'eps', type: 'range', label: { zh: '常数扰动 ε', en: 'Perturbation ε' }, min: -0.4, max: 0.4, step: 0.02, value: 0 },
      { id: 'xL', type: 'range', label: { zh: '极限观察点', en: 'Limit point' }, min: -6, max: 6, step: 0.1, value: 0 },
      { id: 'probe', type: 'toggle', label: { zh: '显示探针', en: 'Probe' }, value: true },
      { id: 'tangent', type: 'toggle', label: { zh: '显示切线', en: 'Tangent line' }, value: true },
      { id: 'adaptive', type: 'toggle', label: { zh: '自适应采样', en: 'Adaptive sampling' }, value: true }
    ],
    view: { xMin: -8, xMax: 8, yMin: -5, yMax: 5 },
    legend: function (params) {
      var items = SLOTS.map(function (s) {
        var r = slot(params, s.id);
        return {
          color: s.color,
          label: { zh: s.id.replace('f', 'f') + '(x) = ' + (r.ok ? params[s.id] : '（输入有误）'), en: 'f(x) = ' + (r.ok ? params[s.id] : 'invalid') }
        };
      });
      if (params.op === 'd') items.push({ color: P.ink, label: { zh: '虚线：导函数 f′', en: 'Dashed: derivative f′' } });
      if (params.op === 'F') items.push({ color: P.violet, label: { zh: '虚线：原函数 F(x)=∫f', en: 'Dashed: antiderivative' } });
      if (params.op === 'I') items.push({ color: P.coral, label: { zh: '矩形：定积分 ∫ₐᵇ f', en: 'Riemann rectangles' } });
      if (Math.abs(params.eps) > 1e-6) items.push({ color: P.violet, label: { zh: '紫色虚线：常数扰动 (1+ε) 后的 f₁', en: 'Perturbed f₁' } });
      return items;
    },
    init: function (state) { state.px = 1.2; state.py = 0; state.hover = false; },
    onPointer: function (state, params, world) {
      state.px = world.x;
      state.py = world.y;
      state.hover = true;
      return true;
    },
    onKey: function (state, params, key, step, shift) {
      var k = shift ? step * 8 : step;
      if (key === 'ArrowLeft') { state.px -= k; return true; }
      if (key === 'ArrowRight') { state.px += k; return true; }
      if (key === 'ArrowUp') { state.py += k; return true; }
      if (key === 'ArrowDown') { state.py -= k; return true; }
      return false;
    },
    draw: function (plot, p, state) {
      plot.grid(); plot.axes();
      var parsed = SLOTS.map(function (s) { return { slot: s, r: slot(p, s.id) }; });
      var op = p.op || 'none';

      // ---- 主曲线（含常数扰动对照）----
      parsed.forEach(function (item, i) {
        if (!item.r.ok) return;
        plot.curve(item.r.fn, { color: item.slot.color, width: 2.3, adaptive: p.adaptive !== false });
      });
      if (Math.abs(p.eps) > 1e-6) {
        var pf = perturbedFn(p.f1, 1 + p.eps);
        if (pf) plot.curve(pf, { color: P.violet, width: 1.8, dash: [7, 5], adaptive: true, alpha: 0.9 });
      }

      // ---- 微积分运算结果 ----
      if (op === 'd') {
        parsed.forEach(function (item) {
          if (!item.r.ok) return;
          plot.curve(item.r.derivative, {
            color: item.slot.color, width: 1.8, dash: [6, 4], adaptive: true, alpha: 0.9
          });
        });
      } else if (op === 'F') {
        var fv = firstValid(p);
        if (fv) {
          var F = MC.antiderivative(fv.r.fn, 0, { steps: 300 });
          plot.curve(F, { color: P.violet, width: 2, dash: [7, 4], adaptive: true });
          plot.point(0, 0, { r: 4.5, fill: P.violet, stroke: P.paper });
          plot.label(0, 0, 'F(0)=0', { dx: 8, dy: 14, color: P.violet, font: '11px Consolas, monospace' });
        }
      } else if (op === 'I') {
        var fv2 = firstValid(p);
        if (fv2) {
          var lo = Math.min(p.a, p.b), hi = Math.max(p.a, p.b);
          var r = MC.riemann(fv2.r.fn, lo, hi, 24, 'mid');
          r.rectangles.forEach(function (rc) {
            if (!isFinite(rc.h)) return;
            plot.rect(rc.x0, 0, rc.x1, rc.h, {
              fill: rc.h >= 0 ? 'rgba(206,88,72,0.18)' : 'rgba(74,98,136,0.20)',
              stroke: rc.h >= 0 ? 'rgba(206,88,72,0.8)' : 'rgba(74,98,136,0.8)', width: 1
            });
          });
          plot.guide(p.a, plot.view.yMin, p.a, plot.view.yMax, { color: 'rgba(47,158,126,0.85)', dash: [] });
          plot.guide(p.b, plot.view.yMin, p.b, plot.view.yMax, { color: 'rgba(47,158,126,0.85)', dash: [] });
        }
      }

      // ---- 极限观察点 ----
      var xL = p.xL;
      plot.guide(xL, plot.view.yMin, xL, plot.view.yMax, { color: 'rgba(122,90,168,0.65)', dash: [4, 5] });
      plot.label(xL, plot.view.yMin, 'x→' + MC.formatFixed(xL, 1), { align: 'center', dy: -12, color: P.violet, font: '11px Consolas, monospace' });

      // ---- 探针 ----
      if (!p.probe) return;
      var x0 = isFinite(state.px) ? state.px : 0;
      plot.guide(x0, plot.view.yMin, x0, plot.view.yMax, { color: 'rgba(44,50,60,0.45)', dash: [5, 5] });
      parsed.forEach(function (item) {
        if (!item.r.ok) return;
        var y0 = item.r.fn(x0);
        if (!isFinite(y0)) return;
        var k = item.r.derivative(x0);
        if (p.tangent && isFinite(k)) {
          var span = (plot.view.xMax - plot.view.xMin) * 0.12;
          plot.segment(x0 - span, y0 - k * span, x0 + span, y0 + k * span,
            { color: item.slot.color, width: 1.4, alpha: 0.65 });
        }
        plot.point(x0, y0, { r: 5, fill: item.slot.color, stroke: P.paper, width: 1.4 });
        plot.label(x0, y0, '  (' + MC.formatNumber(x0, 3) + ', ' + MC.formatNumber(y0, 3) + ')',
          { dx: 10, dy: -13, color: item.slot.color, font: '11px Consolas, monospace' });
      });
    },
    readouts: function (p, state) {
      var x0 = isFinite(state.px) ? state.px : 0;
      var out = [{ label: { zh: '探针 x₀', en: 'probe x₀' }, value: MC.formatNumber(x0, 4) }];
      SLOTS.forEach(function (s, i) {
        var r = slot(p, s.id);
        if (!r.ok) {
          out.push({ label: { zh: 'f' + (i + 1) + '(x₀)', en: 'f' + (i + 1) }, value: '输入错误' });
          return;
        }
        var y = r.fn(x0);
        var k = r.derivative(x0);
        out.push({
          label: { zh: 'f' + (i + 1) + '(x₀) / f′', en: 'f' + (i + 1) + ' / f′' },
          value: (isFinite(y) ? MC.formatNumber(y, 4) : '无定义') + ' / ' +
                 (isFinite(k) ? MC.formatNumber(k, 4) : '—')
        });
      });

      var fv = firstValid(p);
      if (fv) {
        var op = p.op || 'none';
        if (op === 'I') {
          var lo = Math.min(p.a, p.b), hi = Math.max(p.a, p.b);
          var sum = MC.riemann(fv.r.fn, lo, hi, 24, 'mid').value;
          var exact = MC.simpson(fv.r.fn, lo, hi, 2000);
          out.push({
            label: { zh: '∫ₐᵇ f₁ (24 个矩形)', en: '∫ₐᵇ (24 rects)' },
            value: (isFinite(sum) ? MC.formatNumber(sum, 5) : '定义域外')
          });
          out.push({
            label: { zh: '精确值', en: 'exact' },
            value: (isFinite(exact) ? MC.formatNumber(exact, 5) : '定义域外')
          });
        }
        // 极限：两侧逼近
        var lim = MC.limitAt(fv.r.fn, p.xL);
        out.push({
          label: { zh: 'lim(x→' + MC.formatFixed(p.xL, 1) + ')', en: 'limit' },
          value: lim.diverges ? '发散' : (lim.twoSided ? MC.formatNumber(lim.value, 5) : '不存在（左右不等）')
        });
      }
      if (Math.abs(p.eps) > 1e-6) {
        var pf = perturbedFn(p.f1, 1 + p.eps);
        var base = slot(p, 'f1');
        if (pf && base.ok) {
          var maxDelta = 0;
          for (var i = -40; i <= 40; i++) {
            var xx = (i / 40) * 8;
            var a1 = base.fn(xx), b1 = pf(xx);
            if (isFinite(a1) && isFinite(b1)) maxDelta = Math.max(maxDelta, Math.abs(b1 - a1));
          }
          out.push({
            label: { zh: '扰动最大偏差 max|Δf|', en: 'max|Δf|' },
            value: MC.formatNumber(maxDelta, 4)
          });
        }
      }
      return out;
    },
    /** 概念闭环里额外渲染的"变量替换过程"（按顶层加减逐项给出导数与法则）。 */
    infoExtra: function (p) {
      var r = MC.toFunctionOfX(p.f1);
      if (!r.ok) return '<p class="hint">f₁ 输入有误，无法展示推导过程。</p>';
      var rows = MC.diffSteps(r.ast, 'x');
      var html = '<div class="steps"><div class="steps-title">变量替换过程 · d/dx [ ' + tex(r.latex) + ' ]</div>';
      rows.forEach(function (row) {
        html += '<div class="step-row">' +
          '<span class="step-term">' + tex(row.term) + '</span>' +
          '<span class="step-arrow">⟶</span>' +
          '<span class="step-res">' + tex(row.derivative) + '</span>' +
          '<span class="step-rule">' + row.rule + '</span></div>';
      });
      html += '</div>';
      return html;
    },
    info: {
      definition: {
        zh: '沙盒把「自由输入 → 实时解析 → 动态渲染」和「输入 → 微分/积分/极限 → 即时可视化」串成两条回路：字符串先被词法/语法分析成 AST，再编译成函数逐像素采样；**求导用符号微分**（精确），**定积分用黎曼和 + 辛普森参考值**，**极限用 h 递减序列左右逼近**。',
        en: 'The sandbox wires two loops: your string is parsed to an AST and compiled for per-pixel sampling; derivatives are **symbolic**, definite integrals use **Riemann sums with a Simpson reference**, and limits use **two-sided decreasing-h sequences**.'
      },
      geometry: {
        zh: '探针竖线与曲线的交点就是 $(x_0, f(x_0))$，同点切线斜率即 $f\'(x_0)$。切到「求导 f′」后虚线画出导函数——它是各点切线斜率的集合；「原函数 ∫f」画出 $F(x)=\\int_0^x f$，满足 $F\'=f$；「定积分 ∫ₐᵇ」用 24 个矩形逼近曲线下的面积，绿色竖线就是上下限。',
        en: 'The probe gives $(x_0,f(x_0))$ and the tangent slope $f\'(x_0)$. "f′" draws the derivative curve, "∫f" draws $F(x)=\\int_0^x f$ with $F\'=f$, and "∫ₐᵇ" approximates the area with 24 rectangles between the green limit lines.'
      },
      algebra: {
        zh: '支持隐式乘法（`2x`、`(x+1)(x-1)`）、右结合幂（`2^3^2 = 512`）、内置函数、常数 `pi e`、科学计数法与分数幂。右下角的"变量替换过程"会按顶层加减拆项，逐项给出导数与所用**法则**（幂函数法则 / 乘积法则 / 商法则 / 链式法则）。',
        en: 'Implicit multiplication, right-associative powers, built-in functions, `pi`/`e`, scientific notation and fractional powers are all supported. The step list decomposes the derivative term by term with the **rule** used.'
      },
      application: {
        zh: '常数扰动 ε 展示"参数微扰"如何移动极值与渐近线（敏感度分析的雏形）；极限面板则是数值方法判断连续性与可去间断点的实用手段。',
        en: 'The ε perturbation shows how small parameter changes move extrema and asymptotes (a first taste of sensitivity analysis); the limit panel is the numerical way to test continuity.'
      }
    }
  });
})(window);
