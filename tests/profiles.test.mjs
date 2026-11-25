import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ProfileStore } from '../electron/profiles.mjs';

/** Reversible stand-in for safeStorage. */
const secrets = (available = true) => ({
  isEncryptionAvailable: () => available,
  encryptString: (value) => Buffer.from(`sealed:${value}`),
  decryptString: (value) => value.toString().replace(/^sealed:/, '')
});

async function store(available = true) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'analyzer-profiles-'));
  return { directory, profiles: new ProfileStore(directory, secrets(available)) };
}

test('tokens are stored encrypted and never listed', async () => {
  const { directory, profiles } = await store();
  const { id, tokensStored } = await profiles.save({ name: 'Lab', url: 'https://lab.test', token: 'secret-token' });
  assert.equal(tokensStored, true);
  const raw = await fs.readFile(path.join(directory, 'profiles.json'), 'utf8');
  assert.ok(!raw.includes('secret-token'));
  assert.deepEqual(await profiles.list(), [{ id, name: 'Lab', url: 'https://lab.test', hasToken: true, hasCoreToken: false }]);
  assert.equal((await profiles.load(id)).token, 'secret-token');
});

test('saving without a token keeps the stored one', async () => {
  const { profiles } = await store();
  const { id } = await profiles.save({ name: 'Lab', url: 'https://lab.test', token: 'first' });
  await profiles.save({ id, name: 'Lab renamed', url: 'https://lab.test' });
  const loaded = await profiles.load(id);
  assert.equal(loaded.name, 'Lab renamed');
  assert.equal(loaded.token, 'first');
});

test('without system encryption tokens are not written to disk', async () => {
  const { directory, profiles } = await store(false);
  const { id, tokensStored } = await profiles.save({ name: 'Lab', url: 'https://lab.test', token: 'secret-token' });
  assert.equal(tokensStored, false);
  assert.ok(!(await fs.readFile(path.join(directory, 'profiles.json'), 'utf8')).includes('secret-token'));
  assert.equal((await profiles.list())[0].hasToken, false);
  await profiles.remove(id);
  assert.deepEqual(await profiles.list(), []);
});
