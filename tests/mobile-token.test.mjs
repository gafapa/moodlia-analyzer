import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { buildLaunchUrl, createPassport, isLaunchRedirect, parseLaunchRedirect, readMobileConfig, requestTokenWithPassword, signInMethod } from '../electron/moodle/mobile-token.mjs';

const SITE = 'https://moodle.example.edu';
const TOKEN = 'a'.repeat(32);

/** The redirect Moodle's launch.php sends, built the same way. */
function redirectFor(wwwroot, passport, token = TOKEN, extra = '') {
  const signature = createHash('md5').update(wwwroot + passport).digest('hex');
  return `moodlemobile://token=${Buffer.from(`${signature}:::${token}${extra}`).toString('base64')}`;
}

function fakeFetch(answer, { ok = true } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push([url, JSON.parse(init.body)]);
    if (answer instanceof Error) throw answer;
    return { ok, json: async () => answer };
  };
  return { calls, impl };
}

test('the launch address asks for the Moodle app service with this sign-in passport', () => {
  const passport = createPassport();
  assert.match(passport, /^[0-9a-f]{32}$/);
  const url = new URL(buildLaunchUrl(`${SITE}/admin/tool/mobile/launch.php`, passport));
  assert.equal(url.pathname, '/admin/tool/mobile/launch.php');
  assert.equal(url.searchParams.get('service'), 'moodle_mobile_app');
  assert.equal(url.searchParams.get('passport'), passport);
  assert.equal(url.searchParams.get('urlscheme'), 'moodlemobile');
});

test('a token signed by the site for this passport is accepted and the private token dropped', () => {
  assert.equal(isLaunchRedirect('MoodleMobile://token=abc'), true);
  assert.equal(isLaunchRedirect(`${SITE}/login`), false);
  assert.equal(parseLaunchRedirect(redirectFor(SITE, 'p1'), SITE, 'p1'), TOKEN);
  assert.equal(parseLaunchRedirect(redirectFor(SITE, 'p1', TOKEN, ':::private123'), SITE, 'p1'), TOKEN);
});

test('tokens signed for another site or passport are refused', () => {
  assert.throws(() => parseLaunchRedirect(redirectFor('https://evil.example', 'p1'), SITE, 'p1'), { code: 'invalid_token_response' });
  assert.throws(() => parseLaunchRedirect(redirectFor(SITE, 'other'), SITE, 'p1'), { code: 'invalid_token_response' });
  assert.throws(() => parseLaunchRedirect(redirectFor(SITE, 'p1', 'bad token!'), SITE, 'p1'), { code: 'invalid_token_response' });
  assert.throws(() => parseLaunchRedirect('moodlemobile://nothing', SITE, 'p1'), { code: 'invalid_token_response' });
});

test('the public configuration gives the site address Moodle signs with', async () => {
  const fake = fakeFetch([{ error: false, data: { wwwroot: 'https://moodle.example.edu/', launchurl: `${SITE}/admin/tool/mobile/launch.php`, enablemobilewebservice: 1 } }]);
  assert.deepEqual(await readMobileConfig(SITE, fake.impl), { wwwroot: SITE, launchUrl: `${SITE}/admin/tool/mobile/launch.php`, typeOfLogin: 1 });
  assert.equal(fake.calls[0][0], `${SITE}/lib/ajax/service-nologin.php?info=tool_mobile_get_public_config`);
  assert.equal(fake.calls[0][1][0].methodname, 'tool_mobile_get_public_config');
});

test('a launch address on another host is ignored', async () => {
  const fake = fakeFetch([{ error: false, data: { wwwroot: SITE, launchurl: 'https://evil.example/launch.php', enablemobilewebservice: 1 } }]);
  assert.equal((await readMobileConfig(SITE, fake.impl)).launchUrl, `${SITE}/admin/tool/mobile/launch.php`);
});

test('a site with the Moodle app service off is reported before the sign-in opens', async () => {
  const fake = fakeFetch([{ error: false, data: { wwwroot: SITE, enablemobilewebservice: 0 } }]);
  await assert.rejects(readMobileConfig(SITE, fake.impl), { code: 'mobile_service_disabled' });
});

test('sites without the public configuration fall back to the entered address', async () => {
  for (const fake of [fakeFetch(new Error('offline')), fakeFetch([{ error: true, exception: {} }]), fakeFetch(null, { ok: false })]) {
    assert.deepEqual(await readMobileConfig(SITE, fake.impl), { wwwroot: SITE, launchUrl: `${SITE}/admin/tool/mobile/launch.php`, typeOfLogin: 1 });
  }
});

test('the site login type decides between password and the site page', async () => {
  for (const [typeoflogin, expected] of [[1, 'password'], [2, 'browser'], [3, 'browser'], [undefined, 'password']]) {
    const fake = fakeFetch([{ error: false, data: { wwwroot: SITE, enablemobilewebservice: 1, typeoflogin } }]);
    assert.equal(signInMethod(await readMobileConfig(SITE, fake.impl)), expected);
  }
});

/** A fetch that answers the public configuration and then login/token.php. */
function tokenFetch(tokenAnswer, { status = 200 } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push([url, init]);
    if (url.includes('service-nologin.php')) {
      return { ok: true, json: async () => [{ error: false, data: { wwwroot: SITE, enablemobilewebservice: 1, typeoflogin: 1 } }] };
    }
    return { ok: status === 200, status, json: async () => tokenAnswer };
  };
  return { calls, impl };
}

test('username and password get a Moodle app token from login/token.php', async () => {
  const fake = tokenFetch({ token: TOKEN, privatetoken: 'private' });
  assert.equal(await requestTokenWithPassword(`${SITE}/`, ' teacher ', 'pa ss&word', fake.impl), TOKEN);
  const [url, init] = fake.calls[1];
  assert.equal(url, `${SITE}/login/token.php`);
  assert.equal(init.method, 'POST');
  assert.equal(init.redirect, 'error');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(init.body)), { username: 'teacher', password: 'pa ss&word', service: 'moodle_mobile_app' });
});

test('Moodle sign-in errors are reported with the message Moodle gives', async () => {
  await assert.rejects(requestTokenWithPassword(SITE, 'teacher', 'wrong', tokenFetch({ error: 'Invalid login, please try again', errorcode: 'invalidlogin' }).impl), { code: 'invalid_login', message: 'Invalid login, please try again' });
  await assert.rejects(requestTokenWithPassword(SITE, 'teacher', 'x', tokenFetch({}, { status: 500 }).impl), { code: 'sign_in_failed' });
  await assert.rejects(requestTokenWithPassword(SITE, 'teacher', 'x', tokenFetch({ token: 'short' }).impl), { code: 'invalid_token_response' });
  await assert.rejects(requestTokenWithPassword(SITE, '', 'x', tokenFetch({}).impl), { code: 'credentials_required' });
  await assert.rejects(requestTokenWithPassword('http://moodle.example.edu', 'teacher', 'x', tokenFetch({}).impl), { code: 'insecure_url' });
});
