/*!
 * tests/fps-probe.mjs — 真实浏览器帧率测量（Chrome DevTools Protocol）
 * ---------------------------------------------------------------------------
 * 启动无头 Chrome（--disable-gpu，软件光栅 = 比真实低端设备更严苛的下限），
 * 逐个切换 11 个模块，在每个模块内用 requestAnimationFrame 实测 1 秒的帧率，
 * 同时统计“长帧”（>20ms）比例，用于验收「低端设备不低于 30FPS」。
 *
 * 运行：node tests/fps-probe.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PAGE = 'file:///D:/math_project/math-visualizer/index.html';
const PORT = 9333;
const profile = mkdtempSync(join(tmpdir(), 'dsh-fps-'));

const child = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1440,900',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + profile,
  PAGE
], { stdio: 'ignore', windowsHide: true });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function targetWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) { /* 还没起来 */ }
    await sleep(250);
  }
  throw new Error('DevTools 未就绪');
}

const NO_MOTION = process.argv[2] === 'nomotion';

const EXPR = `(async () => {
  const mods = ${JSON.stringify([
    'sandbox', 'arith-add', 'arith-mul', 'algebra-linear', 'algebra-quadratic', 'algebra-explog',
    'algebra-inequality', 'geo-circle', 'geo-pythagoras', 'solid-3d', 'trig-unit',
    'vector-parallelogram', 'analytic-conic', 'sequence-arith', 'series-geometric',
    'series-harmonic', 'stats-histogram', 'calc-derivative', 'calc-integral'
  ])};
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 100 && !(window.MS && window.MS.ready); i++) await wait(100);
  if (!(window.MS && window.MS.ready)) return { error: 'MS.ready 未置位' };

  // A/B：动效关闭时，过渡动画与活力层都被跳过（等价于"减少动态效果"路径）
  if (${NO_MOTION}) {
    const b = document.getElementById('motion-toggle');
    if (b && b.getAttribute('aria-pressed') === 'true') b.click();
    await wait(300);
  }

  // 画布“墨迹覆盖率”：若某模块 draw() 抛错，画布会保持空白 → 覆盖率≈0
  const cv = document.getElementById('plot');
  const ctx = cv.getContext('2d');
  function inkPct() {
    const w = cv.width, h = cv.height;
    const d = ctx.getImageData(0, 0, w, h).data;
    let ink = 0, total = 0;
    for (let i = 0; i < d.length; i += 4 * 37) {   // 稀疏采样，够用且快
      total++;
      if (Math.abs(d[i] - 251) > 14 || Math.abs(d[i + 1] - 247) > 14 || Math.abs(d[i + 2] - 239) > 14) ink++;
    }
    return Math.round((ink / total) * 1000) / 10;
  }

  const out = [];
  for (const id of mods) {
    window.MS.gotoModule(id);
    await wait(400);
    const ink = inkPct();
    const r = await new Promise(resolve => {
      let n = 0, long = 0, worst = 0, last = performance.now();
      const t0 = last;
      function tick(now) {
        const dt = now - last; last = now;
        n++;
        if (dt > 20) long++;
        if (dt > worst) worst = dt;
        if (now - t0 < 1000) requestAnimationFrame(tick);
        else resolve({ n, ms: now - t0, long, worst });
      }
      requestAnimationFrame(tick);
    });
    out.push({
      id,
      fps: Math.round(r.n / (r.ms / 1000)),
      longFrames: r.long,
      worstMs: Math.round(r.worst * 10) / 10,
      inkPct: ink
    });
  }
  const boot = document.getElementById('boot-error');
  return {
    modules: out,
    bootError: boot ? boot.textContent.trim() : '(无该节点)',
    bootVisible: boot ? getComputedStyle(boot).display !== 'none' : false,
    navNodes: document.querySelectorAll('.map-node').length,
    katexNodes: document.querySelectorAll('.katex').length,
    readoutNodes: document.querySelectorAll('.readout').length
  };
})()`;

try {
  const wsUrl = await targetWs();
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  const result = await new Promise((resolve, reject) => {
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === 1) {
        if (msg.result && msg.result.result && msg.result.result.value) resolve(msg.result.result.value);
        else reject(new Error(JSON.stringify(msg.result || msg.error)));
      }
    };
    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression: EXPR, awaitPromise: true, returnByValue: true }
    }));
    setTimeout(() => reject(new Error('测量超时')), 60000);
  });

  if (result.error) {
    console.log('ERROR: ' + result.error);
    process.exitCode = 1;
  } else {
    console.log('\n== 无头 Chrome 实测（--disable-gpu 软件光栅，1440×900）==\n');
    console.log('  模块'.padEnd(24) + 'FPS   长帧(>20ms)  最差单帧   墨迹覆盖率');
    let min = Infinity, totalLong = 0, minInk = Infinity;
    for (const m of result.modules) {
      min = Math.min(min, m.fps);
      minInk = Math.min(minInk, m.inkPct);
      totalLong += m.longFrames;
      console.log('  ' + m.id.padEnd(22) + String(m.fps).padStart(3) + '   ' +
        String(m.longFrames).padStart(6) + '     ' + String(m.worstMs).padStart(5) + ' ms   ' +
        String(m.inkPct).padStart(5) + ' %');
    }
    console.log('\n  最低帧率：' + min + ' FPS　长帧总数：' + totalLong + '　最低墨迹覆盖率：' + minInk + ' %');
    console.log('  运行时错误：' + (result.bootError ? '「' + result.bootError + '」' : '无') +
      '（错误面板可见：' + result.bootVisible + '）');
    console.log('  DOM 自检：导航节点 ' + result.navNodes + ' 个、KaTeX 公式 ' + result.katexNodes +
      ' 处、读数 ' + result.readoutNodes + ' 个');
    const ok = min >= 30 && !result.bootVisible && minInk > 0.5 && result.navNodes >= 19;
    console.log(ok
      ? '\n  验收通过：全部模块 ≥30FPS、无运行时错误、画布均有内容（软件光栅的保守下限）。\n'
      : '\n  验收未通过：见上表。\n');
    if (!ok) process.exitCode = 1;
  }
  ws.close();
} catch (e) {
  console.log('ERROR: ' + e.message);
  process.exitCode = 1;
} finally {
  try { child.kill(); } catch (e) { /* ignore */ }
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}
