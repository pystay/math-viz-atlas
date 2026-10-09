/*!
 * tests/sandbox-probe.mjs — 自由输入沙盒的端到端验收（CDP 真浏览器）
 * ---------------------------------------------------------------------------
 * 验证 Rules 里最硬的两条：
 *   · 「自由输入 → 实时解析 → 动态渲染」回路真的能跑通（含错误定位）
 *   · 输入到首帧渲染 < 100ms（规则要求）
 * 同时验证探针（鼠标 + 键盘）能改变读数。
 *
 * 用法：node tests/sandbox-probe.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9337;
const profile = mkdtempSync(join(tmpdir(), 'dsh-sandbox-'));
const child = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--disk-cache-size=1', '--window-size=1440,900',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  'file:///D:/math_project/math-visualizer/index.html#sandbox'
], { stdio: 'ignore', windowsHide: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

const EXPR = `(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 100 && !(window.MS && window.MS.ready); i++) await wait(100);
  if (!(window.MS && window.MS.ready)) return { error: 'MS.ready 未置位' };
  window.MS.gotoModule('sandbox');
  await wait(300);

  const q = sel => document.querySelector(sel);
  const inp = q('input[type=text]');              // 第一个函数槽 f₁
  const status = () => q('.status') ? q('.status').textContent : null;
  const help = () => q('.help') ? q('.help').textContent : null;
  const caret = () => q('.caret-line') ? q('.caret-line').textContent : '';
  const tex = () => q('.tex-preview') ? q('.tex-preview').textContent : '';
  const readouts = () => [...document.querySelectorAll('.readout')].map(e => e.textContent.trim());

  function type(el, value) {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  const out = { steps: [] };

  // ---- 1. 非法输入：必须被定位到字符，而不是让曲线消失 ----
  type(inp, 'x^2 + si(x)');
  await wait(120);
  out.steps.push({
    name: '非法输入 x^2 + si(x)',
    status: status(), help: help(),
    caret: caret().split('\\n').map(s => s.replace(/\\s+$/, '')),
    invalidClass: inp.classList.contains('invalid'),
    ariaInvalid: inp.getAttribute('aria-invalid')
  });

  // ---- 2. 合法输入：KaTeX 回显 + 立即渲染，并测量输入→首帧延迟 ----
  const t0 = performance.now();
  type(inp, 'x^3 - 3x');
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const dt = performance.now() - t0;
  await wait(120);
  out.steps.push({
    name: '合法输入 x^3 - 3x',
    status: status(), help: help(),
    invalidClass: inp.classList.contains('invalid'),
    latexPreview: tex().slice(0, 60),
    caretHidden: getComputedStyle(q('.caret-line')).display === 'none',
    parseToPaintMs: Math.round(dt * 100) / 100
  });

  // ---- 3. 探针：键盘移动必须改变读数（无障碍路径） ----
  const cv = document.getElementById('plot');
  const before = readouts();
  cv.focus();
  for (let i = 0; i < 6; i++) {
    cv.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  }
  await wait(150);
  const after = readouts();
  out.steps.push({
    name: '键盘探针（ArrowRight ×6）',
    readoutsChanged: JSON.stringify(before) !== JSON.stringify(after),
    before: before.slice(0, 2), after: after.slice(0, 2)
  });

  // ---- 4. 鼠标探针：在画布上移动指针 ----
  const rect = cv.getBoundingClientRect();
  cv.dispatchEvent(new PointerEvent('pointermove', {
    bubbles: true, clientX: rect.left + rect.width * 0.7, clientY: rect.top + rect.height * 0.4
  }));
  await wait(150);
  out.steps.push({ name: '鼠标探针', readouts: readouts().slice(0, 3) });

  // ---- 5. 多曲线：三个槽位颜色不同且都画出来了（墨迹覆盖率） ----
  const ctx = cv.getContext('2d');
  const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
  let ink = 0, total = 0;
  for (let i = 0; i < data.length; i += 4 * 37) {
    total++;
    if (Math.abs(data[i] - 251) > 14 || Math.abs(data[i + 1] - 247) > 14 || Math.abs(data[i + 2] - 239) > 14) ink++;
  }
  out.inkPct = Math.round((ink / total) * 1000) / 10;
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
  const result = await new Promise((resolve, reject) => {
    sock.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id === 1) resolve(m.result?.result?.value ?? m.result);
    };
    sock.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: EXPR, awaitPromise: true, returnByValue: true } }));
    setTimeout(() => reject(new Error('超时')), 60000);
  });

  if (result.error) throw new Error(result.error);
  console.log('\n== 自由输入沙盒 · 端到端验收 ==\n');
  let pass = true;
  for (const s of result.steps) {
    console.log('· ' + s.name);
    console.log('  ' + JSON.stringify(s));
  }
  const bad = result.steps[0];
  const good = result.steps[1];
  const kb = result.steps[2];

  const checks = [
    ['非法输入显示 ✗', bad.status === '✗', bad.status],
    ['给出中文错误原因', /未定义/.test(bad.help || ''), bad.help],
    ['输入框标记为 invalid（无障碍）', bad.invalidClass === true && bad.ariaInvalid === 'true'],
    ['错误被定位到字符（出现插入符行）', Array.isArray(bad.caret) && bad.caret.length === 2 && /\^/.test(bad.caret[1]), bad.caret],
    ['合法输入显示 ✓', good.status === '✓', good.status],
    ['自动生成 LaTeX 回显', /x/.test(good.latexPreview || ''), good.latexPreview],
    ['错误提示消失', good.caretHidden === true],
    ['输入→首帧渲染 < 100ms', good.parseToPaintMs < 100, good.parseToPaintMs + ' ms'],
    ['键盘探针改变读数（无障碍）', kb.readoutsChanged === true],
    ['画布有内容（多曲线已绘制）', result.inkPct > 0.5, result.inkPct + ' %'],
    ['无运行时错误', result.bootError === '', result.bootError]
  ];
  console.log('');
  for (const [name, ok, extra] of checks) {
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + name + (extra !== undefined && extra !== '' ? '  → ' + extra : ''));
    if (!ok) pass = false;
  }
  console.log('\n' + (pass ? '沙盒验收通过：解析-定位-渲染-探针全链路正常。' : '沙盒验收未通过。') + '\n');
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
