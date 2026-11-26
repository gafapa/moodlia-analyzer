// The teacher's to-do list across courses: work waiting for a grade, quiz attempts to grade by
// hand, forum questions nobody answered, students to contact, deadlines this week and quiz
// questions to check. Each item carries the path of the Moodle page where it is dealt with.
import { quizStatistics } from "./advanced";
import { UNSUBMITTED, countsAsHandedIn, gradedAssignmentIds } from "./delivery";
import type { CourseAnalysis } from "./types";

const DAY = 86400;
const TEACHER_ROLES = new Set(["editingteacher", "teacher", "manager", "coursecreator"]);
/** Students to contact per course before the list sends the teacher to the participants page. */
export const CONTACTS_PER_COURSE = 5;

export type TodoKind = "grade" | "manualGrading" | "forum" | "contact" | "deadline" | "questions";
export const TODO_KINDS: TodoKind[] = ["grade", "manualGrading", "forum", "contact", "deadline", "questions"];

export interface TodoItem {
  kind: TodoKind;
  courseId: number;
  courseName: string;
  /** What the item is about: an assignment, a quiz, a discussion or a student. */
  title: string;
  /** Values for the item's text, such as how many and since when. */
  values: Record<string, number>;
  /** Higher is more urgent. */
  urgency: number;
  /** Moodle page, relative to the site address. */
  path: string;
  /** For a student, why they are listed. */
  reason?: "highRisk" | "inactive" | "more";
}

const num = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

/** Whether the connected user teaches the course; unknown roles count as teaching. */
export function teaches(analysis: Pick<CourseAnalysis, "viewerRoles">): boolean {
  if (!analysis.viewerRoles) return true;
  return analysis.viewerRoles.some((role) => TEACHER_ROLES.has(role.toLowerCase()));
}

