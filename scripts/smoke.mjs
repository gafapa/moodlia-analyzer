// Starts the built app with MOODLIA_ANALYZER_SMOKE=1 and fails unless the window checks pass.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const run = spawnSync(require('electron'), ['.'], {
  env: { ...process.env, MOODLIA_ANALYZER_SMOKE: '1' },
  encoding: 'utf8',
  timeout: 60_000
});
const line = `${run.stdout}`.split('\n').find((entry) => entry.startsWith('SMOKE '));
console.log(line ?? `No smoke result.\n${run.stdout}\n${run.stderr}`);
process.exit(run.status === 0 && line ? 0 : 1);
