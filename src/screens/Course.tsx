// Course panel: a summary first, and the detail in tabs so each view shows a few things.
import { useMemo, useState, type ReactNode } from 'react';
import type { CourseSummary } from '../bridge';
import type { Analysed } from '../App';
import { summarizeActivities } from '../analysis/activitySummary';
import { engagementVsGrade, weeklyActivity } from '../analysis/courseCharts';
import { TURNAROUND_BUCKETS, type CheckKey } from '../analysis/insights';
import type { StudentAnalysis } from '../analysis/types';
import { EngagementScatter, GradeHistogram, WeeklyLines } from '../charts/Charts';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n/en';
import { BarList, Brand, Card, Icon, Kpi, LanguageSelect, Legend, RiskMark, initials, pct, type Risk } from '../ui';
import { AccessCard, Completion, Forums, Profiles, Quizzes, SpreadCard, TimingCard, WorkloadCard } from './CourseMore';

export type Tab = 'summary' | 'students' | 'profiles' | 'submissions' | 'grading' | 'quizzes' | 'forums' | 'completion' | 'pace' | 'course';

/** The tabs that apply to the course: quizzes, forums and completion only when it has them. */
function tabsFor(entry: Analysed): Tab[] {
  const { analysis, advanced } = entry;
  return [
    'summary', 'students', 'profiles', 'submissions', 'grading',
    ...(analysis.quizzes.length > 0 ? ['quizzes' as Tab] : []),
    ...(analysis.forums.length > 0 ? ['forums' as Tab] : []),
    ...(advanced.completion.activities.length > 0 ? ['completion' as Tab] : []),
    'pace', 'course'
  ];
}

type Filter = 'all' | 'atRisk' | 'drafts' | 'inactive';
type SortKey = 'name' | 'risk' | 'grade' | 'tasks' | 'engagement' | 'access';
const RISK_ORDER: Record<Risk, number> = { high: 3, medium: 2, low: 1 };

