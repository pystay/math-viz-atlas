/*!
 * timeline.js — 自动演示时间轴引擎
 * ---------------------------------------------------------------------------
 * 为每个核心章节提供"结构化自动播放"：脚本由若干步骤组成，每步有
 * 标签（叙事文案）、时长、缓动与一个 apply(进度, 上下文) 回调。
 * 时间轴负责按时间推进、把当前步骤的进度喂给回调，并暴露播放状态给 UI。
 *
 * 设计要点：
 *   · 时间轴只做"时间 → 进度"，具体改什么由脚本决定（改参数、切选项、加高亮）
 *   · **可随时介入**：pause() 冻结在当前时刻，用户拖滑块即暂停并接管
 *   · 播完自动暂停（"自动暂停供用户探索"），可重播
 *   · 时钟可注入（测试可确定性地推进时间）
 *   · 倍速 0.25×–4×，进度条可拖拽定位
 */
(function (root) {
  'use strict';

  var EASE = (root.Motion && root.Motion.EASINGS) || {
    linear: function (t) { return t; },
    easeInOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    easeOutCubic: function (t) { return 1 - Math.pow(1 - t, 3); }
  };

  function create() {
    var script = null;
    var ctx = null;
    var t = 0;                 // 当前时间（ms）
    var playing = false;
    var speed = 1;
    var lastNow = null;        // null = 尚未开始计时（不能用 0 判定，时钟可能从 0 开始）
    var done = false;
    var index = 0;

    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

    function steps() { return (script && script.steps) || []; }

    function duration() {
      var s = 0;
      steps().forEach(function (st) { s += Math.max(0, st.dur || 0); });
      return s;
    }

    /** 根据当前时间找到活动步骤，返回 { index, p }（p 为 0..1） */
    function locate(time) {
      var acc = 0;
      var list = steps();
      for (var i = 0; i < list.length; i++) {
        var d = Math.max(1, list[i].dur || 0);
        if (time < acc + d || i === list.length - 1) {
          return { index: i, p: clamp((time - acc) / d, 0, 1) };
        }
        acc += d;
      }
      return { index: 0, p: 0 };
    }

    /** 把当前进度应用到脚本（每帧调用；暂停时也会调用一次以保持状态一致） */
    function apply() {
      if (!script || !ctx) return;
      var loc = locate(t);
      index = loc.index;
      var list = steps();

      // 追赶（catch-up）：把当前步骤**之前**的每一步按其终值应用一次。
      // 否则 seek 或长帧跳跃会跳过中间步骤的设置，导致状态与叙事不一致。
      for (var i = 0; i < index; i++) {
        var prev = list[i];
        if (typeof prev.apply === 'function') {
          try { prev.apply(1, ctx, 1); } catch (e) { /* 单步失败不影响后续 */ }
        }
      }

      var step = list[index];
      if (!step) return;
      var ease = EASE[step.ease || 'easeInOutCubic'] || EASE.easeInOutCubic;
      var p = ease(loc.p);
      try {
        if (typeof step.apply === 'function') step.apply(p, ctx, loc.p);
        if (typeof step.enter === 'function' && !step._entered) { step._entered = true; step.enter(ctx); }
      } catch (e) {
        // 脚本出错不应让整个应用崩溃：停下来并交给用户
        playing = false;
        if (root.console) console.error('demo step failed', e);
      }
    }

    var api = {
      now: function () {
        return (root.performance && root.performance.now) ? root.performance.now() : Date.now();
      },

      /** 载入脚本并复位（不自动播放） */
      load: function (s, context) {
        script = s || null;
        ctx = context || {};
        t = 0;
        done = false;
        playing = false;
        lastNow = null;
        if (script) steps().forEach(function (st) { st._entered = false; });
        apply();
        return api.state();
      },

      clear: function () { script = null; ctx = null; playing = false; t = 0; done = false; },

      hasScript: function () { return !!script; },
      duration: duration,
      title: function () { return script ? script.title : null; },

      play: function () {
        if (!script) return api.state();
        if (done || t >= duration()) { t = 0; done = false; steps().forEach(function (st) { st._entered = false; }); }
        playing = true;
        lastNow = api.now();
        return api.state();
      },

      pause: function () { playing = false; return api.state(); },
      toggle: function () { return playing ? api.pause() : api.play(); },
      isPlaying: function () { return playing; },

      /** 拖动进度条定位 */
      seek: function (ms) {
        t = clamp(ms, 0, duration());
        done = t >= duration();
        steps().forEach(function (st) { st._entered = false; });
        apply();
        return api.state();
      },

      setSpeed: function (x) { speed = clamp(x || 1, 0.25, 4); return api.state(); },
      getSpeed: function () { return speed; },

      /** 每帧推进；返回最新状态。**暂停时不再回写脚本**，
       *  否则会覆盖用户在暂停期间的拖动（"随时介入"必须真的生效）。 */
      update: function (nowMs) {
        if (!script) return api.state();
        var now = nowMs === undefined ? api.now() : nowMs;
        if (playing) {
          var dt = lastNow === null ? 0 : Math.max(0, now - lastNow);
          lastNow = now;
          t += dt * speed;
          if (t >= duration()) {
            t = duration();
            done = true;
            playing = false;            // 播完自动暂停，把控制权交还用户
          }
          apply();
        } else {
          lastNow = now;
        }
        return api.state();
      },

      state: function () {
        var st = steps()[index] || null;
        return {
          loaded: !!script,
          title: script ? script.title : null,
          playing: playing,
          done: done,
          t: t,
          duration: duration(),
          index: index,
          stepCount: steps().length,
          label: st ? st.label : null,
          speed: speed
        };
      }
    };

    return api;
  }

  root.Timeline = { create: create };
})(typeof self !== 'undefined' ? self : this);
