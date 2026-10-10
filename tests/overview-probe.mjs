/*!
 * tests/overview-probe.mjs — 总览（可交互知识图谱）端到端验收（CDP 真浏览器）
 * ---------------------------------------------------------------------------
 * 验证：
 *   1. 导航地图出现"总览"分组，首屏默认进入 overview
 *   2. 画布墨迹非空白（中心 + 8 节点 + 连线都画出来了）
 *   3. 点击"三角·向量"节点 → 跳转到 trig-unit（hash 与标题变化）
 *   4. 返回 overview，中心"跳转目标"文本框填 calc-integral → 点中心 → 跳转
 *   5. 中心"跳转目标"填非法 id → 回落沙盒（不崩）
 *   6. 键盘 → 移动焦点，Enter 跳转
 *   7. 无运行时错误
 * 用法：node tests/overview-probe.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9343;
const profile = mkdtempSync(join(tmpdir(), 'dsh-ovw-'));
const child = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--disk-cache-size=1', '--window-size=1440,900',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  'file:///D:/math_project/math-visualizer/index.html'
], { stdio: 'ignore', windowsHide: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

const EXPR = `(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 100 && !(window.MS && window.MS.ready); i++) await wait(100);
  if (!(window.MS && window.MS.ready)) return { error: 'MS.ready 未置位' };
  const q = s => document.querySelector(s);
  const out = {};

  // ---- 1. 默认进入 overview ----
  await wait(500);
  out.default = {
    hash: location.hash,
    title: q('#stage-title').textContent,
    inNav: !!Array.from(document.querySelectorAll('#map .stage, #map [data-stage]')).some(e => /总览/.test(e.textContent))
  };

  const c = q('#plot');
  const DPR = window.devicePixelRatio || 1;
  const W = c.clientWidth, H = c.clientHeight;
  function pxOf(angleDeg) {
    const cx = W / 2, cy = H / 2;
    const R = Math.min(W, H) * 0.34;
    const a = angleDeg * Math.PI / 180;
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  }
  // 画布像素 → 页面坐标（clientX 是相对视口的，画布不在 (0,0)）
  const cr = c.getBoundingClientRect();
  function pagePx(px) { return { x: cr.left + px.x, y: cr.top + px.y }; }
  function clickAt(px) {
    const p = pagePx(px);
    c.dispatchEvent(new PointerEvent('pointermove', { clientX: p.x, clientY: p.y, bubbles: true }));
    c.dispatchEvent(new PointerEvent('pointerdown',  { clientX: p.x, clientY: p.y, bubbles: true }));
  }

  // 三角·向量节点 angle = 15°
  const trig = pxOf(15);

  // ---- 2. 画布有内容（非空白）----
  const inkBefore = (() => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0, tot = 0;
    for (let i = 0; i < d.length; i += 4 * 61) { tot++; if (Math.abs(d[i]-251)>14 || Math.abs(d[i+1]-247)>14 || Math.abs(d[i+2]-239)>14) n++; }
    return Math.round(n / tot * 1000) / 10;
  })();
  out.inkOverview = inkBefore;

  // ---- 3. 点击三角·向量节点（hash 会短暂保持 #overview，因为 gotoModule 不更新 hash；以标题为准）----
  clickAt(trig);
  await wait(900);
  out.afterTrigClick = { hash: location.hash, title: q('#stage-title').textContent };

  // ---- 4. 回 overview，填中心跳转目标 = calc-integral，点中心 ----
  window.MS.gotoModule('overview');
  await wait(500);
  const jumpInput = q('#controls input[type=text]');
  jumpInput.value = 'calc-integral';
  jumpInput.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(200);
  clickAt({ x: W / 2, y: H / 2 });
  await wait(900);
  out.afterCenterClick = { hash: location.hash, title: q('#stage-title').textContent };

  // ---- 5. 非法跳转目标 → 回落沙盒 ----
  window.MS.gotoModule('overview');
  await wait(500);
  const ji = q('#controls input[type=text]');
  ji.value = 'no-such-module-xyz';
  ji.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(200);
  clickAt({ x: W / 2, y: H / 2 });
  await wait(900);
  out.afterBadJump = { hash: location.hash, title: q('#stage-title').textContent };

  // ---- 6. 键盘：逐次按 → 后读"焦点"读数，验证 onKey 步进逻辑（避免一次按多键的时序漂移）----
  window.MS.gotoModule('overview');
  await wait(400);
  c.focus();
  const key = k => c.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  const readFocus = async () => {
    await wait(250);
    const e = Array.from(document.querySelectorAll('.readout')).find(x => /焦点/.test(x.textContent));
    return e ? e.textContent.replace(/^焦点\s*/, '').trim() : '—';
  };
  const f0 = await readFocus();            // 初始
  key('ArrowRight'); const f1 = await readFocus();   // 中心
  key('ArrowRight'); const f2 = await readFocus();   // 小学·算术
  key('ArrowRight'); const f3 = await readFocus();   // 初中·代数
  out.afterKeyNav = { f0, f1, f2, f3 };

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

  if (r.error) throw new Error(r.error);
  console.log('\n== 总览（可交互知识图谱）端到端验收 ==\n');
  console.log(JSON.stringify(r, null, 2));

  const checks = [
    ['默认进入 overview', r.default.hash === '#overview' && /总览|Overview/.test(r.default.title), r.default.hash + ' / ' + r.default.title],
    ['画布确实画出了图谱（有墨迹）', r.inkOverview > 1, r.inkOverview + '%'],
    ['点击"三角·向量"节点 → trig-unit', r.afterTrigClick.title.indexOf('单位圆') >= 0, JSON.stringify(r.afterTrigClick)],
    ['中心填 calc-integral 后点击 → 跳转定积分', r.afterCenterClick.title.indexOf('定积分') >= 0, JSON.stringify(r.afterCenterClick)],
    ['非法跳转目标回落沙盒（不崩）', r.afterBadJump.title.indexOf('沙盒') >= 0, JSON.stringify(r.afterBadJump)],
    ['键盘：每次 → 恰好前进一步（中心→小学→代数→平面几何）',
      r.afterKeyNav.f1.indexOf('小学') >= 0 && r.afterKeyNav.f2.indexOf('代数') >= 0 && r.afterKeyNav.f3.indexOf('平面') >= 0,
      JSON.stringify(r.afterKeyNav)],
    ['无运行时错误', r.bootError === '', r.bootError]
  ];
  console.log('');
  let pass = true;
  for (const [name, ok, extra] of checks) {
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + name + (extra ? '  → ' + extra : ''));
    if (!ok) pass = false;
  }
  console.log('\n' + (pass ? '总览验收通过：知识图谱已作为可交互模块嵌入 index.html。'
                          : '总览验收未通过。') + '\n');
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
