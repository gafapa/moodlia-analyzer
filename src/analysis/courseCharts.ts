// Data for the course charts, computed from an analysed course. Only students count.
import type { CourseAnalysis } from "./types";

const WEEK = 7 * 86400;

const num = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

/** Monday 00:00 UTC of the week that contains the timestamp (seconds). */
export function weekStart(seconds: number): number {
  const day = Math.floor(seconds / 86400);
  // 1 January 1970 was a Thursday: day 0 is weekday 3 counting from Monday.
  return (day - ((day + 3) % 7)) * 86400;
}

export interface ActivityWeek {
  week: number;
  submissions: number;
  quizAttempts: number;
  forumPosts: number;
}

/**
 * Student actions per week: assignment submissions (last change), finished quiz attempts and
 * forum posts. Weeks without actions between the first and the last are included as zeros;
 * at most the last `maxWeeks` weeks are kept.
 */
export function weeklyActivity(analysis: CourseAnalysis, maxWeeks = 52): ActivityWeek[] {
  const counts = new Map<number, ActivityWeek>();
  const add = (seconds: number | null, field: keyof Omit<ActivityWeek, "week">) => {
    if (!seconds || seconds <= 0) return;
    const week = weekStart(seconds);
    const entry = counts.get(week) ?? { week, submissions: 0, quizAttempts: 0, forumPosts: 0 };
    entry[field] += 1;
    counts.set(week, entry);
  };
  for (const student of analysis.students) {
    for (const submission of student.submissions) {
      if (["new", "draft", "reopened"].includes(String(submission.status ?? "submitted"))) continue;
      add(num(submission.timemodified) ?? num(submission.timecreated), "submissions");
    }
    for (const attempt of student.quizAttempts) add(num(attempt.timefinish) ?? num(attempt.timestart), "quizAttempts");
    for (const post of student.forumPosts) add(num(post.created), "forumPosts");
  }
  if (counts.size === 0) return [];
  const weeks = [...counts.keys()].sort((a, b) => a - b);
  const last = weeks[weeks.length - 1];
  const first = Math.max(weeks[0], last - (maxWeeks - 1) * WEEK);
  const series: ActivityWeek[] = [];
  for (let week = first; week <= last; week += WEEK) {
    series.push(counts.get(week) ?? { week, submissions: 0, quizAttempts: 0, forumPosts: 0 });
  }
  return series;
}

export interface StudentPoint {
  id: number;
  name: string;
  engagement: number;
  gradePct: number | null;
  riskLevel: "high" | "medium" | "low";
}

/** One point per student: engagement (0-100) against the current grade. */
export function engagementVsGrade(analysis: CourseAnalysis): StudentPoint[] {
  return analysis.students.map((student) => ({
    id: student.id,
    name: student.fullname,
    engagement: Math.round(student.metrics.engagementScore),
    gradePct: student.metrics.finalGradePct,
    riskLevel: student.riskLevel
  }));
}
