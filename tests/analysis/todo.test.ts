import { describe, expect, it } from 'vitest';

import { CONTACTS_PER_COURSE, courseTodo, teacherTodo, teaches } from '../../src/analysis/todo';
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

function course(partial: Partial<CourseAnalysis> = {}): CourseAnalysis {
  return {
    course: { id: 12 },
    students: [student(1), student(2, 'high', 3), student(3, 'low', 20)],
    assignments: [
      { id: 30, cmid: 300, name: 'Essay', grade: 10, duedate: NOW + 2 * DAY },
      { id: 31, cmid: 301, name: 'Practice', grade: 0, duedate: 0 }
    ],
    quizzes: [{ id: 40, coursemodule: 400, name: 'Test' }],
    submissionsByAssign: {
      30: [
        { userid: 1, status: 'submitted', gradingstatus: 'notgraded', timemodified: NOW - 5 * DAY },
        { userid: 2, status: 'submitted', gradingstatus: 'graded', timemodified: NOW - 9 * DAY },
        { userid: 99, status: 'submitted', timemodified: NOW - 30 * DAY }
      ],
      31: [{ userid: 1, status: 'submitted', timemodified: NOW }]
    },
    assignmentGradesByAssign: { 30: [{ userid: 2, grade: '7' }] },
    attemptsByQuiz: { 40: [{ userid: 1, state: 'finished', sumgrades: null, timefinish: NOW - 2 * DAY }, { userid: 2, state: 'finished', sumgrades: 5 }] },
    postsByUser: {
      1: [{ id: 1, userid: 1, parent: 0, discussionid: 70, created: NOW - 4 * DAY, subject: 'Help with task 2' }],
      50: [{ id: 2, userid: 50, parent: 0, discussionid: 71, created: NOW - DAY, subject: 'Notice' }]
    },
    quizQuestions: {},
    viewerRoles: ['editingteacher'],
    passThresholdPct: 50,
    ...partial
  } as unknown as CourseAnalysis;
}

describe('courseTodo', () => {
  it('lists pending work with the Moodle page of each item', () => {
    const items = courseTodo(course(), 'Biology', NOW);
    const of = (kind: string) => items.filter((item) => item.kind === kind);
    expect(of('grade')).toEqual([expect.objectContaining({ title: 'Essay', values: { count: 1, days: 5 }, path: '/mod/assign/view.php?id=300&action=grading', courseName: 'Biology' })]);
    expect(of('manualGrading')).toEqual([expect.objectContaining({ title: 'Test', values: { count: 1, days: 2 }, path: '/mod/quiz/report.php?id=400&mode=grading' })]);
    // Only the discussion a student opened; the teacher's notice is not a question.
    expect(of('forum')).toEqual([expect.objectContaining({ title: 'Help with task 2', values: { days: 4 }, path: '/mod/forum/discuss.php?d=70' })]);
    expect(of('contact').map((item) => [item.title, item.reason, item.path])).toEqual([
      ['Student 2', 'highRisk', '/user/view.php?id=2&course=12'],
      ['Student 3', 'inactive', '/user/view.php?id=3&course=12']
    ]);
    expect(of('deadline')).toEqual([expect.objectContaining({ title: 'Essay', values: { days: 2, missing: 1, due: NOW + 2 * DAY }, path: '/mod/assign/view.php?id=300' })]);
  });

  it('sends the teacher to the participants page when many students need contact', () => {
    const students = Array.from({ length: CONTACTS_PER_COURSE + 2 }, (_, index) => student(index + 1, 'high'));
    const contacts = courseTodo(course({ students }), 'Biology', NOW).filter((item) => item.kind === 'contact');
    expect(contacts).toHaveLength(CONTACTS_PER_COURSE + 1);
    expect(contacts.at(-1)).toMatchObject({ reason: 'more', values: { count: 2 }, path: '/user/index.php?id=12' });
  });
});

describe('teacherTodo', () => {
  it('skips courses the user only takes and sorts by urgency', () => {
    expect(teaches({ viewerRoles: ['student'] })).toBe(false);
    expect(teaches({ viewerRoles: null })).toBe(true);
    const todo = teacherTodo([
      { analysis: course(), name: 'Biology' },
      { analysis: course({ course: { id: 13 }, viewerRoles: ['student'] }), name: 'Taken' }
    ], NOW);
    expect(todo.grade.map((item) => item.courseName)).toEqual(['Biology']);
    expect(todo.contact[0].title).toBe('Student 2');
  });
});
