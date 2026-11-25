import { describe, expect, it } from 'vitest';

import { classAverages, courseInsights, gradeEvolution } from '../../src/analysis/insights';
import type { CourseAnalysis, StudentAnalysis } from '../../src/analysis/types';

const NOW = 1_800_000_000;
const DAY = 86400;

function student(id: number, items: Array<{ pct: number; at: number; feedback?: string }> = []): StudentAnalysis {
  return {
    id,
    fullname: `Student ${id}`,
    grades: { items: items.map((item) => ({ name: 'x', modname: 'assign', grade: item.pct / 10, gradePct: item.pct, maxGrade: 10, minGrade: 0, gradedAt: item.at, feedback: item.feedback })), finalGrade: null, finalGradePct: null, courseTotalMax: null },
    metrics: { submissionRate: 50, finalGradePct: 60, engagementScore: 70, completionRate: null }
  } as unknown as StudentAnalysis;
}

function analysis(): CourseAnalysis {
  return {
    course: { id: 1, enablecompletion: true },
    students: [student(7, [{ pct: 80, at: NOW - 5 * DAY, feedback: '<p>Good</p>' }]), student(8, [{ pct: 40, at: NOW - 2 * DAY }])],
    assignments: [{ id: 30, name: 'Essay', duedate: 0, grade: 10 }, { id: 31, name: 'Report', duedate: 0, grade: 10 }, { id: 32, name: 'Practice', duedate: 0, grade: 0 }],
    forums: [],
    contents: [{ modules: [{ modname: 'assign', visible: 1, completion: 0 }, { modname: 'assign', visible: 1 }, { modname: 'book', visible: 1 }, { modname: 'label', visible: 1 }, { modname: 'page', visible: 0 }] }],
    submissionsByAssign: {
      30: [
        { userid: 7, status: 'submitted', gradingstatus: 'graded', timemodified: NOW - 10 * DAY },
        { userid: 8, status: 'submitted', gradingstatus: 'notgraded', timemodified: NOW - 4 * DAY },
        { userid: 99, status: 'submitted', timemodified: NOW }
      ],
      31: [{ userid: 7, status: 'draft', timemodified: NOW - DAY }],
      32: [{ userid: 7, status: 'submitted', gradingstatus: 'notgraded', timemodified: NOW - DAY }, { userid: 8, status: 'submitted', gradingstatus: 'notgraded', timemodified: NOW - DAY }]
    },
    assignmentGradesByAssign: { 30: [{ userid: 7, grade: '8', timemodified: NOW - 5 * DAY }] }
  } as unknown as CourseAnalysis;
}

describe('courseInsights', () => {
  const insights = courseInsights(analysis(), NOW);

  it('measures the grading queue and time to grade', () => {
    expect(insights.grading.pending).toBe(1);
    expect(insights.grading.oldestPendingDays).toBe(4);
    expect(insights.grading.medianDays).toBe(5);
    expect(insights.grading.turnaround).toEqual([0, 1, 0, 0, 0]);
    expect(insights.grading.graded).toBe(2);
    expect(insights.grading.gradesWithFeedback).toBe(1);
  });

  it('maps who submitted each assignment, with drafts', () => {
    // The practice assignment has no grade: submitting it is enough.
    expect(insights.submissions.rows.map((row) => row.cells)).toEqual([['graded', 'draft', 'graded'], ['pending', 'none', 'graded']]);
    expect(insights.drafts).toEqual({ count: 1, students: 1 });
    expect(insights.submissions.lowAssignments.map((assignment) => assignment.id)).toEqual([31]);
  });

  it('counts visible content and checks the course set-up', () => {
    expect(insights.contentMix).toEqual([{ modname: 'assign', count: 2 }, { modname: 'book', count: 1 }]);
    expect(insights.checks.map((check) => check.key)).toEqual(['noDueDates', 'completionUnused', 'noDiscussionForum', 'feedbackGood']);
    expect(insights.weekdayHour.flat().reduce((sum, value) => sum + value, 0)).toBe(4);
  });
});

describe('gradeEvolution and classAverages', () => {
  it('builds running averages and class means', () => {
    const one = student(7, [{ pct: 80, at: 2 }, { pct: 40, at: 1 }]);
    const two = student(8, [{ pct: 100, at: 3 }]);
    expect(gradeEvolution(one, [one, two]).student).toEqual([{ at: 1, pct: 40 }, { at: 2, pct: 60 }]);
    expect(gradeEvolution(one, [one, two]).course.at(-1)).toEqual({ at: 3, pct: 220 / 3 });
    expect(classAverages([one, two])).toEqual({ submissionRate: 50, gradeAvgPct: 60, engagement: 70, completionRate: null });
  });
});
