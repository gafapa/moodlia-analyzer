// @ts-check
// Part of the startup smoke check (MOODLIA_ANALYZER_SMOKE=1): runs the real sign-in window
// against a fake Moodle on 127.0.0.1. The fake sends the browser through a sign-in form, a
// form submission and two redirects, then answers like admin/tool/mobile/launch.php.
import { createHash } from 'node:crypto';
import http from 'node:http';
import { signInForMobileToken } from './sign-in-window.mjs';

const TOKEN = '0123456789abcdef0123456789abcdef';

/** @returns {Promise<boolean>} whether the expected token came back */
export async function smokeSignIn() {
  /** @type {string} */
  let base = '';
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', base);
    const signedIn = (request.headers.cookie ?? '').includes('MoodleSession=ok');
    if (url.pathname === '/lib/ajax/service-nologin.php') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify([{ error: false, data: { wwwroot: base, launchurl: `${base}/admin/tool/mobile/launch.php`, enablemobilewebservice: 1, typeoflogin: 2 } }]));
    } else if (url.pathname === '/admin/tool/mobile/launch.php' && !signedIn) {
      response.writeHead(303, { Location: `/login/index.php?wantsurl=${encodeURIComponent(url.pathname + url.search)}` }).end();
    } else if (url.pathname === '/admin/tool/mobile/launch.php') {
      const passport = url.searchParams.get('passport') ?? '';
      const signature = createHash('md5').update(base + passport).digest('hex');
      const ok = url.searchParams.get('service') === 'moodle_mobile_app' && url.searchParams.get('urlscheme') === 'moodlemobile';
      response.writeHead(ok ? 303 : 400, ok ? { Location: `moodlemobile://token=${Buffer.from(`${signature}:::${TOKEN}:::private`).toString('base64')}` } : {}).end();
    } else if (url.pathname === '/login/index.php' && request.method === 'POST') {
      let body = '';
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        const wantsurl = new URLSearchParams(body).get('wantsurl') ?? '/';
        response.writeHead(303, { Location: wantsurl.startsWith('/') ? wantsurl : '/', 'Set-Cookie': 'MoodleSession=ok; Path=/; HttpOnly' }).end();
      });
    } else if (url.pathname === '/login/index.php') {
      response.setHeader('Content-Type', 'text/html');
      const wantsurl = (url.searchParams.get('wantsurl') ?? '/').replace(/"/g, '&quot;');
      response.end(`<!doctype html><title>Log in</title><form method="post" action="/login/index.php"><input type="hidden" name="wantsurl" value="${wantsurl}"><button>Log in</button></form><script>document.forms[0].submit()</script>`);
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  try {
    return (await signInForMobileToken(null, base)) === TOKEN;
  } finally {
    server.close();
  }
}
