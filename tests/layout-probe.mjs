/*!
 * tests/layout-probe.mjs — 窄屏布局诊断 + 真机尺寸截图（CDP）
 * ---------------------------------------------------------------------------
 * 注意：`--window-size` 在无头 Chrome 下对窗口宽度有下限（约 500px），
 * 直接用 390 的 window-size 截出来的图其实是 500px 视口被裁掉右边 —— 会误判为
 * "布局溢出"。正确做法是用 Emulation.setDeviceMetricsOverride 设置真实视口。
 *
 * 用法：node tests/layout-probe.mjs [宽] [高] [模块 id]
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const W = Number(process.argv[2] || 390);
const H = Number(process.argv[3] || 844);
const MOD = process.argv[4] || 'calc-integral';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9335;
const OUT = 'D:/math_project/math-visualizer/shots/' +
  (W < 600 ? 'mobile-' : 'desktop-') + MOD + '.png';
const profile = mkdtempSync(join(tmpdir(), 'dsh-layout-'));

const child = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--disk-cache-size=1', '--window-size=1000,900',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  'file:///D:/math_project/math-visualizer/index.html#' + MOD
], { stdio: 'ignore', windowsHide: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function findTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const p = (await r.json()).find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch (e) { /* not ready */ }
    await sleep(250);
  }
  throw new Error('DevTools 未就绪');
}

const MEASURE = `(() => {
  const r = el => { if (!el) return null; const b = el.getBoundingClientRect();
    return { w: Math.round(b.width), left: Math.round(b.left), right: Math.round(b.right), scrollW: el.scrollWidth }; };
  const ro = document.querySelector('.readouts');
  const pills = [...document.querySelectorAll('.readout')];
  const cs = ro ? getComputedStyle(ro) : null;
  const inputs = [...document.querySelectorAll('.text-input')];
  return {
    ready: !!(window.MS && window.MS.ready),
    module: (document.querySelector('.map-node[aria-current="true"] .txt strong') || {}).textContent || null,
    viewport: { w: window.innerWidth, scrollW: document.documentElement.scrollWidth },
    mq900: window.matchMedia('(max-width: 900px)').matches,
    readouts: r(ro),
    readoutsStyle: cs ? { flexDirection: cs.flexDirection, flexWrap: cs.flexWrap, width: cs.width } : null,
    pillCount: pills.length,
    pillsRows: [...new Set(pills.map(p => Math.round(p.getBoundingClientRect().top)))].length,
    lastPillRight: pills.length ? Math.round(pills[pills.length - 1].getBoundingClientRect().right) : null,
    textInputs: inputs.map(i => r(i)),
    dock: r(document.querySelector('.formula-dock')),
    stage: r(document.querySelector('.stage')),
    bootError: (document.getElementById('boot-error') || {}).textContent || ''
  };
})()`;

try {
  const wsUrl = await findTarget();
  const sock = new WebSocket(wsUrl);
  await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej; });

  let nextId = 1;
  const pending = new Map();
  sock.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise(resolve => {
    const id = nextId++;
    pending.set(id, resolve);
    sock.send(JSON.stringify({ id, method, params }));
  });

  await send('Runtime.enable');
  await send('Page.enable');
  // 等应用就绪（否则测到的是空白页，之前的误判就是这样来的）
  for (let i = 0; i < 40; i++) {
    const r = await send('Runtime.evaluate', { expression: '!!(window.MS && window.MS.ready)', returnByValue: true });
    if (r && r.result && r.result.value) break;
    await sleep(250);
  }
  // 真实视口（含移动端标志），避免窗口宽度下限的干扰
  await send('Emulation.setDeviceMetricsOverride', {
    width: W, height: H, deviceScaleFactor: W < 600 ? 2 : 1, mobile: W < 600
  });
  await sleep(700);

  const res = await send('Runtime.evaluate', { expression: MEASURE, returnByValue: true });
  const m = res.result.value;

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'));

  console.log('\n== 布局诊断：' + MOD + ' @ 真实视口 ' + W + '×' + H + ' ==\n');
  console.log('应用就绪：' + m.ready + '　当前模块：' + m.module + '　窄屏媒体查询：' + m.mq900);
  console.log('水平溢出：' + (m.viewport.scrollW > m.viewport.w + 1 ? '是（' + m.viewport.scrollW + ' > ' + m.viewport.w + '）' : '否'));
  console.log('读数：' + m.pillCount + ' 个胶囊 / ' + m.pillsRows + ' 行，容器宽 ' + (m.readouts && m.readouts.w) +
    'px，最后胶囊右边缘 ' + m.lastPillRight + 'px');
  if (m.textInputs.length) {
    console.log('文本输入框：' + m.textInputs.map(i => i.w + 'px(右' + i.right + ')').join(' '));
  }
  console.log('运行时报错：' + (m.bootError || '无'));
  console.log('截图已保存：' + OUT);

  const inputsOk = m.textInputs.every(i => i.right <= m.viewport.w);
  const okLayout = !m.bootError && m.viewport.scrollW <= m.viewport.w + 1 &&
    m.lastPillRight !== null && m.lastPillRight <= m.viewport.w && inputsOk;
  console.log(okLayout ? '\n验收通过：无水平溢出，读数与输入框均在视口内。\n' : '\n验收未通过：存在溢出或裁切。\n');
  if (!okLayout) process.exitCode = 1;
  sock.close();
} catch (e) {
  console.log('ERROR: ' + e.message);
  process.exitCode = 1;
} finally {
  try { child.kill(); } catch (e) { /* ignore */ }
  await sleep(400);
  try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}
