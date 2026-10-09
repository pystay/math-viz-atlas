/*!
 * tests/bench.js — 性能基准（数学逻辑层热路径）
 * 目的：证明“参数变化 → 重绘一帧”的计算成本远低于 16.67ms（60FPS 预算）。
 * 运行：node tests/bench.js
 */
'use strict';

var MC = require('../src/core/math-core.js');

function bench(label, iterations, fn) {
  // 预热
  for (var w = 0; w < 3; w++) fn();
  var t0 = process.hrtime.bigint();
  for (var i = 0; i < iterations; i++) fn();
  var t1 = process.hrtime.bigint();
  var msPerOp = Number(t1 - t0) / 1e6 / iterations;
  console.log('  ' + label.padEnd(46) + msPerOp.toFixed(5) + ' ms/次');
  return msPerOp;
}

console.log('\n== 数学逻辑层性能基准（Node ' + process.version + '）==\n');

// 1. 冷路径：切换函数/参数时重新符号求导 + 化简 + LaTeX
var funcs = ['x^2', 'x^3', 'sin(x)', 'e^x', 'ln(x)'];
var cold = bench('符号求导 + 化简 + LaTeX（切函数时）', 2000, function () {
  for (var i = 0; i < funcs.length; i++) {
    var d = MC.simplify(MC.diff(MC.parse(funcs[i]), 'x'));
    MC.toLatex(d);
  }
});

// 2. 热路径：曲线采样（1440 px 画布 = 每像素一列）
var compiled = MC.compile(MC.parse('sin(x)'));
var curve = bench('曲线采样 1440 点（每像素一列）', 2000, function () {
  var s = 0;
  for (var px = 0; px < 1440; px++) s += compiled({ x: -3 + (px / 1440) * 6 });
  return s;
});

// 3. 热路径：黎曼和 n=80
var f = MC.functionOfX('x^2');
var riemann80 = bench('黎曼和 n=80（积分模块每帧）', 2000, function () {
  return MC.riemann(f, 0, 1.5, 80, 'mid').value;
});

// 4. 热路径：级数 n=500（调和级数模块最坏情况）
var harm500 = bench('调和级数 n=500（每帧）', 2000, function () {
  return MC.harmonicPartial(500).value;
});

// 5. 辛普森参考值 n=2000（积分模块每帧调用一次）
var simp = bench('辛普森积分 n=2000（每帧参考值）', 500, function () {
  return MC.simpson(f, 0, 1.5, 2000);
});

var worstFrame = curve + riemann80 + simp + harm500;
console.log('\n  一帧最坏情况合计估算（曲线 + 黎曼和 + 辛普森 + 调和级数）：' + worstFrame.toFixed(4) + ' ms');
console.log('  60FPS 预算：16.67 ms　→　占用 ' + ((worstFrame / 16.67) * 100).toFixed(2) + '%');
console.log('  30FPS 预算：33.33 ms　→　占用 ' + ((worstFrame / 33.33) * 100).toFixed(2) + '%');
console.log('  冷路径（符号求导×5）仅在参数变化时发生：' + cold.toFixed(4) + ' ms\n');

if (worstFrame > 16.67) {
  console.log('!! 超出 60FPS 预算，需要优化');
  process.exitCode = 1;
} else {
  console.log('OK: 数学计算层远低于 60FPS 预算，瓶颈只可能在 Canvas 绘制本身。\n');
}