export function Course({ course, siteName, entry, progress, error, onBack, onRefresh, onOpenStudent, onSwitchSite, tab, onTab }: {
  course: CourseSummary;
  siteName: string;
  entry: Analysed | null;
  progress: { message: string; percent: number } | null;
  error: string;
  onBack: () => void;
  onRefresh: () => void;
  onOpenStudent: (id: number) => void;
  onSwitchSite: () => void;
  tab: Tab;
  onTab: (tab: Tab) => void;
}) {
  const { t, relative } = useI18n();

  return (
    <div className="shell">
      <nav className="sidebar" aria-label={t('nav.main')}>
        <Brand />
        <button type="button" className="site-switch" onClick={onSwitchSite}>
          <span style={{ fontWeight: 600 }}>{siteName}</span>
          <span className="brand-sub">{t('nav.switchSite')}</span>
        </button>
        <div className="nav">
          <button type="button" className="nav-item" onClick={onBack}><Icon name="book" /><span>{t('nav.courses')}</span></button>
          <span className="nav-item" aria-current="page"><Icon name="chart" /><span>{course.fullName}</span></span>
        </div>
        <div className="sidebar-note">
          <strong>{t('nav.readOnly')}</strong>
          <span>{t('nav.readOnlyText')}</span>
        </div>
      </nav>

      <main className="main">
        <header className="page-header">
          <div>
            <h1 className="page-title">{course.fullName}</h1>
            <p className="page-sub">
              {entry
                ? t('course.subtitle', { students: entry.analysis.courseMetrics.totalStudents, assignments: entry.analysis.assignments.length, when: relative(entry.collectedAt) })
                : course.shortName}
            </p>
          </div>
          <div className="actions">
            <button type="button" className="btn" onClick={onRefresh} disabled={!entry && !error}><Icon name="refresh" size={16} />{t('course.refresh')}</button>
            <LanguageSelect />
          </div>
        </header>

        {error && <p className="alert" role="alert" style={{ margin: 0 }}>{error}</p>}
        {!entry && !error && (
          <div className="card" aria-live="polite">
            <span className="card-title">{t('course.collecting')}</span>
            <progress max={100} value={progress?.percent ?? 0} style={{ width: '100%' }} />
            <span className="muted">{progress?.message || t('course.starting')}</span>
          </div>
        )}

        {entry && (
          <>
            <div className="tabs" role="tablist" aria-label={t('course.sections')}>
              {tabsFor(entry).map((id) => (
                <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`} className="tab" onClick={() => onTab(id)}>
                  {t(`tab.${id}` as MessageKey)}
                </button>
              ))}
            </div>
            <p className="tab-intro">{t(`tab.${tab}.intro` as MessageKey)}</p>
            <div className="tab-panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
              {tab === 'summary' && <Summary entry={entry} onTab={onTab} onOpenStudent={onOpenStudent} />}
              {tab === 'students' && <Students entry={entry} onOpenStudent={onOpenStudent} />}
              {tab === 'profiles' && <Profiles entry={entry} onOpenStudent={onOpenStudent} />}
              {tab === 'submissions' && <Submissions entry={entry} onOpenStudent={onOpenStudent} />}
              {tab === 'grading' && <Grading entry={entry} />}
              {tab === 'quizzes' && <Quizzes entry={entry} />}
              {tab === 'forums' && <Forums entry={entry} onOpenStudent={onOpenStudent} />}
              {tab === 'completion' && <Completion entry={entry} onOpenStudent={onOpenStudent} />}
              {tab === 'pace' && <Pace entry={entry} />}
              {tab === 'course' && <Settings entry={entry} />}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Summary({ entry, onTab, onOpenStudent }: { entry: Analysed; onTab: (tab: Tab) => void; onOpenStudent: (id: number) => void }) {
  const { t } = useI18n();
  const { analysis, insights, advanced, flow } = entry;
  const m = analysis.courseMetrics;
  const passing = analysis.students.filter((student) => (student.metrics.finalGradePct ?? -1) >= analysis.passThresholdPct).length;
  const graded = analysis.students.filter((student) => student.metrics.finalGradePct !== null).length;

  const alerts: Array<{ title: string; detail: string; color: string; tab: Tab }> = [];
  if (insights.grading.pending > 0) alerts.push({ title: t('alert.pending', { count: insights.grading.pending }), detail: insights.grading.oldestPendingDays !== null ? t('alert.pendingOldest', { days: insights.grading.oldestPendingDays }) : '', color: 'var(--series-2)', tab: 'grading' });
  if (m.atRiskHigh > 0) alerts.push({ title: t('alert.highRisk', { count: m.atRiskHigh }), detail: t('alert.highRiskDetail'), color: 'var(--risk-high)', tab: 'students' });
  if (insights.drafts.count > 0) alerts.push({ title: t('alert.drafts', { count: insights.drafts.count }), detail: t('alert.draftsDetail', { count: insights.drafts.students }), color: 'var(--series-1)', tab: 'submissions' });
  if (m.inactive7d > 0) alerts.push({ title: t('alert.inactive', { count: m.inactive7d }), detail: t('alert.inactiveDetail'), color: 'var(--risk-medium)', tab: 'students' });
  if (insights.submissions.lowAssignments.length > 0) alerts.push({ title: t('alert.lowAssignments', { count: insights.submissions.lowAssignments.length }), detail: t('alert.lowAssignmentsDetail'), color: 'var(--series-1)', tab: 'submissions' });
  if (flow && flow.worse.length > 0) alerts.push({ title: t('alert.worse', { count: flow.worse.length }), detail: t('alert.worseDetail'), color: 'var(--risk-high)', tab: 'profiles' });
  const badQuestions = advanced.quizzes.reduce((sum, quiz) => sum + quiz.questions.filter((question) => question.flag === 'negative').length, 0);
  if (badQuestions > 0) alerts.push({ title: t('alert.badQuestions', { count: badQuestions }), detail: t('alert.badQuestionsDetail'), color: 'var(--series-2)', tab: 'quizzes' });
  if (advanced.network.unanswered > 0) alerts.push({ title: t('alert.unanswered', { count: advanced.network.unanswered }), detail: t('alert.unansweredDetail'), color: 'var(--series-1)', tab: 'forums' });
  const nextWeek = advanced.workload?.overloaded.slice(4, 6).reduce((max, value) => Math.max(max, value), 0) ?? 0;
  if (nextWeek > 0) alerts.push({ title: t('alert.overload', { count: nextWeek }), detail: t('alert.overloadDetail'), color: 'var(--series-2)', tab: 'pace' });
  const firstCheck = insights.checks.find((check) => !check.ok);
  if (firstCheck) alerts.push({ title: t(`check.${firstCheck.key}.title` as MessageKey, firstCheck.values), detail: t('alert.checkDetail'), color: '#8A96A3', tab: 'course' });

  const atRisk = [...analysis.students]
    .filter((student) => student.riskLevel !== 'low')
    .sort((a, b) => RISK_ORDER[b.riskLevel] - RISK_ORDER[a.riskLevel] || b.prediction.riskProbability - a.prediction.riskProbability)
    .slice(0, 3);
  const riskLabel = (risk: Risk) => t(`risk.${risk}` as MessageKey);

  return (
    <>
      <section className="grid" style={{ ['--min' as string]: '200px' }} aria-label={t('summary.indicators')}>
        <Kpi label={t('kpi.students')} value={m.totalStudents} note={m.inactive7d === 0 ? t('kpi.allActive') : t('kpi.someInactive', { count: m.inactive7d })} />
        <Kpi label={t('kpi.avgGrade')} value={pct(m.avgGradePct)} note={graded ? t('kpi.passing', { count: passing, total: graded }) : t('kpi.noGrades')} />
        <Kpi label={t('kpi.submitted')} value={pct(m.avgSubmissionRate)} note={t('kpi.ofAssignments', { count: analysis.assignments.length })} />
        <Kpi label={t('kpi.toGrade')} value={insights.grading.pending} note={insights.grading.medianDays !== null ? t('kpi.median', { days: insights.grading.medianDays }) : t('kpi.noGradingYet')} />
      </section>
      <div className="grid">
        <Card title={t('summary.attention')}>
          {alerts.length === 0 ? <p className="muted" style={{ margin: 0 }}>{t('summary.nothing')}</p> : alerts.slice(0, 6).map((alert) => (
            <button key={alert.title} type="button" className="attention" onClick={() => onTab(alert.tab)}>
              <span className="dot" style={{ background: alert.color }} aria-hidden="true" />
              <span className="attention-text">
                <span className="attention-title">{alert.title}</span>
                {alert.detail && <span className="attention-detail">{alert.detail}</span>}
              </span>
              <Icon name="chevronRight" size={18} />
            </button>
          ))}
        </Card>
        <Card title={t('summary.risk')} sub={t('summary.riskSub')}>
          <div className="risk-bar" role="img" aria-label={t('courses.riskLine', { high: m.atRiskHigh, medium: m.atRiskMedium, low: m.atRiskLow })}>
            {m.atRiskHigh > 0 && <span style={{ flex: m.atRiskHigh, background: 'var(--risk-high)' }} />}
            {m.atRiskMedium > 0 && <span style={{ flex: m.atRiskMedium, background: 'var(--risk-medium)' }} />}
            {m.atRiskLow > 0 && <span style={{ flex: m.atRiskLow, background: 'var(--risk-low)' }} />}
          </div>
          <div className="risk-counts">
            {(['high', 'medium', 'low'] as Risk[]).map((risk) => (
              <div key={risk} className="risk-count">
                <span className="risk-count-label"><RiskMark risk={risk} />{riskLabel(risk)}</span>
                <span className="risk-count-value">{risk === 'high' ? m.atRiskHigh : risk === 'medium' ? m.atRiskMedium : m.atRiskLow}</span>
              </div>
            ))}
          </div>
          {atRisk.length === 0 ? <p className="muted" style={{ margin: 0 }}>{t('summary.noRisk')}</p> : atRisk.map((student) => (
            <button key={student.id} type="button" className={`person ${student.riskLevel}`} onClick={() => onOpenStudent(student.id)}>
              <span className="person-name">
                <span className="avatar" style={{ background: '#FFFFFF' }}>{initials(student.fullname)}</span>
                <span style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 600 }}>{student.fullname}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('summary.personLine', { grade: pct(student.metrics.finalGradePct), missing: student.metrics.totalAssignments - student.metrics.submittedAssignments })}</span>
                </span>
              </span>
              <span className={`pill ${student.riskLevel}`}>{riskLabel(student.riskLevel)}</span>
            </button>
          ))}
        </Card>
      </div>
    </>
  );
}

function Students({ entry, onOpenStudent }: { entry: Analysed; onOpenStudent: (id: number) => void }) {
  const { t, lastAccess } = useI18n();
  const { analysis, insights } = entry;
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({ key: 'risk', descending: true });
  const drafts = new Set(insights.submissions.rows.filter((row) => row.drafts > 0).map((row) => row.id));
  const matches: Record<Filter, (student: StudentAnalysis) => boolean> = {
    all: () => true,
    atRisk: (student) => student.riskLevel !== 'low',
    drafts: (student) => drafts.has(student.id),
    inactive: (student) => student.metrics.daysSinceAccess > 7
  };
  const sorters: Record<SortKey, (student: StudentAnalysis) => number | string> = {
    name: (s) => s.fullname.toLocaleLowerCase(),
    risk: (s) => RISK_ORDER[s.riskLevel] * 10 + s.prediction.riskProbability,
    grade: (s) => s.metrics.finalGradePct ?? -1,
    tasks: (s) => s.metrics.submissionRate ?? -1,
    engagement: (s) => s.metrics.engagementScore,
    access: (s) => s.metrics.daysSinceAccess
  };
  const rows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const by = sorters[sort.key];
    return analysis.students
      .filter(matches[filter])
      .filter((student) => !needle || student.fullname.toLocaleLowerCase().includes(needle))
      .sort((a, b) => {
        const [x, y] = [by(a), by(b)];
        const order = x < y ? -1 : x > y ? 1 : 0;
        return sort.descending ? -order : order;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, filter, query, sort]);
  const header = (key: SortKey, label: MessageKey) => (
    <th aria-sort={sort.key === key ? (sort.descending ? 'descending' : 'ascending') : 'none'}>
      <button type="button" onClick={() => setSort({ key, descending: sort.key === key ? !sort.descending : key !== 'name' })}>
        {t(label)}{sort.key === key ? (sort.descending ? ' ▾' : ' ▴') : ''}
      </button>
    </th>
  );
  const count = (key: Filter) => analysis.students.filter(matches[key]).length;
  const riskLabels = { high: t('risk.high'), medium: t('risk.medium'), low: t('risk.low') };

  return (
    <>
      <section className="card" aria-label={t('tab.students')}>
        <div className="card-head" style={{ alignItems: 'center' }}>
          <div className="chips" role="group" aria-label={t('students.filter')}>
            {(['all', 'atRisk', 'drafts', 'inactive'] as Filter[]).map((key) => (
              <button key={key} type="button" className="chip" aria-pressed={filter === key} onClick={() => setFilter(key)}>{t(`students.filter.${key}` as MessageKey, { count: count(key) })}</button>
            ))}
          </div>
          <label className="search">
            <Icon name="search" size={16} />
            <span className="visually-hidden">{t('students.search')}</span>
            <input type="search" placeholder={t('students.search')} value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>
        <div className="table-wrap">
          <table style={{ minWidth: 760 }}>
            <thead>
              <tr>
                {header('name', 'col.student')}
                {header('risk', 'col.risk')}
                {header('grade', 'col.grade')}
                {header('tasks', 'col.tasks')}
                {header('engagement', 'col.engagement')}
                {header('access', 'col.lastAccess')}
                <th><span className="visually-hidden">{t('col.actions')}</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((student) => {
                const s = student.metrics;
                return (
                  <tr key={student.id}>
                    <td><span className="person-name"><span className="avatar">{initials(student.fullname)}</span><span style={{ fontWeight: 600, color: 'var(--ink)' }}>{student.fullname}</span></span></td>
                    <td><span className={`pill ${student.riskLevel}`}>{riskLabels[student.riskLevel]}</span></td>
                    <td>
                      <span className="gradecell">
                        <span className="num" style={{ width: 38, fontWeight: 600, color: 'var(--ink)' }}>{pct(s.finalGradePct)}</span>
                        <span className="minibar">{s.finalGradePct !== null && <span style={{ width: `${Math.min(100, s.finalGradePct)}%`, background: s.finalGradePct < analysis.passThresholdPct ? 'var(--risk-high)' : 'var(--series-1)' }} />}</span>
                      </span>
                    </td>
                    <td className="num">{s.totalAssignments ? `${s.submittedAssignments}/${s.totalAssignments}` : '—'}</td>
                    <td className="num">{Math.round(s.engagementScore)}</td>
                    <td>{lastAccess(s.daysSinceAccess)}</td>
                    <td style={{ textAlign: 'right' }}><button type="button" className="btn-link" onClick={() => onOpenStudent(student.id)}>{t('students.open')}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <p className="muted">{t('students.none')}</p>}
        </div>
      </section>
      <div className="grid" style={{ ['--min' as string]: '420px' }}>
        <Card title={t('students.scatter')} sub={t('students.scatterSub')}>
          <EngagementScatter
            title={t('students.scatter')}
            points={engagementVsGrade(analysis)}
            passMark={analysis.passThresholdPct}
            labels={{ engagement: t('col.engagement'), grade: t('col.grade'), pass: t('chart.pass', { pct: analysis.passThresholdPct }), risk: riskLabels, withoutGrade: (count) => t('chart.withoutGrade', { count }) }}
            onSelect={onOpenStudent}
          />
        </Card>
        <Card title={t('students.distribution')} sub={t('students.distributionSub', { pct: analysis.passThresholdPct })}>
          <GradeHistogram title={t('students.distribution')} distribution={analysis.courseMetrics.gradeDistribution} passMark={analysis.passThresholdPct} passLabel={t('chart.pass', { pct: analysis.passThresholdPct })} studentsLabel={t('chart.students')} />
        </Card>
      </div>
    </>
  );
}

function Submissions({ entry, onOpenStudent }: { entry: Analysed; onOpenStudent: (id: number) => void }) {
  const { t } = useI18n();
  const { analysis, insights } = entry;
  const { assignments, rows, lowAssignments } = insights.submissions;
  const labels = { graded: t('cell.graded'), pending: t('cell.pending'), draft: t('cell.draft'), none: t('cell.none') };
  return (
    <>
      <section className="grid" style={{ ['--min' as string]: '200px' }}>
        <Kpi label={t('kpi.submitted')} value={pct(analysis.courseMetrics.avgSubmissionRate)} />
        <Kpi label={t('kpi.drafts')} value={insights.drafts.count} note={t('alert.draftsDetail', { count: insights.drafts.students })} />
        <Kpi label={t('kpi.lowAssignments')} value={lowAssignments.length} />
      </section>
      {assignments.length === 0 ? <p className="empty">{t('submissions.none')}</p> : (
        <Card
          title={t('submissions.map')}
          sub={t('submissions.mapSub')}
          aside={<Legend items={[['graded', 'var(--series-1)'], ['pending', 'var(--series-2)'], ['draft', 'dashed'], ['none', '#E6EAEE']].map(([key, color]): [string, string] => [labels[key as keyof typeof labels], color])} />}
        >
          <div className="heatmap" role="img" aria-label={t('submissions.mapAria', { students: rows.length, assignments: assignments.length })} style={{ ['--cells-min' as string]: `${assignments.length * 10}px` }}>
            {rows.map((row) => (
              <div key={row.id} className="heat-row">
                <button type="button" className="heat-name" onClick={() => onOpenStudent(row.id)}>{row.name}</button>
                <div className="heat-cells" style={{ gridTemplateColumns: `repeat(${assignments.length}, minmax(0, 1fr))` }}>
                  {row.cells.map((cell, index) => (
                    <span key={assignments[index].id} className={`heat-cell ${cell}`} title={`${row.name} · ${assignments[index].name}: ${labels[cell]}`} />
                  ))}
                </div>
                <span className="heat-count">{row.submitted}/{assignments.length}</span>
              </div>
            ))}
          </div>
          {lowAssignments.length > 0 && (
            <p className="card-foot">{t('submissions.low', { names: lowAssignments.slice(0, 3).map((assignment) => `«${assignment.name}»`).join(', ') })}</p>
          )}
        </Card>
      )}
      <TimingCard entry={entry} />
    </>
  );
}

function Grading({ entry }: { entry: Analysed }) {
  const { t } = useI18n();
  const { analysis, insights } = entry;
  const g = insights.grading;
  const bucketLabels = [
    t('grading.bucket', { from: 0, to: TURNAROUND_BUCKETS[0] }),
    ...TURNAROUND_BUCKETS.slice(1).map((limit, index) => t('grading.bucket', { from: TURNAROUND_BUCKETS[index] + 1, to: limit })),
    t('grading.bucketOver', { days: TURNAROUND_BUCKETS[TURNAROUND_BUCKETS.length - 1] })
  ];
  const maxBucket = Math.max(1, ...g.turnaround);
  const hardest = summarizeActivities(analysis).assignments
    .filter((assignment) => assignment.avgGradePct !== null)
    .sort((a, b) => (a.avgGradePct ?? 0) - (b.avgGradePct ?? 0))
    .slice(0, 6);
  return (
    <>
      <section className="grid" style={{ ['--min' as string]: '200px' }}>
        <Kpi label={t('kpi.toGrade')} value={g.pending} note={g.oldestPendingDays !== null ? t('alert.pendingOldest', { days: g.oldestPendingDays }) : undefined} />
        <Kpi label={t('kpi.medianTime')} value={g.medianDays !== null ? t('unit.days', { count: g.medianDays }) : '—'} />
        <Kpi label={t('kpi.feedback')} value={pct(g.feedbackRate)} note={g.graded ? t('kpi.feedbackNote', { count: g.gradesWithFeedback, total: g.graded }) : undefined} />
      </section>
      <div className="grid" style={{ ['--min' as string]: '380px' }}>
        <Card title={t('grading.turnaround')} sub={t('grading.turnaroundSub')}>
          {g.turnaround.every((count) => count === 0) ? <p className="muted" style={{ margin: 0 }}>{t('kpi.noGradingYet')}</p> : (
            <BarList rows={g.turnaround.map((count, index) => ({ key: index, label: bucketLabels[index], value: count, max: maxBucket, color: index >= 3 ? 'var(--series-2)' : 'var(--series-1)' }))} />
          )}
        </Card>
        <Card title={t('grading.hardest')} sub={t('grading.hardestSub')}>
          {hardest.length === 0 ? <p className="muted" style={{ margin: 0 }}>{t('kpi.noGradingYet')}</p> : (
            <>
              <BarList labelWidth={200} passMark={analysis.passThresholdPct} rows={hardest.map((assignment) => ({
                key: assignment.id, label: assignment.name, title: assignment.name, value: assignment.avgGradePct ?? 0, max: 100, text: pct(assignment.avgGradePct),
                color: (assignment.avgGradePct ?? 0) < analysis.passThresholdPct ? 'var(--risk-high)' : 'var(--series-1)'
              }))} />
              <p className="card-foot">{t('grading.passLine', { pct: analysis.passThresholdPct })}</p>
            </>
          )}
        </Card>
      </div>
      <SpreadCard entry={entry} />
    </>
  );
}

function Pace({ entry }: { entry: Analysed }) {
  const { t, date, weekdays } = useI18n();
  const weeks = weeklyActivity(entry.analysis);
  const series = [
    { key: 'submissions', label: t('chart.submissions'), color: 'var(--series-1)', values: weeks.map((week) => week.submissions) },
    { key: 'quizAttempts', label: t('chart.quizAttempts'), color: 'var(--series-2)', values: weeks.map((week) => week.quizAttempts) },
    { key: 'forumPosts', label: t('chart.forumPosts'), color: 'var(--series-3)', values: weeks.map((week) => week.forumPosts) }
  ].filter((entry) => entry.values.some((value) => value > 0));
  const grid = entry.insights.weekdayHour;
  const max = Math.max(1, ...grid.flat());
  const ramp = ['#F1F4F7', '#CDE2FB', '#86B6EF', '#3987E5', '#1C5CAB'];
  const shade = (value: number) => (value === 0 ? ramp[0] : ramp[Math.min(4, 1 + Math.floor((value / max) * 3.999))]);
  const days = weekdays();
  return (
    <>
    <div className="grid" style={{ ['--min' as string]: '420px' }}>
      <Card title={t('pace.weekly')} sub={t('pace.weeklySub')}>
        {series.length === 0 ? <p className="muted" style={{ margin: 0 }}>{t('pace.none')}</p> : (
          <WeeklyLines title={t('pace.weekly')} weeks={weeks.map((week) => date(week.week).replace(/\s?\d{4}$/, ''))} series={series} weekLabel={(index) => t('chart.weekOf', { date: date(weeks[index].week) })} />
        )}
      </Card>
      <Card title={t('pace.when')} sub={t('pace.whenSub')}>
        <div className="week-grid" role="img" aria-label={t('pace.whenSub')}>
          <span />
          {[0, 3, 6, 9, 12, 15, 18, 21].map((hour) => <span key={hour} style={{ textAlign: 'center' }}>{hour}</span>)}
          {grid.map((row, day) => (
            <Fragmentless key={days[day]}>
              <span className="day">{days[day]}</span>
              {row.map((value, slot) => <span key={slot} className="slot" style={{ background: shade(value) }} title={t('pace.slot', { day: days[day], from: slot * 3, to: slot * 3 + 3, count: value })} />)}
            </Fragmentless>
          ))}
        </div>
        <span className="scale">0 {ramp.map((color) => <span key={color} style={{ background: color }} />)} {max}</span>
      </Card>
    </div>
    <AccessCard entry={entry} />
    <WorkloadCard entry={entry} />
    </>
  );
}

function Fragmentless({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function Settings({ entry }: { entry: Analysed }) {
  const { t } = useI18n();
  const { analysis, insights } = entry;
  const maxCount = Math.max(1, ...insights.contentMix.map((item) => item.count));
  const moduleName = (modname: string) => {
    const key = `mod.${modname}` as MessageKey;
    const text = t(key);
    return text === key ? modname : text;
  };
  return (
    <div className="grid">
      <Card title={t('settings.checks')}>
        {insights.checks.length === 0 ? <p className="muted" style={{ margin: 0 }}>{t('settings.allGood')}</p> : (
          <ul className="checks">
            {insights.checks.map((check) => (
              <li key={check.key} className="check">
                <span className={`check-icon ${check.ok ? 'ok' : 'warn'}`} aria-hidden="true">{check.ok ? '✓' : '!'}</span>
                <span>
                  <span className="check-title">{t(`check.${check.key}.title` as MessageKey, check.values)}</span>
                  <br />
                  <span className="check-text">{t(`check.${check.key}.text` as MessageKey, check.values)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={t('settings.content')} sub={analysis.excluded?.hidden ? t('settings.hidden', { count: analysis.excluded.hidden }) : undefined}>
        {insights.contentMix.length === 0 ? <p className="muted" style={{ margin: 0 }}>{t('settings.noContent')}</p> : (
          <BarList rows={insights.contentMix.slice(0, 8).map((item) => ({ key: item.modname, label: moduleName(item.modname), value: item.count, max: maxCount, color: 'var(--brand)' }))} />
        )}
        <p className="card-foot">
          {Object.keys(analysis.unavailable ?? {}).length > 0 && `${t('settings.sources', { count: Object.keys(analysis.unavailable ?? {}).length })} `}
          {t('settings.noLog')}
        </p>
      </Card>
    </div>
  );
}

export type { CheckKey };
