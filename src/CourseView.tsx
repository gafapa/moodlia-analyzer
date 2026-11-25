// Provisional course view: collects the course, runs the analysis and shows everything it
// computes, as charts and tables, so the data can be checked before the interface is designed.
import { Fragment, useEffect, useMemo, useState } from 'react';
import { analyzer, type CourseSummary } from './bridge';
import { CourseAnalyzer } from './analysis/courseAnalyzer';
import { summarizeActivities } from './analysis/activitySummary';
import { engagementVsGrade, weeklyActivity } from './analysis/courseCharts';
import type { CourseAnalysis, StudentAnalysis } from './analysis/types';
import { AssignmentColumns, EngagementScatter, GradeHistogram, PercentBars, RiskBar, WeeklyLines } from './charts/Charts';
import { useI18n } from './i18n';
import type { MessageKey } from './i18n/en';

const PASS_THRESHOLD_PCT = 50;
const pct = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${Math.round(value)}%`);
const ratio = (part: number, total: number) => (total > 0 ? `${part}/${total}` : '—');

type SortKey = 'risk' | 'name' | 'grade' | 'predicted' | 'engagement' | 'lastAccess' | 'submissions' | 'quizzes' | 'forum';

const SORTERS: Record<SortKey, (student: StudentAnalysis) => number | string> = {
  risk: (s) => s.prediction.riskProbability * 10 + ({ high: 3, medium: 2, low: 1 })[s.riskLevel] * 100,
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
  const { t, message, error: errorText, date, dateTime } = useI18n();
  const [progress, setProgress] = useState({ message: '', percent: 0 });
  const [analysis, setAnalysis] = useState<CourseAnalysis | null>(null);
  const [error, setError] = useState('');
  const [run, setRun] = useState(0);
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({ key: 'risk', descending: true });
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    setAnalysis(null);
    setError('');
    setProgress({ message: '', percent: 0 });
    const stop = analyzer().analysis.onProgress((update) => {
      if (active && update.courseId === course.id) setProgress(update);
    });
    void (async () => {
      const result = await analyzer().analysis.collect(course.id, course);
      if (!active) return;
      if (!result.ok) {
        setError(errorText(result.error));
        return;
      }
      setAnalysis(new CourseAnalyzer(PASS_THRESHOLD_PCT).analyze(result.value));
    })();
    return () => {
      active = false;
      stop();
    };
    // errorText changes with the language; a language change must not collect again.
  }, [course, run]);

  const activities = useMemo(() => (analysis ? summarizeActivities(analysis) : null), [analysis]);
  const weeks = useMemo(() => (analysis ? weeklyActivity(analysis) : []), [analysis]);
  const students = useMemo(() => {
    if (!analysis) return [];
    const by = SORTERS[sort.key];
    return [...analysis.students].sort((a, b) => {
      const [x, y] = [by(a), by(b)];
      const order = x < y ? -1 : x > y ? 1 : 0;
      return sort.descending ? -order : order;
    });
  }, [analysis, sort]);

  const riskLabels = { high: t('risk.high'), medium: t('risk.medium'), low: t('risk.low') };
  const lastAccess = (days: number) => (days >= 999 ? t('access.never') : days === 0 ? t('access.today') : days === 1 ? t('access.yesterday') : t('access.daysAgo', { days }));

  const openStudent = (id: number) => {
    setOpen(id);
    requestAnimationFrame(() => document.getElementById(`student-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  const header = (key: SortKey, label: MessageKey) => (
    <th aria-sort={sort.key === key ? (sort.descending ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className="sort" onClick={() => setSort({ key, descending: sort.key === key ? !sort.descending : key !== 'name' })}>
        {t(label)}{sort.key === key ? (sort.descending ? ' ▾' : ' ▴') : ''}
      </button>
    </th>
  );

  return (
    <main className="shell wide">
      <p className="toolbar">
        <button type="button" onClick={onBack}>{t('course.back')}</button>
        {(analysis || error) && <button type="button" onClick={() => setRun(run + 1)}>{t('course.collectAgain')}</button>}
      </p>
      <h1>{course.fullName}</h1>
      {error && <p role="alert">{error}</p>}
      {!analysis && !error && (
        <p aria-live="polite">
          <progress max={100} value={progress.percent} /> {progress.message || t('course.starting')}
        </p>
      )}
      {analysis && activities && (() => {
        const m = analysis.courseMetrics;
        const unavailable = Object.entries(analysis.unavailable ?? {});
        const columns = [...activities.assignments]
          .sort((a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity))
          .map((a) => ({ id: a.id, name: a.name, dueLabel: a.dueDate ? t('chart.dueOn', { date: date(a.dueDate) }) : t('chart.noDue'), students: a.students, onTime: a.submitted - a.late, late: a.late }));
        const lineSeries = [
          { key: 'submissions', label: t('chart.submissions'), color: 'var(--viz-series-1)', values: weeks.map((week) => week.submissions) },
          { key: 'quizAttempts', label: t('chart.quizAttempts'), color: 'var(--viz-series-2)', values: weeks.map((week) => week.quizAttempts) },
          { key: 'forumPosts', label: t('chart.forumPosts'), color: 'var(--viz-series-3)', values: weeks.map((week) => week.forumPosts) }
        ].filter((entry) => entry.values.some((value) => value > 0));
        return (
          <>
            <p className="muted">{t('course.collected', { date: dateTime(analysis.collectedAt), pct: analysis.passThresholdPct })}</p>

            <section className="cards" aria-label={t('course.summary')}>
              <Card label={t('card.students')} value={m.totalStudents} />
              <Card label={t('card.avgGrade')} value={pct(m.avgGradePct)} />
              <Card label={t('card.avgEngagement')} value={m.avgEngagement === null ? '—' : Math.round(m.avgEngagement)} note="0–100" />
              <Card label={t('card.submitted')} value={pct(m.avgSubmissionRate)} note={m.noSubmissions ? t('card.withNone', { count: m.noSubmissions }) : undefined} />
              <Card label={t('card.completion')} value={m.hasCompletion ? pct(m.avgCompletion) : t('card.notTracked')} />
              <Card label={t('card.inactive')} value={m.inactive7d} note={m.neverAccessed ? t('card.neverAccessed', { count: m.neverAccessed }) : undefined} />
              <Card label={t('card.noForum')} value={m.noForum ?? '—'} />
            </section>

            <section>
              <h2>{t('course.overview')}</h2>
              <div className="chart-grid">
                <RiskBar title={t('chart.risk')} counts={{ high: m.atRiskHigh, medium: m.atRiskMedium, low: m.atRiskLow }} labels={riskLabels} />
                <GradeHistogram title={t('chart.grades')} distribution={m.gradeDistribution} passMark={analysis.passThresholdPct} passLabel={t('chart.passMark', { pct: analysis.passThresholdPct })} studentsLabel={t('chart.students')} />
              </div>
              <EngagementScatter
                title={t('chart.scatter')}
                points={engagementVsGrade(analysis)}
                passMark={analysis.passThresholdPct}
                labels={{ engagement: t('col.engagement'), grade: t('col.grade'), pass: t('chart.passMark', { pct: analysis.passThresholdPct }), risk: riskLabels, withoutGrade: (count) => t('chart.withoutGrade', { count }) }}
                onSelect={openStudent}
              />
              <p className="muted">{t('chart.scatterHelp')}</p>
              {columns.length > 0 && <AssignmentColumns title={t('chart.assignments')} columns={columns} labels={{ onTime: t('chart.onTime'), late: t('chart.late'), submitted: t('chart.submitted') }} />}
              {lineSeries.length > 0 && (
                <>
                  <WeeklyLines
                    title={t('chart.weekly')}
                    weeks={weeks.map((week) => date(week.week).replace(/\s?\d{4}$/, ''))}
                    series={lineSeries}
                    weekLabel={(index) => t('chart.weekOf', { date: date(weeks[index].week) })}
                  />
                  <p className="muted">{t('chart.weeklyNote')}</p>
                </>
              )}
            </section>

            {analysis.teacherRecommendations.length > 0 && (
              <section>
                <h2>{t('course.recommendations')}</h2>
                <ul>{analysis.teacherRecommendations.map((entry) => <li key={entry.key}>{message(entry)}</li>)}</ul>
              </section>
            )}

            <section>
              <h2>{t('course.students')}</h2>
              <p className="muted">{t('course.studentsHelp')}</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {header('name', 'col.student')}
                      {header('risk', 'col.risk')}
                      {header('grade', 'col.grade')}
                      {header('predicted', 'col.predicted')}
                      {header('engagement', 'col.engagement')}
                      {header('lastAccess', 'col.lastAccess')}
                      {header('submissions', 'col.assignments')}
                      {header('quizzes', 'col.quizzes')}
                      {header('forum', 'col.forumPosts')}
                      <th>{t('col.completion')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student) => {
                      const s = student.metrics;
                      const expanded = open === student.id;
                      return (
                        <Fragment key={student.id}>
                          <tr id={`student-${student.id}`} className={expanded ? 'selected' : undefined}>
                            <td>
                              <button type="button" className="link" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : student.id)}>{student.fullname}</button>
                            </td>
                            <td><span className={`risk ${student.riskLevel}`}>{riskLabels[student.riskLevel]}</span></td>
                            <td>{pct(s.finalGradePct)}</td>
                            <td>{pct(student.prediction.predictedGradePct)}</td>
                            <td>{Math.round(s.engagementScore)}</td>
                            <td>{lastAccess(s.daysSinceAccess)}</td>
                            <td>{ratio(s.submittedAssignments, s.totalAssignments)}{s.lateSubmissions ? ` (${t('count.late', { count: s.lateSubmissions })})` : ''}</td>
                            <td>{pct(s.quizAvgPct)} {s.totalQuizzes ? `· ${ratio(s.quizUniqueAttempted, s.totalQuizzes)}` : ''}</td>
                            <td>{s.forumPostsCount}{s.forumDiscussionsStarted ? ` (${t('count.new', { count: s.forumDiscussionsStarted })})` : ''}</td>
                            <td>{s.totalActivities ? `${pct(s.completionRate)} · ${ratio(s.completedActivities, s.totalActivities)}` : '—'}</td>
                          </tr>
                          {expanded && (
                            <tr className="detail">
                              <td colSpan={10}><StudentDetail student={student} passMark={analysis.passThresholdPct} /></td>
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
              <h2>{t('course.assignments', { count: activities.assignments.length })}</h2>
              {activities.assignments.length === 0 ? <p className="muted">{t('course.none')}</p> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>{t('col.assignment')}</th><th>{t('col.due')}</th><th>{t('col.submitted')}</th><th>{t('col.late')}</th><th>{t('col.graded')}</th><th>{t('col.avgGrade')}</th></tr></thead>
                    <tbody>
                      {activities.assignments.map((a) => (
                        <tr key={a.id}><td>{a.name}</td><td>{a.dueDate ? date(a.dueDate) : '—'}</td><td>{ratio(a.submitted, a.students)}</td><td>{a.late}</td><td>{a.graded}</td><td>{pct(a.avgGradePct)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <h2>{t('course.quizzes', { count: activities.quizzes.length })}</h2>
              {activities.quizzes.length === 0 ? <p className="muted">{t('course.none')}</p> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>{t('col.quiz')}</th><th>{t('col.tried')}</th><th>{t('col.attempts')}</th><th>{t('col.avgBest')}</th></tr></thead>
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
              <h2>{t('course.forums', { count: activities.forums.length })}</h2>
              {activities.forums.length === 0 ? <p className="muted">{t('course.none')}</p> : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>{t('col.forum')}</th><th>{t('col.posted')}</th><th>{t('col.posts')}</th><th>{t('col.discussions')}</th></tr></thead>
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
              <h2>{t('course.sources')}</h2>
              <ul className="muted">
                <li>{t('course.sourcesCounts', { sections: analysis.contents.length, pages: analysis.pages.length, resources: analysis.resources.length })}</li>
                {analysis.excluded && analysis.excluded.hidden + analysis.excluded.notOpenYet > 0 && (
                  <li>{t('course.excluded', { hidden: analysis.excluded.hidden, notOpen: analysis.excluded.notOpenYet })}</li>
                )}
                <li>{t('course.noLog')}</li>
                {unavailable.length === 0 ? <li>{t('course.allRead')}</li> : unavailable.map(([operation, reason]) => <li key={operation}>{t('course.notRead', { operation, reason })}</li>)}
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

function StudentDetail({ student, passMark }: { student: StudentAnalysis; passMark: number }) {
  const { t, message, date } = useI18n();
  const s = student.metrics;
  const trend = (value: 'improving' | 'stable' | 'declining') => t(`trend.${value}`);
  return (
    <div className="student-detail">
      <div>
        <h3>{t('student.whyRisk')}</h3>
        {student.riskFactors.length ? <ul>{student.riskFactors.map((entry) => <li key={entry.key}>{message(entry)}</li>)}</ul> : <p className="muted">{t('student.noFactors')}</p>}
        <h3>{t('student.recommendations')}</h3>
        <ul>{student.recommendations.map((entry) => <li key={entry.key}>{message(entry)}</li>)}</ul>
        <h3>{t('student.indicators')}</h3>
        <ul>
          <li>{t('student.prediction', { predicted: pct(student.prediction.predictedGradePct), chance: pct(student.prediction.riskProbability * 100) })}</li>
          <li>{t('student.lastAccess', { date: date(s.lastAccessTs) })}</li>
          <li>{t('student.trends', { grade: trend(s.gradeTrend), quiz: trend(s.quizTrend) })}</li>
          <li>{t('student.scores', { academic: Math.round(s.academicScore), engagement: Math.round(s.engagementScore) })}</li>
          <li>{t('student.onTime', { pct: pct(s.onTimeRate) })}{s.submissionAvgAdvanceDays !== null ? t('student.advance', { days: s.submissionAvgAdvanceDays.toFixed(1) }) : ''}</li>
          <li>{t('student.quizAttempts', { count: s.quizAttemptsCount })}{s.quizAvgTimeMin !== null ? t('student.quizTime', { minutes: Math.round(s.quizAvgTimeMin) }) : ''}</li>
        </ul>
      </div>
      <PercentBars
        title={t('student.gradeItems')}
        passMark={passMark}
        emptyLabel={t('student.noGradeItems')}
        rows={s.gradeItems.map((item, index) => ({
          key: `${item.id ?? index}-${item.name}`,
          label: item.name,
          pct: item.gradePct,
          detail: item.grade === null ? '—' : t('chart.itemDetail', { grade: Number(item.grade.toFixed(2)), max: item.maxGrade })
        }))}
      />
    </div>
  );
}
