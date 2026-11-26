import { describe, expect, it } from 'vitest';

import { handedInAssignments } from '../../src/analysis/delivery';
import { courseInsights } from '../../src/analysis/insights';
import { StudentMetricsComputer } from '../../src/analysis/metrics';
import type { CourseAnalysis, StudentAnalysis, StudentCourseData } from '../../src/analysis/types';

const item = (instance: number, grade: number | null) => ({ name: `A${instance}`, modname: 'assign', instance, grade, gradePct: grade === null ? null : grade * 10, maxGrade: 10, minGrade: 0 });

function student(): StudentCourseData {
  return {
    id: 7,
    fullname: 'Ana',
    grades: { finalGrade: null, finalGradePct: null, courseTotalMax: 10, items: [item(1, 7), item(2, 0), item(3, null), item(9, 8)] },
    completion: { statuses: [], completed: 0, total: 0 },
    // Assignment 4 was submitted in Moodle; 1 was graded with no submission (on paper).
    submissions: [{ assignid: 4, status: 'submitted', timemodified: 1 }, { assignid: 5, status: 'new' }],
    quizAttempts: [],
    forumPosts: [],
    logs: []
  };
}

describe('handed-in assignments', () => {
  it('counts graded work without a submission, but not a grade of 0 or assignments outside the course', () => {
    const result = handedInAssignments(student(), [1, 2, 3, 4, 5, 6], { 6: [{ userid: 7, grade: '5.00' }], 5: [{ userid: 8, grade: '9' }] });
    expect([...result.all].sort()).toEqual([1, 4, 6]);
    expect([...result.withoutSubmission].sort()).toEqual([1, 6]);
  });

  it('feeds the student metrics', () => {
    const metrics = new StudentMetricsComputer(student(), {
      assignments: [1, 2, 3, 4, 5].map((id) => ({ id, duedate: 0 })),
      quizzes: [],
      forums: []
    }).compute();
    expect(metrics.submittedAssignments).toBe(2);
    expect(metrics.handedInWithoutSubmission).toBe(1);
    expect(metrics.submissionRate).toBe(40);
  });

  it('shows graded work without a submission in the assignment map', () => {
    const analysis = {
      course: { id: 1 },
      students: [{ ...student(), metrics: {} } as unknown as StudentAnalysis],
      assignments: [1, 2, 4].map((id) => ({ id, name: `A${id}`, grade: 10, duedate: 0 })),
      forums: [],
      contents: [],
      submissionsByAssign: { 4: [{ userid: 7, status: 'submitted', gradingstatus: 'notgraded', timemodified: 1 }] },
      assignmentGradesByAssign: {}
    } as unknown as CourseAnalysis;
    const row = courseInsights(analysis, 100).submissions.rows[0];
    expect(row.cells).toEqual(['offline', 'none', 'pending']);
    expect(row.submitted).toBe(2);
  });
});
