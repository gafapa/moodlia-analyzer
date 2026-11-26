// Checks the GitHub Pages site in site/: it has a title, every local file it links exists,
// and it loads no script or stylesheet from another origin.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const site = path.resolve('site');
const html = readFileSync(path.join(site, 'index.html'), 'utf8');
const problems = [];
if (!/<title>[^<]+<\/title>/.test(html)) problems.push('index.html has no title.');
for (const [, attribute, value] of html.matchAll(/\b(href|src)="([^"]+)"/g)) {
  if (/^(https?:|mailto:|#)/.test(value) || value === './') {
    if (attribute === 'src' && /^https?:/.test(value)) problems.push(`External script or image: ${value}`);
    continue;
  }
  if (!existsSync(path.join(site, value.split(/[?#]/)[0]))) problems.push(`Missing file: ${value}`);
}
for (const [, value] of html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="(https?:[^"]+)"/g)) problems.push(`External stylesheet: ${value}`);
for (const id of html.matchAll(/href="#([^"]+)"/g)) {
  if (!html.includes(`id="${id[1]}"`)) problems.push(`Missing anchor: #${id[1]}`);
}
if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('Site check passed.');
