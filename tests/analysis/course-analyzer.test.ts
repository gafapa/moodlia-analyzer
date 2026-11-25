import { afterEach, describe, expect, it, vi } from 'vitest';

import { CourseAnalyzer } from '../../src/analysis/courseAnalyzer';
import type { CollectedCourseData, StudentCourseData } from '../../src/analysis/types';

const NOW = 1_800_000_000;

afterEach(() => {
  vi.restoreAllMocks();
});

function student(id: number, overrides: Partial<StudentCourseData>): StudentCourseData {
  return {
    id,
    fullname: `Student ${id}`,
    lastaccess: NOW - 86400,
    grades: { items: [], finalGrade: null, finalGradePct: null, courseTotalMax: null },
    completion: { statuses: [], completed: 0, total: 0 },
    submissions: [],
    quizAttempts: [],
    forumPosts: [],
    logs: [],
    ...overrides
  };
}

function course(students: StudentCourseData[]): CollectedCourseData {
  return {
    course: { id: 12, fullname: 'Biology' },
    students,
    assignments: [{ id: 30, duedate: NOW + 86400 }],
    quizzes: [{ id: 40, grade: 10, sumgrades: 20 }],
    forums: [{ id: 50 }],
    contents: [],
    pages: [],
    resources: [],
    submissionsByAssign: {},
    assignmentGradesByAssign: {},
    attemptsByQuiz: {},
    postsByUser: {},
    logsAvailable: false,
    logs: [],
    unavailable: {},
    collectedAt: new Date(NOW * 1000).toISOString()
  };
}

describe('CourseAnalyzer', () => {
  it('separates an active passing student from an inactive failing one', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
    const active = student(7, {
      grades: { items: [{ name: 'Essay', grade: 8, gradePct: 80, maxGrade: 10, minGrade: 0 }], finalGrade: 8, finalGradePct: 80, courseTotalMax: 10 },
      completion: { statuses: [], completed: 4, total: 4 },
      submissions: [{ assignid: 30, status: 'submitted', timemodified: NOW - 3600 }],
      // Grade already scaled by the collector from sumgrades.
      quizAttempts: [{ quizid: 40, state: 'finished', grade: 9, timestart: NOW - 900, timefinish: NOW - 300 }],
      forumPosts: [{ discussionid: 70, parent: 0, created: NOW - 5000 }]
    });
    const inactive = student(8, {
      lastaccess: NOW - 40 * 86400,
      grades: { items: [{ name: 'Essay', grade: 2, gradePct: 20, maxGrade: 10, minGrade: 0 }], finalGrade: 2, finalGradePct: 20, courseTotalMax: 10 },
      completion: { statuses: [], completed: 0, total: 4 }
    });

    const analysis = new CourseAnalyzer(50).analyze(course([active, inactive]));
    const byId = new Map(analysis.students.map((entry) => [entry.id, entry]));

    expect(analysis.courseMetrics.totalStudents).toBe(2);
    expect(byId.get(7)?.metrics.quizAvgPct).toBe(90);
    expect(byId.get(7)?.riskLevel).toBe('low');
    expect(byId.get(8)?.riskLevel).toBe('high');
    expect(byId.get(8)?.riskFactors.length).toBeGreaterThan(0);
    expect(analysis.courseMetrics.atRiskHigh).toBe(1);
    expect(analysis.unavailable).toEqual({});
  });
});
