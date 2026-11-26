import { describe, expect, it } from 'vitest';

import { courseTodo, mostUrgent, teacherTodo } from '../../src/analysis/todo';
import { dayStart, teacherOverview } from '../../src/analysis/teacher';
import type { CourseInsights } from '../../src/analysis/insights';
import type { CourseAnalysis, StudentAnalysis } from '../../src/analysis/types';

const NOW = 1_800_000_000;
const DAY = 86400;

function student(id: number, risk: 'high' | 'medium' | 'low' = 'low', days = 1): StudentAnalysis {
  return {
    id, fullname: `Student ${id}`, riskLevel: risk,
    grades: { items: [], finalGrade: null, finalGradePct: null, courseTotalMax: null },
    metrics: { daysSinceAccess: days, totalAssignments: 2, submittedAssignments: 1 }
  } as unknown as StudentAnalysis;
}

function course(id: number, partial: Partial<CourseAnalysis> = {}): CourseAnalysis {
  return {
    course: { id },
    students: [student(1, 'high'), student(2, 'medium'), student(3)],
    assignments: [
      { id: 30, cmid: 300, name: 'Past', grade: 10, duedate: NOW - 3 * DAY },
      { id: 31, cmid: 301, name: 'Soon', grade: 10, duedate: NOW + 2 * DAY }
    ],
    quizzes: [{ id: 40, coursemodule: 400, name: 'Closing quiz', timeclose: NOW + DAY }],
    submissionsByAssign: {
      30: [{ userid: 1, status: 'submitted', gradingstatus: 'notgraded', timemodified: NOW - 20 * DAY }, { userid: 2, status: 'submitted', timemodified: NOW - 2 * DAY }],
      31: [{ userid: 3, status: 'draft' }]
    },
    assignmentGradesByAssign: { 30: [{ userid: 2, grade: '8', timemodified: NOW - DAY }] },
    attemptsByQuiz: { 40: [{ userid: 1, state: 'finished', timefinish: NOW - DAY, sumgrades: 5 }] },
    postsByUser: { 2: [{ id: 1, userid: 2, parent: 0, discussionid: 9, created: NOW - DAY }] },
    quizQuestions: {},
    viewerRoles: ['editingteacher'],
    passThresholdPct: 50,
    courseMetrics: { totalStudents: 3, atRiskHigh: 1, atRiskMedium: 1, atRiskLow: 1, avgSubmissionRate: 50, avgGradePct: 60 },
    ...partial
  } as unknown as CourseAnalysis;
}

const insights = { grading: { pending: 1, medianDays: 4, feedbackRate: 50 } } as unknown as CourseInsights;

describe('teacher items', () => {
  it('lists overdue work, drafts near the due date and quizzes closing soon', () => {
    const items = courseTodo(course(12), 'Biology', NOW);
    expect(items.find((item) => item.kind === 'overdue')).toMatchObject({ title: 'Past', values: { days: 3, missing: 1, total: 3 }, path: '/mod/assign/view.php?id=300&action=grading' });
    expect(items.find((item) => item.kind === 'drafts')).toMatchObject({ title: 'Soon', values: { count: 1, past: 0 } });
    expect(items.find((item) => item.kind === 'quizClosing')).toMatchObject({ title: 'Closing quiz', values: { days: 1, missing: 2 }, path: '/mod/quiz/view.php?id=400' });
    expect(items.every((item) => item.priority >= 0 && item.priority <= 100)).toBe(true);
  });

  it('ranks the most urgent items across kinds', () => {
    const urgent = mostUrgent(teacherTodo([{ analysis: course(12), name: 'Biology' }], NOW), 3);
    expect(urgent).toHaveLength(3);
    expect(urgent[0].priority).toBeGreaterThanOrEqual(urgent[2].priority);
  });
});

describe('teacherOverview', () => {
  it('builds the backlog, throughput, calendar, activity, course health and cross-course risk', () => {
    const overview = teacherOverview([
      { id: 12, name: 'Biology', analysis: course(12), insights },
      { id: 13, name: 'Maths', analysis: course(13), insights }
    ], NOW);
    expect(overview.backlog).toEqual([{ id: 12, name: 'Biology', counts: [0, 0, 1] }, { id: 13, name: 'Maths', counts: [0, 0, 1] }]);
    expect(overview.throughput.received.at(-1)! + overview.throughput.received.at(-2)!).toBeGreaterThanOrEqual(2);
    expect(overview.throughput.graded.reduce((sum, value) => sum + value, 0)).toBe(2);
    const soon = overview.calendar.find((entry) => entry.day === dayStart(NOW + 2 * DAY));
    expect(soon?.events.map((event) => [event.name, event.missing])).toEqual([['Soon', 3], ['Soon', 3]]);
    expect(overview.calendar).toHaveLength(14);
    expect(overview.activity.posts.reduce((sum, value) => sum + value, 0)).toBe(2);
    expect(overview.courses[0]).toMatchObject({ toGrade: 1, medianGradingDays: 4, risk: { high: 1, medium: 1, low: 1 } });
    expect(overview.crossCourse.map((entry) => [entry.id, entry.courses.length])).toEqual([[1, 2], [2, 2]]);
  });
});