export function courseTodo(analysis: CourseAnalysis, courseName: string, now = Math.floor(Date.now() / 1000)): TodoItem[] {
  const courseId = num(analysis.course.id) ?? 0;
  const items: TodoItem[] = [];
  const studentIds = new Set(analysis.students.map((student) => student.id));
  const base = { courseId, courseName };

  // Submissions waiting for a grade, per assignment.
  for (const assignment of analysis.assignments) {
    const id = num(assignment.id);
    const cmid = num(assignment.cmid);
    if (id === null || cmid === null || num(assignment.grade) === 0) continue;
    const graded = new Set((analysis.assignmentGradesByAssign[id] ?? [])
      .filter((grade) => (num(grade.grade) ?? -1) >= 0)
      .map((grade) => num(grade.userid)));
    let pending = 0;
    let oldest = 0;
    for (const submission of analysis.submissionsByAssign[id] ?? []) {
      const user = num(submission.userid);
      if (user === null || !studentIds.has(user) || UNSUBMITTED.has(String(submission.status ?? "submitted"))) continue;
      if (graded.has(user) && String(submission.gradingstatus ?? "") !== "notgraded") continue;
      pending += 1;
      const at = num(submission.timemodified) ?? num(submission.timecreated) ?? now;
      oldest = Math.max(oldest, Math.floor((now - at) / DAY));
    }
    if (pending > 0) {
      items.push({ ...base, kind: "grade", title: String(assignment.name ?? ""), values: { count: pending, days: oldest }, urgency: oldest + pending, path: `/mod/assign/view.php?id=${cmid}&action=grading` });
    }
  }

  // Finished quiz attempts without a total: they have questions to grade by hand.
  for (const quiz of analysis.quizzes) {
    const id = num(quiz.id);
    const cmid = num(quiz.coursemodule);
    if (id === null || cmid === null) continue;
    const waiting = (analysis.attemptsByQuiz[id] ?? []).filter((attempt) => studentIds.has(num(attempt.userid) ?? -1)
      && String(attempt.state ?? "") === "finished" && attempt.sumgrades === null);
    if (waiting.length === 0) continue;
    const oldest = Math.max(...waiting.map((attempt) => Math.floor((now - (num(attempt.timefinish) ?? now)) / DAY)));
    items.push({ ...base, kind: "manualGrading", title: String(quiz.name ?? ""), values: { count: waiting.length, days: oldest }, urgency: oldest + waiting.length, path: `/mod/quiz/report.php?id=${cmid}&mode=grading` });
  }

  // Discussions a student opened that nobody else answered.
  const discussions = new Map<number, Array<Record<string, unknown>>>();
  for (const post of Object.values(analysis.postsByUser).flat()) {
    const discussion = num(post.discussionid);
    if (discussion === null) continue;
    const list = discussions.get(discussion) ?? [];
    list.push(post);
    discussions.set(discussion, list);
  }
  for (const [discussion, posts] of discussions) {
    const sorted = [...posts].sort((a, b) => (num(a.created) ?? 0) - (num(b.created) ?? 0));
    const start = sorted.find((post) => (num(post.parent) ?? 0) === 0) ?? sorted[0];
    const author = num(start.userid);
    if (author === null || !studentIds.has(author)) continue;
    if (sorted.some((post) => num(post.userid) !== author)) continue;
    const days = Math.floor((now - (num(start.created) ?? now)) / DAY);
    items.push({ ...base, kind: "forum", title: String(start.subject ?? ""), values: { days }, urgency: days, path: `/mod/forum/discuss.php?d=${discussion}` });
  }

  // Students at high risk or without access for two weeks, most urgent first.
  const contacts = analysis.students
    .filter((student) => student.riskLevel === "high" || (student.metrics.daysSinceAccess > 14 && student.metrics.daysSinceAccess < 999))
    .map((student) => ({ student, urgency: (student.riskLevel === "high" ? 100 : 0) + Math.min(student.metrics.daysSinceAccess, 90) }))
    .sort((a, b) => b.urgency - a.urgency);
  for (const { student, urgency } of contacts.slice(0, CONTACTS_PER_COURSE)) {
    items.push({
      ...base,
      kind: "contact",
      title: student.fullname,
      values: { days: student.metrics.daysSinceAccess, missing: student.metrics.totalAssignments - student.metrics.submittedAssignments },
      urgency,
      path: `/user/view.php?id=${student.id}&course=${courseId}`,
      reason: student.riskLevel === "high" ? "highRisk" : "inactive"
    });
  }
  if (contacts.length > CONTACTS_PER_COURSE) {
    items.push({ ...base, kind: "contact", title: "", values: { count: contacts.length - CONTACTS_PER_COURSE }, urgency: 0, path: `/user/index.php?id=${courseId}`, reason: "more" });
  }

  // Assignments due in the next seven days, with who has not handed them in yet.
  for (const assignment of analysis.assignments) {
    const id = num(assignment.id);
    const cmid = num(assignment.cmid);
    const due = num(assignment.duedate) ?? 0;
    if (id === null || cmid === null || due < now || due > now + 7 * DAY) continue;
    const handedIn = new Set([
      ...(analysis.submissionsByAssign[id] ?? []).filter((submission) => !UNSUBMITTED.has(String(submission.status ?? "submitted"))).map((submission) => num(submission.userid)),
      ...(analysis.assignmentGradesByAssign[id] ?? []).filter((grade) => countsAsHandedIn(num(grade.grade))).map((grade) => num(grade.userid)),
      ...analysis.students.filter((student) => gradedAssignmentIds(student).has(id)).map((student) => student.id)
    ]);
    const missing = analysis.students.filter((student) => !handedIn.has(student.id)).length;
    const days = Math.max(0, Math.ceil((due - now) / DAY));
    items.push({ ...base, kind: "deadline", title: String(assignment.name ?? ""), values: { days, missing, due }, urgency: 7 - days, path: `/mod/assign/view.php?id=${cmid}` });
  }

  // Quiz questions whose discrimination is negative: the question or its key may be wrong.
  for (const quiz of quizStatistics(analysis)) {
    const bad = quiz.questions.filter((question) => question.flag === "negative").length;
    const cmid = num(analysis.quizzes.find((entry) => num(entry.id) === quiz.id)?.coursemodule);
    if (bad === 0 || cmid === null) continue;
    items.push({ ...base, kind: "questions", title: quiz.name, values: { count: bad }, urgency: bad, path: `/mod/quiz/report.php?id=${cmid}&mode=statistics` });
  }

  return items;
}

/** Items of all the courses the user teaches, by kind, most urgent first. */
export function teacherTodo(courses: Array<{ analysis: CourseAnalysis; name: string }>, now = Math.floor(Date.now() / 1000)): Record<TodoKind, TodoItem[]> {
  const all = courses.filter((course) => teaches(course.analysis)).flatMap((course) => courseTodo(course.analysis, course.name, now));
  return Object.fromEntries(TODO_KINDS.map((kind) => [
    kind,
    all.filter((item) => item.kind === kind).sort((a, b) => Number(a.reason === "more") - Number(b.reason === "more") || b.urgency - a.urgency)
  ])) as Record<TodoKind, TodoItem[]>;
}
