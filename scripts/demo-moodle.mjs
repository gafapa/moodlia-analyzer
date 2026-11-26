// A fake Moodle REST endpoint with fictitious courses, students and activity, for screenshots
// and manual trials without real student data. Names and numbers are generated from a fixed
// seed, so the same data comes back every time. It listens on 127.0.0.1 only and answers the
// read functions the analyzer calls; anything else returns a Moodle access exception.
//
//   node scripts/demo-moodle.mjs [port]      then add a site with that address and any token.
import http from 'node:http';

const DAY = 86400;
const TEACHER = 2;

/** Mulberry32: a small seeded random generator. */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Lucía', 'Martín', 'Sara', 'Hugo', 'Noa', 'Pablo', 'Uxía', 'Mateo', 'Carla', 'Iago', 'Alba', 'Leo', 'Antía', 'Daniel', 'Vera', 'Bruno', 'Iria', 'Adrián', 'Nerea', 'Xoán', 'Olivia', 'Marcos', 'Aroa', 'Brais', 'Laura', 'Diego', 'Sabela', 'Álex', 'Paula', 'Nico'];
const LAST = ['Abeledo', 'Barreiro', 'Castiñeira', 'Dopazo', 'Estévez', 'Feijoo', 'Graña', 'Insua', 'Lago', 'Méndez', 'Novoa', 'Outeiro', 'Pazos', 'Quintela', 'Rial', 'Sanmartín', 'Taboada', 'Vilar', 'Xestoso', 'Ces'];

const COURSES = [
  { id: 101, shortname: 'BIO3', fullname: 'Bioloxía e Xeoloxía 3º ESO', topics: ['A célula', 'Os tecidos', 'Nutrición', 'Aparato dixestivo', 'Respiración', 'Circulación', 'Excreción', 'Relación'] },
  { id: 102, shortname: 'MAT2', fullname: 'Matemáticas 2º ESO', topics: ['Números enteiros', 'Fraccións', 'Potencias', 'Proporcionalidade', 'Ecuacións', 'Sistemas', 'Funcións', 'Xeometría'] },
  { id: 103, shortname: 'TEC4', fullname: 'Tecnoloxía 4º ESO', topics: ['Electrónica', 'Circuítos', 'Programación', 'Arduino', 'Redes', 'Robótica', 'Impresión 3D', 'Proxecto final'] }
];

