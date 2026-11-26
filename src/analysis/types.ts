// Data shapes shared by the collector (electron/analysis/collector.mjs) and the analysis.
export type LanguageCode = "es" | "en";

export type RiskLevel = "high" | "medium" | "low";
export type TrendState = "improving" | "stable" | "declining";

/** Texts the analysis produces, as a key and values; the interface translates them. */
export type AnalysisMessageKey =
  | "risk.noAccess" | "risk.limitedAccess" | "risk.fewSubmissions" | "risk.lowSubmissions"
  | "risk.gradeWellBelow" | "risk.gradeNearPass" | "risk.gradeDeclining" | "risk.engagementCritical"
  | "risk.engagementLow" | "risk.lowCompletion" | "risk.noForum" | "risk.fewQuizzes" | "risk.lowQuizCoverage"
  | "student.reenter" | "student.pendingAssignments" | "student.latePlan" | "student.incompleteActivities"
  | "student.quizBelowTarget" | "student.quizDeclining" | "student.useForums" | "student.gradeDeclining" | "student.stable"
  | "teacher.highRisk" | "teacher.inactive" | "teacher.lowEngagement" | "teacher.lowSubmission"
  | "teacher.forumSilence" | "teacher.noForums";

export interface AnalysisMessage {
  key: AnalysisMessageKey;
  values?: Record<string, number>;
}

export const msg = (key: AnalysisMessageKey, values?: Record<string, number>): AnalysisMessage => (values ? { key, values } : { key });

export interface CourseSummary {
  id: number;
  fullname?: string;
  shortname?: string;
  categoryname?: string;
  category?: string | number;
  categoryid?: number | null;
  enrolledusercount?: number;
  enablecompletion?: boolean;
  [key: string]: unknown;
}

export interface GradeItem {
  id?: number;
  name: string;
  type?: string;
  modname?: string;
  /** The activity instance the item grades, such as the assignment id. */
  instance?: number;
  grade: number | null;
  gradePct: number | null;
  maxGrade: number;
  minGrade: number;
  gradedAt?: number | null;
  feedback?: string;
}

export interface StudentGrades {
  items: GradeItem[];
  finalGrade: number | null;
  finalGradePct: number | null;
  courseTotalMax: number | null;
}

export interface CompletionStatus {
  statuses: Record<string, unknown>[];
  completed: number;
  total: number;
}

export interface StudentCourseData {
  id: number;
  fullname: string;
  email?: string;
  /** Last access to the course (Moodle's lastcourseaccess when available). */
  lastaccess?: number;
  /** Last access to the whole site. */
  lastSiteAccess?: number;
  firstaccess?: number;
  enrolled?: number;
  country?: string;
  profileimageurl?: string;
  grades: StudentGrades;
  completion: CompletionStatus;
  submissions: Record<string, unknown>[];
  quizAttempts: Record<string, unknown>[];
  forumPosts: Record<string, unknown>[];
  logs: Record<string, unknown>[];
}

export interface QuizQuestionSlot {
  slot: number;
  /** The number shown to students, such as "3". */
  number: string;
  type: string;
  maxmark: number | null;
  /** The start of the question text. */
  text: string;
  /** The slot held different questions in different attempts (a random question). */
  varies: boolean;
}

export interface QuizQuestionData {
  slots: QuizQuestionSlot[];
  /** Each student's first finished attempt: the quiz grade and the mark per slot. */
  attempts: Array<{ userid: number; grade: number | null; marks: Record<number, number | null> }>;
}

export interface Deadline {
  courseId: number;
  kind: "assign" | "quiz";
  name: string;
  due: number;
}

export interface WorkloadData {
  /** Visible courses of each student. */
  coursesByUser: Record<number, number[]>;
  courseNames: Record<number, string>;
  deadlines: Deadline[];
  /** Courses whose assignments and quizzes this token could read. */
  covered: { assignments: number[]; quizzes: number[] };
}

export interface CollectedCourseData {
  course: CourseSummary;
  students: StudentCourseData[];
  assignments: Record<string, unknown>[];
  quizzes: Record<string, unknown>[];
  forums: Record<string, unknown>[];
  contents: Record<string, unknown>[];
  pages: Record<string, unknown>[];
  resources: Record<string, unknown>[];
  submissionsByAssign: Record<number, Record<string, unknown>[]>;
  assignmentGradesByAssign: Record<number, Record<string, unknown>[]>;
  attemptsByQuiz: Record<number, Record<string, unknown>[]>;
  postsByUser: Record<number, Record<string, unknown>[]>;
  /** Marks per question of each quiz, by quiz id. */
  quizQuestions?: Record<number, QuizQuestionData>;
  /** Deadlines in all the students' courses. */
  workload?: WorkloadData;
  logsAvailable: boolean;
  logs: Record<string, unknown>[];
  /** Sources this token could not read, by operation, with the reason. */
  unavailable?: Record<string, string>;
  /** Activities left out because students cannot see them yet. */
  excluded?: { hidden: number; notOpenYet: number };
  collectedAt: string;
}

export interface StudentMetrics {
  lastAccessTs?: number;
  daysSinceAccess: number;
  lastAccessLabel: string;
  finalGrade: number | null;
  finalGradePct: number | null;
  courseTotalMax: number;
  gradeItems: GradeItem[];
  gradedItems: GradeItem[];
  gradeAvgPct: number | null;
  gradeTrend: TrendState;
  completionRate: number | null;
  completedActivities: number;
  totalActivities: number;
  totalAssignments: number;
  submittedAssignments: number;
  submissionRate: number | null;
  lateSubmissions: number;
  onTimeRate: number | null;
  totalQuizzes: number;
  quizAttemptsCount: number;
  quizScores: number[];
  quizAvgPct: number | null;
  quizTrend: TrendState;
  quizUniqueAttempted: number;
  quizCoverageRate: number | null;
  totalForums: number;
  forumPostsCount: number;
  forumDiscussionsStarted: number;
  logCount: number;
  loginDays: number;
  activityTimestamps: number[];
  weeksActive: number;
  submissionAvgAdvanceDays: number | null;
  quizAvgTimeMin: number | null;
  sessionCount: number | null;
  avgSessionDurationMin: number | null;
  engagementScore: number;
  academicScore: number;
}

export interface GradePrediction {
  predictedGrade: number;
  predictedGradePct: number;
  riskProbability: number;
  method: "heuristic";
}

export interface StudentAnalysis extends StudentCourseData {
  metrics: StudentMetrics;
  prediction: GradePrediction;
  riskLevel: RiskLevel;
  riskFactors: AnalysisMessage[];
  recommendations: AnalysisMessage[];
}

export interface CourseMetrics {
  totalStudents: number;
  atRiskHigh: number;
  atRiskMedium: number;
  atRiskLow: number;
  hasCompletion: boolean;
  hasAssignments: boolean;
  hasQuizzes: boolean;
  hasForums: boolean;
  avgEngagement: number | null;
  avgCompletion: number | null;
  avgSubmissionRate: number | null;
  avgGradePct: number | null;
  gradeDistribution: Record<string, number>;
  neverAccessed: number;
  inactive7d: number;
  noSubmissions: number | null;
  noForum: number | null;
}

export interface CourseAnalysis extends CollectedCourseData {
  students: StudentAnalysis[];
  courseMetrics: CourseMetrics;
  teacherRecommendations: AnalysisMessage[];
  passThresholdPct: number;
  logsAvailable: boolean;
  mlUsed: boolean;
  analyzedAt: string;
}

