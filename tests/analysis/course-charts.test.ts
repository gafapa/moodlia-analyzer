import { describe, expect, it } from 'vitest';

import { weekStart, weeklyActivity } from '../../src/analysis/courseCharts';
import type { CourseAnalysis } from '../../src/analysis/types';

// Monday 2 November 2026 00:00 UTC.
const MONDAY = Date.UTC(2026, 10, 2) / 1000;
const DAY = 86400;

describe('weekStart', () => {
  it('returns the Monday of the week', () => {
    expect(weekStart(MONDAY)).toBe(MONDAY);
    expect(weekStart(MONDAY + 6 * DAY + 3600)).toBe(MONDAY);
    expect(weekStart(MONDAY - 1)).toBe(MONDAY - 7 * DAY);
  });
});

describe('weeklyActivity', () => {
  it('counts student actions per week and fills empty weeks', () => {
    const analysis = {
      students: [
        {
          submissions: [{ status: 'submitted', timemodified: MONDAY + DAY }, { status: 'draft', timemodified: MONDAY + DAY }],
          quizAttempts: [{ timefinish: MONDAY + 15 * DAY }],
          forumPosts: [{ created: MONDAY + 2 * DAY }]
        },
        { submissions: [{ status: 'submitted', timemodified: MONDAY + 3 * DAY }], quizAttempts: [], forumPosts: [] }
      ]
    } as unknown as CourseAnalysis;
    expect(weeklyActivity(analysis)).toEqual([
      { week: MONDAY, submissions: 2, quizAttempts: 0, forumPosts: 1 },
      { week: MONDAY + 7 * DAY, submissions: 0, quizAttempts: 0, forumPosts: 0 },
      { week: MONDAY + 14 * DAY, submissions: 0, quizAttempts: 1, forumPosts: 0 }
    ]);
    expect(weeklyActivity(analysis, 1)).toHaveLength(1);
  });

  it('is empty without actions', () => {
    expect(weeklyActivity({ students: [] } as unknown as CourseAnalysis)).toEqual([]);
  });
});
