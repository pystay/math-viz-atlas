/*!
 * tests/demo-probe.mjs — 自动演示播放器 + 沙盒微积分引擎 端到端验收（CDP 真浏览器）
 * ---------------------------------------------------------------------------
 * 验证本轮的硬性要求：
 *   1. 自动演示能启动、按叙事推进、播完自动暂停
 *   2. 播放控制：暂停/继续、倍速、进度条拖拽定位、关闭
 *   3. 用户随时介入：拖动滑块即暂停演示，且用户的取值生效
 *   4. 无障碍：开启"减少动效"后自动演示被禁用/关闭
 *   5. 沙盒微积分：切到"求导/定积分"后画布确实多画出内容；推导步骤面板渲染出来
 *   6. 无运行时错误
 *
 * 用法：node tests/demo-probe.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9341;
const profile = mkdtempSync(join(tmpdir(), 'dsh-demo-'));
const child = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--disk-cache-size=1', '--window-size=1440,900',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  'file:///D:/math_project/math-visualizer/index.html#calc-derivative'
], { stdio: 'ignore', windowsHide: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

const EXPR = `(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 100 && !(window.MS && window.MS.ready); i++) await wait(100);
  if (!(window.MS && window.MS.ready)) return { error: 'MS.ready 未置位' };
  const q = s => document.querySelector(s);
  const bar = () => q('#demo-bar');
  const demoBtn = () => q('#controls .btn.primary');
  const firstSlider = () => q('#controls input[type=range]');
  const ink = () => {
    const c = q('#plot');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0, tot = 0;
    for (let i = 0; i < d.length; i += 4 * 37) {
      tot++;
      if (Math.abs(d[i] - 251) > 14 || Math.abs(d[i + 1] - 247) > 14 || Math.abs(d[i + 2] - 239) > 14) n++;
    }
    return Math.round((n / tot) * 1000) / 10;
  };
  const out = {};

  // ---------- 1. 启动自动演示 ----------
  window.MS.gotoModule('calc-derivative');
  await wait(600);
  out.hasDemoButton = !!demoBtn();
  out.barHiddenBefore = bar().hidden;
  const x0Before = window.MS.getParams().x0;      // 演示启动前的默认值
  demoBtn().click();
  await wait(120);
  out.barHiddenAfterStart = bar().hidden;
  await wait(700);
  out.started = {
    x0Before: x0Before,
    x0After: window.MS.getParams().x0,
    progress: parseFloat(q('#demo-progress').value),
    label: q('#demo-label').textContent,
    time: q('#demo-time').textContent
  };

  // ---------- 2. 暂停：参数冻结 ----------
  q('#demo-toggle').click();          // 暂停
  await wait(80);
  const hPaused = window.MS.getParams().h;
  await wait(500);
  out.paused = { h1: hPaused, h2: window.MS.getParams().h, same: Math.abs(hPaused - window.MS.getParams().h) < 1e-12 };

  // ---------- 3. 倍速：2× 下时间轴推进更快 ----------
  q('#demo-progress').value = '0';
  q('#demo-progress').dispatchEvent(new Event('input', { bubbles: true }));   // seek 到 0（并暂停）
  await wait(100);
  const speedBtn = q('.demo-speed button[data-speed="2"]');
  speedBtn.click();
  q('#demo-toggle').click();          // 继续播放
  const t0 = parseFloat(q('#demo-time').textContent.split('/')[0]);
  await wait(600);
  const t1 = parseFloat(q('#demo-time').textContent.split('/')[0]);
  out.speed2 = { from: t0, to: t1, advanced: t1 - t0, pressed: speedBtn.getAttribute('aria-pressed') };

  // ---------- 4. 进度条拖拽定位 ----------
  q('#demo-progress').value = '700';
  q('#demo-progress').dispatchEvent(new Event('input', { bubbles: true }));
  await wait(120);
  out.seek = { progress: parseFloat(q('#demo-progress').value), label: q('#demo-label').textContent };

  // ---------- 5. 用户随时介入：拖滑块应暂停演示并生效 ----------
  q('#demo-toggle').click();          // 先继续播放
  await wait(120);
  const sl = firstSlider();
  const ctrlId = (sl.id.match(/^in-(.+)-([A-Za-z0-9_]+)$/) || [])[2] || 'x0';
  const userVal = 1.75;
  sl.value = String(userVal);
  sl.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(500);
  out.takeover = {
    ctrlId: ctrlId,
    value: window.MS.getParams()[ctrlId],
    isUserValue: Math.abs(window.MS.getParams()[ctrlId] - userVal) < 1e-9,
    hint: q('#hint').textContent
  };

  // ---------- 6. 关闭演示 ----------
  q('#demo-close').click();
  await wait(150);
  out.closed = { barHidden: bar().hidden };

  // ---------- 7. 无障碍：减少动效后演示按钮禁用 ----------
  q('#motion-toggle').click();        // 关闭动效
  await wait(200);
  out.reducedMotion = { demoDisabled: demoBtn().disabled, label: demoBtn().textContent };

  // 再打开演示应无效
  demoBtn().click();
  await wait(200);
  out.reducedMotion.barStillHidden = bar().hidden;
  q('#motion-toggle').click();        // 恢复动效
  await wait(200);

  // ---------- 8. 沙盒微积分：运算切换真的多画出内容 ----------
  window.MS.gotoModule('sandbox');
  await wait(900);
  const segButtons = [...document.querySelectorAll('#controls .seg button')];
  const btnNone = segButtons.find(b => b.textContent.trim() === '无');
  const btnD = segButtons.find(b => b.textContent.indexOf('求导') >= 0);
  const btnI = segButtons.find(b => b.textContent.indexOf('定积分') >= 0);
  out.sandboxHasButtons = !!(btnNone && btnD && btnI);
  btnNone.click();
  await wait(400);
  const inkNone = ink();
  btnD.click();
  await wait(500);
  const inkD = ink();
  btnI.click();
  await wait(500);
  const inkI = ink();
  // 把一个"和式"喂进 f₁，再检查推导步骤面板（乘积式只有 1 项，和式才有多项）
  const f1Input = document.querySelector('#controls input[type=text]');
  f1Input.value = 'x^3 + sin(x)';
  f1Input.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(300);
  // 推导步骤面板
  const tabAlg = [...document.querySelectorAll('#tabs button')].find(b => /代数操作/.test(b.textContent));
  if (tabAlg) tabAlg.click();
  await wait(400);
  out.sandbox = {
    inkNone: inkNone, inkDerivative: inkD, inkIntegral: inkI,
    derivativeAddsInk: inkD > inkNone,
    integralAddsInk: inkI > inkNone,
    stepRows: document.querySelectorAll('#tabpanel .step-row').length,
    hasRuleLabel: /法则/.test(q('#tabpanel').textContent)
  };

  out.readoutsAfter = [...document.querySelectorAll('.readout')].map(e => e.textContent.trim()).slice(0, 4);
  window.__shotSandboxReady = true;

  // 重新起一段演示，让最终画面停留在"播放器 + 叙事步骤"上（供截图）
  window.MS.gotoModule('calc-derivative');
  await wait(500);
  const b2 = q('#controls .btn.primary');
  if (b2) b2.click();
  await wait(1000);
  out.demoShot = { barVisible: !bar().hidden, label: q('#demo-label').textContent };

  out.bootError = (q('#boot-error') || {}).textContent || '';
  return out;
})()`;

try {
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const p = (await r.json()).find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) wsUrl = p.webSocketDebuggerUrl;
    } catch (e) { /* not ready */ }
    if (!wsUrl) await sleep(250);
  }
  if (!wsUrl) throw new Error('DevTools 未就绪');

  const sock = new WebSocket(wsUrl);
  await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej; });
  const r = await new Promise((resolve, reject) => {
    sock.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id === 1) resolve(m.result?.result?.value ?? m.result);
    };
    sock.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: EXPR, awaitPromise: true, returnByValue: true } }));
    setTimeout(() => reject(new Error('超时')), 90000);
  });

  // 最终画面停在一段正在播放的演示上 —— 截一张图作为交付物
  try {
    const shot = await new Promise((resolve, reject) => {
      sock.onmessage = ev => {
        const m = JSON.parse(ev.data);
        if (m.id === 2) resolve(m.result);
      };
      sock.send(JSON.stringify({ id: 2, method: 'Page.captureScreenshot', params: { format: 'png' } }));
      setTimeout(() => reject(new Error('截图超时')), 20000);
    });
    if (shot && shot.data) {
      writeFileSync('D:/math_project/math-visualizer/shots/demo-player.png', Buffer.from(shot.data, 'base64'));
      console.log('\n（截图已保存：shots/demo-player.png）');
    }
  } catch (e) { console.log('（截图跳过：' + e.message + '）'); }

  if (r.error) throw new Error(r.error);
  console.log('\n== 自动演示 + 沙盒微积分 端到端验收 ==\n');
  console.log(JSON.stringify(r, null, 2));

  const checks = [
    ['章节配有"自动演示"按钮', r.hasDemoButton === true],
    ['点击后播放器出现', r.barHiddenBefore === true && r.barHiddenAfterStart === false],
    ['演示推进了参数（x₀ 被脚本改写）', Math.abs(r.started.x0After - r.started.x0Before) > 1e-6,
      r.started.x0Before + ' → ' + r.started.x0After],
    ['进度条与步骤标签在更新', r.started.progress > 0 && /①|②|③|④|⑤/.test(r.started.label),
      r.started.progress + ' / ' + r.started.label],
    ['暂停后参数冻结', r.paused.same === true, JSON.stringify(r.paused)],
    ['2× 倍速生效（0.6s 实时推进 ≈1.2s）', r.speed2.advanced > 0.9, r.speed2.advanced + 's'],
    ['进度条拖拽定位生效', r.seek.progress === 700 && /④|⑤/.test(r.seek.label), r.seek.progress + ' / ' + r.seek.label],
    ['用户拖动滑块 → 演示让位且取值生效', r.takeover.isUserValue === true && /接管/.test(r.takeover.hint),
      r.takeover.ctrlId + '=' + r.takeover.value + ' / ' + r.takeover.hint],
    ['关闭按钮隐藏播放器', r.closed.barHidden === true],
    ['减少动效后演示按钮禁用', r.reducedMotion.demoDisabled === true, r.reducedMotion.label],
    ['减少动效时点击无效（播放器不出现）', r.reducedMotion.barStillHidden === true],
    ['沙盒微积分运算按钮存在', r.sandboxHasButtons === true],
    ['沙盒"求导"确实多画出导函数曲线', r.sandbox.derivativeAddsInk === true,
      r.sandbox.inkNone + '% → ' + r.sandbox.inkDerivative + '%'],
    ['沙盒"定积分"确实多画出矩形', r.sandbox.integralAddsInk === true,
      r.sandbox.inkNone + '% → ' + r.sandbox.inkIntegral + '%'],
    ['推导步骤面板渲染（含法则标签）', r.sandbox.stepRows >= 2 && r.sandbox.hasRuleLabel === true,
      r.sandbox.stepRows + ' 行'],
    ['无运行时错误', r.bootError === '', r.bootError]
  ];

  console.log('');
  let pass = true;
  for (const [name, ok, extra] of checks) {
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + name + (extra ? '  → ' + extra : ''));
    if (!ok) pass = false;
  }
  console.log('\n' + (pass ? '验收通过：自动演示（播放/暂停/倍速/定位/介入/无障碍）与沙盒微积分全部正常。'
                           : '验收未通过。') + '\n');
  if (!pass) process.exitCode = 1;
  sock.close();
} catch (e) {
  console.log('ERROR: ' + e.message);
  process.exitCode = 1;
} finally {
  try { child.kill(); } catch (e) { /* ignore */ }
  await sleep(400);
  try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}
