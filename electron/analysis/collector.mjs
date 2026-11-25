// @ts-check
// Collects one course's raw data through core Moodle web services. The result has the
// shape the analysis in src/analysis expects (CollectedCourseData in src/analysis/types.ts).
// A source this token cannot read is recorded in `unavailable` and treated as empty, so
// partial access still yields an analysis.

const TEACHER_ROLES = new Set(['editingteacher', 'teacher', 'manager', 'coursecreator']);
const CONCURRENCY = 4;
const FORUM_PAGE_SIZE = 100;
const PROFILE_BATCH = 50;

/** @param {unknown} value @returns {Record<string, any>[]} */
const asList = (value) => (Array.isArray(value) ? value : []);
/** @param {unknown} value @returns {Record<string, any>} */
const asRecord = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? /** @type {Record<string, any>} */ (value) : {});

/** @param {unknown} value */
export function asNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** @param {unknown} value @param {string} [fallback] */
const text = (value, fallback = '') => (typeof value === 'string' ? value : fallback);

/**
 * @template T, U
 * @param {T[]} items @param {number} limit @param {(item: T, index: number) => Promise<U>} worker
 */
async function mapLimited(items, limit, worker) {
  /** @type {U[]} */
  const results = new Array(items.length);
  let cursor = 0;
  const consume = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, consume));
  return results;
}

/** Teachers and managers are excluded; users without roles are kept. @param {Record<string, any>} user */
export function isStudent(user) {
  const roles = asList(user.roles);
  return roles.length === 0 || roles.every((role) => !TEACHER_ROLES.has(text(role.shortname).toLowerCase()));
}

/**
 * Current forum posts (mod_forum_get_discussion_posts) use author.id, parentid and timecreated;
 * the analysis reads userid, parent and created.
 * @param {Record<string, any>} post @param {number} forumId @param {number} discussionId
 */
export function normalizePost(post, forumId, discussionId) {
  return {
    ...post,
    userid: asNumber(post.userid) ?? asNumber(post.author?.id),
    parent: asNumber(post.parent) ?? asNumber(post.parentid) ?? 0,
    created: asNumber(post.created) ?? asNumber(post.timecreated),
    forumid: forumId,
    discussionid: discussionId
  };
}

/**
 * mod_quiz_get_user_attempts gives the attempt mark in sumgrades, out of the quiz's sumgrades;
 * the analysis expects the grade on the quiz's grade scale.
 * @param {Record<string, any>} attempt @param {Record<string, any>} quiz
 */
export function attemptGrade(attempt, quiz) {
  const given = asNumber(attempt.grade);
  if (given !== null) return given;
  const marks = asNumber(attempt.sumgrades);
  const maxMarks = asNumber(quiz.sumgrades);
  const scale = asNumber(quiz.grade);
  if (marks === null || maxMarks === null || maxMarks <= 0 || scale === null) return null;
  return (marks / maxMarks) * scale;
}

/** @param {Record<string, any>} userGrade */
export function parseGradeItems(userGrade) {
  let finalGrade = null;
  let finalGradePct = null;
  let courseTotalMax = null;
  const items = [];
  for (const item of asList(userGrade?.gradeitems)) {
    const type = text(item.itemtype);
    const raw = asNumber(item.graderaw);
    const max = asNumber(item.grademax) ?? 10;
    const min = asNumber(item.grademin) ?? 0;
    if (type === 'course') {
      if (raw !== null && max > 0) {
        finalGrade = raw;
        finalGradePct = (raw / max) * 100;
        courseTotalMax = max;
      }
      continue;
    }
    items.push({
      id: asNumber(item.id) ?? undefined,
      name: text(item.itemname) || text(item.categoryname, 'Untitled'),
      type: type || undefined,
      modname: text(item.itemmodule) || undefined,
      instance: asNumber(item.iteminstance) ?? undefined,
      grade: raw,
      gradePct: raw !== null && max > 0 ? (raw / max) * 100 : null,
      maxGrade: max,
      minGrade: min,
      gradedAt: asNumber(item.gradedategraded),
      feedback: text(item.feedback)
    });
  }
  return { items, finalGrade, finalGradePct, courseTotalMax };
}

/** @param {Record<string, any>} data */
export function parseCompletion(data) {
  const statuses = asList(data?.statuses);
  const completed = statuses.filter((status) => [1, 2].includes(asNumber(status.state) ?? -1)).length;
  return { statuses, completed, total: statuses.length };
}

export class CourseCollector {
  /**
   * @param {{ read(provider: 'core' | 'moodlia', operation: string, parameters?: Record<string, unknown>): Promise<any> }} session
   * @param {(message: string, percent: number) => void} [onProgress]
   */
  constructor(session, onProgress = () => {}) {
    this.session = session;
    this.onProgress = onProgress;
    /** @type {Map<string, string>} */
    this.unavailable = new Map();
  }

