# Contributing to Math Viz Atlas · 贡献指南

感谢你有兴趣参与！本文档说明如何在本仓库中提出改动。

## 行为准则

参与本项目即表示你同意遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

## 我可以贡献什么

- 🐛 **报告缺陷**：数学表达错误、渲染异常、交互问题（请用 issue 模板）
- ✨ **新增可视化模块**：新的数学主题章节（见下文模块契约）
- 🎬 **新增自动演示脚本**：为核心章节编写叙事动画
- 📝 **文档与翻译**：README、i18n 词条（`src/ui/i18n.js`）
- ♿ **无障碍与性能**：键盘导航、对比度、低端设备帧率

## 开发环境

```bash
git clone https://github.com/pystay/math-viz-atlas.git
cd math-viz-atlas
# 本项目是零构建的纯静态应用，直接用浏览器打开即可
# （只有重新内联 KaTeX 时才需要 npm install）
```

无需构建步骤。用浏览器打开 `index.html` 即可运行（`file://` 亦可）。

## 本地校验（提交前必须全绿）

```bash
node src/core/math-core.test.js    # 76 条：解析/求导/积分/级数/统计/LaTeX
node tests/modules.test.js         # 182 条：19 个模块 + 沙盒微积分 + 演示脚本
node tests/motion.test.js          # 29 条：动效引擎
node tests/timeline.test.js        # 27 条：演示时间轴
```

端到端探针（需要本机安装 Chrome，会自行启动无头实例）：

```bash
node tests/sandbox-probe.mjs       # 输入→解析→定位→渲染→探针（含 <100ms 计时）
node tests/motion-probe.mjs        # 回退/中断/相机过渡/描边/活力层/无障碍
node tests/demo-probe.mjs          # 自动演示播放器 + 沙盒微积分
node tests/fps-probe.mjs           # 19 个模块帧率与运行时错误
node tests/layout-probe.mjs 390 844 sandbox   # 窄屏布局
```

## 代码结构约束（三层分离）

```
src/core/    数学逻辑层：纯计算，无 DOM，可在 Node 中直接测试
src/render/  可视化渲染层：画布原语、绘图引擎、动效/时间轴
src/ui/      交互层：路由、控件、i18n、动画循环
src/modules/ 章节模块：组合三层，一个文件一个主题
```

新增模块请遵守 **模块契约**（详见 README 第三节）：

```js
MS.register({
  id, stage, order, zoomable,
  title, caption, formula,
  controls: [...],                 // 或 function(params)
  view | square,                   // 视窗
  init, animate, onPointer, onKey,
  draw(plot, params, state),
  readouts(params, state),
  legend, info: { definition, geometry, algebra, application }
});
```

## 编码规范

1. **零构建、零 CDN**：只使用经典 `<script>` 标签 + IIFE 全局；依赖必须内联到 `vendor/`。
2. **颜色与间距只用设计令牌**（`assets/tokens.css`），不要在模块里写死颜色。
3. **永远不要抛异常给用户**：用户输入的解析必须走 `parseSafe` / `toFunctionOfX` 的 `{ok, message}` 路径。
4. **数学必须正确**：改动公式、求导、积分、统计逻辑时，必须同时补测试用例。
5. **可视优先**：先让图形传达概念，公式作为辅助验证。
6. **中文优先，保留 i18n 接口**：新增文案必须同时补 `zh` 与 `en`。

## 提交与 PR

- 分支命名：`feat/xxx`、`fix/xxx`、`docs/xxx`
- 提交信息使用祈使句，说明**为什么**改：`fix(parser): 修正 x^(1/3) 在负半轴的符号导数`
- PR 请填写模板，附上：改动说明、验证命令与结果、截图（若涉及视觉）
- 涉及视觉的改动请附 `docs/media/` 风格的前后对比截图

## 数学正确性的评审标准

本项目的核心资产是**数学正确性**。任何涉及计算的 PR 需要提供独立验证证据，例如：

- 与解析解/参考实现逐点比对（并说明容差来源）
- 边界与退化取值（`a=0`、`e=1`、`r=1`、`persp=0`、分数指数）的显式处理
- 定义域护栏（NaN/∞ 不得被"优化"成 0）

历史上本项目通过**独立对抗性验证**发现过多个自测无法覆盖的缺陷，我们欢迎这类"挑刺"。

## 许可证

提交贡献即表示你同意以 [MIT License](LICENSE) 授权你的贡献。
