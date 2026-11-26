// The demo Moodle used for screenshots answers everything the collector reads, with
// fictitious students only.
import assert from 'node:assert/strict';
import test from 'node:test';
import { CourseCollector } from '../electron/analysis/collector.mjs';
import { MoodleSession } from '../electron/moodle/session.mjs';
import { startDemoMoodle } from '../scripts/demo-moodle.mjs';

test('the demo Moodle gives a complete course with fictitious data', async () => {
  const demo = await startDemoMoodle();
  try {
    const session = new MoodleSession({ name: 'Demo', url: demo.url, token: 'demo-token' });
    await session.connect();
    const courses = await session.listCourses();
    assert.equal(courses.length, 4);
    const data = await new CourseCollector(session).collect(101);
    assert.deepEqual(data.unavailable, {});
    assert.equal(data.students.length, 24);
    assert.deepEqual(data.viewerRoles, ['editingteacher']);
    assert.equal(data.assignments.length, 8);
    assert.equal(Object.keys(data.quizQuestions ?? {}).length, 3);
    assert.ok(data.workload.deadlines.length > 0);
    assert.ok(data.students.every((student) => student.email.endsWith('@demo.invalid')));
  } finally {
    await demo.close();
  }
});
