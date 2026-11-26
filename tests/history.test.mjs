import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { MAX_SNAPSHOTS, RiskHistory, cleanRisks, historyKey } from '../electron/history.mjs';

test('keeps one snapshot per day, oldest first, with only ids and known levels', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'analyzer-history-'));
  const history = new RiskHistory(directory);
  const key = historyKey('https://moodle.example.edu', 12);
  await history.record(key, { 7: 'low' }, new Date('2026-11-02T10:00:00Z'));
  await history.record(key, { 7: 'high', 8: 'medium' }, new Date('2026-11-01T10:00:00Z'));
  const list = await history.record(key, { 7: 'medium', bad: 'high', 9: 'unknown' }, new Date('2026-11-02T18:00:00Z'));
  assert.deepEqual(list, [
    { day: '2026-11-01', risks: { 7: 'high', 8: 'medium' } },
    { day: '2026-11-02', risks: { 7: 'medium' } }
  ]);
  assert.doesNotMatch(await fs.readFile(path.join(directory, 'risk-history.json'), 'utf8'), /moodle\.example/);
  await fs.rm(directory, { recursive: true, force: true });
});

test('keeps at most the latest snapshots', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'analyzer-history-'));
  const history = new RiskHistory(directory);
  let list = [];
  for (let day = 0; day < MAX_SNAPSHOTS + 3; day += 1) list = await history.record('k', { 1: 'low' }, new Date(Date.UTC(2026, 0, 1 + day)));
  assert.equal(list.length, MAX_SNAPSHOTS);
  assert.equal(list[0].day, '2026-01-04');
  assert.deepEqual(cleanRisks(null), {});
  await fs.rm(directory, { recursive: true, force: true });
});
