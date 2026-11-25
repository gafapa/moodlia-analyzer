// Provisional course view: collects the course, runs the analysis and shows everything it
// computes, so the data can be checked before the interface is designed.
import { Fragment, useEffect, useMemo, useState } from 'react';
import { analyzer, type CourseSummary } from './bridge';
import { CourseAnalyzer } from './analysis/courseAnalyzer';
import { summarizeActivities } from './analysis/activitySummary';
import type { CourseAnalysis, StudentAnalysis } from './analysis/types';

const PASS_THRESHOLD_PCT = 50;
const pct = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${Math.round(value)}%`);
const date = (seconds: number | null) => (seconds ? new Date(seconds * 1000).toLocaleDateString() : '—');
const ratio = (part: number, total: number) => (total > 0 ? `${part}/${total}` : '—');
const RISK_LABEL = { high: 'High', medium: 'Medium', low: 'Low' } as const;
const TREND_LABEL = { improving: '↑ improving', stable: '→ stable', declining: '↓ declining' } as const;

type SortKey = 'risk' | 'name' | 'grade' | 'predicted' | 'engagement' | 'lastAccess' | 'submissions' | 'quizzes' | 'forum';

const SORTERS: Record<SortKey, (student: StudentAnalysis) => number | string> = {
  risk: (s) => s.prediction.riskProbability,
  name: (s) => s.fullname.toLocaleLowerCase(),
  grade: (s) => s.metrics.finalGradePct ?? -1,
  predicted: (s) => s.prediction.predictedGradePct,
  engagement: (s) => s.metrics.engagementScore,
  lastAccess: (s) => s.metrics.daysSinceAccess,
  submissions: (s) => s.metrics.submissionRate ?? -1,
  quizzes: (s) => s.metrics.quizAvgPct ?? -1,
  forum: (s) => s.metrics.forumPostsCount
};

export function CourseView({ course, onBack }: { course: CourseSummary; onBack: () => void }) {
  const [progress, setProgress] = useState({ message: 'Starting', percent: 0 });
  const [analysis, setAnalysis] = useState<CourseAnalysis | null>(null);
  const [error, setError] = useState('');
  const [run, setRun] = useState(0);
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({ key: 'risk', descending: true });
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    setAnalysis(null);
    setError('');
    setProgress({ message: 'Starting', percent: 0 });
    const stop = analyzer().analysis.onProgress((update) => {
      if (active && update.courseId === course.id) setProgress(update);
    });
    void (async () => {
      const result = await analyzer().analysis.collect(course.id, course);
      if (!active) return;
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setAnalysis(new CourseAnalyzer(PASS_THRESHOLD_PCT).analyze(result.value));
    })();
    return () => {
      active = false;
      stop();
    };
  }, [course, run]);

  const activities = useMemo(() => (analysis ? summarizeActivities(analysis) : null), [analysis]);
  const students = useMemo(() => {
    if (!analysis) return [];
    const by = SORTERS[sort.key];
    return [...analysis.students].sort((a, b) => {
      const [x, y] = [by(a), by(b)];
      const order = x < y ? -1 : x > y ? 1 : 0;
      return sort.descending ? -order : order;
    });
  }, [analysis, sort]);

  const header = (key: SortKey, label: string) => (
    <th aria-sort={sort.key === key ? (sort.descending ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className="sort" onClick={() => setSort({ key, descending: sort.key === key ? !sort.descending : key !== 'name' })}>
        {label}{sort.key === key ? (sort.descending ? ' ▾' : ' ▴') : ''}
      </button>
    </th>
  );

  return (
    <main className="shell wide">
      <p className="toolbar">
        <button type="button" onClick={onBack}>Back to courses</button>
        {(analysis || error) && <button type="button" onClick={() => setRun(run + 1)}>Collect again</button>}
      </p>
      <h1>{course.fullName}</h1>
      {error && <p role="alert">{error}</p>}
      {!analysis && !error && (
        <p aria-live="polite">
          <progress max={100} value={progress.percent} /> {progress.message}
        </p>
      )}
      {analysis && activities && (() => {
        const m = analysis.courseMetrics;
        const unavailable = Object.entries(analysis.unavailable ?? {});
        return (
          <>
            <p className="muted">Collected {new Date(analysis.collectedAt).toLocaleString()} · pass mark {analysis.passThresholdPct}%</p>

            <section className="cards" aria-label="Course summary">
              <Card label="Students" value={m.totalStudents} />
              <Card label="Risk" value={`${m.atRiskHigh} · ${m.atRiskMedium} · ${m.atRiskLow}`} note="high · medium · low" />
              <Card label="Average grade" value={pct(m.avgGradePct)} />
              <Card label="Average engagement" value={m.avgEngagement === null ? '—' : Math.round(m.avgEngagement)} note="0–100" />
              <Card label="Assignments submitted" value={pct(m.avgSubmissionRate)} note={m.noSubmissions ? `${m.noSubmissions} with none` : undefined} />
              <Card label="Activity completion" value={m.hasCompletion ? pct(m.avgCompletion) : 'Not tracked'} />
              <Card label="No access in 7 days" value={m.inactive7d} note={m.neverAccessed ? `${m.neverAccessed} over 90 days or never` : undefined} />
              <Card label="No forum posts" value={m.noForum ?? '—'} />
            </section>

            <section>
              <h2>Grade distribution</h2>
              <div className="bars">
                {Object.entries(m.gradeDistribution).map(([range, count]) => (
                  <div key={range} className="bar-row">
                    <span>{range}%</span>
                    <span className="bar"><span style={{ width: `${m.totalStudents ? (count / m.totalStudents) * 100 : 0}%` }} /></span>
                    <span>{count}</span>
                  </div>
                ))}
              </div>
            </section>

            {analysis.teacherRecommendations.length > 0 && (
              <section>
                <h2>Recommendations</h2>
                <ul>{analysis.teacherRecommendations.map((text) => <li key={text}>{text}</li>)}</ul>
              </section>
            )}

            <section>
              <h2>Students</h2>
              <p className="muted">Select a student to see risk factors, recommendations and grade items.</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {header('name', 'Student')}
                      {header('risk', 'Risk')}
                      {header('grade', 'Grade')}
                      {header('predicted', 'Predicted')}
                      {header('engagement', 'Engagement')}
                      {header('lastAccess', 'Last access')}
                      {header('submissions', 'Assignments')}
                      {header('quizzes', 'Quizzes')}
                      {header('forum', 'Forum posts')}
                      <th>Completion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student) => {
                      const s = student.metrics;
                      const expanded = open === student.id;
                      return (
                        <Fragment key={student.id}>
                          <tr className={expanded ? 'selected' : undefined}>
                            <td>
                              <button type="button" className="link" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : student.id)}>{student.fullname}</button>
                            </td>
                            <td><span className={`risk ${student.riskLevel}`}>{RISK_LABEL[student.riskLevel]}</span></td>
                            <td>{pct(s.finalGradePct)}</td>
                            <td>{pct(student.prediction.predictedGradePct)}</td>
                            <td>{Math.round(s.engagementScore)}</td>
                            <td>{s.daysSinceAccess >= 999 ? 'Never' : s.daysSinceAccess === 0 ? 'Today' : s.daysSinceAccess === 1 ? 'Yesterday' : `${s.daysSinceAccess} days ago`}</td>
                            <td>{ratio(s.submittedAssignments, s.totalAssignments)}{s.lateSubmissions ? ` (${s.lateSubmissions} late)` : ''}</td>
                            <td>{pct(s.quizAvgPct)} {s.totalQuizzes ? `· ${ratio(s.quizUniqueAttempted, s.totalQuizzes)}` : ''}</td>
                            <td>{s.forumPostsCount}{s.forumDiscussionsStarted ? ` (${s.forumDiscussionsStarted} new)` : ''}</td>
                            <td>{s.totalActivities ? `${pct(s.completionRate)} · ${ratio(s.completedActivities, s.totalActivities)}` : '—'}</td>
                          </tr>
                          {expanded && (
                            <tr className="detail">
                              <td colSpan={10}><StudentDetail student={student} /></td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2>Assignments ({activities.assignments.length})</h2>
              {activities.assignments.length === 0 ? <p className="muted">None.</p> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Assignment</th><th>Due</th><th>Submitted</th><th>Late</th><th>Graded</th><th>Average grade</th></tr></thead>
                    <tbody>
                      {activities.assignments.map((a) => (
                        <tr key={a.id}><td>{a.name}</td><td>{date(a.dueDate)}</td><td>{ratio(a.submitted, a.students)}</td><td>{a.late}</td><td>{a.graded}</td><td>{pct(a.avgGradePct)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <h2>Quizzes ({activities.quizzes.length})</h2>
              {activities.quizzes.length === 0 ? <p className="muted">None.</p> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Quiz</th><th>Students who tried</th><th>Attempts</th><th>Average best attempt</th></tr></thead>
                    <tbody>
                      {activities.quizzes.map((q) => (
                        <tr key={q.id}><td>{q.name}</td><td>{ratio(q.attempted, q.students)}</td><td>{q.attempts}</td><td>{pct(q.avgBestPct)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <h2>Forums ({activities.forums.length})</h2>
              {activities.forums.length === 0 ? <p className="muted">None.</p> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Forum</th><th>Students who posted</th><th>Posts</th><th>Discussions started</th></tr></thead>
                    <tbody>
                      {activities.forums.map((f) => (
                        <tr key={f.id}><td>{f.name}</td><td>{ratio(f.participants, f.students)}</td><td>{f.posts}</td><td>{f.discussionsStarted}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <h2>Data sources</h2>
              <ul className="muted">
                <li>{analysis.contents.length} sections, {analysis.pages.length} pages, {analysis.resources.length} files and resources.</li>
                <li>The course log is not available through standard web services, so time online and sessions are not measured.</li>
                {unavailable.length === 0 ? <li>Everything else was read.</li> : unavailable.map(([operation, reason]) => <li key={operation}>Not read: <code>{operation}</code>: {reason}</li>)}
              </ul>
            </section>
          </>
        );
      })()}
    </main>
  );
}

function Card({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="card">
      <span className="card-label">{label}</span>
      <strong>{value}</strong>
      {note && <span className="card-note">{note}</span>}
    </div>
  );
}

function StudentDetail({ student }: { student: StudentAnalysis }) {
  const s = student.metrics;
  return (
    <div className="student-detail">
      <div>
        <h3>Why this risk level</h3>
        {student.riskFactors.length ? <ul>{student.riskFactors.map((text) => <li key={text}>{text}</li>)}</ul> : <p className="muted">No risk factors.</p>}
        <h3>Recommendations</h3>
        {student.recommendations.length ? <ul>{student.recommendations.map((text) => <li key={text}>{text}</li>)}</ul> : <p className="muted">None.</p>}
        <h3>Indicators</h3>
        <ul>
          <li>Predicted grade {pct(student.prediction.predictedGradePct)}; chance of ending below the pass mark {pct(student.prediction.riskProbability * 100)}</li>
          <li>Last access: {s.lastAccessLabel}</li>
          <li>Grade trend: {TREND_LABEL[s.gradeTrend]}; quiz trend: {TREND_LABEL[s.quizTrend]}</li>
          <li>Academic score {Math.round(s.academicScore)}, engagement {Math.round(s.engagementScore)}</li>
          <li>Submissions on time: {pct(s.onTimeRate)}{s.submissionAvgAdvanceDays !== null ? `, on average ${s.submissionAvgAdvanceDays.toFixed(1)} days before the due date` : ''}</li>
          <li>Quiz attempts: {s.quizAttemptsCount}{s.quizAvgTimeMin !== null ? `, ${Math.round(s.quizAvgTimeMin)} min on average` : ''}</li>
        </ul>
      </div>
      <div>
        <h3>Grade items</h3>
        {s.gradeItems.length === 0 ? <p className="muted">No grade items.</p> : (
          <table>
            <thead><tr><th>Item</th><th>Grade</th><th>%</th></tr></thead>
            <tbody>
              {s.gradeItems.map((item, index) => (
                <tr key={`${item.id ?? index}-${item.name}`}>
                  <td>{item.name}</td>
                  <td>{item.grade === null ? '—' : `${Number(item.grade.toFixed(2))} / ${item.maxGrade}`}</td>
                  <td>{pct(item.gradePct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
