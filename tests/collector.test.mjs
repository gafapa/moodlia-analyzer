import assert from 'node:assert/strict';
import test from 'node:test';
import { CourseCollector, attemptGrade, isStudent, normalizePost, parseGradeItems } from '../electron/analysis/collector.mjs';

/** Core payloads keyed by operation; a function value receives the parameters. */
const COURSE = 12;
const payloads = {
  get_course_contents: [{ id: 1, name: 'Week 1', modules: [] }],
  get_course_assignments: { courses: [{ id: COURSE, assignments: [{ id: 30, name: 'Essay', duedate: 1_800_000_000 }] }] },
  get_course_quizzes: { quizzes: [{ id: 40, name: 'Quiz', grade: 10, sumgrades: 20 }] },
  get_course_forums: [{ id: 50, name: 'Forum' }],
  get_course_pages: { pages: [{ id: 60 }] },
  get_course_resources: { resources: [] },
  get_assignment_submissions: { assignments: [{ assignmentid: 30, submissions: [{ userid: 7, status: 'submitted', timemodified: 1_799_000_000 }] }] },
  get_assignment_grades: { assignments: [{ assignmentid: 30, grades: [{ userid: 7, grade: '8.0' }] }] },
  get_forum_discussions: { discussions: [{ id: 900, discussion: 70 }] },
  get_forum_discussion_posts: { posts: [{ id: 900, author: { id: 7 }, parentid: 0, timecreated: 1_799_500_000 }, { id: 901, author: { id: 8 }, parentid: 900, timecreated: 1_799_600_000 }] },
  get_enrolled_users: [
    { id: 7, fullname: 'Ana', roles: [{ shortname: 'student' }], lastaccess: 1_799_900_000 },
    { id: 8, fullname: 'Teacher', roles: [{ shortname: 'editingteacher' }] },
    { id: 9, fullname: 'Luis' }
  ],
  get_course_user_profiles: [{ id: 9, roles: [{ shortname: 'student' }], fullname: 'Luis Pérez' }],
  get_grade_items: { usergrades: [{ userid: 7, gradeitems: [{ itemtype: 'course', graderaw: 7, grademax: 10 }, { itemtype: 'mod', itemmodule: 'assign', itemname: 'Essay', graderaw: 8, grademax: 10 }] }] },
  get_activity_completion_statuses: (parameters) => ({ statuses: parameters.user_id === 7 ? [{ state: 1 }, { state: 0 }] : [] }),
  get_user_quiz_attempts_legacy: (parameters) => ({ attempts: parameters.user_id === 7 ? [{ id: 1, state: 'finished', sumgrades: 15, userid: 7 }] : [] })
};

function fakeSession({ missing = [] } = {}) {
  const calls = [];
  return {
    calls,
    async read(provider, operation, parameters) {
      calls.push([provider, operation, parameters]);
      if (missing.includes(operation)) throw Object.assign(new Error('Access control exception'), { code: 'permission_denied' });
      const value = payloads[operation];
      if (value === undefined) throw new Error(`Unexpected operation ${operation}`);
      return typeof value === 'function' ? value(parameters) : structuredClone(value);
    }
  };
}

test('a course is collected through core web services in the analysis shape', async () => {
  const session = fakeSession();
  const progress = [];
  const data = await new CourseCollector(session, (message, percent) => progress.push(percent)).collect(COURSE, { id: COURSE, fullname: 'Biology' });
  assert.ok(session.calls.every(([provider]) => provider === 'core'));
  assert.deepEqual(data.students.map((student) => student.fullname), ['Ana', 'Luis Pérez']);
  const ana = data.students[0];
  assert.equal(ana.grades.finalGradePct, 70);
  assert.equal(ana.grades.items[0].name, 'Essay');
  assert.equal(ana.completion.completed, 1);
  assert.deepEqual(ana.submissions.map((submission) => submission.assignid), [30]);
  assert.equal(ana.quizAttempts[0].grade, 7.5);
  assert.deepEqual(ana.forumPosts.map((post) => [post.userid, post.parent, post.discussionid]), [[7, 0, 70]]);
  assert.deepEqual(data.postsByUser[8].map((post) => post.parent), [900]);
  assert.equal(data.assignmentGradesByAssign[30].length, 1);
  assert.equal(data.logsAvailable, false);
  assert.deepEqual(data.unavailable, {});
  assert.equal(progress.at(-1), 100);
  // Grades come from one course-wide call, attempts are read per student.
  assert.equal(session.calls.filter(([, operation]) => operation === 'get_grade_items').length, 1);
  assert.deepEqual(session.calls.find(([, operation]) => operation === 'get_grade_items')[2], { course_id: COURSE });
  assert.equal(session.calls.filter(([, operation]) => operation === 'get_user_quiz_attempts_legacy').length, 2);
});

test('sources the token cannot read are reported and treated as empty', async () => {
  const data = await new CourseCollector(fakeSession({ missing: ['get_course_quizzes', 'get_grade_items'] })).collect(COURSE);
  assert.deepEqual(Object.keys(data.unavailable).sort(), ['get_course_quizzes', 'get_grade_items']);
  assert.equal(data.quizzes.length, 0);
  assert.equal(data.students[0].grades.finalGrade, null);
});

test('helpers normalize Moodle records', () => {
  assert.equal(isStudent({ roles: [{ shortname: 'manager' }] }), false);
  assert.equal(isStudent({}), true);
  assert.deepEqual(
    (({ userid, parent, created }) => ({ userid, parent, created }))(normalizePost({ author: { id: 3 }, parentid: 5, timecreated: 10 }, 1, 2)),
    { userid: 3, parent: 5, created: 10 }
  );
  assert.equal(attemptGrade({ sumgrades: '5' }, { sumgrades: 10, grade: 100 }), 50);
  assert.equal(attemptGrade({ grade: 4 }, {}), 4);
  assert.equal(attemptGrade({ sumgrades: null }, { sumgrades: 10, grade: 10 }), null);
  assert.equal(parseGradeItems({}).items.length, 0);
});
