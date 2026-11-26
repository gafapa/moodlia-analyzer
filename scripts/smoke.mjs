// Starts the app with MOODLIA_ANALYZER_SMOKE=1 and fails unless the window checks pass.
// Without arguments it runs the development Electron on the built interface; with
// --packaged it runs the unpacked app that `npm run package:dir` leaves in release/.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const productName = require('../package.json').build.productName;

/** The executable inside the first unpacked app directory electron-builder produced. */
function packagedExecutable() {
  const release = path.resolve('release');
  const directories = existsSync(release) ? readdirSync(release, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name) : [];
  // Prefer the build for this machine's architecture (mac-arm64 over mac on Apple silicon).
  directories.sort((a, b) => Number(b.endsWith(`-${process.arch}`)) - Number(a.endsWith(`-${process.arch}`)));
  for (const directory of directories) {
    const candidates = {
      win32: [path.join(release, directory, `${productName}.exe`)],
      darwin: [path.join(release, directory, `${productName}.app`, 'Contents', 'MacOS', productName)],
      linux: [path.join(release, directory, 'moodlia-analyzer')]
    }[process.platform] ?? [];
    const found = candidates.find((candidate) => existsSync(candidate));
    if (found) return found;
  }
  throw new Error(`No unpacked app in ${release}. Run npm run package:dir first.`);
}

const packaged = process.argv.includes('--packaged');
const [command, args] = packaged ? [packagedExecutable(), []] : [require('electron'), ['.']];
console.log(`Smoke check: ${command}`);
const run = spawnSync(command, args, {
  env: { ...process.env, MOODLIA_ANALYZER_SMOKE: '1' },
  encoding: 'utf8',
  timeout: 60_000
});
const line = `${run.stdout}`.split('\n').find((entry) => entry.startsWith('SMOKE '));
console.log(line ?? `No smoke result.\n${run.stdout}\n${run.stderr}${run.error ? `\n${run.error}` : ''}`);
process.exit(run.status === 0 && line ? 0 : 1);
