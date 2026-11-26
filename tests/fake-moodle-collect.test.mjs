// Collects a course with the real moodle-core-cli client against a fake Moodle REST endpoint,
// checking the Moodle function names and parameters that reach the site.
import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { CourseCollector } from '../electron/analysis/collector.mjs';
import { MoodleSession } from '../electron/moodle/session.mjs';

const responses = {
  core_webservice_get_site_info: { sitename: 'Fake Moodle', siteurl: 'http://127.0.0.1', release: '4.5.15 (Build: 20260101)', version: '2024100715', userid: 2, functions: [] },
  core_course_get_contents: [{ id: 1, name: 'Week 1', modules: [] }],
  mod_assign_get_assignments: { courses: [{ id: 12, assignments: [{ id: 30, name: 'Essay' }] }], warnings: [] },
  mod_quiz_get_quizzes_by_courses: { quizzes: [{ id: 40, name: 'Quiz', grade: 10, sumgrades: 20 }], warnings: [] },
  mod_forum_get_forums_by_courses: [{ id: 50, name: 'Forum' }],
  mod_page_get_pages_by_courses: { pages: [], warnings: [] },
  mod_resource_get_resources_by_courses: { resources: [], warnings: [] },
  mod_assign_get_submissions: { assignments: [{ assignmentid: 30, submissions: [{ userid: 7, status: 'submitted' }] }], warnings: [] },
  mod_assign_get_grades: { assignments: [{ assignmentid: 30, grades: [{ userid: 7, grade: '8.00' }] }], warnings: [] },
  mod_forum_get_forum_discussions: { discussions: [{ id: 900, discussion: 70 }], warnings: [] },
  mod_forum_get_discussion_posts: { posts: [{ id: 900, author: { id: 7 }, parentid: 0, timecreated: 1_799_500_000 }], forumid: 50, courseid: 12, ratinginfo: null, warnings: [] },
  core_enrol_get_enrolled_users: [{ id: 7, fullname: 'Ana', roles: [{ shortname: 'student' }] }],
  gradereport_user_get_grade_items: { usergrades: [{ userid: 7, gradeitems: [{ itemtype: 'course', graderaw: 7, grademax: 10 }] }], warnings: [] },
  core_completion_get_activities_completion_status: { statuses: [{ cmid: 1, state: 1 }], warnings: [] },
  mod_quiz_get_user_attempts: { attempts: [{ id: 1, quiz: 40, userid: 7, attempt: 1, state: 'finished', sumgrades: 15 }], warnings: [] },
  mod_quiz_get_attempt_review: { grade: 7.5, questions: [{ slot: 1, type: 'multichoice', questionnumber: '1', maxmark: 1, mark: '1,00', html: '<div class="qtext">Pick one</div><div class="ablock">a</div>' }], warnings: [] },
  core_enrol_get_users_courses: [{ id: 12, shortname: 'C12' }]
};

async function fakeMoodle() {
  const calls = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const form = new URLSearchParams(body);
      const fn = form.get('wsfunction');
      calls.push({ fn, form });
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(responses[fn] ?? { exception: 'webservice_access_exception', errorcode: 'accessexception', message: 'Access control exception' }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, calls, close: () => new Promise((resolve) => server.close(resolve)) };
}

test('a course is collected from a site without the plugin', async () => {
  const moodle = await fakeMoodle();
  try {
    const session = new MoodleSession({ name: 'Fake', url: moodle.url, token: 'teacher-token' });
    await session.connect();
    const data = await new CourseCollector(session).collect(12);
    assert.deepEqual(data.unavailable, {});
    assert.equal(data.students.length, 1);
    const ana = data.students[0];
    assert.equal(ana.grades.finalGradePct, 70);
    assert.equal(ana.completion.completed, 1);
    assert.equal(ana.quizAttempts[0].grade, 7.5);
    assert.equal(ana.forumPosts.length, 1);
    assert.equal(ana.submissions.length, 1);

    const sent = (fn) => moodle.calls.find((call) => call.fn === fn)?.form;
    assert.equal(sent('mod_assign_get_assignments').get('courseids[0]'), '12');
    assert.equal(sent('mod_assign_get_submissions').get('assignmentids[0]'), '30');
    assert.equal(sent('gradereport_user_get_grade_items').get('courseid'), '12');
    assert.equal(sent('gradereport_user_get_grade_items').get('userid'), '0');
    assert.equal(sent('mod_quiz_get_user_attempts').get('quizid'), '40');
    assert.equal(sent('mod_quiz_get_user_attempts').get('userid'), '7');
    assert.equal(sent('mod_forum_get_discussion_posts').get('discussionid'), '70');
    assert.equal(sent('core_completion_get_activities_completion_status').get('userid'), '7');
    assert.equal(sent('mod_quiz_get_attempt_review').get('attemptid'), '1');
    assert.equal(sent('mod_quiz_get_attempt_review').get('page'), '-1');
    assert.equal(sent('core_enrol_get_users_courses').get('userid'), '7');
    assert.deepEqual(data.quizQuestions[40].slots.map((slot) => slot.text), ['Pick one']);
    assert.deepEqual(data.quizQuestions[40].attempts, [{ userid: 7, grade: 7.5, marks: { 1: 1 } }]);
    assert.deepEqual(data.workload.coursesByUser, { 7: [12] });
    assert.ok(moodle.calls.every((call) => call.form.get('wstoken') === 'teacher-token'));
  } finally {
    await moodle.close();
  }
});
