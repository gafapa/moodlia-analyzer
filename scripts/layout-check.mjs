// Opens every screen of the app with the demo Moodle (scripts/demo-moodle.mjs) at several
// window widths and reports anything wider than the window, and how much of the window the
// content uses. Run `npm run build` first. Exits with 1 when something overflows.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { startDemoMoodle } from './demo-moodle.mjs';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 9335;
const WIDTHS = (process.argv[2] ?? '900,1100,1366,1680,1920,2560').split(',').map(Number);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await fs.access(path.join(root, 'dist', 'index.html')).catch(() => { throw new Error('Run npm run build first.'); });
const demo = await startDemoMoodle();
const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moodlia-analyzer-layout-'));
const app = spawn(require('electron'), ['.', `--user-data-dir=${profileDir}`, `--remote-debugging-port=${PORT}`, '--remote-allow-origins=*'], { cwd: root, stdio: 'ignore' });
let failures = 0;

try {
  let url;
  for (let tries = 0; tries < 60 && !url; tries += 1) {
    try {
      url = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((entry) => entry.type === 'page')?.webSocketDebuggerUrl;
    } catch {
      // Still starting.
    }
    if (!url) await sleep(500);
  }
  const socket = new WebSocket(url);
  await new Promise((resolve) => { socket.onopen = resolve; });
  let next = 0;
  const waiting = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && waiting.has(message.id)) { waiting.get(message.id)(message); waiting.delete(message.id); }
  };
  // Every DevTools call gives up after ten seconds, so a stuck step cannot hang the check.
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = ++next;
    const timer = setTimeout(() => { waiting.delete(id); resolve({}); }, 10000);
    waiting.set(id, (message) => { clearTimeout(timer); resolve(message); });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const run = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
  const until = async (expression) => {
    for (let tries = 0; tries < 120; tries += 1) {
      if (await run(expression)) return;
      await sleep(500);
    }
    throw new Error(`Timed out waiting for ${expression}`);
  };
  const click = (selector, index = 0) => run(`(() => { const e = document.querySelectorAll(${JSON.stringify(selector)})[${index}]; e?.click(); return Boolean(e); })()`);

  // Elements that reach past the right edge, and the share of the width the content uses.
  const measure = `(() => {
    const width = document.documentElement.clientWidth;
    const over = [];
    for (const element of document.querySelectorAll('body *')) {
      const box = element.getBoundingClientRect();
      if (box.width && box.right > width + 1 && !element.closest('.table-wrap, .heatmap')) {
        const parent = element.parentElement?.getBoundingClientRect();
        if (!parent || parent.right <= width + 1) over.push((element.className?.baseVal ?? element.className ?? element.tagName) + ' +' + Math.round(box.right - width));
      }
    }
    const content = document.querySelector('.page-inner, .main');
    const used = content ? Math.round(content.getBoundingClientRect().right) : width;
    return { scroll: document.documentElement.scrollWidth - width, over: over.slice(0, 5), emptyRight: width - used };
  })()`;
  const record = async (name) => {
    for (const width of WIDTHS) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
      await sleep(350);
      const result = await run(measure);
      const bad = result.scroll > 0 || result.over.length > 0;
      if (bad) failures += 1;
      console.log(`${bad ? 'OVERFLOW' : 'ok      '} ${String(width).padStart(4)} ${name.padEnd(22)} scroll=${result.scroll} emptyRight=${result.emptyRight}${result.over.length ? ` ${result.over.join(', ')}` : ''}`);
    }
  };

  await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await until('document.getElementById("root")?.childElementCount > 0');
  await run(`window.analyzer.profiles.save({ name: 'IES Demo', url: ${JSON.stringify(demo.url)}, token: 'demo-token' }).then((r) => r.ok)`);
  await run(`localStorage.setItem('moodlia-analyzer.language', 'es'); location.reload(); true`);
  await sleep(1500);
  await until(`[...document.querySelectorAll('button')].some((b) => b.innerText.includes('IES Demo'))`);
  await record('signin');
  await run(`[...document.querySelectorAll('button')].find((b) => b.innerText.includes('IES Demo')).click(); true`);
  await until(`document.querySelector('[role=tab]') && !document.querySelector('progress')`);
  for (let index = 0; index < 6; index += 1) { await click('[role=tab]', index); await record(`panel-${index}`); }
  await click('.btn', 0);
  await sleep(500);
  await record('courses');
  await click('[role=tab]', 0);
  await run(`[...document.querySelectorAll('button')].find((b) => /pendientes/i.test(b.innerText))?.click(); true`);
  await until(`Boolean(document.querySelector('.todo-course'))`);
  await click('.todo-course');
  await until('Boolean(document.getElementById("tab-summary")) && !document.querySelector("progress")');
  for (const tab of ['summary', 'students', 'profiles', 'submissions', 'grading', 'quizzes', 'forums', 'completion', 'pace', 'course']) {
    if (await click(`#tab-${tab}`)) await record(`course-${tab}`);
  }
  await click('#tab-students');
  await click('tbody .btn-link');
  await until('Boolean(document.querySelector(".avatar.large"))');
  for (let index = 0; index < 4; index += 1) { await click('[role=tab]', index); await record(`student-${index}`); }
  socket.close();
} finally {
  app.kill();
  await demo.close();
  await sleep(1500);
  await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
}
process.exit(failures ? 1 : 0);
