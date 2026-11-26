// Takes the screenshots in docs/screenshots from the demo Moodle (scripts/demo-moodle.mjs), so
// they show fictitious students only. Run `npm run build` first. The app runs with a temporary
// profile directory and a DevTools port on 127.0.0.1 that only this script uses.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { startDemoMoodle } from './demo-moodle.mjs';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 9334;
// SHOTS_WIDTH, SHOTS_HEIGHT, SHOTS_LANGUAGES and SHOTS_DIR change the window size, the
// languages and the folder, for example to look at other screen sizes.
const WIDTH = Number(process.env.SHOTS_WIDTH ?? 1360);
const HEIGHT = Number(process.env.SHOTS_HEIGHT ?? 860);
const LANGUAGES = (process.env.SHOTS_LANGUAGES ?? 'en,es').split(',');
const OUT = process.env.SHOTS_DIR ?? path.join(root, 'docs', 'screenshots');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await fs.access(path.join(root, 'dist', 'index.html')).catch(() => { throw new Error('Run npm run build first.'); });
const demo = await startDemoMoodle();
const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'moodlia-analyzer-shots-'));
const app = spawn(require('electron'), ['.', `--user-data-dir=${profileDir}`, `--remote-debugging-port=${PORT}`, '--remote-allow-origins=*'], { cwd: root, stdio: 'ignore' });

async function page() {
  for (let tries = 0; tries < 60; tries += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const target = targets.find((entry) => entry.type === 'page');
      if (target) return target.webSocketDebuggerUrl;
    } catch {
      // The app is still starting.
    }
    await sleep(500);
  }
  throw new Error('The app did not open a page.');
}

try {
  const socket = new WebSocket(await page());
  await new Promise((resolve) => { socket.onopen = resolve; });
  let next = 0;
  const waiting = new Map();
  const pageErrors = [];
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') pageErrors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') pageErrors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '));
    if (message.id && waiting.has(message.id)) { waiting.get(message.id)(message); waiting.delete(message.id); }
  };
  const send = (method, params = {}) => new Promise((resolve) => { const id = ++next; waiting.set(id, resolve); socket.send(JSON.stringify({ id, method, params })); });
  const run = async (expression) => {
    const { result } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result?.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? expression);
    return result?.result?.value;
  };
  const until = async (expression, label) => {
    for (let tries = 0; tries < 240; tries += 1) {
      if (await run(expression)) return;
      await sleep(500);
    }
    const shown = (await run('document.body.innerText.slice(0, 400)')) ?? '';
    if (process.env.SHOTS_DEBUG) await fs.writeFile(process.env.SHOTS_DEBUG, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
    throw new Error(`Timed out waiting for ${label}. The page shows: ${shown} | Page errors: ${pageErrors.join(' | ').slice(0, 2000)}`);
  };
  const shot = async (language, name) => {
    await run('window.scrollTo(0, 0)');
    await sleep(600);
    const { result } = await send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(OUT, language, `${name}.png`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, Buffer.from(result.data, 'base64'));
    console.log(`  ${file}`);
  };
  const click = (selector, index = 0) => run(`(() => { const element = document.querySelectorAll(${JSON.stringify(selector)})[${index}]; element?.click(); return Boolean(element); })()`);

  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
  await until('document.getElementById("root")?.childElementCount > 0', 'the sign-in screen');
  const saved = await run(`window.analyzer.profiles.save({ name: 'IES Demo', url: ${JSON.stringify(demo.url)}, token: 'demo-token' }).then((result) => result.ok)`);
  if (!saved) throw new Error('Could not save the demo site.');

  for (const language of LANGUAGES) {
    console.log(language);
    await run(`localStorage.setItem('moodlia-analyzer.language', '${language}'); location.reload(); true`);
    await sleep(1500);
    await until(`[...document.querySelectorAll('button')].some((button) => button.innerText.includes('IES Demo'))`, 'the saved site');
    await run(`[...document.querySelectorAll('button')].find((button) => button.innerText.includes('IES Demo')).click(); true`);
    await until(`document.querySelector('[role=tab]') && !document.querySelector('progress')`, 'the teacher panel');

    for (const [index, name] of ['panel-today', 'panel-grading', 'panel-students', 'panel-calendar', 'panel-forums', 'panel-courses'].entries()) {
      await click('[role=tab]', index);
      if (name === 'panel-calendar') await click('.day.level-1, .day.level-2, .day.level-3, .day.level-4');
      await shot(language, name);
    }

    await click('[role=tab]', 0);
    await click('.todo-course');
    await until('Boolean(document.getElementById("tab-summary"))', 'the course panel');
    await until('!document.querySelector("progress")', 'the course analysis');
    for (const tab of ['summary', 'students', 'profiles', 'submissions', 'grading', 'quizzes', 'forums', 'pace']) {
      if (!(await click(`#tab-${tab}`))) continue;
      await shot(language, `course-${tab}`);
    }

    await click('#tab-students');
    await click('tbody .btn-link');
    await until('Boolean(document.querySelector(".avatar.large"))', 'the student detail');
    await shot(language, 'student-summary');
    await click('[role=tab]', 3);
    await shot(language, 'student-workload');
    await run(`[...document.querySelectorAll('button.back')][0]?.click(); true`);
    await sleep(500);
    await run(`[...document.querySelectorAll('.nav-item')][0]?.click(); true`);
    await sleep(500);
    await run(`[...document.querySelectorAll('button')].find((button) => /Change site|Cambiar de sitio|Cambiar de sitio/.test(button.innerText))?.click(); true`);
    await sleep(1000);
  }
  socket.close();
} finally {
  app.kill();
  await demo.close();
  await sleep(1500);
  await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
}
