import { describe, expect, it } from 'vitest';

import {
  accessDistribution, completionMatrix, correlation, forumNetwork, gradeSpread, questionFlag, quizStatistics,
  riskFlow, studentDeadlines, studentProfile, submissionTiming, timingBucket, workload
} from '../../src/analysis/advanced';
import { weekStart } from '../../src/analysis/courseCharts';
import type { CourseAnalysis, StudentAnalysis } from '../../src/analysis/types';

const NOW = 1_800_000_000;
const DAY = 86400;
const HOUR = 3600;

function student(id: number, overrides: Partial<StudentAnalysis['metrics']> = {}, extra: Partial<StudentAnalysis> = {}): StudentAnalysis {
  return {
    id,
    fullname: `Student ${id}`,
    grades: { items: [], finalGrade: null, finalGradePct: null, courseTotalMax: null },
    completion: { statuses: [], completed: 0, total: 0 },
    metrics: { daysSinceAccess: 1, engagementScore: 60, finalGradePct: 70, submissionRate: 100, ...overrides },
    ...extra
  } as unknown as StudentAnalysis;
}

function course(partial: Partial<CourseAnalysis>): CourseAnalysis {
  return {
    course: { id: 1 }, students: [], assignments: [], quizzes: [], forums: [], contents: [],
    submissionsByAssign: {}, assignmentGradesByAssign: {}, attemptsByQuiz: {}, postsByUser: {},
    passThresholdPct: 50, ...partial
  } as unknown as CourseAnalysis;
}

describe('submissionTiming', () => {
  it('buckets submissions by time before the due date and ranks students within each assignment', () => {
    const due = NOW;
    const analysis = course({
      students: [student(1), student(2), student(3)],
      assignments: [{ id: 10, name: 'Essay', duedate: due }, { id: 11, name: 'No date', duedate: 0 }],
      submissionsByAssign: {
        10: [
          { userid: 1, status: 'submitted', timemodified: due - 10 * DAY },
          { userid: 2, status: 'submitted', timemodified: due - 5 * HOUR },
          { userid: 3, status: 'submitted', timemodified: due + HOUR },
          { userid: 99, status: 'submitted', timemodified: due - DAY }
        ],
        11: [{ userid: 1, status: 'submitted', timemodified: due }]
      }
    });
    const timing = submissionTiming(analysis);
    expect(timing.assignments).toHaveLength(1);
    expect(timing.counts).toEqual([1, 1, 0, 0, 1]);
    expect(timing.students[1]).toMatchObject({ dated: 1, rank: 0, profile: 'early' });
    expect(timing.students[2].profile).toBe('lastMinute');
    expect(timing.students[3]).toMatchObject({ rank: 1, profile: 'late' });
    expect(timing.lastMinuteShare).toBeCloseTo(66.67, 1);
    expect(timingBucket(-1)).toBe('late');
    expect(timingBucket(200)).toBe('early');
  });
});

describe('completionMatrix', () => {
  it('keeps tracked activities in course order and flags little-used ones', () => {
    const analysis = course({
      contents: [{ modules: [{ id: 5, name: 'Reading', modname: 'page' }, { id: 6, name: 'Quiz', modname: 'quiz' }] }],
      students: [
        student(1, {}, { completion: { statuses: [{ cmid: 6, state: 1, tracking: 1 }, { cmid: 5, state: 0, tracking: 1 }], completed: 1, total: 2 } }),
        student(2, {}, { completion: { statuses: [{ cmid: 6, state: 3, tracking: 1 }, { cmid: 5, state: 0, tracking: 1 }, { cmid: 7, state: 0, tracking: 0 }], completed: 0, total: 2 } })
      ]
    });
    const matrix = completionMatrix(analysis);
    expect(matrix.activities.map((activity) => activity.name)).toEqual(['Reading', 'Quiz']);
    expect(matrix.rows[0].cells).toEqual(['todo', 'done']);
    expect(matrix.rows[1].cells).toEqual(['todo', 'failed']);
    expect(matrix.unused).toBe(1);
  });
});

describe('accessDistribution', () => {
  it('counts students per bucket and builds the active-within curve', () => {
    const access = accessDistribution(course({ students: [student(1, { daysSinceAccess: 0 }), student(2, { daysSinceAccess: 10 }), student(3, { daysSinceAccess: 999 })] }));
    expect(access.counts).toEqual([1, 0, 0, 1, 0, 0, 1]);
    expect(access.curve[0]).toBeCloseTo(33.33, 1);
    expect(access.curve[10]).toBeCloseTo(66.67, 1);
    expect(access.medianDays).toBe(5);
  });
});

describe('gradeSpread', () => {
  it('summarises items with at least three grades', () => {
    const item = (pct: number) => ({ id: 3, name: 'Exam', modname: 'quiz', grade: pct / 10, gradePct: pct, maxGrade: 10, minGrade: 0 });
    const students = [20, 40, 60, 80].map((pct, index) => student(index + 1, {}, { grades: { items: [item(pct)], finalGrade: null, finalGradePct: null, courseTotalMax: null } }));
    const [spread] = gradeSpread(course({ students }));
    expect(spread).toMatchObject({ name: 'Exam', count: 4, min: 20, max: 80, median: 50, q1: 35, q3: 65, belowPass: 2 });
  });
});

