/*!
 * tests/motion-probe.mjs — 动效端到端验收（CDP 真浏览器）
 * ---------------------------------------------------------------------------
 * 验证 SOUL 里对动效的硬性要求，全部在真实浏览器里测量：
 *   1. 重置回退：点击"重置"后滑块**不是瞬跳**，而是经过中间值再落到默认（逆向缓动）
 *   2. 动画中断：回退进行中用户再输入 → 输入立刻接管，不回弹
 *   3. 相机过渡：模块切换时视窗连续变化（不是瞬间跳变）
 *   4. 描边生成：切换模块后曲线从左到右"画"出来（reveal 0 → 1）
 *   5. 背景活力层：闲置时画面确实在缓慢变化（低对比度微动效）
 *   6. 无障碍开关：点"动效"按钮后动效关闭（aria-pressed=false、ambient 关、body 带 motion-off）
 *
 * 用法：node tests/motion-probe.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9339;
const profile = mkdtempSync(join(tmpdir(), 'dsh-motion-'));
const child = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--disk-cache-size=1', '--window-size=1440,900',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  'file:///D:/math_project/math-visualizer/index.html#algebra-linear'
], { stdio: 'ignore', windowsHide: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

const EXPR = `(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 100 && !(window.MS && window.MS.ready); i++) await wait(100);
  if (!(window.MS && window.MS.ready)) return { error: 'MS.ready 未置位' };
  const plot = window.MS.getPlot();
  const slider = () => document.querySelector('#controls input[type=range]');
  const resetBtn = () => document.querySelector('#controls .btn');
  const out = {};

  // ---- 0. 默认状态：动效开启、活力层运行 ----
  // 无头浏览器可能在首帧前短暂处于 hidden，此时应用会按"页面不可见"暂停活力层；
  // 等可见后再取初始快照，避免把这一瞬态误判为缺陷。
  for (let i = 0; i < 40 && document.visibilityState !== 'visible'; i++) await wait(100);
  await wait(600);
  out.initial = {
    ambientOn: plot.ambientOn(),
    motionPressed: document.getElementById('motion-toggle').getAttribute('aria-pressed'),
    bodyOff: document.body.classList.contains('motion-off'),
    visibility: document.visibilityState
  };

  // ---- 5. 背景活力层：闲置时画面确实在变化（用静态模块 algebra-linear） ----
  window.MS.gotoModule('algebra-linear');
  await wait(900);
  const sig = () => {
    const c = document.getElementById('plot');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let h = 0;
    for (let i = 0; i < d.length; i += 4 * 997) h = (h * 31 + d[i]) >>> 0;
    return h;
  };
  const s1 = sig();
  await wait(700);
  const s2 = sig();
  out.ambient = { sig1: s1, sig2: s2, changed: s1 !== s2 };

  // ---- 4 + 3. 描边生成与相机过渡（切到另一个模块） ----
  window.MS.gotoModule('algebra-quadratic');
  const viewAt = () => [plot.view.xMin, plot.view.xMax, plot.view.yMin, plot.view.yMax];
  const vDiff = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0);
  const v0 = viewAt();
  const r0 = plot.getReveal();
  await wait(180);
  const vMid = viewAt();
  const rMid = plot.getReveal();
  await wait(900);
  const v1 = viewAt();
  const r1 = plot.getReveal();
  out.transition = { v0, vMid, v1, r0, rMid, r1, midDiffers: vDiff(vMid, v0) > 1e-9 && vDiff(vMid, v1) > 1e-9 };

  // ---- 1. 重置回退：必须经过中间值 ----
  window.MS.gotoModule('trig-unit');
  await wait(900);
  const sl = slider();
  const def = parseFloat(sl.value);
  sl.value = String(def + 1.5);
  sl.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(120);
  const changed = parseFloat(sl.value);
  resetBtn().click();
  await wait(140);
  const mid = parseFloat(sl.value);
  await wait(700);
  const end = parseFloat(sl.value);
  out.reset = { def, changed, mid, end };

  // ---- 2. 中断处理：回退中再次输入 ----
  window.MS.gotoModule('trig-unit');
  await wait(300);
  const sl2 = slider();
  const def2 = parseFloat(sl2.value);
  sl2.value = String(def2 - 1.2);
  sl2.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(120);
  resetBtn().click();                    // 开始回退
  await wait(150);
  const userVal = def2 + 0.8;
  sl2.value = String(userVal);           // 回退进行中，用户再次拖动
  sl2.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(700);
  out.interrupt = { def2, userVal, final: parseFloat(sl2.value) };

  // ---- 6. 无障碍开关（用静态模块，排除模块自身动画的干扰）----
  window.MS.gotoModule('algebra-linear');
  await wait(700);
  document.getElementById('motion-toggle').click();
  await wait(250);
  out.reduced = {
    ambientOn: plot.ambientOn(),
    pressed: document.getElementById('motion-toggle').getAttribute('aria-pressed'),
    bodyOff: document.body.classList.contains('motion-off'),
    label: document.getElementById('motion-toggle').textContent
  };
  const s3 = sig();
  await wait(700);
  const s4 = sig();
  out.reduced.stillChanged = s3 !== s4;   // 关闭后应当完全静止

  document.getElementById('motion-toggle').click();   // 再打开
  await wait(200);
  out.reenabled = { ambientOn: plot.ambientOn() };

  out.bootError = (document.getElementById('boot-error') || {}).textContent || '';
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

  if (r.error) throw new Error(r.error);
  console.log('\n== 动效端到端验收（真实浏览器）==\n');
  console.log(JSON.stringify(r, null, 2).split('\n').slice(0, 60).join('\n'));

  const checks = [];
  checks.push(['默认开启背景活力层', r.initial.ambientOn === true && r.initial.motionPressed === 'true',
    JSON.stringify(r.initial)]);
  checks.push(['闲置时画面在缓慢变化（活力层生效）', r.ambient.changed === true,
    r.ambient.sig1 + ' → ' + r.ambient.sig2]);
  checks.push(['模块切换时视窗连续过渡（非瞬跳）', r.transition.midDiffers === true,
    JSON.stringify([r.transition.v0, r.transition.vMid, r.transition.v1])]);
  checks.push(['曲线描边生成：reveal 从 <1 过渡到 1',
    r.transition.r0 < 0.99 && r.transition.r1 > 0.99,
    r.transition.r0.toFixed(2) + ' → ' + r.transition.rMid.toFixed(2) + ' → ' + r.transition.r1.toFixed(2)]);
  checks.push(['重置回退经过中间值（不是瞬跳）',
    Math.abs(r.reset.mid - r.reset.changed) > 1e-6 && Math.abs(r.reset.mid - r.reset.def) > 1e-6,
    JSON.stringify(r.reset)]);
  checks.push(['重置最终落在默认值', Math.abs(r.reset.end - r.reset.def) < 1e-6, r.reset.end + ' vs ' + r.reset.def]);
  checks.push(['回退中用户输入立刻接管（不回弹）',
    Math.abs(r.interrupt.final - r.interrupt.userVal) < 1e-6, JSON.stringify(r.interrupt)]);
  checks.push(['无障碍开关：关闭后 ambient 关、aria-pressed=false、body.motion-off',
    r.reduced.ambientOn === false && r.reduced.pressed === 'false' && r.reduced.bodyOff === true,
    JSON.stringify(r.reduced)]);
  checks.push(['关闭动效后画面静止', r.reduced.stillChanged === false, 'changed=' + r.reduced.stillChanged]);
  checks.push(['可再次开启', r.reenabled.ambientOn === true]);
  checks.push(['无运行时错误', r.bootError === '', r.bootError]);

  console.log('');
  let pass = true;
  for (const [name, ok, extra] of checks) {
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + name + (extra ? '  → ' + extra : ''));
    if (!ok) pass = false;
  }
  console.log('\n' + (pass ? '动效验收通过：回退、中断、过渡、描边、活力层与无障碍开关全部符合规范。'
                           : '动效验收未通过。') + '\n');
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