  /**
   * A core read that returns the fallback, and records why, when the token cannot use it.
   * @param {string} operation @param {Record<string, unknown>} parameters @param {any} fallback
   */
  async read(operation, parameters, fallback) {
    try {
      return await this.session.read('core', operation, parameters);
    } catch (error) {
      if (!this.unavailable.has(operation)) this.unavailable.set(operation, String(/** @type {any} */ (error)?.message ?? 'Unavailable.'));
      return fallback;
    }
  }

  /** @param {number} courseId @param {Record<string, any>} [course] */
  async collect(courseId, course) {
    const report = this.onProgress;
    report('Loading course structure', 5);
    const courseIds = [courseId];
    const [contents, assignmentsPayload, quizzesPayload, forums, pagesPayload, resourcesPayload] = await Promise.all([
      this.read('get_course_contents', { course_id: courseId }, []),
      this.read('get_course_assignments', { course_ids: courseIds }, {}),
      this.read('get_course_quizzes', { course_ids: courseIds }, {}),
      this.read('get_course_forums', { course_ids: courseIds }, []),
      this.read('get_course_pages', { course_ids: courseIds }, {}),
      this.read('get_course_resources', { course_ids: courseIds }, {})
    ]);
    // Activities students cannot see yet do not count: hidden modules, and assignments that
    // do not accept submissions yet. Without the course contents nothing is left out.
    const hiddenModules = new Set(asList(contents).flatMap((section) => asList(asRecord(section).modules))
      .filter((module) => module.visible === 0 || module.visible === false)
      .map((module) => asNumber(module.id)));
    const now = Math.floor(Date.now() / 1000);
    const allAssignments = asList(asList(asRecord(assignmentsPayload).courses).find((entry) => asNumber(entry.id) === courseId)?.assignments);
    const allQuizzes = asList(asRecord(quizzesPayload).quizzes);
    const isHidden = (/** @type {Record<string, any>} */ activity, /** @type {string} */ field) => hiddenModules.has(asNumber(activity[field]));
    const assignments = allAssignments.filter((assignment) => !isHidden(assignment, 'cmid') && !((asNumber(assignment.allowsubmissionsfromdate) ?? 0) > now));
    const quizzes = allQuizzes.filter((quiz) => !isHidden(quiz, 'coursemodule'));
    // Announcement forums are left out of participation: only teachers post there.
    const visibleForums = asList(forums).filter((forum) => !isHidden(forum, 'cmid') && forum.type !== 'news');
    const excluded = {
      hidden: allAssignments.filter((assignment) => isHidden(assignment, 'cmid')).length + allQuizzes.length - quizzes.length + asList(forums).filter((forum) => isHidden(forum, 'cmid')).length,
      notOpenYet: allAssignments.filter((assignment) => !isHidden(assignment, 'cmid') && (asNumber(assignment.allowsubmissionsfromdate) ?? 0) > now).length
    };
    const pages = asList(asRecord(pagesPayload).pages);
    const resources = asList(asRecord(resourcesPayload).resources);
    const assignmentIds = assignments.map((assignment) => asNumber(assignment.id)).filter((id) => id !== null);

    report('Loading assignment submissions and grades', 20);
    const [submissionsPayload, assignmentGradesPayload] = assignmentIds.length > 0
      ? await Promise.all([
        this.read('get_assignment_submissions', { assignment_ids: assignmentIds }, {}),
        this.read('get_assignment_grades', { assignment_ids: assignmentIds }, {})
      ])
      : [{}, {}];
    /** @param {any} payload @param {string} key */
    const byAssignment = (payload, key) => Object.fromEntries(asList(asRecord(payload).assignments)
      .map((entry) => [asNumber(entry.assignmentid), asList(entry[key])])
      .filter(([id]) => id !== null));
    const submissionsByAssign = byAssignment(submissionsPayload, 'submissions');
    const assignmentGradesByAssign = byAssignment(assignmentGradesPayload, 'grades');

    report('Loading forum activity', 35);
    const postsByUser = await this.collectForumPosts(visibleForums);

    report('Loading enrolled users', 50);
    const enrolled = await this.withRoles(courseId, asList(await this.read('get_enrolled_users', { course_id: courseId }, [])));
    const studentsRaw = enrolled.filter(isStudent);

    report('Loading grades', 58);
    const gradesPayload = await this.read('get_grade_items', { course_id: courseId }, {});
    const gradesByUser = new Map(asList(asRecord(gradesPayload).usergrades).map((entry) => [asNumber(entry.userid), entry]));

    report('Loading student activity', 62);
    /** @type {Record<number, Record<string, any>[]>} */
    const attemptsByQuiz = {};
    const students = await mapLimited(studentsRaw, CONCURRENCY, async (user, index) => {
      report(`Loading student ${index + 1} of ${studentsRaw.length}`, 62 + Math.round((index / Math.max(studentsRaw.length, 1)) * 36));
      const userId = asNumber(user.id) ?? 0;
      const completion = await this.read('get_activity_completion_statuses', { course_id: courseId, user_id: userId }, {});
      const quizAttempts = [];
      for (const quiz of quizzes) {
        const quizId = asNumber(quiz.id);
        if (quizId === null) continue;
        const attempts = asList(asRecord(await this.read('get_user_quiz_attempts_legacy', { quiz_id: quizId, user_id: userId, status: 'all' }, {})).attempts)
          .map((attempt) => ({ ...attempt, quizid: quizId, grade: attemptGrade(attempt, quiz) }));
        (attemptsByQuiz[quizId] ??= []).push(...attempts);
        quizAttempts.push(...attempts);
      }
      return {
        id: userId,
        fullname: text(user.fullname, `User ${userId}`),
        email: text(user.email),
        // Last access to this course; Moodle's lastaccess is the last access to the whole site.
        lastaccess: 'lastcourseaccess' in user ? asNumber(user.lastcourseaccess) ?? 0 : asNumber(user.lastaccess) ?? 0,
        lastSiteAccess: asNumber(user.lastaccess) ?? 0,
        firstaccess: asNumber(user.firstaccess) ?? 0,
        country: text(user.country),
        profileimageurl: text(user.profileimageurl),
        grades: parseGradeItems(gradesByUser.get(userId) ?? {}),
        completion: parseCompletion(asRecord(completion)),
        submissions: Object.entries(submissionsByAssign).flatMap(([assignId, list]) => list
          .filter((submission) => asNumber(submission.userid) === userId)
          .map((submission) => ({ ...submission, assignid: Number(assignId) }))),
        quizAttempts,
        forumPosts: postsByUser[userId] ?? [],
        logs: []
      };
    });

    report('Course data ready', 100);
    return {
      course: course ?? { id: courseId },
      students,
      assignments,
      quizzes,
      forums: visibleForums,
      excluded,
      contents: asList(contents),
      pages,
      resources,
      submissionsByAssign,
      assignmentGradesByAssign,
      attemptsByQuiz,
      postsByUser,
      // Standard Moodle web services do not expose the course log.
      logsAvailable: false,
      logs: [],
      unavailable: Object.fromEntries(this.unavailable),
      collectedAt: new Date().toISOString()
    };
  }

