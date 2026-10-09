/*!
 * plot.js — 绘图引擎（可视化渲染层）
 * ---------------------------------------------------------------------------
 * 职责单一：世界坐标 ⇄ 屏幕坐标、网格/坐标轴、曲线采样、面积与矩形、标注。
 * 不含任何数学定义（由 math-core 提供），也不含任何 UI 控件（由 app.js 提供）。
 *
 * 性能策略：
 *   - devicePixelRatio 适配，最多 2x（低端设备不至于爆填充率）
 *   - 曲线按“每像素一列”采样，天然与画布宽度解耦
 *   - 网格步长按像素密度自适应（网格过密时自动降级为 2/5 倍步长）
 */
(function (root) {
  'use strict';

  var PALETTE = {
    paper: '#FBF7EF',
    panel: '#FFFDF8',
    grid: 'rgba(120,110,96,0.10)',
    gridMajor: 'rgba(120,110,96,0.22)',
    axis: 'rgba(44,50,60,0.55)',
    ink: '#20262f',
    muted: '#6b7280',
    coral: '#CE5848',
    coralSoft: 'rgba(206,88,72,0.22)',
    cobalt: '#4A6288',
    cobaltSoft: 'rgba(74,98,136,0.18)',
    mint: '#2F9E7E',
    mintSoft: 'rgba(47,158,126,0.20)',
    amber: '#C08A2E',
    violet: '#7A5AA8'
  };

  function create(canvas) {
    var ctx = canvas.getContext('2d');
    var view = { xMin: -6, xMax: 6, yMin: -4, yMax: 4 };
    var size = { w: 1, h: 1, dpr: 1 };
    // 动效状态：reveal = 曲线描边生成进度；ambient = 背景活力层
    var reveal = 1;
    var ambient = { on: false, t: 0, alpha: 0.05, drift: 0.06, gridPulse: 0.22 };

    function resize() {
      var dpr = Math.min(root.devicePixelRatio || 1, 2);
      var rect = canvas.getBoundingClientRect();
      size.w = Math.max(1, Math.round(rect.width));
      size.h = Math.max(1, Math.round(rect.height));
      size.dpr = dpr;
      canvas.width = Math.round(size.w * dpr);
      canvas.height = Math.round(size.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function sx(x) { return ((x - view.xMin) / (view.xMax - view.xMin)) * size.w; }
    function sy(y) { return size.h - ((y - view.yMin) / (view.yMax - view.yMin)) * size.h; }
    function wx(px) { return view.xMin + (px / size.w) * (view.xMax - view.xMin); }
    function wy(py) { return view.yMin + ((size.h - py) / size.h) * (view.yMax - view.yMin); }

    function setView(v) {
      if (v.xMin !== undefined) view.xMin = v.xMin;
      if (v.xMax !== undefined) view.xMax = v.xMax;
      if (v.yMin !== undefined) view.yMin = v.yMin;
      if (v.yMax !== undefined) view.yMax = v.yMax;
    }

    /** 等比设置视窗：保证 x/y 单位长度一致（圆是圆）。 */
    function setSquareView(cx, cy, halfWidth) {
      var halfHeight = halfWidth * (size.h / size.w);
      view.xMin = cx - halfWidth; view.xMax = cx + halfWidth;
      view.yMin = cy - halfHeight; view.yMax = cy + halfHeight;
    }

    function niceStep(range, px) {
      var raw = (range * 64) / Math.max(1, px);
      var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
      var n = raw / mag;
      var m = n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10;
      return m * mag;
    }

    function background() {
      ctx.save();
      ctx.fillStyle = PALETTE.paper;
      ctx.fillRect(0, 0, size.w, size.h);
      if (ambient.on && ambient.alpha > 0.001) {
        // 环境活力层：两团极慢漂移的低对比度光斑（呼吸感，约 24s 一个循环）
        // 只填光斑包围盒，避免整屏渐变带来的填充率开销
        var ph = ambient.t * 0.26;
        var d = ambient.drift;
        blob(
          size.w * (0.28 + d * Math.sin(ph)),
          size.h * (0.34 + d * Math.cos(ph * 0.83)),
          Math.max(size.w, size.h) * 0.20, '74,98,136', ambient.alpha
        );
        blob(
          size.w * (0.74 + d * Math.cos(ph * 0.71 + 1.7)),
          size.h * (0.68 + d * Math.sin(ph * 0.59 + 0.6)),
          Math.max(size.w, size.h) * 0.17, '206,88,72', ambient.alpha * 0.75
        );
      }
      ctx.restore();
    }

    /** 一团径向渐变光斑（填充范围裁剪到画布内，控制填充率）。 */
    function blob(cx, cy, r, rgb, alpha) {
      var x0 = Math.max(0, cx - r), y0 = Math.max(0, cy - r);
      var x1 = Math.min(size.w, cx + r), y1 = Math.min(size.h, cy + r);
      if (x1 <= x0 || y1 <= y0) return;
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(' + rgb + ',' + alpha.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.fillStyle = g;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }

    function setReveal(t) { reveal = t < 0 ? 0 : (t > 1 ? 1 : t); }
    function getReveal() { return reveal; }
    function setAmbient(o) {
      if (!o) return;
      if (o.on !== undefined) ambient.on = !!o.on;
      if (o.t !== undefined) ambient.t = o.t;
      if (o.alpha !== undefined) ambient.alpha = o.alpha;
      if (o.drift !== undefined) ambient.drift = o.drift;
      if (o.gridPulse !== undefined) ambient.gridPulse = o.gridPulse;
    }
    function ambientOn() { return ambient.on; }

    function grid(o) {
      o = o || {};
      var stepX = niceStep(view.xMax - view.xMin, size.w);
      var stepY = niceStep(view.yMax - view.yMin, size.h);
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = PALETTE.grid;
      ctx.beginPath();
      for (var x = Math.ceil(view.xMin / stepX) * stepX; x <= view.xMax; x += stepX) {
        var px = Math.round(sx(x)) + 0.5;
        ctx.moveTo(px, 0); ctx.lineTo(px, size.h);
      }
      for (var y = Math.ceil(view.yMin / stepY) * stepY; y <= view.yMax; y += stepY) {
        var py = Math.round(sy(y)) + 0.5;
        ctx.moveTo(0, py); ctx.lineTo(size.w, py);
      }
      ctx.stroke();
      // 主网格（5 倍步长）稍深，保持"方格纸"层次；活力开启时做极轻微的呼吸
      ctx.save();
      if (ambient.on) {
        ctx.globalAlpha = 1 + ambient.gridPulse * 0.6 * Math.sin(ambient.t * 0.30);
      }
      ctx.strokeStyle = PALETTE.gridMajor;
      ctx.beginPath();
      for (var x2 = Math.ceil(view.xMin / (stepX * 5)) * stepX * 5; x2 <= view.xMax; x2 += stepX * 5) {
        var px2 = Math.round(sx(x2)) + 0.5;
        ctx.moveTo(px2, 0); ctx.lineTo(px2, size.h);
      }
      for (var y2 = Math.ceil(view.yMin / (stepY * 5)) * stepY * 5; y2 <= view.yMax; y2 += stepY * 5) {
        var py2 = Math.round(sy(y2)) + 0.5;
        ctx.moveTo(0, py2); ctx.lineTo(size.w, py2);
      }
      ctx.stroke();
      ctx.restore();
      ctx.restore();
      return { stepX: stepX, stepY: stepY };
    }

    function axes(o) {
      o = o || {};
      var stepX = niceStep(view.xMax - view.xMin, size.w);
      var stepY = niceStep(view.yMax - view.yMin, size.h);
      ctx.save();
      ctx.strokeStyle = PALETTE.axis;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      var y0 = Math.round(sy(0)) + 0.5, x0 = Math.round(sx(0)) + 0.5;
      ctx.moveTo(0, y0); ctx.lineTo(size.w, y0);
      ctx.moveTo(x0, 0); ctx.lineTo(x0, size.h);
      ctx.stroke();

      ctx.fillStyle = PALETTE.muted;
      ctx.font = '11px Consolas, "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      var decimals = stepX < 0.1 ? 2 : stepX < 1 ? 1 : 0;
      for (var x = Math.ceil(view.xMin / stepX) * stepX; x <= view.xMax; x += stepX) {
        if (Math.abs(x) < stepX / 2) continue;
        ctx.fillText(x.toFixed(decimals), sx(x), Math.min(size.h - 14, Math.max(2, sy(0) + 5)));
      }
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      var decimalsY = stepY < 0.1 ? 2 : stepY < 1 ? 1 : 0;
      for (var y = Math.ceil(view.yMin / stepY) * stepY; y <= view.yMax; y += stepY) {
        if (Math.abs(y) < stepY / 2) continue;
        ctx.fillText(y.toFixed(decimalsY), Math.max(24, Math.min(size.w - 6, sx(0) - 7)), sy(y));
      }
      ctx.restore();
    }

    /**
     * 绘制函数曲线。
     * 基础采样是"每像素一列"；adaptive 开启时对每个像素区间做递归二分：
     * 只要中点偏离弦高超过 0.6px 就继续细分（最多 maxDepth 层）。
     * 于是垂直渐近线附近与高频振荡区会自动加密，平坦区保持廉价。
     * 遇到 NaN/∞ 或跨屏跳变则断笔，避免"跨渐近线的假连线"。
     */
    function curve(f, o) {
      o = o || {};
      var width = o.width === undefined ? 2 : o.width;
      var color = o.color || PALETTE.ink;
      var adaptive = o.adaptive !== false;
      var maxDepth = o.maxDepth === undefined ? 4 : o.maxDepth;
      var stepPx = o.stepPx || 1;
      var jumpLimit = o.jumpLimit || size.h * 1.5;
      var from = o.from === undefined ? view.xMin : o.from;
      var to = o.to === undefined ? view.xMax : o.to;

      ctx.save();
      // 描边生成特效：reveal < 1 时只画左侧 reveal 比例的区域（"曲线正在被画出来"）
      if (reveal < 0.999) {
        ctx.beginPath();
        ctx.rect(0, 0, size.w * reveal, size.h);
        ctx.clip();
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (o.dash) ctx.setLineDash(o.dash);
      if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
      ctx.beginPath();

      var drawing = false;
      function emit(px, py) {
        if (!drawing) { ctx.moveTo(px, py); drawing = true; }
        else ctx.lineTo(px, py);
      }
      function evalAt(px) {
        var x = wx(px);
        if (x < from - 1e-9 || x > to + 1e-9) return NaN;
        var y = f(x);
        if (!isFinite(y)) return NaN;
        var py = sy(y);
        if (py < -size.h * 4 || py > size.h * 5) return NaN;
        return py;
      }
      function walk(px0, py0, px1, py1, depth) {
        if (adaptive && depth < maxDepth && px1 - px0 > 0.04) {
          var mid = (px0 + px1) / 2;
          var pym = evalAt(mid);
          if (isFinite(pym) && Math.abs(pym - (py0 + py1) / 2) > 0.6) {
            walk(px0, py0, mid, pym, depth + 1);
            walk(mid, pym, px1, py1, depth + 1);
            return;
          }
        }
        emit(px1, py1);
      }

      var prevPy = null;
      for (var px = 0; px <= size.w; px += stepPx) {
        var py = evalAt(px);
        if (!isFinite(py)) { drawing = false; prevPy = null; continue; }
        if (prevPy === null) {
          emit(px, py);
        } else if (Math.abs(py - prevPy) > jumpLimit) {
          drawing = false;
          emit(px, py);
        } else {
          walk(px - stepPx, prevPy, px, py, 0);
        }
        prevPy = py;
      }
      ctx.stroke();
      ctx.restore();
    }

    /** 带箭头的向量（屏幕空间画箭头，世界空间定端点）。 */
    function arrow(x0, y0, x1, y1, o) {
      o = o || {};
      var color = o.color || PALETTE.cobalt;
      var width = o.width === undefined ? 2 : o.width;
      var head = o.head === undefined ? 9 : o.head;
      var x0s = sx(x0), y0s = sy(y0), x1s = sx(x1), y1s = sy(y1);
      var dx = x1s - x0s, dy = y1s - y0s;
      var len = Math.hypot(dx, dy);
      if (len < 0.5) return;
      var ux = dx / len, uy = dy / len;
      var hl = Math.min(head, len * 0.45);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0s, y0s);
      ctx.lineTo(x1s - ux * hl * 0.6, y1s - uy * hl * 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x1s, y1s);
      ctx.lineTo(x1s - ux * hl - uy * hl * 0.42, y1s - uy * hl + ux * hl * 0.42);
      ctx.lineTo(x1s - ux * hl + uy * hl * 0.42, y1s - uy * hl - ux * hl * 0.42);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
    }

    /** 以世界坐标点为中心缩放（滚轮缩放用）。 */
    function zoomAt(cx, cy, factor) {
      var spanX = (view.xMax - view.xMin) * factor;
      var spanY = (view.yMax - view.yMin) * factor;
      if (spanX < 1e-4 || spanY < 1e-4 || spanX > 1e7 || spanY > 1e7) return false;
      view.xMin = cx - (cx - view.xMin) * factor;
      view.xMax = cx + (view.xMax - cx) * factor;
      view.yMin = cy - (cy - view.yMin) * factor;
      view.yMax = cy + (view.yMax - cy) * factor;
      return true;
    }

    function panBy(dxWorld, dyWorld) {
      view.xMin += dxWorld; view.xMax += dxWorld;
      view.yMin += dyWorld; view.yMax += dyWorld;
    }

    function segment(x0, y0, x1, y1, o) {
      o = o || {};
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(sx(x0), sy(y0));
      ctx.lineTo(sx(x1), sy(y1));
      ctx.strokeStyle = o.color || PALETTE.ink;
      ctx.lineWidth = o.width === undefined ? 1.5 : o.width;
      if (o.dash) ctx.setLineDash(o.dash);
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    }

    function rect(x0, y0, x1, y1, o) {
      o = o || {};
      var left = sx(Math.min(x0, x1)), right = sx(Math.max(x0, x1));
      var top = sy(Math.max(y0, y1)), bottom = sy(Math.min(y0, y1));
      ctx.save();
      if (o.fill) { ctx.fillStyle = o.fill; ctx.fillRect(left, top, right - left, bottom - top); }
      if (o.stroke) {
        ctx.strokeStyle = o.stroke;
        ctx.lineWidth = o.width === undefined ? 1 : o.width;
        ctx.strokeRect(Math.round(left) + 0.5, Math.round(top) + 0.5, Math.max(1, right - left - 1), Math.max(1, bottom - top - 1));
      }
      ctx.restore();
    }

    /** 曲线与 x 轴之间的填充（用于积分与面积直观）。 */
    function areaUnder(f, a, b, o) {
      o = o || {};
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(sx(a), sy(0));
      var steps = Math.max(2, Math.round(Math.abs(sx(b) - sx(a))));
      for (var i = 0; i <= steps; i++) {
        var x = a + ((b - a) * i) / steps;
        var y = f(x);
        if (!isFinite(y)) continue;
        ctx.lineTo(sx(x), sy(y));
      }
      ctx.lineTo(sx(b), sy(0));
      ctx.closePath();
      ctx.fillStyle = o.fill || PALETTE.coralSoft;
      ctx.fill();
      if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = 1; ctx.stroke(); }
      ctx.restore();
    }

    function point(x, y, o) {
      o = o || {};
      // r 为屏幕像素；若给 rWorld 则按世界坐标换算（图形随缩放同步变化）
      var radius = o.rWorld !== undefined
        ? Math.abs(sx(x + o.rWorld) - sx(x))
        : (o.r || 4);
      ctx.save();
      ctx.beginPath();
      ctx.arc(sx(x), sy(y), radius, 0, Math.PI * 2);
      if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
      if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.width || 1.4; ctx.stroke(); }
      ctx.restore();
    }

    function label(x, y, text, o) {
      o = o || {};
      ctx.save();
      ctx.font = o.font || '13px "Cambria Math", Georgia, serif';
      ctx.fillStyle = o.color || PALETTE.ink;
      ctx.textAlign = o.align || 'left';
      ctx.textBaseline = o.baseline || 'middle';
      var px = sx(x) + (o.dx || 0);
      var py = sy(y) + (o.dy || 0);
      if (o.background) {
        var w = ctx.measureText(text).width;
        var pad = 4;
        var bx = o.align === 'center' ? px - w / 2 : o.align === 'right' ? px - w : px;
        ctx.fillStyle = o.background;
        ctx.fillRect(bx - pad, py - 9, w + pad * 2, 18);
        ctx.fillStyle = o.color || PALETTE.ink;
      }
      ctx.fillText(text, px, py);
      ctx.restore();
    }

    function guide(x0, y0, x1, y1, o) {
      o = o || {};
      segment(x0, y0, x1, y1, { color: o.color || PALETTE.muted, width: o.width || 1, dash: o.dash || [4, 4] });
    }

    /** 斜率三角形：直观呈现“Δy/Δx”。 */
    function slopeTriangle(x, y, dx, dy, o) {
      o = o || {};
      var color = o.color || PALETTE.cobalt;
      guide(x, y, x + dx, y, { color: color, dash: [5, 4] });
      guide(x + dx, y, x + dx, y + dy, { color: color, dash: [5, 4] });
      segment(x, y, x + dx, y + dy, { color: color, width: 1.6 });
      if (o.labels !== false) {
        label(x + dx / 2, y, 'Δx = ' + (dx > 0 ? '+' : '') + dx.toFixed(2), { align: 'center', dy: 16, color: color, font: '12px Consolas, monospace' });
        label(x + dx, y + dy / 2, 'Δy = ' + (dy >= 0 ? '+' : '') + dy.toFixed(2), { align: 'left', dx: 8, color: color, font: '12px Consolas, monospace' });
      }
    }

    function clear() { ctx.clearRect(0, 0, size.w, size.h); }

    function frame(drawFn) {
      clear();
      background();
      drawFn();
    }

    return {
      ctx: ctx, canvas: canvas, palette: PALETTE,
      resize: resize, setView: setView, setSquareView: setSquareView, view: view, size: size,
      sx: sx, sy: sy, wx: wx, wy: wy,
      clear: clear, frame: frame, background: background, grid: grid, axes: axes,
      curve: curve, segment: segment, rect: rect, areaUnder: areaUnder,
      point: point, label: label, guide: guide, slopeTriangle: slopeTriangle,
      arrow: arrow, zoomAt: zoomAt, panBy: panBy,
      setReveal: setReveal, getReveal: getReveal, setAmbient: setAmbient, ambientOn: ambientOn
    };
  }

  root.Plot = { create: create, PALETTE: PALETTE };
})(typeof self !== 'undefined' ? self : this);
