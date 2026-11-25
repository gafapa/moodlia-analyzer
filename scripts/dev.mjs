// Starts the Vite dev server for the interface, then Electron pointed at it.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const server = await createServer({ configFile: 'vite.config.ts' });
await server.listen();
const url = server.resolvedUrls?.local?.[0];
if (!url) throw new Error('The Vite dev server did not report a local address.');

const electron = spawn(require('electron'), ['.'], {
  stdio: 'inherit',
  env: { ...process.env, MOODLIA_ANALYZER_DEV_URL: url.replace(/\/$/, '') }
});
electron.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
