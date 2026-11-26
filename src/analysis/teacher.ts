// The teacher's overview across the courses they teach: how much is waiting for a grade and
// for how long, submissions received against grades given per week, grading time and feedback
// per course, the next two weeks of deadlines, recent student activity, the health of each
// course and students at risk in more than one course.
import { weekStart } from "./courseCharts";
import { UNSUBMITTED } from "./delivery";
import type { CourseInsights } from "./insights";
import { missingStudents } from "./todo";
import type { CourseAnalysis, RiskLevel } from "./types";

const DAY = 86400;
const WEEK = 7 * DAY;
export const BACKLOG_BUCKETS = [7, 14] as const;
export const THROUGHPUT_WEEKS = 8;
export const CALENDAR_DAYS = 14;
export const ACTIVITY_DAYS = 14;

const num = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

/** Midnight in local time of the day that contains the timestamp (seconds). */
export function dayStart(seconds: number): number {
  const date = new Date(seconds * 1000);
  date.setHours(0, 0, 0, 0);
  return Math.floor(date.getTime() / 1000);
}

export interface TaughtCourse {
  id: number;
  name: string;
  analysis: CourseAnalysis;
  insights: CourseInsights;
}

export interface CalendarEvent {
  courseId: number;
  courseName: string;
  kind: "assign" | "quiz";
  name: string;
  due: number;
  missing: number;
  students: number;
  path: string;
}

export interface CourseHealth {
  id: number;
  name: string;
  students: number;
  risk: Record<RiskLevel, number>;
  submissionRate: number | null;
  avgGrade: number | null;
  toGrade: number;
  medianGradingDays: number | null;
  feedbackRate: number | null;
  /** Share of students who entered the course in the last seven days. */
  activeWeek: number | null;
}

export interface TeacherOverview {
  /** Pending submissions per course by age: under 7 days, 7 to 14, over 14. */
  backlog: Array<{ id: number; name: string; counts: number[] }>;
  /** Submissions received and grades given per week, oldest first. */
  throughput: { weeks: number[]; received: number[]; graded: number[] };
  /** Deadlines per day for the next CALENDAR_DAYS days, starting today. */
  calendar: Array<{ day: number; events: CalendarEvent[] }>;
  /** Student submissions, forum posts and finished quiz attempts per day, oldest first. */
  activity: { days: number[]; submissions: number[]; posts: number[]; attempts: number[] };
  courses: CourseHealth[];
  /** Students at medium or high risk in two or more of the courses. */
  crossCourse: Array<{ id: number; name: string; courses: Array<{ id: number; name: string; risk: RiskLevel }> }>;
}

