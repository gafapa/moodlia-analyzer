// @ts-check
import { app, BrowserWindow, ipcMain, safeStorage, session, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MoodleSession, SessionError } from './moodle/session.mjs';
import { ProfileStore } from './profiles.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const devServerUrl = process.env.MOODLIA_ANALYZER_DEV_URL ?? '';
const rendererUrl = devServerUrl || new URL(`file:///${path.join(root, 'dist', 'index.html').replaceAll('\\', '/')}`).toString();
const rendererOrigin = devServerUrl ? new URL(devServerUrl).origin : 'file://';

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {MoodleSession | null} */
let current = null;
/** @type {ProfileStore} */
let profiles;

/** Only the app's own page may call the main process. @param {Electron.IpcMainInvokeEvent} event */
function assertTrustedSender(event) {
  const frameUrl = event.senderFrame?.url ?? '';
  const trusted = event.sender === mainWindow?.webContents
    && (devServerUrl ? new URL(frameUrl).origin === rendererOrigin : frameUrl.startsWith('file://'));
  if (!trusted) throw new Error('Untrusted sender.');
}

/** Runs a handler and returns errors as plain data the interface can show. */
function handle(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    assertTrustedSender(event);
    try {
      return { ok: true, value: await handler(...args) };
    } catch (error) {
      const known = error instanceof SessionError || error instanceof TypeError;
      return { ok: false, error: { code: known ? String(/** @type {any} */ (error).code ?? 'invalid_input') : 'internal_error', message: known ? error.message : 'Unexpected error.' } };
    }
  });
}

function requireSession() {
  if (!current) throw new SessionError('not_connected', 'Connect to a Moodle site first.');
  return current;
}

function registerHandlers() {
  handle('profiles:list', () => profiles.list());
  handle('profiles:save', (input) => profiles.save(input ?? {}));
  handle('profiles:remove', (id) => profiles.remove(String(id)));
  handle('session:connect', async (request) => {
    const profile = request?.profileId ? await profiles.load(String(request.profileId)) : request ?? {};
    const next = new MoodleSession({ name: String(profile.name ?? 'Moodle'), url: String(profile.url ?? ''), token: profile.token, coreToken: profile.coreToken });
    const summary = await next.connect();
    current = next;
    return summary;
  });
  handle('session:disconnect', () => { current = null; return true; });
  handle('session:courses', () => requireSession().listCourses());
  handle('session:read', (operation, parameters) => requireSession().read(String(operation), parameters && typeof parameters === 'object' ? parameters : {}));
}

function contentSecurityPolicy() {
  const connect = devServerUrl ? `'self' ${devServerUrl.replace(/^http/, 'ws')}` : "'self'";
  const script = devServerUrl ? "'self' 'unsafe-inline'" : "'self'";
  return `default-src 'self'; script-src ${script}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src ${connect}; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'MoodlIA Analyzer',
    show: false,
    webPreferences: {
      preload: path.join(root, 'electron', 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  // The window shows only the app; external links open in the default browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(rendererUrl)) event.preventDefault();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  if (process.env.MOODLIA_ANALYZER_SMOKE === '1') runSmokeCheck(mainWindow);
  void mainWindow.loadURL(rendererUrl);
}

/**
 * Startup check used by `npm run smoke`: the page loads, the bridge is present, Node is not
 * reachable from the page, and a bridge call returns. Prints one JSON line and quits.
 * @param {BrowserWindow} window
 */
function runSmokeCheck(window) {
  window.webContents.once('did-finish-load', async () => {
    let result;
    try {
      result = await window.webContents.executeJavaScript(`(async () => ({
        title: document.title,
        rendered: document.getElementById('root').childElementCount > 0,
        bridge: typeof window.analyzer?.session?.connect === 'function',
        nodeHidden: typeof require === 'undefined' && typeof process === 'undefined',
        profiles: (await window.analyzer.profiles.list()).ok
      }))()`);
    } catch (error) {
      result = { error: String(error) };
    }
    console.log(`SMOKE ${JSON.stringify(result)}`);
    app.exit(result?.rendered && result.bridge && result.nodeHidden && result.profiles ? 0 : 1);
  });
}

app.whenReady().then(() => {
  if (process.env.MOODLIA_ANALYZER_SMOKE === '1') app.setPath('userData', path.join(app.getPath('temp'), `moodlia-analyzer-smoke-${process.pid}`));
  profiles = new ProfileStore(app.getPath('userData'), safeStorage);
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [contentSecurityPolicy()] } });
  });
  registerHandlers();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
