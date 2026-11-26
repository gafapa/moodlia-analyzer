import { describe, expect, it } from 'vitest';

import { summarizeActivities } from '../../src/analysis/activitySummary';
import type { CourseAnalysis } from '../../src/analysis/types';

const DUE = 1_800_000_000;

function analysis(): CourseAnalysis {
  return {
    students: [{ id: 7 }, { id: 8 }, { id: 9 }],
    assignments: [{ id: 30, name: 'Essay', duedate: DUE, grade: 10 }],
    quizzes: [{ id: 40, name: 'Quiz', grade: 10 }],
    forums: [{ id: 50, name: 'Forum' }],
    submissionsByAssign: {
      30: [
        { userid: 7, status: 'submitted', timemodified: DUE - 10 },
        { userid: 8, status: 'submitted', timemodified: DUE + 10 },
        { userid: 9, status: 'new' },
        { userid: 99, status: 'submitted', timemodified: DUE }
      ]
    },
    assignmentGradesByAssign: { 30: [{ userid: 7, grade: '8.0' }, { userid: 8, grade: '-1' }, { userid: 99, grade: '1' }] },
    attemptsByQuiz: { 40: [{ userid: 7, grade: 5 }, { userid: 7, grade: 9 }, { userid: 8, grade: 6 }] },
    postsByUser: {
      7: [{ userid: 7, forumid: 50, parent: 0 }, { userid: 7, forumid: 50, parent: 1 }],
      99: [{ userid: 99, forumid: 50, parent: 0 }]
    }
  } as unknown as CourseAnalysis;
}

describe('summarizeActivities', () => {
  it('counts only students and summarizes each activity', () => {
    const { assignments, quizzes, forums } = summarizeActivities(analysis());
    expect(assignments[0]).toEqual({ id: 30, name: 'Essay', dueDate: DUE, students: 3, submitted: 2, late: 1, graded: 1, avgGradePct: 80 });
    expect(quizzes[0]).toEqual({ id: 40, name: 'Quiz', students: 3, attempted: 2, attempts: 3, avgBestPct: 75 });
    expect(forums[0]).toEqual({ id: 50, name: 'Forum', students: 3, participants: 1, posts: 2, discussionsStarted: 1 });
  });
});
