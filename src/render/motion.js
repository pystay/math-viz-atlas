/*!
 * motion.js — 动效引擎（补间管理器）
 * ---------------------------------------------------------------------------
 * 一个极小的、rAF 友好的补间管理器，支撑三类动效：
 *   1. 重置回退：把参数从当前值平滑回溯到默认值（"时间倒流"）
 *   2. 相机过渡：模块切换时把视窗从旧范围补间到新范围
 *   3. 描边生成：曲线从左到右"画"出来（reveal 由 0 补间到 1）
 *
 * 设计要点：
 *   · **可重定向**（retarget）：同一 key 再次 to() 时，从"当前值"重新出发，
 *     所以动画中途改目标不会跳变 —— 这正是"动画中断平滑过渡"的实现。
 *   · 只存数值，不碰 DOM；更新与渲染完全解耦，方便单测。
 *   · 缓动函数是纯函数，可被测试直接验证（单调、端点、有界）。
 */
(function (root) {
  'use strict';

  var EASINGS = {
    linear: function (t) { return t; },
    easeInOutCubic: function (t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    },
    easeOutCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    easeInOutQuint: function (t) {
      return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
    },
    easeOutExpo: function (t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); },
    /** 轻微过冲，用于"弹回"的手感（重置结束时的一点点回弹） */
    easeOutBack: function (t) {
      var c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
  };

  function create() {
    var tweens = {};      // key -> { from, to, start, dur, ease }

    function easeOf(name) {
      return EASINGS[name] || EASINGS.easeInOutCubic;
    }

    /** 是否仍在动画中 —— 由**时钟**判定，不依赖 update() 是否被调用过。 */
    function isActive(t, at) {
      if (!t) return false;
      var now = at === undefined ? api.now() : at;
      return now - t.start < t.dur;
    }

    var api = {
      /**
       * 启动/重定向一个补间。
       * @param key    唯一键（如 'p:k'、'view.xMin'、'reveal'）
       * @param target 目标值
       * @param opts   { dur, ease, from, delay, now }
       */
      to: function (key, target, opts) {
        opts = opts || {};
        var now = opts.now === undefined ? api.now() : opts.now;
        var existing = tweens[key];
        // 关键：重定向时以"当前显示值"为起点，避免跳变（动画中断平滑过渡）
        var from = opts.from !== undefined
          ? opts.from
          : (isActive(existing, now) ? api.value(key, target) : target);
        tweens[key] = {
          from: from,
          to: target,
          start: now + (opts.delay || 0),
          dur: Math.max(1, opts.dur === undefined ? 300 : opts.dur),
          ease: easeOf(opts.ease)
        };
        return tweens[key];
      },

      /** 当前时间（毫秒）。测试可替换它注入时钟。 */
      now: function () {
        return (root.performance && root.performance.now) ? root.performance.now() : Date.now();
      },

      /** 该 key 的当前值；没有补间时返回 fallback。 */
      value: function (key, fallback) {
        var t = tweens[key];
        if (!t) return fallback;
        var p = (api.now() - t.start) / t.dur;
        if (p <= 0) return t.from;
        if (p >= 1) return t.to;
        return t.from + (t.to - t.from) * t.ease(p);
      },

      has: function (key) { return isActive(tweens[key]); },

      /** 推进一帧：返回"本帧是否仍有动画在跑"。 */
      update: function (now) {
        var t0 = now === undefined ? api.now() : now;
        var active = false;
        for (var k in tweens) {
          if (!Object.prototype.hasOwnProperty.call(tweens, k)) continue;
          if (isActive(tweens[k], t0)) active = true;
        }
        return active;
      },

      animating: function () {
        for (var k in tweens) {
          if (Object.prototype.hasOwnProperty.call(tweens, k) && isActive(tweens[k])) return true;
        }
        return false;
      },

      /** 取消某个补间（用户手动拖动滑块时，输入必须立刻接管）。 */
      cancel: function (key) {
        if (tweens[key]) delete tweens[key];
      },

      cancelAll: function () { tweens = {}; },

      /** 调试/测试用：列出仍在跑的键。 */
      activeKeys: function () {
        var out = [];
        for (var k in tweens) {
          if (Object.prototype.hasOwnProperty.call(tweens, k) && isActive(tweens[k])) out.push(k);
        }
        return out.sort();
      },

      /** 立即跳到终值（清除补间，value 随即返回 fallback）。 */
      finishAll: function () { tweens = {}; }
    };

    return api;
  }

  root.Motion = { create: create, EASINGS: EASINGS };
})(typeof self !== 'undefined' ? self : this);
