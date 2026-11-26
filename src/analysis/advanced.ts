// Further course analyses: when students submit relative to the due date, activity completion,
// days since the last access, the spread of each grade item, quiz question statistics, the
// forum reply network, student profiles, risk changes between analyses and the workload of
// deadlines across courses. Everything is computed from data the collector already read.
import type { CourseAnalysis, Deadline, RiskLevel, StudentAnalysis } from "./types";
import { weekStart } from "./courseCharts";

const HOUR = 3600;
const DAY = 86400;
const WEEK = 7 * DAY;
const UNSUBMITTED = new Set(["new", "draft", "reopened"]);

const num = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const mean = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

/** Linear-interpolated quantile of sorted values. */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

function variance(values: number[]): number | null {
  const average = mean(values);
  if (average === null || values.length < 2) return null;
  return values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
}

/** Pearson correlation; null when either side does not vary or there are fewer than 5 pairs. */
export function correlation(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 5) return null;
  const mx = mean(xs) as number;
  const my = mean(ys) as number;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let index = 0; index < xs.length; index += 1) {
    sxy += (xs[index] - mx) * (ys[index] - my);
    sxx += (xs[index] - mx) ** 2;
    syy += (ys[index] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

// ---------------------------------------------------------------------------------------------
// 1. Submission timing

/** Buckets of submission time relative to the due date, from late to well ahead. */
export const TIMING_BUCKETS = ["late", "lastDay", "days1to3", "days3to7", "early"] as const;
export type TimingBucket = (typeof TIMING_BUCKETS)[number];
export type TimingProfile = "early" | "onTime" | "lastMinute" | "late";

export function timingBucket(hoursBefore: number): TimingBucket {
  if (hoursBefore < 0) return "late";
  if (hoursBefore < 24) return "lastDay";
  if (hoursBefore < 72) return "days1to3";
  if (hoursBefore < 168) return "days3to7";
  return "early";
}

export interface StudentTiming {
  /** Submissions to assignments with a due date. */
  dated: number;
  counts: number[];
  /**
   * Average position in the order of submission of each assignment: 0 the first to submit,
   * 1 the last (a relative submission time, comparable across assignments).
   */
  rank: number | null;
  profile: TimingProfile | null;
}

export interface SubmissionTiming {
  assignments: Array<{ id: number; name: string; due: number; counts: number[]; total: number; medianHours: number | null }>;
  counts: number[];
  total: number;
  medianHours: number | null;
  students: Record<number, StudentTiming>;
  /** Share of dated submissions made in the last 24 hours or late. */
  lastMinuteShare: number | null;
}

export function submissionTiming(analysis: CourseAnalysis): SubmissionTiming {
  const studentIds = new Set(analysis.students.map((student) => student.id));
  const perStudent = new Map<number, { counts: number[]; ranks: number[] }>();
  const allHours: number[] = [];
  const counts: number[] = new Array(TIMING_BUCKETS.length).fill(0);
  const assignments: SubmissionTiming["assignments"] = [];
  for (const assignment of analysis.assignments) {
    const id = num(assignment.id);
    const due = num(assignment.duedate) ?? 0;
    if (id === null || due <= 0) continue;
    const submitted = (analysis.submissionsByAssign[id] ?? [])
      .filter((submission) => studentIds.has(num(submission.userid) ?? -1) && !UNSUBMITTED.has(String(submission.status ?? "submitted")))
      .map((submission) => ({ userid: num(submission.userid) as number, at: num(submission.timemodified) ?? num(submission.timecreated) ?? 0 }))
      .filter((entry) => entry.at > 0)
      .sort((a, b) => a.at - b.at);
    if (submitted.length === 0) continue;
    const bucketCounts: number[] = new Array(TIMING_BUCKETS.length).fill(0);
    const hours: number[] = [];
    submitted.forEach((entry, index) => {
      const before = (due - entry.at) / HOUR;
      const bucket = (TIMING_BUCKETS as readonly string[]).indexOf(timingBucket(before));
      bucketCounts[bucket] += 1;
      counts[bucket] += 1;
      hours.push(before);
      allHours.push(before);
      const own = perStudent.get(entry.userid) ?? { counts: new Array<number>(TIMING_BUCKETS.length).fill(0), ranks: [] as number[] };
      own.counts[bucket] += 1;
      if (submitted.length > 1) own.ranks.push(index / (submitted.length - 1));
      perStudent.set(entry.userid, own);
    });
    const sortedHours = [...hours].sort((a, b) => a - b);
    assignments.push({ id, name: String(assignment.name ?? ""), due, counts: bucketCounts, total: submitted.length, medianHours: quantile(sortedHours, 0.5) });
  }
  const students: Record<number, StudentTiming> = {};
  for (const student of analysis.students) {
    const own = perStudent.get(student.id);
    const dated = own ? own.counts.reduce((sum, value) => sum + value, 0) : 0;
    const rank = own ? mean(own.ranks) : null;
    let profile: TimingProfile | null = null;
    if (own && dated > 0) {
      const late = own.counts[0];
      const lastDay = own.counts[1];
      if (late / dated >= 0.5) profile = "late";
      else if ((late + lastDay) / dated >= 0.5 || (rank !== null && rank >= 0.67)) profile = "lastMinute";
      else if (rank !== null && rank <= 0.33 && (own.counts[3] + own.counts[4]) / dated >= 0.5) profile = "early";
      else profile = "onTime";
    }
    students[student.id] = { dated, counts: own?.counts ?? new Array(TIMING_BUCKETS.length).fill(0), rank, profile };
  }
  const total = counts.reduce((sum, value) => sum + value, 0);
  const sortedAll = [...allHours].sort((a, b) => a - b);
  return {
    assignments: assignments.sort((a, b) => a.due - b.due),
    counts,
    total,
    medianHours: sortedAll.length ? quantile(sortedAll, 0.5) : null,
    students,
    lastMinuteShare: total ? ((counts[0] + counts[1]) / total) * 100 : null
  };
}

// ---------------------------------------------------------------------------------------------
// 2. Activity completion matrix

export type CompletionCell = "done" | "failed" | "todo";

export interface CompletionMatrix {
  activities: Array<{ cmid: number; name: string; modname: string; rate: number }>;
  rows: Array<{ id: number; name: string; cells: CompletionCell[]; done: number }>;
  /** Activities fewer than one student in five completed. */
  unused: number;
}

export function completionMatrix(analysis: CourseAnalysis): CompletionMatrix {
  const modules = new Map<number, { name: string; modname: string; order: number }>();
  let order = 0;
  for (const section of analysis.contents) {
    for (const module of Array.isArray(section.modules) ? (section.modules as Record<string, unknown>[]) : []) {
      const id = num(module.id);
      if (id !== null) modules.set(id, { name: String(module.name ?? ""), modname: String(module.modname ?? ""), order: order++ });
    }
  }
  const tracked = new Map<number, string>();
  for (const student of analysis.students) {
    for (const status of student.completion.statuses) {
      const cmid = num(status.cmid);
      if (cmid === null || (num(status.tracking) ?? 1) === 0) continue;
      if (status.uservisible === false) continue;
      tracked.set(cmid, String(status.modname ?? modules.get(cmid)?.modname ?? ""));
    }
  }
  const ids = [...tracked.keys()].sort((a, b) => (modules.get(a)?.order ?? Infinity) - (modules.get(b)?.order ?? Infinity) || a - b);
  if (ids.length === 0) return { activities: [], rows: [], unused: 0 };
  const rows = analysis.students.map((student) => {
    const states = new Map(student.completion.statuses.map((status) => [num(status.cmid), num(status.state) ?? 0]));
    const cells = ids.map((cmid): CompletionCell => {
      const state = states.get(cmid) ?? 0;
      return state === 1 || state === 2 ? "done" : state === 3 ? "failed" : "todo";
    });
    return { id: student.id, name: student.fullname, cells, done: cells.filter((cell) => cell === "done").length };
  });
  const activities = ids.map((cmid, index) => ({
    cmid,
    name: modules.get(cmid)?.name || `#${cmid}`,
    modname: tracked.get(cmid) ?? "",
    rate: rows.length ? (rows.filter((row) => row.cells[index] === "done").length / rows.length) * 100 : 0
  }));
  return { activities, rows, unused: activities.filter((activity) => activity.rate < 20).length };
}

// ---------------------------------------------------------------------------------------------
// 3. Days since the last access

export const ACCESS_BUCKETS = [[0, 1], [2, 3], [4, 7], [8, 14], [15, 30], [31, 998]] as const;

export interface AccessDistribution {
  /** Students per bucket of ACCESS_BUCKETS, then those who never entered. */
  counts: number[];
  /** Share of students who entered in the last d days, for d = 0..30. */
  curve: number[];
  medianDays: number | null;
}

export function accessDistribution(analysis: CourseAnalysis): AccessDistribution {
  const days = analysis.students.map((student) => student.metrics.daysSinceAccess);
  const counts = ACCESS_BUCKETS.map(([low, high]) => days.filter((value) => value >= low && value <= high).length);
  counts.push(days.filter((value) => value >= 999).length);
  const curve = Array.from({ length: 31 }, (_, limit) => (days.length ? (days.filter((value) => value <= limit).length / days.length) * 100 : 0));
  const entered = days.filter((value) => value < 999).sort((a, b) => a - b);
  return { counts, curve, medianDays: entered.length ? Math.round(quantile(entered, 0.5)) : null };
}

// ---------------------------------------------------------------------------------------------
// 4. Spread of each grade item

export interface ItemSpread {
  key: string;
  name: string;
  modname: string;
  count: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  mean: number;
  sd: number;
  belowPass: number;
}

export function gradeSpread(analysis: CourseAnalysis): ItemSpread[] {
  const items = new Map<string, { name: string; modname: string; values: number[] }>();
  for (const student of analysis.students) {
    for (const item of student.grades.items) {
      if (item.gradePct === null || item.type === "category") continue;
      const key = item.id !== undefined ? String(item.id) : `${item.modname}:${item.instance}:${item.name}`;
      const entry = items.get(key) ?? { name: item.name, modname: item.modname ?? "", values: [] };
      entry.values.push(Math.max(0, Math.min(100, item.gradePct)));
      items.set(key, entry);
    }
  }
  return [...items.entries()]
    .filter(([, entry]) => entry.values.length >= 3)
    .map(([key, entry]) => {
      const sorted = [...entry.values].sort((a, b) => a - b);
      const average = mean(sorted) as number;
      return {
        key,
        name: entry.name,
        modname: entry.modname,
        count: sorted.length,
        min: sorted[0],
        q1: quantile(sorted, 0.25),
        median: quantile(sorted, 0.5),
        q3: quantile(sorted, 0.75),
        max: sorted[sorted.length - 1],
        mean: average,
        sd: Math.sqrt(variance(sorted) ?? 0),
        belowPass: sorted.filter((value) => value < analysis.passThresholdPct).length
      };
    });
}

// ---------------------------------------------------------------------------------------------
// 5. Quiz question statistics

export type QuestionFlag = "negative" | "weak" | "easy" | "hard";

export interface QuestionStats {
  slot: number;
  number: string;
  type: string;
  text: string;
  varies: boolean;
  count: number;
  /** Average mark as a percentage of the question's maximum. */
  facility: number | null;
  /** Correlation between the question mark and the mark on the rest of the quiz. */
  discrimination: number | null;
  flag: QuestionFlag | null;
}

export interface QuizStats {
  id: number;
  name: string;
  attempts: number;
  /** Average quiz mark as a percentage. */
  average: number | null;
  /** Cronbach's alpha: how consistently the questions measure the same thing. */
  consistency: number | null;
  questions: QuestionStats[];
}

export function questionFlag(facility: number | null, discrimination: number | null): QuestionFlag | null {
  if (discrimination !== null && discrimination < 0) return "negative";
  if (discrimination !== null && discrimination < 0.2) return "weak";
  if (facility !== null && facility >= 90) return "easy";
  if (facility !== null && facility < 20) return "hard";
  return null;
}

export function quizStatistics(analysis: CourseAnalysis): QuizStats[] {
  const studentIds = new Set(analysis.students.map((student) => student.id));
  const names = new Map(analysis.quizzes.map((quiz) => [num(quiz.id), String(quiz.name ?? "")]));
  const result: QuizStats[] = [];
  for (const [quizKey, data] of Object.entries(analysis.quizQuestions ?? {})) {
    const id = Number(quizKey);
    const attempts = data.attempts.filter((attempt) => studentIds.has(attempt.userid));
    if (attempts.length === 0) continue;
    const maxOf = (slot: number) => data.slots.find((entry) => entry.slot === slot)?.maxmark ?? 1;
    const fraction = (attempt: (typeof attempts)[number], slot: number) => {
      const mark = attempt.marks[slot];
      const max = maxOf(slot);
      return mark === null || mark === undefined || !max ? null : mark / max;
    };
    const totals = attempts.map((attempt) => data.slots.reduce((sum, slot) => sum + (attempt.marks[slot.slot] ?? 0), 0));
    const maxTotal = data.slots.reduce((sum, slot) => sum + (slot.maxmark ?? 0), 0);
    const questions = data.slots.map((slot): QuestionStats => {
      const xs: number[] = [];
      const rest: number[] = [];
      attempts.forEach((attempt, index) => {
        const value = fraction(attempt, slot.slot);
        if (value === null) return;
        xs.push(value);
        rest.push(totals[index] - (attempt.marks[slot.slot] ?? 0));
      });
      const facility = xs.length ? (mean(xs) as number) * 100 : null;
      const discrimination = correlation(xs, rest);
      return { slot: slot.slot, number: slot.number, type: slot.type, text: slot.text, varies: slot.varies, count: xs.length, facility, discrimination, flag: questionFlag(facility, discrimination) };
    });
    const itemVariances = data.slots.map((slot) => variance(attempts.map((attempt) => attempt.marks[slot.slot] ?? 0)) ?? 0);
    const totalVariance = variance(totals);
    const k = data.slots.length;
    const consistency = k > 1 && totalVariance && attempts.length >= 5
      ? (k / (k - 1)) * (1 - itemVariances.reduce((sum, value) => sum + value, 0) / totalVariance)
      : null;
    result.push({
      id,
      name: names.get(id) ?? `#${id}`,
      attempts: attempts.length,
      average: maxTotal > 0 ? ((mean(totals) as number) / maxTotal) * 100 : null,
      consistency,
      questions
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------------------------
// 6. Forum reply network

export interface NetworkNode {
  id: number;
  name: string;
  role: "student" | "teacher";
  posts: number;
  sent: number;
  received: number;
}

export interface ForumNetwork {
  nodes: NetworkNode[];
  edges: Array<{ from: number; to: number; weight: number }>;
  discussions: number;
  /** Discussions a student opened where nobody else wrote. */
  unanswered: number;
  /** Median hours from a discussion's first post to its first reply. */
  firstReplyHours: number | null;
  /** Share of replies that a teacher wrote or received. */
  teacherShare: number | null;
  /** Students without posts, and students who posted but nobody replied to and who replied to nobody. */
  silent: number[];
  isolated: number[];
}

export function forumNetwork(analysis: CourseAnalysis): ForumNetwork {
  const studentNames = new Map(analysis.students.map((student) => [student.id, student.fullname]));
  const posts = Object.values(analysis.postsByUser).flat();
  const authorOf = new Map<number, number>();
  for (const post of posts) {
    const id = num(post.id);
    const user = num(post.userid);
    if (id !== null && user !== null) authorOf.set(id, user);
  }
  const nodes = new Map<number, NetworkNode>();
  const node = (user: number, post?: Record<string, unknown>) => {
    let entry = nodes.get(user);
    if (!entry) {
      const isStudent = studentNames.has(user);
      entry = { id: user, name: studentNames.get(user) ?? String(post?.authorname || `#${user}`), role: isStudent ? "student" : "teacher", posts: 0, sent: 0, received: 0 };
      nodes.set(user, entry);
    }
    return entry;
  };
  const edges = new Map<string, { from: number; to: number; weight: number }>();
  const byDiscussion = new Map<number, Array<{ created: number; parent: number; user: number }>>();
  let teacherReplies = 0;
  let replies = 0;
  for (const post of posts) {
    const user = num(post.userid);
    if (user === null) continue;
    node(user, post).posts += 1;
    const parent = num(post.parent) ?? 0;
    const discussion = num(post.discussionid);
    if (discussion !== null) {
      const list = byDiscussion.get(discussion) ?? [];
      list.push({ created: num(post.created) ?? 0, parent, user });
      byDiscussion.set(discussion, list);
    }
    if (parent === 0) continue;
    const target = authorOf.get(parent);
    if (target === undefined || target === user) continue;
    node(user).sent += 1;
    node(target).received += 1;
    replies += 1;
    if (!studentNames.has(user) || !studentNames.has(target)) teacherReplies += 1;
    const key = `${user}>${target}`;
    const edge = edges.get(key) ?? { from: user, to: target, weight: 0 };
    edge.weight += 1;
    edges.set(key, edge);
  }
  let unanswered = 0;
  const firstReplies: number[] = [];
  for (const list of byDiscussion.values()) {
    const sorted = [...list].sort((a, b) => a.created - b.created);
    const start = sorted.find((entry) => entry.parent === 0) ?? sorted[0];
    const reply = sorted.find((entry) => entry !== start && entry.user !== start.user);
    // Only discussions a student opened: teachers often post notices nobody needs to answer.
    if (!reply) {
      if (studentNames.has(start.user)) unanswered += 1;
    }
    else if (reply.created >= start.created) firstReplies.push((reply.created - start.created) / HOUR);
  }
  const silent = analysis.students.filter((student) => !nodes.has(student.id)).map((student) => student.id);
  const isolated = analysis.students.filter((student) => {
    const entry = nodes.get(student.id);
    return entry !== undefined && entry.sent === 0 && entry.received === 0;
  }).map((student) => student.id);
  const sortedReplies = [...firstReplies].sort((a, b) => a - b);
  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    discussions: byDiscussion.size,
    unanswered,
    firstReplyHours: sortedReplies.length ? quantile(sortedReplies, 0.5) : null,
    teacherShare: replies ? (teacherReplies / replies) * 100 : null,
    silent,
    isolated
  };
}

// ---------------------------------------------------------------------------------------------
// 7. Student profiles

export const PROFILES = ["steady", "lastMinute", "efficient", "struggling", "disengaged", "irregular"] as const;
export type ProfileKey = (typeof PROFILES)[number];

/**
 * Groups students by behaviour with explicit rules, so every label can be explained:
 * disengaged (no access for two weeks or very low engagement), struggling (active but below
 * the pass mark), efficient (passing with little activity), last minute (submits at the end or
 * late), steady (submits nearly everything and passes) and irregular (everything else).
 */
export function studentProfile(student: StudentAnalysis, timing: StudentTiming | undefined, passMark: number): ProfileKey {
  const m = student.metrics;
  const grade = m.finalGradePct;
  if (m.daysSinceAccess > 14 || m.engagementScore < 25) return "disengaged";
  if (grade !== null && grade < passMark && m.engagementScore >= 50) return "struggling";
  if (grade !== null && grade >= passMark && m.engagementScore < 40) return "efficient";
  if (timing?.profile === "lastMinute" || timing?.profile === "late") return "lastMinute";
  if ((m.submissionRate ?? 100) >= 80 && (grade === null || grade >= passMark)) return "steady";
  return "irregular";
}

export function studentProfiles(analysis: CourseAnalysis, timing: SubmissionTiming): Record<number, ProfileKey> {
  return Object.fromEntries(analysis.students.map((student) => [student.id, studentProfile(student, timing.students[student.id], analysis.passThresholdPct)]));
}

// ---------------------------------------------------------------------------------------------
// 8. Risk changes between analyses

export interface RiskSnapshot {
  /** Day of the analysis, as YYYY-MM-DD. */
  day: string;
  risks: Record<number, RiskLevel>;
}

export interface RiskFlow {
  from: string;
  to: string;
  /** Students by [earlier level][current level], levels in the order high, medium, low. */
  matrix: number[][];
  worse: number[];
  better: number[];
}

export const RISK_LEVELS: RiskLevel[] = ["high", "medium", "low"];

/** Compares the latest snapshot with the one before it, on another day. */
export function riskFlow(history: RiskSnapshot[]): RiskFlow | null {
  if (history.length < 2) return null;
  const sorted = [...history].sort((a, b) => a.day.localeCompare(b.day));
  const current = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];
  const matrix = RISK_LEVELS.map(() => RISK_LEVELS.map(() => 0));
  const worse: number[] = [];
  const better: number[] = [];
  for (const [key, level] of Object.entries(current.risks)) {
    const before = previous.risks[Number(key)];
    if (!before) continue;
    const from = RISK_LEVELS.indexOf(before);
    const to = RISK_LEVELS.indexOf(level);
    if (from < 0 || to < 0) continue;
    matrix[from][to] += 1;
    if (to < from) worse.push(Number(key));
    if (to > from) better.push(Number(key));
  }
  return { from: previous.day, to: current.day, matrix, worse, better };
}

// ---------------------------------------------------------------------------------------------
// 9. Deadlines across the students' courses

export const WORKLOAD_PAST_WEEKS = 4;
export const WORKLOAD_WEEKS = 12;
export const OVERLOAD = 3;

export interface Workload {
  weeks: number[];
  /** Average deadlines per student in each week. */
  average: number[];
  /** Students with OVERLOAD or more deadlines in each week. */
  overloaded: number[];
  perStudent: Record<number, number[]>;
  courses: number;
  covered: number;
}

export function workload(analysis: CourseAnalysis, now = Math.floor(Date.now() / 1000)): Workload | null {
  const data = analysis.workload;
  if (!data || data.deadlines.length === 0) return null;
  const first = weekStart(now) - WORKLOAD_PAST_WEEKS * WEEK;
  const weeks = Array.from({ length: WORKLOAD_WEEKS }, (_, index) => first + index * WEEK);
  const byCourse = new Map<number, Deadline[]>();
  for (const deadline of data.deadlines) {
    const list = byCourse.get(deadline.courseId) ?? [];
    list.push(deadline);
    byCourse.set(deadline.courseId, list);
  }
  const perStudent: Record<number, number[]> = {};
  for (const student of analysis.students) {
    const counts = new Array(WORKLOAD_WEEKS).fill(0);
    for (const courseId of data.coursesByUser[student.id] ?? []) {
      for (const deadline of byCourse.get(courseId) ?? []) {
        const index = Math.floor((weekStart(deadline.due) - first) / WEEK);
        if (index >= 0 && index < WORKLOAD_WEEKS) counts[index] += 1;
      }
    }
    perStudent[student.id] = counts;
  }
  const rows = Object.values(perStudent);
  const courses = new Set(Object.values(data.coursesByUser).flat());
  const covered = new Set([...data.covered.assignments, ...data.covered.quizzes].filter((id) => courses.has(id)));
  return {
    weeks,
    average: weeks.map((_, index) => (rows.length ? rows.reduce((sum, row) => sum + row[index], 0) / rows.length : 0)),
    overloaded: weeks.map((_, index) => rows.filter((row) => row[index] >= OVERLOAD).length),
    perStudent,
    courses: courses.size,
    covered: covered.size
  };
}

/** One student's deadlines in the workload window, soonest first. */
export function studentDeadlines(analysis: CourseAnalysis, studentId: number, now = Math.floor(Date.now() / 1000)) {
  const data = analysis.workload;
  if (!data) return [];
  const courses = new Set(data.coursesByUser[studentId] ?? []);
  const from = weekStart(now);
  const to = from + (WORKLOAD_WEEKS - WORKLOAD_PAST_WEEKS) * WEEK;
  return data.deadlines
    .filter((deadline) => courses.has(deadline.courseId) && deadline.due >= from && deadline.due < to)
    .sort((a, b) => a.due - b.due)
    .map((deadline) => ({ ...deadline, course: data.courseNames[deadline.courseId] ?? `#${deadline.courseId}` }));
}

// ---------------------------------------------------------------------------------------------

export interface AdvancedInsights {
  timing: SubmissionTiming;
  completion: CompletionMatrix;
  access: AccessDistribution;
  spread: ItemSpread[];
  quizzes: QuizStats[];
  network: ForumNetwork;
  profiles: Record<number, ProfileKey>;
  workload: Workload | null;
}

export function advancedInsights(analysis: CourseAnalysis, now = Math.floor(Date.now() / 1000)): AdvancedInsights {
  const timing = submissionTiming(analysis);
  return {
    timing,
    completion: completionMatrix(analysis),
    access: accessDistribution(analysis),
    spread: gradeSpread(analysis),
    quizzes: quizStatistics(analysis),
    network: forumNetwork(analysis),
    profiles: studentProfiles(analysis, timing),
    workload: workload(analysis, now)
  };
}