export function teacherOverview(courses: TaughtCourse[], now = Math.floor(Date.now() / 1000)): TeacherOverview {
  const backlog: TeacherOverview["backlog"] = [];
  const thisWeek = weekStart(now);
  const weeks = Array.from({ length: THROUGHPUT_WEEKS }, (_, index) => thisWeek - (THROUGHPUT_WEEKS - 1 - index) * WEEK);
  const received = new Array(THROUGHPUT_WEEKS).fill(0);
  const graded = new Array(THROUGHPUT_WEEKS).fill(0);
  const today = dayStart(now);
  const calendar = Array.from({ length: CALENDAR_DAYS }, (_, index) => ({ day: dayStart(today + index * DAY + 3600), events: [] as CalendarEvent[] }));
  const activityDays = Array.from({ length: ACTIVITY_DAYS }, (_, index) => dayStart(today - (ACTIVITY_DAYS - 1 - index) * DAY + 3600));
  const activity = { days: activityDays, submissions: new Array(ACTIVITY_DAYS).fill(0), posts: new Array(ACTIVITY_DAYS).fill(0), attempts: new Array(ACTIVITY_DAYS).fill(0) };
  const weekIndex = (seconds: number) => weeks.indexOf(weekStart(seconds));
  const dayIndex = (list: number[], seconds: number) => list.indexOf(dayStart(seconds));
  const health: CourseHealth[] = [];
  const atRisk = new Map<number, { name: string; courses: Array<{ id: number; name: string; risk: RiskLevel }> }>();

  for (const course of courses) {
    const { analysis, insights } = course;
    const students = new Set(analysis.students.map((student) => student.id));
    const ages = [0, 0, 0];

    for (const assignment of analysis.assignments) {
      const id = num(assignment.id);
      if (id === null) continue;
      const gradedUsers = new Set((analysis.assignmentGradesByAssign[id] ?? []).filter((grade) => (num(grade.grade) ?? -1) >= 0).map((grade) => num(grade.userid)));
      for (const submission of analysis.submissionsByAssign[id] ?? []) {
        const user = num(submission.userid);
        if (user === null || !students.has(user) || UNSUBMITTED.has(String(submission.status ?? "submitted"))) continue;
        const at = num(submission.timemodified) ?? num(submission.timecreated) ?? 0;
        if (at > 0) {
          const index = weekIndex(at);
          if (index >= 0) received[index] += 1;
          const day = dayIndex(activityDays, at);
          if (day >= 0) activity.submissions[day] += 1;
        }
        const waiting = num(assignment.grade) !== 0 && (!gradedUsers.has(user) || String(submission.gradingstatus ?? "") === "notgraded");
        if (waiting) {
          const days = (now - (at || now)) / DAY;
          ages[days < BACKLOG_BUCKETS[0] ? 0 : days < BACKLOG_BUCKETS[1] ? 1 : 2] += 1;
        }
      }
      for (const grade of analysis.assignmentGradesByAssign[id] ?? []) {
        const at = num(grade.timemodified) ?? 0;
        if (!students.has(num(grade.userid) ?? -1) || (num(grade.grade) ?? -1) < 0 || at <= 0) continue;
        const index = weekIndex(at);
        if (index >= 0) graded[index] += 1;
      }
      const due = num(assignment.duedate) ?? 0;
      const cmid = num(assignment.cmid);
      const day = dayIndex(calendar.map((entry) => entry.day), due);
      if (due >= now && day >= 0 && cmid !== null) {
        calendar[day].events.push({ courseId: course.id, courseName: course.name, kind: "assign", name: String(assignment.name ?? ""), due, missing: missingStudents(analysis, id).length, students: students.size, path: `/mod/assign/view.php?id=${cmid}` });
      }
    }
    if (ages.some((count) => count > 0)) backlog.push({ id: course.id, name: course.name, counts: ages });

    for (const quiz of analysis.quizzes) {
      const id = num(quiz.id);
      const cmid = num(quiz.coursemodule);
      const close = num(quiz.timeclose) ?? 0;
      const day = dayIndex(calendar.map((entry) => entry.day), close);
      if (id === null || cmid === null || close < now || day < 0) continue;
      const done = new Set((analysis.attemptsByQuiz[id] ?? []).filter((attempt) => String(attempt.state ?? "") === "finished").map((attempt) => num(attempt.userid)));
      calendar[day].events.push({ courseId: course.id, courseName: course.name, kind: "quiz", name: String(quiz.name ?? ""), due: close, missing: analysis.students.filter((student) => !done.has(student.id)).length, students: students.size, path: `/mod/quiz/view.php?id=${cmid}` });
    }

    for (const [user, posts] of Object.entries(analysis.postsByUser)) {
      if (!students.has(Number(user))) continue;
      for (const post of posts) {
        const day = dayIndex(activityDays, num(post.created) ?? 0);
        if (day >= 0) activity.posts[day] += 1;
      }
    }
    for (const attempts of Object.values(analysis.attemptsByQuiz)) {
      for (const attempt of attempts) {
        if (!students.has(num(attempt.userid) ?? -1) || String(attempt.state ?? "") !== "finished") continue;
        const day = dayIndex(activityDays, num(attempt.timefinish) ?? 0);
        if (day >= 0) activity.attempts[day] += 1;
      }
    }

    const m = analysis.courseMetrics;
    health.push({
      id: course.id,
      name: course.name,
      students: m.totalStudents,
      risk: { high: m.atRiskHigh, medium: m.atRiskMedium, low: m.atRiskLow },
      submissionRate: m.avgSubmissionRate,
      avgGrade: m.avgGradePct,
      toGrade: insights.grading.pending,
      medianGradingDays: insights.grading.medianDays,
      feedbackRate: insights.grading.feedbackRate,
      activeWeek: m.totalStudents ? (analysis.students.filter((student) => student.metrics.daysSinceAccess <= 7).length / m.totalStudents) * 100 : null
    });

    for (const student of analysis.students) {
      if (student.riskLevel === "low") continue;
      const entry = atRisk.get(student.id) ?? { name: student.fullname, courses: [] };
      entry.courses.push({ id: course.id, name: course.name, risk: student.riskLevel });
      atRisk.set(student.id, entry);
    }
  }

  for (const entry of calendar) entry.events.sort((a, b) => a.due - b.due);
  const order: Record<RiskLevel, number> = { high: 2, medium: 1, low: 0 };
  const score = (entry: { courses: Array<{ risk: RiskLevel }> }) => entry.courses.reduce((sum, course) => sum + order[course.risk], 0);
  return {
    backlog: backlog.sort((a, b) => b.counts[2] - a.counts[2] || b.counts.reduce((x, y) => x + y, 0) - a.counts.reduce((x, y) => x + y, 0)),
    throughput: { weeks, received, graded },
    calendar,
    activity,
    courses: health,
    crossCourse: [...atRisk.entries()]
      .filter(([, entry]) => entry.courses.length >= 2)
      .map(([id, entry]) => ({ id, ...entry }))
      .sort((a, b) => score(b) - score(a) || b.courses.length - a.courses.length)
  };
}