/** Builds the whole site once, relative to `now`. */
export function buildDemoSite(now = Math.floor(Date.now() / 1000)) {
  const rand = random(20261126);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
  const used = new Set();
  const students = Array.from({ length: 40 }, (_, index) => {
    let name;
    do {
      const [first, second] = [pick(LAST), pick(LAST)];
      name = first === second ? '' : `${pick(FIRST)} ${first} ${second}`;
    } while (!name || used.has(name));
    used.add(name);
    const engagement = clamp(0.25 + rand() * 0.8);
    return {
      id: 1000 + index,
      fullname: name,
      engagement,
      ability: clamp(0.2 + rand() * 0.75 + (engagement - 0.6) * 0.3),
      procrastination: rand(),
      lastaccess: 0,
      firstaccess: 0,
      /** @type {number[]} */
      courses: []
    };
  });
  const site = { now, courses: [], students, users: new Map(students.map((student) => [student.id, student])) };

  for (const [courseIndex, base] of COURSES.entries()) {
    const members = students.filter((_, index) => (index + courseIndex * 7) % 40 < 24);
    for (const member of members) member.courses.push(base.id);
    const course = { ...base, members, assignments: [], quizzes: [], forums: [], pages: [], submissions: {}, grades: {}, attempts: {}, reviews: new Map(), posts: [] };
    site.courses.push(course);

    // Eight assignments, one a week, the last two still open.
    base.topics.forEach((topic, index) => {
      const id = base.id * 100 + index;
      const due = now - (55 - index * 8) * DAY + 14 * 3600;
      course.assignments.push({ id, cmid: id + 50000, name: `Tarefa ${index + 1} · ${topic}`, duedate: due, grade: 10, nosubmissions: 0, allowsubmissionsfromdate: due - 14 * DAY });
      const submissions = [];
      const grades = [];
      for (const student of members) {
        const open = due > now;
        const submits = rand() < student.engagement * (open ? 0.6 : 1.02);
        if (!submits) {
          if (open && rand() < 0.25) submissions.push({ userid: student.id, status: 'draft', timemodified: now - Math.floor(rand() * 3 * DAY) });
          continue;
        }
        const lead = (1 - student.procrastination) * 6 * DAY * rand();
        const late = student.procrastination > 0.8 && rand() < 0.5 ? rand() * 3 * DAY : 0;
        const at = Math.min(now - 3600, Math.floor(due - lead + late));
        const age = (now - at) / DAY;
        // Recent work and part of the work of the last weeks still waits for a grade.
        const graded = age > 6 && !(courseIndex === 0 && age < 24 && rand() < 0.55) && !(rand() < 0.08);
        submissions.push({ userid: student.id, status: 'submitted', gradingstatus: graded ? 'graded' : 'notgraded', timemodified: at });
        if (graded) {
          const mark = Math.round(clamp(student.ability + (rand() - 0.5) * 0.35 - (index === 5 ? 0.2 : 0)) * 100) / 10;
          grades.push({ userid: student.id, grade: mark.toFixed(2), timemodified: Math.min(now - 3600, at + Math.floor((2 + rand() * (courseIndex === 0 ? 16 : 7)) * DAY)), feedback: rand() < 0.75 });
        }
      }
      course.submissions[id] = submissions;
      course.grades[id] = grades;
    });

    // Three quizzes; the last one closes in three days and has an essay question.
    for (let index = 0; index < 3; index += 1) {
      const id = base.id * 10 + index;
      const close = index === 2 ? now + 3 * DAY : now - (40 - index * 15) * DAY;
      const slots = Array.from({ length: 8 }, (_, slot) => ({
        slot: slot + 1,
        type: index === 2 && slot === 7 ? 'essay' : slot % 3 === 0 ? 'truefalse' : 'multichoice',
        // Slot 5 of the first quiz has a wrong key: better students fail it.
        difficulty: 0.15 + rand() * 0.6,
        inverted: index === 0 && slot === 4,
        text: `Pregunta ${slot + 1} sobre ${base.topics[(index * 3 + slot) % 8].toLowerCase()}`
      }));
      course.quizzes.push({ id, course: base.id, coursemodule: id + 60000, name: `Cuestionario ${index + 1} · ${base.topics[index * 3]}`, grade: 10, sumgrades: 8, timeclose: close, slots });
      const attempts = [];
      for (const student of members) {
        if (rand() > student.engagement * (index === 2 ? 0.7 : 1.05)) continue;
        const finish = Math.min(now - 7200, close - Math.floor(rand() * 6 * DAY));
        const marks = slots.map((slot) => {
          if (slot.type === 'essay') return null;
          const chance = slot.inverted ? 1 - student.ability : clamp(student.ability + 0.35 - slot.difficulty);
          return rand() < chance ? 1 : 0;
        });
        const essayPending = index === 2 && rand() < 0.7;
        const total = marks.reduce((sum, mark) => sum + (mark ?? 0), 0);
        const attemptId = id * 1000 + student.id;
        attempts.push({ id: attemptId, quiz: id, userid: student.id, attempt: 1, state: 'finished', preview: 0, timestart: finish - 1500, timefinish: finish, sumgrades: essayPending ? null : total });
        course.reviews.set(attemptId, { grade: essayPending ? null : (total / 8) * 10, marks, slots });
      }
      course.attempts[id] = attempts;
    }

    // A discussion forum with questions, some answered by the teacher or classmates.
    course.forums.push({ id: base.id * 10 + 9, course: base.id, cmid: base.id * 10 + 70009, name: 'Foro de dúbidas', type: 'general' });
    course.forums.push({ id: base.id * 10 + 8, course: base.id, cmid: base.id * 10 + 70008, name: 'Avisos', type: 'news' });
    let postId = base.id * 1000;
    for (let discussion = 0; discussion < 7; discussion += 1) {
      const author = members[Math.floor(rand() * members.length)];
      const created = now - Math.floor((2 + rand() * 40) * DAY);
      const first = { id: ++postId, discussion: base.id * 100 + discussion, author: { id: author.id, fullname: author.fullname }, parentid: 0, timecreated: created, subject: `Dúbida sobre ${base.topics[discussion].toLowerCase()}` };
      course.posts.push(first);
      // The last two questions have no reply yet.
      if (discussion < 5) {
        course.posts.push({ id: ++postId, discussion: first.discussion, author: { id: TEACHER, fullname: 'Docente Demo' }, parentid: first.id, timecreated: created + Math.floor((0.2 + rand() * 2) * DAY), subject: `Re: ${first.subject}` });
        for (let reply = 0; reply < Math.floor(rand() * 3); reply += 1) {
          const replier = members[Math.floor(rand() * members.length)];
          course.posts.push({ id: ++postId, discussion: first.discussion, author: { id: replier.id, fullname: replier.fullname }, parentid: first.id + (reply ? 0 : 1), timecreated: created + Math.floor((1 + rand() * 4) * DAY), subject: `Re: ${first.subject}` });
        }
      }
    }
    course.pages = base.topics.map((topic, index) => ({ id: base.id * 100 + 90 + index, course: base.id, coursemodule: base.id * 100 + 80000 + index, name: `Apuntamentos · ${topic}` }));
  }

  // Last access, from engagement: a few students have not entered for weeks.
  for (const student of students) {
    student.lastaccess = now - Math.floor((student.engagement > 0.45 ? rand() * 4 : 12 + rand() * 30) * DAY);
    student.firstaccess = now - 85 * DAY;
  }
  return site;
}

