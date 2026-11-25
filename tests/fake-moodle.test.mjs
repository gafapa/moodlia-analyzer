// End-to-end check of the session with the real moodlia and moodle-core-cli clients
// against a fake Moodle REST endpoint on this computer.
import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { MoodleSession } from '../electron/moodle/session.mjs';

const SITE = { sitename: 'Fake Moodle', siteurl: '', release: '4.5.15 (Build: 20260101)', version: '2024100715', userid: 7 };

/** Starts a fake Moodle. withPlugin decides whether MoodlIA functions exist. */
async function fakeMoodle({ withPlugin }) {
  const calls = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const form = new URLSearchParams(body);
      const fn = form.get('wsfunction');
      calls.push({ path: request.url, fn, token: form.get('wstoken') });
      const reply = (value) => { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(value)); };
      if (request.url !== '/webservice/rest/server.php') { response.statusCode = 404; return response.end(); }
      if (fn === 'core_webservice_get_site_info') {
        return reply({ ...SITE, siteurl: `http://127.0.0.1:${server.address().port}`, functions: [{ name: 'core_webservice_get_site_info' }, { name: 'core_enrol_get_users_courses' }] });
      }
      if (fn === 'core_enrol_get_users_courses') return reply([{ id: 3, shortname: 'BIO', fullname: 'Biology', visible: 1 }]);
      if (withPlugin && fn === 'local_moodlia_get_moodlia_status') {
        // Same fields as the plugin's get_moodlia_status contract.
        return reply({
          component: 'local_moodlia', site_url: `http://127.0.0.1:${server.address().port}`, site_name: 'Fake Moodle',
          moodle_release: '4.5.15', moodle_version: '2024100715', plugin_release: '0.1.224', plugin_version: 2026111400,
          user_id: 7, username: 'teacher', can_use_api: true, rest_service: 'MoodlIA', function_count: 1,
          functions_json: JSON.stringify(['local_moodlia_get_moodlia_status'])
        });
      }
      return reply({ exception: 'dml_missing_record_exception', errorcode: 'invalidrecord', message: 'Can not find data record in database table external_functions.' });
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, calls, close: () => new Promise((resolve) => server.close(resolve)) };
}

test('a site without the plugin is read through core web services', async () => {
  const moodle = await fakeMoodle({ withPlugin: false });
  try {
    const session = new MoodleSession({ name: 'Fake', url: moodle.url, token: 'core-only-token' });
    const summary = await session.connect();
    assert.equal(summary.siteName, 'Fake Moodle');
    assert.equal(summary.moodlia.available, false);
    assert.equal(summary.core.available, true);
    assert.deepEqual(await session.listCourses(), [{ id: 3, shortName: 'BIO', fullName: 'Biology', visible: true }]);
    assert.ok(moodle.calls.every((call) => call.token === 'core-only-token'));
  } finally {
    await moodle.close();
  }
});

test('a site with the plugin is detected and plugin reads are allowed', async () => {
  const moodle = await fakeMoodle({ withPlugin: true });
  try {
    const session = new MoodleSession({ name: 'Fake', url: moodle.url, token: 'moodlia-token' });
    const summary = await session.connect();
    assert.equal(summary.moodlia.available, true);
    assert.equal(summary.moodlia.pluginRelease, '0.1.224');
    const status = await session.read('moodlia', 'get_moodlia_status');
    assert.equal(status.plugin_release, '0.1.224');
    assert.equal((await session.listCourses()).length, 1);
  } finally {
    await moodle.close();
  }
});
