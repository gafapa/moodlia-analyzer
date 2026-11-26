// When an assignment counts as handed in. A submission in Moodle counts, and so does a grade
// without one: work handed in on paper or in class is graded in Moodle with no submission.
// A grade of 0 without a submission does not count, since teachers often record work that
// was never handed in that way.
import type { StudentCourseData } from "./types";

export const UNSUBMITTED = new Set(["new", "draft", "reopened"]);

const num = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

export function isSubmitted(submission: Record<string, unknown> | undefined): boolean {
  return submission !== undefined && !UNSUBMITTED.has(String(submission.status ?? "submitted"));
}

/** A grade above 0 that counts as handed in when there is no submission. */
export function countsAsHandedIn(grade: number | null | undefined): boolean {
  return grade !== null && grade !== undefined && grade > 0;
}

/** Assignment ids of the gradebook items that grade the student above 0. */
export function gradedAssignmentIds(student: Pick<StudentCourseData, "grades">): Set<number> {
  return new Set((student.grades?.items ?? [])
    .filter((item) => item.modname === "assign" && item.instance !== undefined && countsAsHandedIn(item.grade))
    .map((item) => item.instance as number));
}

/**
 * The assignments of `assignmentIds` the student handed in: submitted in Moodle, or graded
 * above 0 in the gradebook or the assignment.
 */
export function handedInAssignments(
  student: Pick<StudentCourseData, "id" | "grades" | "submissions">,
  assignmentIds: Iterable<number>,
  assignmentGrades: Record<number, Record<string, unknown>[]> = {},
): { all: Set<number>; withoutSubmission: Set<number> } {
  const ids = new Set(assignmentIds);
  const submitted = new Set(student.submissions
    .filter((submission) => isSubmitted(submission))
    .map((submission) => num(submission.assignid))
    .filter((id): id is number => id !== null && ids.has(id)));
  const graded = gradedAssignmentIds(student);
  for (const id of ids) {
    if ((assignmentGrades[id] ?? []).some((grade) => num(grade.userid) === student.id && countsAsHandedIn(num(grade.grade)))) graded.add(id);
  }
  const withoutSubmission = new Set([...graded].filter((id) => ids.has(id) && !submitted.has(id)));
  return { all: new Set([...submitted, ...withoutSubmission]), withoutSubmission };
}
