// Per-activity summaries of an analysed course: how the students did in each assignment,
// quiz and forum. Only students in the analysis count; teachers are already left out.
import type { CourseAnalysis } from "./types";

const UNSUBMITTED = new Set(["new", "draft", "reopened"]);

const num = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const average = (values: number[]): number | null =>
  values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export interface AssignmentSummary {
  id: number;
  name: string;
  dueDate: number | null;
  students: number;
  submitted: number;
  late: number;
  graded: number;
  avgGradePct: number | null;
}

export interface QuizSummary {
  id: number;
  name: string;
  students: number;
  attempted: number;
  attempts: number;
  /** Average of each student's best attempt, as a percentage of the quiz grade. */
  avgBestPct: number | null;
}

export interface ForumSummary {
  id: number;
  name: string;
  students: number;
  participants: number;
  posts: number;
  discussionsStarted: number;
}

export interface ActivitySummary {
  assignments: AssignmentSummary[];
  quizzes: QuizSummary[];
  forums: ForumSummary[];
}

export function summarizeActivities(analysis: CourseAnalysis): ActivitySummary {
  const studentIds = new Set(analysis.students.map((student) => student.id));
  const students = studentIds.size;
  const isStudent = (record: Record<string, unknown>) => studentIds.has(num(record.userid) ?? -1);

  const assignments = analysis.assignments.map((assignment): AssignmentSummary => {
    const id = num(assignment.id) ?? 0;
    const dueDate = num(assignment.duedate);
    const maxGrade = num(assignment.grade);
    const submissions = (analysis.submissionsByAssign[id] ?? []).filter(isStudent)
      .filter((submission) => !UNSUBMITTED.has(String(submission.status ?? "submitted")));
    const late = dueDate && dueDate > 0
      ? submissions.filter((submission) => (num(submission.timemodified) ?? num(submission.timecreated) ?? 0) > dueDate).length
      : 0;
    const grades = (analysis.assignmentGradesByAssign[id] ?? []).filter(isStudent)
      .map((grade) => num(grade.grade))
      .filter((grade): grade is number => grade !== null && grade >= 0);
    return {
      id,
      name: String(assignment.name ?? `Assignment ${id}`),
      dueDate: dueDate && dueDate > 0 ? dueDate : null,
      students,
      submitted: new Set(submissions.map((submission) => num(submission.userid))).size,
      late,
      graded: grades.length,
      avgGradePct: maxGrade && maxGrade > 0 ? average(grades.map((grade) => (grade / maxGrade) * 100)) : null
    };
  });

  const quizzes = analysis.quizzes.map((quiz): QuizSummary => {
    const id = num(quiz.id) ?? 0;
    const maxGrade = num(quiz.grade);
    const attempts = (analysis.attemptsByQuiz[id] ?? []).filter(isStudent);
    const best = new Map<number, number>();
    for (const attempt of attempts) {
      const grade = num(attempt.grade);
      const user = num(attempt.userid) ?? -1;
      if (grade !== null && grade > (best.get(user) ?? -Infinity)) best.set(user, grade);
    }
    return {
      id,
      name: String(quiz.name ?? `Quiz ${id}`),
      students,
      attempted: new Set(attempts.map((attempt) => num(attempt.userid))).size,
      attempts: attempts.length,
      avgBestPct: maxGrade && maxGrade > 0 ? average([...best.values()].map((grade) => (grade / maxGrade) * 100)) : null
    };
  });

  const posts = Object.values(analysis.postsByUser).flat().filter(isStudent);
  const forums = analysis.forums.map((forum): ForumSummary => {
    const id = num(forum.id) ?? 0;
    const forumPosts = posts.filter((post) => num(post.forumid) === id);
    return {
      id,
      name: String(forum.name ?? `Forum ${id}`),
      students,
      participants: new Set(forumPosts.map((post) => num(post.userid))).size,
      posts: forumPosts.length,
      discussionsStarted: forumPosts.filter((post) => (num(post.parent) ?? 0) === 0).length
    };
  });

  return { assignments, quizzes, forums };
}