  /** @param {unknown} forums */
  async collectForumPosts(forums) {
    /** @type {Record<number, Record<string, any>[]>} */
    const postsByUser = {};
    for (const forum of asList(forums)) {
      const forumId = asNumber(forum.id);
      if (forumId === null) continue;
      const discussionIds = new Set();
      for (let page = 0; ; page += 1) {
        const payload = await this.read('get_forum_discussions', { forum_id: forumId, page, page_size: FORUM_PAGE_SIZE }, {});
        const discussions = Array.isArray(payload) ? payload : asList(asRecord(payload).discussions);
        let added = 0;
        for (const discussion of discussions) {
          // mod_forum_get_forum_discussions returns the first post id as "id" and the discussion as "discussion".
          const id = asNumber(discussion.discussion) ?? asNumber(discussion.id);
          if (id !== null && !discussionIds.has(id)) {
            discussionIds.add(id);
            added += 1;
          }
        }
        if (discussions.length < FORUM_PAGE_SIZE || added === 0) break;
      }
      await mapLimited([...discussionIds], CONCURRENCY, async (discussionId) => {
        const posts = asList(asRecord(await this.read('get_forum_discussion_posts', { discussion_id: discussionId }, {})).posts);
        for (const post of posts) {
          const normalized = normalizePost(post, forumId, discussionId);
          if (!normalized.userid) continue;
          (postsByUser[normalized.userid] ??= []).push(normalized);
        }
      });
    }
    return postsByUser;
  }

  /**
   * Adds roles from course profiles when the enrolled-users list lacks them.
   * @param {number} courseId @param {Record<string, any>[]} users
   */
  async withRoles(courseId, users) {
    const missing = users.filter((user) => !Array.isArray(user.roles)).map((user) => asNumber(user.id)).filter((id) => id !== null);
    if (missing.length === 0) return users;
    const profiles = new Map();
    for (let start = 0; start < missing.length; start += PROFILE_BATCH) {
      const batch = missing.slice(start, start + PROFILE_BATCH).map((userId) => ({ user_id: userId, course_id: courseId }));
      for (const profile of asList(await this.read('get_course_user_profiles', { users: batch }, []))) {
        const id = asNumber(profile.id);
        if (id !== null) profiles.set(id, profile);
      }
    }
    return users.map((user) => {
      const profile = profiles.get(asNumber(user.id));
      return profile ? { ...user, roles: profile.roles ?? user.roles, fullname: profile.fullname ?? user.fullname, email: profile.email ?? user.email } : user;
    });
  }
}
