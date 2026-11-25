import assert from 'node:assert/strict';
import test from 'node:test';
import { MoodleSession, normalizeSiteUrl } from '../electron/moodle/session.mjs';

const contract = (operations) => ({ operations });

/** Fake adaptive adapter with optional MoodlIA and core providers. */
function fakeSite({ moodlia = null, core = null, calls = [] } = {}) {
  const adapters = {};
  if (moodlia) {
    adapters.moodlia = {
      discovery: { operations: moodlia.operations },
      hasDeclaredOperation: (name) => moodlia.declared.includes(name),
      client: {
        contract: contract(moodlia.operations.map((name) => ({ name, kind: moodlia.writes?.includes(name) ? 'write' : 'read' }))),
        callOperation: async (name, parameters) => { calls.push(['moodlia', name, parameters]); return moodlia.responses?.[name]; }
      }
    };
  }
  if (core) {
    adapters.core = {
      discovery: { operations: core.operations },
      client: {
        contract: contract(core.operations.map((name) => ({ name, kind: 'read' }))),
        callOperation: async (name, parameters) => { calls.push(['core', name, parameters]); return core.responses?.[name]; }
      }
    };
  }
  const providers = {};
  if (moodlia) providers.moodlia = moodlia.down
    ? { available: false, error: { code: 'unavailable', message: 'Plugin not installed.' } }
    : { available: true, evidence: { site_name: 'Lab', site_url: 'https://lab.test', moodle_release: '4.5.15', plugin_release: '0.1.224', user_id: 7 } };
  if (core) providers.core = { available: true, evidence: { site_name: 'Lab', site_url: 'https://lab.test', moodle_release: '4.5.15', user_id: 7 } };
  const selected = ['moodlia', 'core'].find((name) => providers[name]?.available);
  return (options) => {
    fakeSite.lastOptions = options;
    return {
      discoverSite: async () => ({ selected_read_provider: selected, providers }),
      availableAdapter: (preference) => preference.map((name) => providers[name]?.available ? adapters[name] : null).find(Boolean) ?? null
    };
  };
}

const profile = { name: 'Lab', url: 'https://lab.test/', token: 'moodlia-token' };

test('site addresses must use HTTPS except on this computer', () => {
  assert.equal(normalizeSiteUrl('https://moodle.example.edu/').url, 'https://moodle.example.edu');
  assert.equal(normalizeSiteUrl('http://localhost:8080').allowInsecure, true);
  assert.throws(() => normalizeSiteUrl('http://moodle.example.edu'), { code: 'insecure_url' });
  assert.throws(() => normalizeSiteUrl('https://user:pass@moodle.example.edu'), { code: 'invalid_url' });
  assert.throws(() => normalizeSiteUrl('moodle'), { code: 'invalid_url' });
});

test('one token is used for both providers unless a core token is given', () => {
  new MoodleSession(profile, { createSiteAdapter: fakeSite({ core: { operations: [] } }), moodliaContract: {} });
  assert.deepEqual(fakeSite.lastOptions.profile.credentials, { moodlia: { token: 'moodlia-token' }, core: { token: 'moodlia-token' } });
  assert.equal(fakeSite.lastOptions.allowWrite, false);
  new MoodleSession({ ...profile, coreToken: 'core-token' }, { createSiteAdapter: fakeSite({ core: { operations: [] } }), moodliaContract: {} });
  assert.equal(fakeSite.lastOptions.profile.credentials.core.token, 'core-token');
  assert.throws(() => new MoodleSession({ ...profile, token: '' }, { createSiteAdapter: fakeSite(), moodliaContract: {} }), { code: 'missing_token' });
});

test('each read goes to the provider it names', async () => {
  const calls = [];
  const session = new MoodleSession(profile, {
    moodliaContract: {},
    createSiteAdapter: fakeSite({
      calls,
      moodlia: { operations: ['get_course_progress_report', 'get_user_courses'], declared: ['get_course_progress_report'] },
      core: { operations: ['get_user_courses'], responses: { get_user_courses: [{ id: 3, shortname: 'BIO', fullname: 'Biology', visible: 1 }] } }
    })
  });
  const summary = await session.connect();
  assert.equal(summary.moodlia.available, true);
  assert.equal(summary.moodlia.pluginRelease, '0.1.224');
  await session.read('moodlia', 'get_course_progress_report', { course_id: 3 });
  assert.deepEqual(calls.at(-1), ['moodlia', 'get_course_progress_report', { course_id: 3 }]);
  await assert.rejects(session.read('moodlia', 'get_user_courses', { user_id: 7 }), { code: 'operation_unavailable' });
  assert.deepEqual(await session.listCourses(), [{ id: 3, shortName: 'BIO', fullName: 'Biology', visible: true, startDate: null, endDate: null, enrolledCount: null, enableCompletion: false, lastAccess: null }]);
  assert.deepEqual(calls.at(-1), ['core', 'get_user_courses', { user_id: 7 }]);
});

test('without the plugin only core web services answer', async () => {
  const session = new MoodleSession(profile, {
    moodliaContract: {},
    createSiteAdapter: fakeSite({ moodlia: { operations: [], declared: [], down: true }, core: { operations: ['get_site_info'] } })
  });
  const summary = await session.connect();
  assert.deepEqual(summary.moodlia, { available: false, reason: 'Plugin not installed.' });
  assert.equal(session.offers('moodlia'), false);
  await session.read('core', 'get_site_info');
  await assert.rejects(session.read('moodlia', 'get_course_progress_report'), { code: 'operation_unavailable' });
  await assert.rejects(session.read('other', 'get_site_info'), { code: 'invalid_provider' });
});

test('write operations are refused even when a provider offers them', async () => {
  const session = new MoodleSession(profile, {
    moodliaContract: {},
    createSiteAdapter: fakeSite({ moodlia: { operations: ['update_grade_value'], declared: ['update_grade_value'], writes: ['update_grade_value'] } })
  });
  await session.connect();
  await assert.rejects(session.read('moodlia', 'update_grade_value', {}), { code: 'write_refused' });
});

test('reads before connecting are refused', async () => {
  const session = new MoodleSession(profile, { moodliaContract: {}, createSiteAdapter: fakeSite({ core: { operations: [] } }) });
  await assert.rejects(session.read('core', 'get_site_info'), { code: 'not_connected' });
});
