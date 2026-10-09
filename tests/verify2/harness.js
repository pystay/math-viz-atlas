/*!
 * tests/verify2/harness.js — 对抗性数学审计的公共加载器（只读 src，不修改）
 *
 * 提供：
 *   loadModule(file, inject)  —— 用 vm 在最小 window stub 下加载浏览器风格 IIFE；
 *                                inject 代码被插到 IIFE 末尾之前，用于把闭包内部函数
 *                                （如 algebra2 的 solveQuad）导出，保证测的是**真实源码**。
 *   makePlot(opt)             —— 记录型 plot mock：捕获 segment/rect/point/label/guide/arrow/curve
 *                                以及 canvas ctx 路径（供 geometry2 / solid-3d / stats 的 draw 回放）。
 *   ok/note/tally             —— 计数与结果收集。
 *
 * 说明：inject 只是把源码字符串在内存里追加一句导出语句，磁盘上的 src/ 不被改动。
 */
'use strict';
var fs = require('fs'), vm = require('vm'), path = require('path');
var MC = require('../../src/core/math-core.js');
var ROOT = path.resolve(__dirname, '../../');

var PALETTE = {
  paper: '#FBF7EF', panel: '#FFFDF8', grid: 'rgba(120,110,96,0.10)', gridMajor: 'rgba(120,110,96,0.22)',
  axis: 'rgba(44,50,60,0.55)', ink: '#20262f', muted: '#6b7280', coral: '#CE5848',
  coralSoft: 'rgba(206,88,72,0.22)', cobalt: '#4A6288', cobaltSoft: 'rgba(74,98,136,0.18)',
  mint: '#2F9E7E', mintSoft: 'rgba(47,158,126,0.20)', amber: '#C08A2E', violet: '#7A5AA8'
};

/** 加载一个模块文件；返回该文件注册的模块数组，并把 window.__x 暴露为 .__exports */
function loadModule(file, inject) {
  var code = fs.readFileSync(path.join(ROOT, file), 'utf8');
  if (inject) {
    var m = code.match(/\}\)\(window\);\s*$/);
    if (!m) throw new Error('无法定位 IIFE 结尾: ' + file);
    code = code.replace(/\}\)\(window\);\s*$/, inject + '\n})(window);');
  }
  var reg = [];
  var sandbox = {
    Math: Math, isFinite: isFinite, Number: Number, JSON: JSON, String: String, Object: Object,
    Array: Array, parseFloat: parseFloat, Error: Error, SyntaxError: SyntaxError, console: console,
    window: {
      MS: { modules: reg, register: function (mod) { reg.push(mod); return mod; } },
      Plot: { PALETTE: PALETTE },
      MathCore: MC,
      Sketch: { mulberry32: function () { return function () { return 0.5; }; }, wobblyEllipse: function () { return []; }, stroke: function () { }, jitterLine: function () { return []; }, particleRing: function () { return []; } }
    }
  };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: file });
  reg.__exports = sandbox.window.__export;
  return reg;
}

function byId(mods, id) {
  for (var i = 0; i < mods.length; i++) if (mods[i].id === id) return mods[i];
  return null;
}

/** 记录型 plot mock。view 可传入；size 默认 800x600。 */
function makePlot(view) {
  var v = view || { xMin: -8, xMax: 8, yMin: -5, yMax: 5 };
  var size = { w: 800, h: 600, dpr: 1 };
  function sx(x) { return ((x - v.xMin) / (v.xMax - v.xMin)) * size.w; }
  function sy(y) { return size.h - ((y - v.yMin) / (v.yMax - v.yMin)) * size.h; }
  var rec = { grid: [], axes: [], segments: [], rects: [], points: [], labels: [], guides: [], arrows: [], curves: [], paths: [] };
  var pathBuf = [];
  function push(fn, args, o) { rec[fn].push({ args: Array.prototype.slice.call(args), o: o || {} }); }
  var ctx = {
    save: function () { }, restore: function () { }, beginPath: function () { pathBuf = []; },
    moveTo: function (x, y) { pathBuf.push({ op: 'M', x: x, y: y }); },
    lineTo: function (x, y) { pathBuf.push({ op: 'L', x: x, y: y }); },
    closePath: function () { pathBuf.push({ op: 'Z' }); },
    fill: function () { rec.paths.push({ op: 'fill', pts: pathBuf.slice(), style: ctx.fillStyle }); },
    stroke: function () { rec.paths.push({ op: 'stroke', pts: pathBuf.slice(), style: ctx.strokeStyle }); },
    arc: function () { }, fillRect: function () { }, strokeRect: function () { }, clearRect: function () { },
    fillText: function () { }, measureText: function () { return { width: 10 }; },
    setLineDash: function () { }, setTransform: function () { },
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', globalAlpha: 1, lineJoin: '', lineCap: ''
  };
  var plot = {
    ctx: ctx, canvas: {}, palette: PALETTE, view: v, size: size,
    sx: sx, sy: sy,
    wx: function (px) { return v.xMin + (px / size.w) * (v.xMax - v.xMin); },
    wy: function (py) { return v.yMin + ((size.h - py) / size.h) * (v.yMax - v.yMin); },
    resize: function () { }, setView: function (nv) {
      if (nv.xMin !== undefined) v.xMin = nv.xMin;
      if (nv.xMax !== undefined) v.xMax = nv.xMax;
      if (nv.yMin !== undefined) v.yMin = nv.yMin;
      if (nv.yMax !== undefined) v.yMax = nv.yMax;
    },
    setSquareView: function (cx, cy, hw) {
      var hh = hw * (size.h / size.w);
      v.xMin = cx - hw; v.xMax = cx + hw; v.yMin = cy - hh; v.yMax = cy + hh;
    },
    clear: function () { }, frame: function (f) { f(); }, background: function () { },
    grid: function (o) { push('grid', arguments, o); return { stepX: 1, stepY: 1 }; },
    axes: function (o) { push('axes', arguments, o); },
    curve: function (f, o) { push('curves', [f, o], o); },
    segment: function () { push('segments', arguments, arguments[4]); },
    rect: function () { push('rects', arguments, arguments[4]); },
    areaUnder: function () { }, point: function () { push('points', arguments, arguments[2]); },
    label: function () { push('labels', arguments, arguments[3]); },
    guide: function () { push('guides', arguments, arguments[4]); },
    slopeTriangle: function () { }, arrow: function () { push('arrows', arguments, arguments[4]); },
    zoomAt: function () { return false; }, panBy: function () { }
  };
  plot.rec = rec;
  return plot;
}

/* ---------------------------------------------------------------- 计数 */
var state = { checks: 0, findings: [] };
function check(label, cond, detail) {
  state.checks++;
  if (!cond) state.findings.push({ label: label, detail: detail });
  return !!cond;
}
function note(cat, sev, msg, detail) {
  state.findings.push({ cat: cat, sev: sev, msg: msg, detail: detail });
}
function report(name) {
  console.log('\n---- ' + name + '：独立检查 ' + state.checks + ' 项，异常 ' + state.findings.length + ' 条 ----');
  state.findings.forEach(function (f) {
    console.log('  [' + (f.sev || f.cat || '?') + '] ' + (f.label || f.msg) + (f.detail !== undefined ? '  → ' + f.detail : ''));
  });
  return state;
}
function reset() { state = { checks: 0, findings: [] }; return state; }

module.exports = {
  MC: MC, ROOT: ROOT, PALETTE: PALETTE,
  loadModule: loadModule, byId: byId, makePlot: makePlot,
  check: check, note: note, report: report, reset: reset,
  get checks() { return state.checks; },
  get findings() { return state.findings; }
};
