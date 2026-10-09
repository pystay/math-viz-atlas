/*!
 * tests/timeline.test.js — 自动演示时间轴引擎单元测试
 * ---------------------------------------------------------------------------
 * 覆盖 Rules 对自动演示的硬性要求：
 *   · 叙事步骤按时间推进，进度正确映射到每一步
 *   · 缓动后的进度端点精确（p=0 与 p=1）
 *   · 播完自动暂停（"自动暂停供用户探索"）
 *   · 可暂停/继续、可拖拽定位（seek）、可倍速
 *   · 脚本抛错不崩溃（降级为暂停）
 * 运行：node tests/timeline.test.js
 */
'use strict';

global.self = global;
require('../src/render/motion.js');       // 时间轴复用 Motion 的缓动表
require('../src/render/timeline.js');
var Timeline = global.Timeline;

var passed = 0, failed = 0;
function group(n) { console.log('\n== ' + n + ' =='); }
function ok(label, cond, extra) {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failed++; console.log('  ✗ ' + label + (extra !== undefined ? '  → ' + extra : '')); }
}

console.log('\n===== 自动演示时间轴引擎单元测试 =====');

function makeScript(log) {
  return {
    title: { zh: '测试章节', en: 'Test chapter' },
    steps: [
      { label: { zh: '① 引入' }, dur: 1000, ease: 'linear',
        apply: function (p) { log.push(['a', p]); } },
      { label: { zh: '② 定义' }, dur: 1000, ease: 'linear',
        apply: function (p) { log.push(['b', p]); } },
      { label: { zh: '③ 结论' }, dur: 1000, hold: true, apply: function (p) { log.push(['c', p]); } }
    ]
  };
}

// ---------------------------------------------------------------------------
group('1. 载入与总时长');
var clock = 0;
var log = [];
var tl = Timeline.create();
tl.now = function () { return clock; };
tl.load(makeScript(log), {});
ok('载入后 hasScript 为 true', tl.hasScript() === true);
ok('总时长 = 各步之和 3000ms', tl.duration() === 3000, tl.duration());
ok('载入后处于暂停态且 t=0', tl.isPlaying() === false && tl.state().t === 0);
ok('载入即应用第一步（p=0）', log.length > 0 && log[log.length - 1][0] === 'a' && log[log.length - 1][1] === 0,
  JSON.stringify(log[log.length - 1]));

// ---------------------------------------------------------------------------
group('2. 播放推进：步骤切换与进度端点');
log = [];
clock = 0;
tl.load(makeScript(log), {});
tl.play();
clock = 500;
tl.update(500);
ok('t=500 时仍在第 1 步，进度 0.5', tl.state().index === 0 && Math.abs(log[log.length - 1][1] - 0.5) < 1e-9,
  JSON.stringify(tl.state()) + ' ' + JSON.stringify(log[log.length - 1]));
clock = 1000;
tl.update(1000);
ok('t=1000 时进入第 2 步（边界归属下一步）', tl.state().index === 1, tl.state().index);
clock = 1500;
tl.update(1500);
ok('第 2 步进度 0.5', Math.abs(log[log.length - 1][1] - 0.5) < 1e-9, log[log.length - 1][1]);
clock = 2500;
tl.update(2500);
ok('t=2500 进入第 3 步（hold）', tl.state().index === 2, tl.state().index);
ok('标签随步骤变化', tl.state().label.zh === '③ 结论', tl.state().label.zh);

// ---------------------------------------------------------------------------
group('3. 播完自动暂停（"自动暂停供用户探索"）');
clock = 3000;
var st = tl.update(3000);
ok('到达总时长后 done = true', st.done === true);
ok('自动停止播放', st.playing === false);
ok('时间停在末尾而非溢出', st.t === 3000, st.t);
clock = 4000;
tl.update(4000);
ok('暂停后继续推进时间也不会越过终点', tl.state().t === 3000, tl.state().t);

// ---------------------------------------------------------------------------
group('4. 暂停 / 继续 / 重播');
tl.play();
ok('done 后再次 play 会从头开始', tl.state().t <= 1, tl.state().t);
clock = 4100;
tl.update(4100);
tl.pause();
var frozen = tl.state().t;
clock = 4500;
tl.update(4500);
ok('暂停后时间冻结（仍为 ' + frozen + 'ms）', Math.abs(tl.state().t - frozen) < 1e-9, tl.state().t);
ok('暂停后 isPlaying 为 false', tl.isPlaying() === false);

// ---------------------------------------------------------------------------
group('5. 拖拽定位（seek）与倍速');
var tl2 = Timeline.create();
tl2.now = function () { return 0; };
tl2.load(makeScript([]), {});
tl2.seek(2200);
ok('seek(2200) 落在第 3 步', tl2.state().index === 2, tl2.state().index);
ok('seek 后 t 精确', tl2.state().t === 2200, tl2.state().t);
tl2.seek(99999);
ok('seek 超界被夹到总时长', tl2.state().t === tl2.duration(), tl2.state().t);
tl2.setSpeed(2);
ok('倍速设置生效', tl2.getSpeed() === 2);
tl2.setSpeed(99);
ok('倍速被夹到 4×', tl2.getSpeed() === 4, tl2.getSpeed());
tl2.setSpeed(0.1);
ok('倍速被夹到 0.25×', tl2.getSpeed() === 0.25, tl2.getSpeed());

// 倍速影响推进速度
var tl3 = Timeline.create();
var t3 = 0;
tl3.now = function () { return t3; };
tl3.load(makeScript([]), {});
tl3.setSpeed(2);
tl3.play();
t3 = 1000;
tl3.update(1000);
ok('2× 倍速下 1000ms 实时推进 2000ms 时间轴', Math.abs(tl3.state().t - 2000) < 1e-9, tl3.state().t);

// ---------------------------------------------------------------------------
group('6. 健壮性：脚本抛错不崩溃、空脚本、重载复位');
var tl4 = Timeline.create();
tl4.now = function () { return 0; };
var boom = { title: 'boom', steps: [{ label: 'x', dur: 500, apply: function () { throw new Error('boom'); } }] };
tl4.load(boom, {});
tl4.play();
var t4 = 100;
var threw = false;
try { tl4.update(100); } catch (e) { threw = true; }
ok('脚本内部抛错被吞掉（不冒泡到应用）', threw === false);
ok('抛错后自动暂停，交还用户', tl4.isPlaying() === false);
ok('未载入脚本时 state 安全', (function () {
  var t = Timeline.create();
  var s = t.state();
  t.update(10); t.pause(); t.seek(100);
  return s.loaded === false && s.duration === 0;
})());
ok('重新 load 会复位时间与步骤', (function () {
  tl4.load(makeScript([]), {});
  tl4.seek(1500);
  tl4.load(makeScript([]), {});
  return tl4.state().t === 0 && tl4.state().done === false;
})());

// ---------------------------------------------------------------------------
console.log('\n----------------------------------------');
console.log('时间轴引擎：通过 ' + passed + ' / 失败 ' + failed);
if (failed > 0) process.exitCode = 1;
