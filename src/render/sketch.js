/*!
 * sketch.js — 墨迹风格原语（视觉风格层）
 * 复刻参考视频的“手绘感”：低频谐波扰动 + 种子随机（保证每次重绘完全一致）。
 */
(function (root) {
  'use strict';

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** 抖动直线：返回折线点数组（屏幕坐标）。 */
  function jitterLine(x0, y0, x1, y1, o) {
    o = o || {};
    var amp = o.amp === undefined ? 3 : o.amp;
    var segments = o.segments || 14;
    var rand = mulberry32(o.seed === undefined ? 1 : o.seed);
    var dx = x1 - x0, dy = y1 - y0;
    var len = Math.hypot(dx, dy) || 1;
    var nx = -dy / len, ny = dx / len;
    var c = [rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1];
    var pts = [];
    for (var i = 0; i <= segments; i++) {
      var t = i / segments;
      var taper = Math.sin(Math.PI * t);
      var off = (c[0] * Math.sin(Math.PI * t) + c[1] * Math.sin(2 * Math.PI * t) +
        c[2] * Math.sin(3 * Math.PI * t) + c[3] * Math.sin(5 * Math.PI * t)) * amp * taper;
      pts.push([x0 + dx * t + nx * off, y0 + dy * t + ny * off]);
    }
    return pts;
  }

  /** 手绘椭圆点集。 */
  function wobblyEllipse(cx, cy, rx, ry, o) {
    o = o || {};
    var amp = o.amp === undefined ? 0.05 : o.amp;
    var steps = o.steps || 72;
    var rot = o.rotation || 0;
    var rand = mulberry32(o.seed === undefined ? 2 : o.seed);
    var p1 = rand() * Math.PI * 2, p2 = rand() * Math.PI * 2, p3 = rand() * Math.PI * 2;
    var cos = Math.cos(rot), sin = Math.sin(rot);
    var pts = [];
    for (var i = 0; i <= steps; i++) {
      var a = (i / steps) * Math.PI * 2;
      var k = 1 + amp * (Math.sin(3 * a + p1) * 0.55 + Math.sin(5 * a + p2) * 0.3 + Math.sin(7 * a + p3) * 0.15);
      var x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
      pts.push([cx + x * cos - y * sin, cy + x * sin + y * cos]);
    }
    return pts;
  }

  /** 粒子/墨点环。 */
  function particleRing(cx, cy, rx, ry, count, o) {
    o = o || {};
    var rand = mulberry32(o.seed === undefined ? 3 : o.seed);
    var spread = o.spread === undefined ? 0.18 : o.spread;
    var out = [];
    for (var i = 0; i < count; i++) {
      var a = (i / count) * Math.PI * 2 + (rand() * 2 - 1) * 0.06;
      var k = 1 + (rand() * 2 - 1) * spread;
      out.push({
        x: cx + Math.cos(a) * rx * k,
        y: cy + Math.sin(a) * ry * k,
        r: 0.6 + rand() * 1.8,
        o: 0.25 + rand() * 0.5
      });
    }
    return out;
  }

  /** 用折线点集描一条墨迹。 */
  function stroke(ctx, pts, o) {
    o = o || {};
    if (!pts || pts.length < 2) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.strokeStyle = o.color || '#20262f';
    ctx.lineWidth = o.width === undefined ? 1.4 : o.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (o.dash) ctx.setLineDash(o.dash);
    if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
    if (o.close) ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  root.Sketch = {
    mulberry32: mulberry32,
    jitterLine: jitterLine,
    wobblyEllipse: wobblyEllipse,
    particleRing: particleRing,
    stroke: stroke
  };
})(typeof self !== 'undefined' ? self : this);
