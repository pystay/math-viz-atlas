/*!
 * i18n.js — 国际化层（默认中文，接口预留英文）
 * 只做两件事：查词条、切换语言后通知订阅者重绘（保持数学符号国际标准）。
 */
(function (root) {
  'use strict';

  var DICT = {
    zh: {
      'app.title': '数学可视化图谱',
      'app.subtitle': 'Math Atlas · 算术 → 微积分',
      'panel.controls': '参数控制',
      'panel.info': '概念闭环',
      'panel.legend': '图例',
      'tab.definition': '定义',
      'tab.geometry': '几何意义',
      'tab.algebra': '代数操作',
      'tab.application': '实际应用',
      'stage.arith': '算术',
      'stage.algebra': '代数',
      'stage.geometry': '平面几何',
      'stage.solid3d': '立体几何',
      'stage.trig': '三角',
      'stage.vector': '向量',
      'stage.analytic': '解析几何',
      'stage.calculus': '微积分',
      'stage.series': '数列与级数',
      'stage.stats': '统计',
      'stage.sandbox': '自由沙盒',
      'btn.play': '播放',
      'btn.pause': '暂停',
      'btn.reset': '重置',
      'btn.resetView': '重置视图',
      'hint': '提示：拖动滑块或按 ← → 键微调；Tab 键在模块间移动；[ ] 切换模块。',
      'hint.reduced': '动效已关闭（减少动态效果）。核心图表仍可正常交互。',
      'motion.on': '动效：开',
      'motion.off': '动效：关',
      'motion.degraded': '（已降级）',
      'demo.start': '▶ 自动演示',
      'demo.blocked': '自动演示已随"减少动效"关闭',
      'demo.replay': '↻ 重播',
      'demo.takenOver': '演示已暂停：你接管了控制，可继续拖动探索。',
      'demo.done': '演示结束，可自由探索。',
      'demo.playing': '演示播放中（拖动任意滑块即可接管）',
      'fps': 'FPS'
    },
    en: {
      'app.title': 'Math Atlas',
      'app.subtitle': 'Interactive · Arithmetic → Calculus',
      'panel.controls': 'Parameters',
      'panel.info': 'Concept loop',
      'panel.legend': 'Legend',
      'tab.definition': 'Definition',
      'tab.geometry': 'Geometry',
      'tab.algebra': 'Algebra',
      'tab.application': 'Application',
      'stage.arith': 'Arithmetic',
      'stage.algebra': 'Algebra',
      'stage.geometry': 'Plane geometry',
      'stage.solid3d': 'Solid geometry',
      'stage.trig': 'Trigonometry',
      'stage.vector': 'Vectors',
      'stage.analytic': 'Analytic geometry',
      'stage.calculus': 'Calculus',
      'stage.series': 'Sequences & series',
      'stage.stats': 'Statistics',
      'stage.sandbox': 'Sandbox',
      'btn.play': 'Play',
      'btn.pause': 'Pause',
      'btn.reset': 'Reset',
      'btn.resetView': 'Reset view',
      'hint': 'Tip: drag a slider or use ← → keys; press Tab to move between modules.',
      'hint.reduced': 'Motion is off (reduced motion). The charts stay fully interactive.',
      'motion.on': 'Motion: on',
      'motion.off': 'Motion: off',
      'motion.degraded': ' (degraded)',
      'demo.start': '▶ Auto demo',
      'demo.blocked': 'Auto demo is off with reduced motion',
      'demo.replay': '↻ Replay',
      'demo.takenOver': 'Demo paused: you took over — keep exploring.',
      'demo.done': 'Demo finished — explore freely.',
      'demo.playing': 'Demo playing (drag any slider to take over)',
      'fps': 'FPS'
    }
  };

  var listeners = [];

  var I18N = {
    lang: 'zh',
    t: function (key, fallback) {
      var pack = DICT[this.lang] || DICT.zh;
      return pack[key] !== undefined ? pack[key] : (DICT.zh[key] !== undefined ? DICT.zh[key] : (fallback || key));
    },
    /** 取模块里的双语字段：pick({zh:'导数', en:'Derivative'}) */
    pick: function (obj) {
      if (obj === null || obj === undefined) return '';
      if (typeof obj === 'string') return obj;
      return obj[this.lang] !== undefined ? obj[this.lang] : (obj.zh !== undefined ? obj.zh : '');
    },
    set: function (lang) {
      if (!DICT[lang] || lang === this.lang) return;
      this.lang = lang;
      document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
      listeners.forEach(function (fn) { try { fn(lang); } catch (e) { console.error(e); } });
    },
    onChange: function (fn) { listeners.push(fn); }
  };

  root.I18N = I18N;
})(typeof self !== 'undefined' ? self : this);