/** Reads `name[0]`, `name[1]`… from a Moodle REST form. */
function list(form, name) {
  const values = [];
  for (let index = 0; form.has(`${name}[${index}]`); index += 1) values.push(Number(form.get(`${name}[${index}]`)));
  return values;
}

const html = (text) => `<div class="qtext"><p>${text}</p></div><div class="ablock">…</div>`;

/** The answer to one web service call, or undefined when the demo does not offer it. */
export function answer(site, fn, form) {
  const { now } = site;
  const course = (id) => site.courses.find((entry) => entry.id === Number(id));
  const modules = (entry) => [
    ...entry.assignments.map((assignment) => ({ id: assignment.cmid, name: assignment.name, modname: 'assign', visible: 1, completion: 1 })),
    ...entry.quizzes.map((quiz) => ({ id: quiz.coursemodule, name: quiz.name, modname: 'quiz', visible: 1, completion: 1 })),
    ...entry.forums.map((forum) => ({ id: forum.cmid, name: forum.name, modname: 'forum', visible: 1, completion: 0 })),
    ...entry.pages.map((page) => ({ id: page.coursemodule, name: page.name, modname: 'page', visible: 1, completion: 1 }))
  ];
  const summary = (entry) => ({ id: entry.id, shortname: entry.shortname, fullname: entry.fullname, visible: 1, startdate: now - 85 * DAY, enddate: now + 120 * DAY, enablecompletion: 1, lastaccess: now - DAY, enrolledusercount: entry.members.length });
  switch (fn) {
    case 'core_webservice_get_site_info':
      return { sitename: 'IES Demo', siteurl: site.url, release: '4.5.12 (Build: 20260101)', version: '2024100712', userid: TEACHER, username: 'docente', fullname: 'Docente Demo', functions: [] };
    case 'core_enrol_get_users_courses': {
      const user = Number(form.get('userid'));
      if (user === TEACHER) return [...site.courses.map(summary), { id: 99, shortname: 'OLD', fullname: 'Curso do ano pasado', visible: 1, startdate: now - 400 * DAY, enddate: now - 200 * DAY, lastaccess: now - 210 * DAY }];
      const student = site.users.get(user);
      return student ? student.courses.map((id) => summary(course(id))) : [];
    }
    case 'core_course_get_contents': {
      const entry = course(form.get('courseid'));
      return entry ? [{ id: 1, name: 'Contidos', modules: modules(entry) }] : [];
    }
    case 'mod_assign_get_assignments':
      return { courses: list(form, 'courseids').map(course).filter(Boolean).map((entry) => ({ id: entry.id, assignments: entry.assignments })), warnings: [] };
    case 'mod_quiz_get_quizzes_by_courses':
      return { quizzes: list(form, 'courseids').map(course).filter(Boolean).flatMap((entry) => entry.quizzes.map(({ slots, ...quiz }) => quiz)), warnings: [] };
    case 'mod_forum_get_forums_by_courses':
      return list(form, 'courseids').map(course).filter(Boolean).flatMap((entry) => entry.forums);
    case 'mod_page_get_pages_by_courses':
      return { pages: list(form, 'courseids').map(course).filter(Boolean).flatMap((entry) => entry.pages), warnings: [] };
    case 'mod_resource_get_resources_by_courses':
      return { resources: [], warnings: [] };
    case 'mod_assign_get_submissions':
      return { assignments: list(form, 'assignmentids').map((id) => ({ assignmentid: id, submissions: site.courses.flatMap((entry) => entry.submissions[id] ?? []) })), warnings: [] };
    case 'mod_assign_get_grades':
      return { assignments: list(form, 'assignmentids').map((id) => ({ assignmentid: id, grades: site.courses.flatMap((entry) => (entry.grades[id] ?? []).map(({ feedback, ...grade }) => grade)) })), warnings: [] };
    case 'mod_forum_get_forum_discussions': {
      const forum = Number(form.get('forumid'));
      const entry = site.courses.find((item) => item.forums.some((f) => f.id === forum && f.type === 'general'));
      if (!entry || Number(form.get('page') ?? 0) > 0) return { discussions: [], warnings: [] };
      return { discussions: entry.posts.filter((post) => post.parentid === 0).map((post) => ({ id: post.id, discussion: post.discussion, name: post.subject })), warnings: [] };
    }
    case 'mod_forum_get_discussion_posts': {
      const discussion = Number(form.get('discussionid'));
      return { posts: site.courses.flatMap((entry) => entry.posts.filter((post) => post.discussion === discussion)), warnings: [] };
    }
    case 'core_enrol_get_enrolled_users': {
      const entry = course(form.get('courseid'));
      if (!entry) return [];
      return [
        { id: TEACHER, fullname: 'Docente Demo', roles: [{ shortname: 'editingteacher' }], lastaccess: now - 3600, lastcourseaccess: now - DAY },
        ...entry.members.map((student) => ({ id: student.id, fullname: student.fullname, email: `alumno${student.id}@demo.invalid`, roles: [{ shortname: 'student' }], firstaccess: student.firstaccess, lastaccess: student.lastaccess, lastcourseaccess: student.lastaccess + (entry.id % 3) * 3600 }))
      ];
    }
    case 'gradereport_user_get_grade_items': {
      const entry = course(form.get('courseid'));
      if (!entry) return { usergrades: [], warnings: [] };
      return {
        usergrades: entry.members.map((student) => {
          const items = [
            ...entry.assignments.map((assignment) => {
              const grade = (entry.grades[assignment.id] ?? []).find((item) => item.userid === student.id);
              return { id: assignment.id, itemname: assignment.name, itemtype: 'mod', itemmodule: 'assign', iteminstance: assignment.id, graderaw: grade ? Number(grade.grade) : null, grademax: 10, grademin: 0, gradedategraded: grade?.timemodified ?? null, feedback: grade?.feedback ? '<p>Bo traballo; revisa o apartado 2.</p>' : '' };
            }),
            ...entry.quizzes.map((quiz) => {
              const attempt = (entry.attempts[quiz.id] ?? []).find((item) => item.userid === student.id);
              const raw = attempt && attempt.sumgrades !== null ? (attempt.sumgrades / 8) * 10 : null;
              return { id: quiz.id + 900000, itemname: quiz.name, itemtype: 'mod', itemmodule: 'quiz', iteminstance: quiz.id, graderaw: raw, grademax: 10, grademin: 0, gradedategraded: raw === null ? null : attempt.timefinish };
            })
          ];
          const known = items.filter((item) => item.graderaw !== null);
          const total = known.length ? known.reduce((sum, item) => sum + item.graderaw, 0) / known.length : null;
          return { userid: student.id, gradeitems: [...items, { itemtype: 'course', graderaw: total, grademax: 10 }] };
        }),
        warnings: []
      };
    }
    case 'core_completion_get_activities_completion_status': {
      const entry = course(form.get('courseid'));
      const user = Number(form.get('userid'));
      if (!entry) return { statuses: [], warnings: [] };
      const done = (cmid) => {
        const assignment = entry.assignments.find((item) => item.cmid === cmid);
        if (assignment) return (entry.submissions[assignment.id] ?? []).some((item) => item.userid === user && item.status === 'submitted');
        const quiz = entry.quizzes.find((item) => item.coursemodule === cmid);
        if (quiz) return (entry.attempts[quiz.id] ?? []).some((item) => item.userid === user);
        const student = site.users.get(user);
        return (student?.engagement ?? 0) > ((cmid % 7) + 2) / 10;
      };
      return { statuses: modules(entry).filter((module) => module.completion).map((module) => ({ cmid: module.id, modname: module.modname, state: done(module.id) ? 1 : 0, tracking: 1, uservisible: true })), warnings: [] };
    }
    case 'mod_quiz_get_user_attempts': {
      const quiz = Number(form.get('quizid'));
      const user = Number(form.get('userid'));
      return { attempts: site.courses.flatMap((entry) => (entry.attempts[quiz] ?? []).filter((attempt) => attempt.userid === user)), warnings: [] };
    }
    case 'mod_quiz_get_attempt_review': {
      const attemptId = Number(form.get('attemptid'));
      for (const entry of site.courses) {
        const review = entry.reviews.get(attemptId);
        if (!review) continue;
        return {
          grade: review.grade,
          attempt: { id: attemptId },
          questions: review.slots.map((slot, index) => ({ slot: slot.slot, type: slot.type, questionnumber: String(slot.slot), number: slot.slot, maxmark: 1, mark: review.marks[index] === null ? null : `${review.marks[index]},00`, html: html(slot.text) })),
          warnings: []
        };
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

export async function startDemoMoodle(port = 0) {
  const site = buildDemoSite();
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const form = new URLSearchParams(body);
      const fn = form.get('wsfunction');
      const result = request.url?.startsWith('/webservice/rest/server.php') ? answer(site, fn, form) : undefined;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(result ?? { exception: 'webservice_access_exception', errorcode: 'accessexception', message: 'Access control exception' }));
    });
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(undefined)));
  site.url = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`;
  return { url: site.url, close: () => new Promise((resolve) => server.close(resolve)) };
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll('\\', '/')}` || import.meta.url === `file://${process.argv[1]}`) {
  const demo = await startDemoMoodle(Number(process.argv[2] ?? 0));
  console.log(`Demo Moodle with fictitious data at ${demo.url} (any token works). Ctrl+C stops it.`);
}