describe('quizStatistics', () => {
  it('computes facility, discrimination against the rest of the quiz and flags', () => {
    // Question 1 follows the rest of the quiz; question 2 goes against it.
    const attempts = [
      { userid: 1, grade: null, marks: { 1: 1, 2: 0, 3: 1, 4: 1 } },
      { userid: 2, grade: null, marks: { 1: 1, 2: 0, 3: 1, 4: 1 } },
      { userid: 3, grade: null, marks: { 1: 1, 2: 0, 3: 1, 4: 0 } },
      { userid: 4, grade: null, marks: { 1: 0, 2: 1, 3: 0, 4: 0 } },
      { userid: 5, grade: null, marks: { 1: 0, 2: 1, 3: 0, 4: 0 } }
    ];
    const slot = (n: number) => ({ slot: n, number: String(n), type: 'multichoice', maxmark: 1, text: `Q${n}`, varies: false });
    const analysis = course({
      students: [1, 2, 3, 4, 5].map((id) => student(id)),
      quizzes: [{ id: 40, name: 'Test' }],
      quizQuestions: { 40: { slots: [slot(1), slot(2), slot(3), slot(4)], attempts } }
    });
    const [quiz] = quizStatistics(analysis);
    expect(quiz.attempts).toBe(5);
    expect(quiz.questions[0].facility).toBe(60);
    expect(quiz.questions[0].discrimination).toBeGreaterThan(0.3);
    expect(quiz.questions[1].flag).toBe('negative');
    expect(questionFlag(95, 0.5)).toBe('easy');
    expect(questionFlag(10, null)).toBe('hard');
    expect(correlation([1, 2], [1, 2])).toBeNull();
  });
});

describe('forumNetwork', () => {
  it('links repliers to the authors they replied to and finds silent and isolated students', () => {
    const analysis = course({
      students: [student(1), student(2), student(3), student(4)],
      postsByUser: {
        1: [{ id: 100, userid: 1, parent: 0, discussionid: 9, created: NOW }],
        2: [{ id: 101, userid: 2, parent: 100, discussionid: 9, created: NOW + 2 * HOUR }],
        50: [{ id: 102, userid: 50, parent: 101, discussionid: 9, created: NOW + 3 * HOUR, authorname: 'Teacher T' }],
        3: [{ id: 103, userid: 3, parent: 0, discussionid: 10, created: NOW }]
      }
    });
    const network = forumNetwork(analysis);
    expect(network.edges).toEqual(expect.arrayContaining([{ from: 2, to: 1, weight: 1 }, { from: 50, to: 2, weight: 1 }]));
    expect(network.nodes.find((node) => node.id === 50)).toMatchObject({ role: 'teacher', name: 'Teacher T' });
    expect(network.discussions).toBe(2);
    expect(network.unanswered).toBe(1);
    expect(network.firstReplyHours).toBe(2);
    expect(network.silent).toEqual([4]);
    expect(network.isolated).toEqual([3]);
    expect(network.teacherShare).toBe(50);
  });
});

describe('studentProfile', () => {
  it('applies the rules in order', () => {
    expect(studentProfile(student(1, { daysSinceAccess: 20 }), undefined, 50)).toBe('disengaged');
    expect(studentProfile(student(1, { finalGradePct: 30, engagementScore: 70 }), undefined, 50)).toBe('struggling');
    expect(studentProfile(student(1, { engagementScore: 30 }), undefined, 50)).toBe('efficient');
    expect(studentProfile(student(1), { dated: 3, counts: [0, 3, 0, 0, 0], rank: 0.9, profile: 'lastMinute' }, 50)).toBe('lastMinute');
    expect(studentProfile(student(1), undefined, 50)).toBe('steady');
    expect(studentProfile(student(1, { submissionRate: 40, finalGradePct: 45, engagementScore: 45 }), undefined, 50)).toBe('irregular');
  });
});

describe('riskFlow', () => {
  it('compares the last two days', () => {
    const flow = riskFlow([
      { day: '2026-11-01', risks: { 1: 'low', 2: 'high' } },
      { day: '2026-11-08', risks: { 1: 'medium', 2: 'low', 3: 'high' } }
    ]);
    expect(flow?.matrix).toEqual([[0, 0, 1], [0, 0, 0], [0, 1, 0]]);
    expect(flow?.worse).toEqual([1]);
    expect(flow?.better).toEqual([2]);
    expect(riskFlow([{ day: '2026-11-01', risks: {} }])).toBeNull();
  });
});

describe('workload', () => {
  it('counts deadlines per student and week across their courses', () => {
    const thisWeek = weekStart(NOW);
    const analysis = course({
      students: [student(1), student(2)],
      workload: {
        coursesByUser: { 1: [1, 2], 2: [1] },
        courseNames: { 1: 'Maths', 2: 'Art' },
        deadlines: [
          { courseId: 1, kind: 'assign', name: 'A', due: thisWeek + DAY },
          { courseId: 2, kind: 'quiz', name: 'B', due: thisWeek + 2 * DAY },
          { courseId: 2, kind: 'assign', name: 'C', due: thisWeek + 3 * DAY },
          { courseId: 3, kind: 'assign', name: 'D', due: thisWeek + DAY }
        ],
        covered: { assignments: [1, 2], quizzes: [2] }
      }
    });
    const result = workload(analysis, NOW);
    expect(result?.perStudent[1][4]).toBe(3);
    expect(result?.perStudent[2][4]).toBe(1);
    expect(result?.overloaded[4]).toBe(1);
    expect(result?.average[4]).toBe(2);
    expect(result).toMatchObject({ courses: 2, covered: 2 });
    expect(studentDeadlines(analysis, 1, NOW).map((deadline) => deadline.course)).toEqual(['Maths', 'Art', 'Art']);
  });
});
