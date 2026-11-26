// Course and student insights beyond the per-student metrics: the grading queue, feedback,
// drafts, who submitted each assignment, when students work, and course set-up checks.
// Everything is computed from data the collector already read; only students count.
import { countsAsHandedIn, gradedAssignmentIds } from "./delivery";
import type { CourseAnalysis, StudentAnalysis } from "./types";

const DAY = 86400;
const UNSUBMITTED = new Set(["new", "draft", "reopened"]);

const num = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** Upper bounds, in days, of the grading-time buckets; the last bucket is open. */
export const TURNAROUND_BUCKETS = [3, 7, 14, 30] as const;

/** "offline" is graded work with no submission in Moodle, handed in on paper for example. */
export type CellStatus = "graded" | "offline" | "pending" | "draft" | "none";

export interface AssignmentRef {
  id: number;
  name: string;
}

export interface SubmissionRow {
  id: number;
  name: string;
  cells: CellStatus[];
  submitted: number;
  drafts: number;
}

export type CheckKey = "noDueDates" | "someNoDueDates" | "completionUnused" | "noDiscussionForum" | "feedbackGood" | "feedbackLow";

export interface CourseCheck {
  key: CheckKey;
  ok: boolean;
  values?: Record<string, number>;
}

export interface CourseInsights {
  grading: {
    pending: number;
    oldestPendingDays: number | null;
    medianDays: number | null;
    /** Graded submissions per bucket of TURNAROUND_BUCKETS, plus one for longer. */
    turnaround: number[];
    graded: number;
    gradesWithFeedback: number;
    feedbackRate: number | null;
  };
  drafts: { count: number; students: number };
  submissions: { assignments: AssignmentRef[]; rows: SubmissionRow[]; lowAssignments: Array<AssignmentRef & { pct: number }> };
  /** Submissions by weekday (Monday first) and three-hour slot, in local time. */
  weekdayHour: number[][];
  contentMix: Array<{ modname: string; count: number }>;
  checks: CourseCheck[];
}

function submissionTime(submission: Record<string, unknown>): number | null {
  return num(submission.timemodified) ?? num(submission.timecreated);
}

