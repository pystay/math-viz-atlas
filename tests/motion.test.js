/*!
 * tests/motion.test.js — 动效引擎单元测试
 * ---------------------------------------------------------------------------
 * 覆盖 Rules 里对动效的硬性要求：
 *   · 缓动函数是纯函数（端点、单调、有界）
 *   · 补间时长可控、可重定向（retarget 时不跳变 → "动画中断平滑过渡"）
 *   · 可取消（用户手动输入立刻接管）
 * 运行：node tests/motion.test.js
 */
'use strict';

global.self = global;                       // 模块是浏览器 IIFE，挂在 self 上
require('../src/render/motion.js');
var Motion = global.Motion;

var passed = 0, failed = 0;
function group(n) { console.log('\n== ' + n + ' =='); }
function ok(label, cond, extra) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; console.log('  ✗ ' + label + (extra !== undefined ? '  → ' + extra : '')); }
}

console.log('\n===== 动效引擎（补间管理器）单元测试 =====');

// ---------------------------------------------------------------------------
group('1. 缓动函数：端点精确、区间内有界');
Object.keys(Motion.EASINGS).forEach(function (name) {
  var f = Motion.EASINGS[name];
  var startOk = Math.abs(f(0)) < 1e-12;
  var endOk = Math.abs(f(1) - 1) < 1e-12;
  var bounded = true;
  for (var i = 0; i <= 100; i++) {
    var v = f(i / 100);
    if (!isFinite(v) || v < -0.15 || v > 1.15) bounded = false;   // 允许 easeOutBack 轻微过冲
  }
  ok(name + '：f(0)=0、f(1)=1、区间有界', startOk && endOk && bounded,
    'f(0)=' + f(0) + ' f(1)=' + f(1));
});
ok('easeInOutCubic 在中点为 0.5（对称）',
  Math.abs(Motion.EASINGS.easeInOutCubic(0.5) - 0.5) < 1e-12);

// ---------------------------------------------------------------------------
group('2. 补间：时长、插值、完成判定（注入时钟，确定性）');
var clock = 1000;
var m = Motion.create();
m.now = function () { return clock; };

m.to('a', 10, { from: 0, dur: 100, ease: 'linear' });
ok('t=0 时值为起点', m.value('a', null) === 0, m.value('a', null));
clock = 1050;
ok('t=50（中点）时 linear 值为 5', Math.abs(m.value('a', null) - 5) < 1e-9, m.value('a', null));
ok('t=50 时 has() 为 true（仍在动画中）', m.has('a') === true);
clock = 1100;
ok('t=100 时到达终点', Math.abs(m.value('a', null) - 10) < 1e-9, m.value('a', null));
ok('完成后 has() 为 false', m.has('a') === false);
ok('完成后 value 返回终值', m.value('a', 999) === 10);
clock = 1200;
ok('update() 在动画结束后返回 false', m.update() === false);

// ---------------------------------------------------------------------------
group('3. 重定向（retarget）：动画中途改目标不跳变 —— 对应"动画中断平滑过渡"');
clock = 2000;
var m2 = Motion.create();
m2.now = function () { return clock; };
m2.to('k', 100, { from: 0, dur: 100, ease: 'linear' });
clock = 2050;
var mid = m2.value('k', null);
ok('中途值 = 50', Math.abs(mid - 50) < 1e-9, mid);
// 在动画进行到一半时改目标：必须以"当前值"为新起点
m2.to('k', 200, { dur: 100, ease: 'linear' });
ok('重定向瞬间的值连续（仍为 50，无跳变）', Math.abs(m2.value('k', null) - 50) < 1e-9, m2.value('k', null));
clock = 2150;
ok('重定向后 100ms（从重定向时刻起算）到达新目标 200', Math.abs(m2.value('k', null) - 200) < 1e-9, m2.value('k', null));

// ---------------------------------------------------------------------------
group('4. 取消：用户手动输入立刻接管');
clock = 3000;
var m3 = Motion.create();
m3.now = function () { return clock; };
m3.to('p:k', 5, { from: 1, dur: 400, ease: 'linear' });
clock = 3100;
ok('取消前处于动画中', m3.has('p:k') === true);
m3.cancel('p:k');
ok('取消后 has() = false', m3.has('p:k') === false);
ok('取消后 value 返回调用方给的当前值（用户输入优先）', m3.value('p:k', 3.14) === 3.14, m3.value('p:k', 3.14));
ok('取消后 activeKeys 为空', m3.activeKeys().length === 0, JSON.stringify(m3.activeKeys()));

// ---------------------------------------------------------------------------
group('5. 多键并行与 activeKeys（相机过渡 4 个分量同时跑）');
clock = 4000;
var m4 = Motion.create();
m4.now = function () { return clock; };
['view.xMin', 'view.xMax', 'view.yMin', 'view.yMax'].forEach(function (k) {
  m4.to(k, 10, { from: 0, dur: 380, ease: 'easeInOutCubic' });
});
ok('4 个分量同时在跑', m4.activeKeys().length === 4, JSON.stringify(m4.activeKeys()));
ok('animating() = true', m4.animating() === true);
clock = 4400;
ok('时长过后全部结束', m4.animating() === false && Math.abs(m4.value('view.xMin', null) - 10) < 1e-9);
ok('update() 传时刻也能正确判定', (function () {
  m4.to('z', 1, { from: 0, dur: 100, ease: 'linear' });
  var active = m4.update(4450);
  var done = m4.update(4600);
  return active === true && done === false;
})());

// ---------------------------------------------------------------------------
group('6. 默认值与健壮性');
var m5 = Motion.create();
m5.now = function () { return 0; };
ok('未定义的 key 返回 fallback', m5.value('nope', 42) === 42);
ok('dur 缺省为 300ms', (function () {
  var t = m5.to('d', 5, { from: 0 });
  return t.dur === 300;
})());
ok('非法 dur（0 或负数）被夹到 ≥1ms，不产生除零',
  m5.to('e', 1, { from: 0, dur: 0 }).dur >= 1);
ok('cancelAll 清空全部补间', (function () {
  m5.to('x1', 1, { from: 0, dur: 500 }); m5.to('x2', 1, { from: 0, dur: 500 });
  m5.cancelAll();
  return m5.activeKeys().length === 0 && m5.animating() === false;
})());

// ---------------------------------------------------------------------------
console.log('\n----------------------------------------');
console.log('动效引擎：通过 ' + passed + ' / 失败 ' + failed);
if (failed > 0) process.exitCode = 1;