export function courseInsights(analysis: CourseAnalysis, now = Math.floor(Date.now() / 1000)): CourseInsights {
  const students = analysis.students;
  const studentIds = new Set(students.map((student) => student.id));
  const assignments: AssignmentRef[] = analysis.assignments
    .map((assignment) => ({ id: num(assignment.id) ?? 0, name: String(assignment.name ?? "") }))
    .filter((assignment) => assignment.id > 0);
  // Assignments set to "no grade" (grade 0) never wait for a grade.
  const ungraded = new Set(analysis.assignments.filter((assignment) => num(assignment.grade) === 0).map((assignment) => num(assignment.id)));

  // Latest submission per assignment and student.
  const submissionOf = new Map<string, Record<string, unknown>>();
  for (const assignment of assignments) {
    for (const submission of analysis.submissionsByAssign[assignment.id] ?? []) {
      const user = num(submission.userid);
      if (user !== null && studentIds.has(user)) submissionOf.set(`${assignment.id}:${user}`, submission);
    }
  }
  const gradeOf = new Map<string, Record<string, unknown>>();
  for (const assignment of assignments) {
    for (const grade of analysis.assignmentGradesByAssign[assignment.id] ?? []) {
      const user = num(grade.userid);
      if (user !== null && studentIds.has(user) && (num(grade.grade) ?? -1) >= 0) gradeOf.set(`${assignment.id}:${user}`, grade);
    }
  }

  // Grading queue and time to grade.
  let pending = 0;
  let oldestPending: number | null = null;
  const delays: number[] = [];
  for (const [key, submission] of submissionOf) {
    if (UNSUBMITTED.has(String(submission.status ?? "submitted"))) continue;
    if (ungraded.has(Number(key.split(":")[0]))) continue;
    const submittedAt = submissionTime(submission);
    const grade = gradeOf.get(key);
    const gradedAt = grade ? num(grade.timemodified) : null;
    const notGraded = !grade || String(submission.gradingstatus ?? "") === "notgraded";
    if (notGraded) {
      pending += 1;
      if (submittedAt) oldestPending = Math.max(oldestPending ?? 0, (now - submittedAt) / DAY);
    } else if (submittedAt && gradedAt && gradedAt >= submittedAt) {
      delays.push((gradedAt - submittedAt) / DAY);
    }
  }
  const turnaround = new Array(TURNAROUND_BUCKETS.length + 1).fill(0);
  for (const days of delays) {
    const index = TURNAROUND_BUCKETS.findIndex((limit) => days <= limit);
    turnaround[index === -1 ? TURNAROUND_BUCKETS.length : index] += 1;
  }

  // Feedback on graded assignment items in the gradebook.
  let graded = 0;
  let gradesWithFeedback = 0;
  for (const student of students) {
    for (const item of student.grades.items) {
      if (item.modname !== "assign" || item.grade === null) continue;
      graded += 1;
      if (item.feedback && item.feedback.replace(/<[^>]*>/g, "").trim()) gradesWithFeedback += 1;
    }
  }

  // Who handed in each assignment. Graded work with no submission counts as handed in.
  const rows: SubmissionRow[] = students.map((student) => {
    const gradedInBook = gradedAssignmentIds(student);
    const cells = assignments.map((assignment): CellStatus => {
      const key = `${assignment.id}:${student.id}`;
      const submission = submissionOf.get(key);
      const status = String(submission?.status ?? "new");
      if (!submission || UNSUBMITTED.has(status)) {
        const grade = gradeOf.get(key);
        if (gradedInBook.has(assignment.id) || (grade && countsAsHandedIn(num(grade.grade)))) return "offline";
        return status === "draft" ? "draft" : "none";
      }
      if (ungraded.has(assignment.id)) return "graded";
      return gradeOf.has(key) && String(submission.gradingstatus ?? "") !== "notgraded" ? "graded" : "pending";
    });
    return {
      id: student.id,
      name: student.fullname,
      cells,
      submitted: cells.filter((cell) => cell === "graded" || cell === "offline" || cell === "pending").length,
      drafts: cells.filter((cell) => cell === "draft").length
    };
  });
  const lowAssignments = assignments
    .map((assignment, index) => ({
      ...assignment,
      pct: students.length ? (rows.filter((row) => ["graded", "offline", "pending"].includes(row.cells[index])).length / students.length) * 100 : 0
    }))
    .filter((assignment) => students.length > 0 && assignment.pct < 50);
  const draftCount = rows.reduce((sum, row) => sum + row.drafts, 0);

  // When students submit.
  const weekdayHour = Array.from({ length: 7 }, () => new Array(8).fill(0));
  for (const submission of submissionOf.values()) {
    if (UNSUBMITTED.has(String(submission.status ?? "submitted"))) continue;
    const at = submissionTime(submission);
    if (!at) continue;
    const date = new Date(at * 1000);
    weekdayHour[(date.getDay() + 6) % 7][Math.floor(date.getHours() / 3)] += 1;
  }

  // What the course contains, and how it is set up.
  const visibleModules = analysis.contents.flatMap((section) => (Array.isArray(section.modules) ? section.modules as Record<string, unknown>[] : []))
    .filter((module) => module.visible !== 0 && module.visible !== false);
  const mix = new Map<string, number>();
  for (const module of visibleModules) {
    const name = String(module.modname ?? "");
    if (name && name !== "label") mix.set(name, (mix.get(name) ?? 0) + 1);
  }
  const contentMix = [...mix.entries()].map(([modname, count]) => ({ modname, count })).sort((a, b) => b.count - a.count);

  const checks: CourseCheck[] = [];
  const withDue = analysis.assignments.filter((assignment) => (num(assignment.duedate) ?? 0) > 0).length;
  if (assignments.length > 0 && withDue === 0) checks.push({ key: "noDueDates", ok: false, values: { count: assignments.length } });
  else if (assignments.length > 0 && withDue < assignments.length) checks.push({ key: "someNoDueDates", ok: false, values: { count: assignments.length - withDue } });
  const completionEnabled = Boolean(analysis.course.enablecompletion);
  if (completionEnabled && visibleModules.length > 0 && !visibleModules.some((module) => (num(module.completion) ?? 0) > 0)) {
    checks.push({ key: "completionUnused", ok: false });
  }
  if (analysis.forums.length === 0) checks.push({ key: "noDiscussionForum", ok: false });
  const feedbackRate = graded > 0 ? (gradesWithFeedback / graded) * 100 : null;
  if (feedbackRate !== null) checks.push({ key: feedbackRate >= 50 ? "feedbackGood" : "feedbackLow", ok: feedbackRate >= 50, values: { pct: Math.round(feedbackRate) } });

  return {
    grading: {
      pending,
      oldestPendingDays: oldestPending === null ? null : Math.floor(oldestPending),
      medianDays: median(delays) === null ? null : Math.round(median(delays) as number),
      turnaround,
      graded,
      gradesWithFeedback,
      feedbackRate
    },
    drafts: { count: draftCount, students: rows.filter((row) => row.drafts > 0).length },
    submissions: { assignments, rows, lowAssignments },
    weekdayHour,
    contentMix,
    checks
  };
}

export interface GradePoint {
  at: number;
  pct: number;
}

/**
 * Running average of a student's graded items, in the order they were graded. The class line
 * is the running average of all students' graded items.
 */
export function gradeEvolution(student: StudentAnalysis, all: StudentAnalysis[]): { student: GradePoint[]; course: GradePoint[] } {
  const running = (items: Array<{ at: number; pct: number }>) => {
    const sorted = [...items].sort((a, b) => a.at - b.at);
    let sum = 0;
    return sorted.map((item, index) => {
      sum += item.pct;
      return { at: item.at, pct: sum / (index + 1) };
    });
  };
  const gradedItems = (entry: StudentAnalysis) => entry.grades.items
    .filter((item) => item.gradePct !== null && item.gradedAt)
    .map((item) => ({ at: item.gradedAt as number, pct: item.gradePct as number }));
  return { student: running(gradedItems(student)), course: running(all.flatMap(gradedItems)) };
}

/** Class averages to compare one student with. */
export function classAverages(all: StudentAnalysis[]) {
  const average = (values: Array<number | null>) => {
    const known = values.filter((value): value is number => value !== null);
    return known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null;
  };
  return {
    submissionRate: average(all.map((student) => student.metrics.submissionRate)),
    gradeAvgPct: average(all.map((student) => student.metrics.finalGradePct)),
    engagement: average(all.map((student) => student.metrics.engagementScore)),
    completionRate: average(all.map((student) => student.metrics.completionRate))
  };
}
