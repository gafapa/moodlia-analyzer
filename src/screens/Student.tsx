// One student's detail: why the risk level and what to do, the assignments with their grades,
// and the evolution of the grade against the class.
import { useMemo, useState } from 'react';
import type { Analysed } from '../App';
import { classAverages, gradeEvolution } from '../analysis/insights';
import { weekStart } from '../analysis/courseCharts';
import { OVERLOAD, TIMING_BUCKETS, WORKLOAD_PAST_WEEKS, studentDeadlines } from '../analysis/advanced';
import { Columns, WeeklyLines } from '../charts/Charts';
import { TIMING_COLORS } from './CourseMore';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n/en';
import { BarList, Card, Icon, LanguageSelect, initials, pct } from '../ui';

type Tab = 'summary' | 'tasks' | 'evolution' | 'deadlines';
const WEEK = 7 * 86400;

export function Student({ entry, studentId, courseName, onBack }: { entry: Analysed; studentId: number; courseName: string; onBack: () => void }) {
  const { t, message, date, lastAccess } = useI18n();
  const [tab, setTab] = useState<Tab>('summary');
  const { analysis, insights } = entry;
  const student = analysis.students.find((entry) => entry.id === studentId);
  if (!student) {
    return (
      <div className="page"><div className="page-inner">
        <button type="button" className="back" onClick={onBack}><Icon name="chevronLeft" size={16} />{courseName}</button>
        <p className="empty">{t('student.missing')}</p>
      </div></div>
    );
  }
  const s = student.metrics;
  const pass = analysis.passThresholdPct;
  const riskLabel = t(`risk.${student.riskLevel}` as MessageKey);

  return (
    <div className="page">
      <div className="page-inner">
        <div className="page-header" style={{ alignItems: 'center' }}>
          <button type="button" className="back" onClick={onBack}><Icon name="chevronLeft" size={16} />{courseName}</button>
          <LanguageSelect />
        </div>

        <header className="card" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <span className={`avatar large ${student.riskLevel}`}>{initials(student.fullname)}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <h1 className="page-title" style={{ fontSize: 26 }}>{student.fullname}</h1>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
                <span className={`pill ${student.riskLevel}`}>{t('student.riskPill', { level: riskLabel.toLocaleLowerCase() })}</span>
                <span>{t('student.lastAccess', { when: lastAccess(s.daysSinceAccess).toLocaleLowerCase() })}</span>
                {student.firstaccess ? <><span aria-hidden="true">·</span><span>{t('student.firstAccess', { date: date(student.firstaccess) })}</span></> : null}
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(110px, 1fr))', gap: 12 }}>
            <span className="stat"><span className="stat-label">{t('student.grade')}</span><span className="stat-value" style={{ color: (s.finalGradePct ?? 100) < pass ? 'var(--risk-high-ink)' : undefined }}>{pct(s.finalGradePct)}</span></span>
            <span className="stat"><span className="stat-label">{t('student.predicted')}</span><span className="stat-value">{pct(student.prediction.predictedGradePct)}</span></span>
            <span className="stat"><span className="stat-label">{t('student.tasks')}</span><span className="stat-value">{s.totalAssignments ? `${s.submittedAssignments}/${s.totalAssignments}` : '—'}</span></span>
            <span className="stat"><span className="stat-label">{t('student.engagement')}</span><span className="stat-value">{Math.round(s.engagementScore)}</span></span>
          </div>
        </header>

        <div className="tabs" role="tablist" aria-label={t('student.sections')}>
          {(['summary', 'tasks', 'evolution', 'deadlines'] as Tab[]).map((id) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className="tab" onClick={() => setTab(id)}>{t(`student.tab.${id}` as MessageKey)}</button>
          ))}
        </div>

        {tab === 'summary' && (
          <>
            <div className="grid" style={{ ['--min' as string]: '380px' }}>
              <Card title={t('student.why', { level: riskLabel.toLocaleLowerCase() })}>
                {student.riskFactors.length === 0 ? <p className="muted" style={{ margin: 0 }}>{t('student.noFactors')}</p> : (
                  <ul className="reasons">
                    {student.riskFactors.map((factor) => <li key={factor.key}><span className="reason-icon" aria-hidden="true">!</span>{message(factor)}</li>)}
                  </ul>
                )}
              </Card>
              <Card title={t('student.todo')}>
                <ol className="steps">
                  {student.recommendations.map((entry) => <li key={entry.key}>{message(entry)}</li>)}
                  {(insights.submissions.rows.find((row) => row.id === student.id)?.drafts ?? 0) > 0 && (
                    <li>{t('student.draftsTodo', { count: insights.submissions.rows.find((row) => row.id === student.id)?.drafts ?? 0 })}</li>
                  )}
                </ol>
              </Card>
            </div>
            <ProfileCard entry={entry} studentId={student.id} />
            <Comparison entry={entry} studentId={student.id} />
          </>
        )}

        {tab === 'tasks' && <Tasks entry={entry} studentId={student.id} />}
        {tab === 'evolution' && <Evolution entry={entry} studentId={student.id} />}
        {tab === 'deadlines' && <Deadlines entry={entry} studentId={student.id} />}
      </div>
    </div>
  );
}

function ProfileCard({ entry, studentId }: { entry: Analysed; studentId: number }) {
  const { t } = useI18n();
  const profile = entry.advanced.profiles[studentId];
  const timing = entry.advanced.timing.students[studentId];
  if (!profile) return null;
  return (
    <Card title={t('student.profile', { profile: t(`profile.${profile}` as MessageKey) })}>
      <p style={{ margin: 0 }}>{t(`profile.${profile}.text` as MessageKey, { pct: entry.analysis.passThresholdPct })}</p>
      {timing?.profile && <p className="muted" style={{ margin: 0 }}>{t(`timing.student.${timing.profile}` as MessageKey, { count: timing.dated })}</p>}
      <p className="card-foot">{t(`profile.${profile}.action` as MessageKey)}</p>
    </Card>
  );
}

function Comparison({ entry, studentId }: { entry: Analysed; studentId: number }) {
  const { t } = useI18n();
  const student = entry.analysis.students.find((item) => item.id === studentId)!;
  const averages = classAverages(entry.analysis.students);
  const s = student.metrics;
  const rows = [
    { key: 'submitted', label: t('compare.submitted'), value: s.submissionRate, avg: averages.submissionRate },
    { key: 'grade', label: t('compare.grade'), value: s.finalGradePct, avg: averages.gradeAvgPct },
    { key: 'engagement', label: t('compare.engagement'), value: s.engagementScore, avg: averages.engagement },
    { key: 'completion', label: t('compare.completion'), value: s.completionRate, avg: averages.completionRate }
  ].filter((row) => row.value !== null);
  return (
    <Card title={t('compare.title')} sub={t('compare.sub')}>
      <BarList labelWidth={200} rows={rows.map((row) => ({
        key: row.key, label: row.label, value: row.value ?? 0, max: 100, avg: row.avg ?? undefined,
        text: `${Math.round(row.value ?? 0)}`,
        title: t('compare.tooltip', { value: Math.round(row.value ?? 0), avg: row.avg === null ? '—' : Math.round(row.avg) }),
        color: row.key === 'grade' && (row.value ?? 0) < entry.analysis.passThresholdPct ? 'var(--risk-high)' : 'var(--series-1)'
      }))} />
      <p className="card-foot">{t('compare.foot')}</p>
    </Card>
  );
}

function Tasks({ entry, studentId }: { entry: Analysed; studentId: number }) {
  const { t } = useI18n();
  const { analysis, insights } = entry;
  const student = analysis.students.find((item) => item.id === studentId)!;
  const row = insights.submissions.rows.find((item) => item.id === studentId);
  const pass = analysis.passThresholdPct;
  const gradeByAssignment = new Map(student.grades.items.filter((item) => item.modname === 'assign' && item.instance).map((item) => [item.instance as number, item]));
  const cells = insights.submissions.assignments.map((assignment, index) => {
    const status = row?.cells[index] ?? 'none';
    const item = gradeByAssignment.get(assignment.id);
    const graded = status === 'graded' && item && item.gradePct !== null;
    const kind = graded ? ((item.gradePct as number) < pass ? 'fail' : 'pass') : status === 'graded' ? 'pass' : status;
    const value = graded && item.grade !== null ? String(Number(item.grade.toFixed(1))) : status === 'pending' ? '·' : '';
    return { id: assignment.id, kind, value, title: `${assignment.name}: ${t(`task.${kind}` as MessageKey)}${value && value !== '·' ? ` (${value})` : ''}` };
  });
  const lowest = student.grades.items
    .filter((item) => item.gradePct !== null && item.type !== 'category')
    .sort((a, b) => (a.gradePct ?? 0) - (b.gradePct ?? 0))
    .slice(0, 6);
  const legend: Array<[string, string]> = [['pass', 'var(--series-1)'], ['fail', 'var(--risk-high)'], ['pending', 'var(--series-2)'], ['draft', 'dashed'], ['none', '#E6EAEE']];
  return (
    <>
      <Card
        title={t('tasks.title')}
        sub={t('tasks.sub', { count: insights.submissions.assignments.length })}
        aside={<div className="legend">{legend.map(([key, color]) => <span key={key}><span className={`key${color === 'dashed' ? ' dashed' : ''}`} style={color === 'dashed' ? undefined : { background: color }} />{t(`task.${key}` as MessageKey)}</span>)}</div>}
      >
        {cells.length === 0 ? <p className="muted" style={{ margin: 0 }}>{t('submissions.none')}</p> : (
          <div className="task-grid" role="list" aria-label={t('tasks.title')}>
            {cells.map((cell) => <span key={cell.id} role="listitem" className={`task ${cell.kind}`} title={cell.title} aria-label={cell.title}>{cell.value}</span>)}
          </div>
        )}
      </Card>
      <TimingCard entry={entry} studentId={studentId} />
      <Card title={t('tasks.lowest')}>
        {lowest.length === 0 ? <p className="muted" style={{ margin: 0 }}>{t('tasks.noGrades')}</p> : (
          <>
            <BarList labelWidth={260} passMark={pass} rows={lowest.map((item, index) => ({
              key: `${item.id ?? index}`, label: item.name, title: item.name, value: item.gradePct ?? 0, max: 100,
              text: item.grade === null ? '—' : t('tasks.of', { grade: Number(item.grade.toFixed(1)), max: Number(item.maxGrade.toFixed(1)) }),
              color: (item.gradePct ?? 0) < pass ? 'var(--risk-high)' : 'var(--series-1)'
            }))} />
            <p className="card-foot">{t('grading.passLine', { pct: pass })}</p>
          </>
        )}
      </Card>
    </>
  );
}

function TimingCard({ entry, studentId }: { entry: Analysed; studentId: number }) {
  const { t } = useI18n();
  const own = entry.advanced.timing.students[studentId];
  const all = entry.advanced.timing.counts;
  const allTotal = Math.max(1, entry.advanced.timing.total);
  if (!own || own.dated === 0) return null;
  return (
    <Card title={t('tasks.timing')} sub={t('tasks.timingSub')}>
      <BarList labelWidth={170} rows={TIMING_BUCKETS.map((bucket, index) => ({
        key: bucket,
        label: t(`timing.${bucket}` as MessageKey),
        value: (own.counts[index] / own.dated) * 100,
        max: 100,
        avg: (all[index] / allTotal) * 100,
        text: String(own.counts[index]),
        title: t('compare.tooltip', { value: Math.round((own.counts[index] / own.dated) * 100), avg: Math.round((all[index] / allTotal) * 100) }),
        color: TIMING_COLORS[index]
      }))} />
      <p className="card-foot">{t('tasks.timingFoot')}</p>
    </Card>
  );
}

function Deadlines({ entry, studentId }: { entry: Analysed; studentId: number }) {
  const { t, date } = useI18n();
  const workload = entry.advanced.workload;
  const counts = workload?.perStudent[studentId];
  const list = studentDeadlines(entry.analysis, studentId);
  if (!workload || !counts) return <p className="empty">{entry.analysis.unavailable?.get_user_courses ? t('workload.unavailable') : t('workload.none')}</p>;
  const current = weekStart(Math.floor(Date.now() / 1000));
  return (
    <>
      <Card title={t('deadlines.title')} sub={t('deadlines.sub', { count: OVERLOAD })}>
        <Columns
          title={t('deadlines.title')}
          highlight={WORKLOAD_PAST_WEEKS}
          reference={{ value: OVERLOAD, label: t('deadlines.overload', { count: OVERLOAD }) }}
          bars={workload.weeks.map((week, index) => ({
            key: String(week),
            label: date(week).replace(/\s?\d{4}$/, ''),
            value: counts[index],
            color: week < current ? 'var(--timing-days1to3)' : counts[index] >= OVERLOAD ? 'var(--series-2)' : 'var(--series-1)',
            tip: <><strong>{t('chart.weekOf', { date: date(week) })}</strong><br />{t('deadlines.tip', { count: counts[index], average: workload.average[index].toFixed(1) })}</>
          }))}
        />
        <p className="card-foot">{t('workload.foot', { covered: workload.covered, courses: workload.courses })}</p>
      </Card>
      <Card title={t('deadlines.upcoming')}>
        {list.length === 0 ? <p className="muted" style={{ margin: 0 }}>{t('deadlines.noneUpcoming')}</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('deadlines.colDate')}</th><th>{t('deadlines.colCourse')}</th><th>{t('deadlines.colActivity')}</th></tr></thead>
              <tbody>
                {list.map((deadline, index) => (
                  <tr key={`${deadline.courseId}-${deadline.kind}-${index}`}>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>{date(deadline.due)}</td>
                    <td>{deadline.course}</td>
                    <td>{deadline.name} <span className="pill neutral">{t(`deadlines.kind.${deadline.kind}` as MessageKey)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function Evolution({ entry, studentId }: { entry: Analysed; studentId: number }) {
  const { t, date } = useI18n();
  const student = entry.analysis.students.find((item) => item.id === studentId)!;
  const data = useMemo(() => {
    const evolution = gradeEvolution(student, entry.analysis.students);
    if (evolution.student.length === 0) return null;
    const first = weekStart(Math.min(evolution.student[0].at, evolution.course[0]?.at ?? Infinity));
    const last = weekStart(Math.max(evolution.student.at(-1)!.at, evolution.course.at(-1)?.at ?? 0));
    const weeks: number[] = [];
    for (let week = first; week <= last; week += WEEK) weeks.push(week);
    // The running average at the end of each week, carried forward.
    const sample = (points: Array<{ at: number; pct: number }>) => {
      let value = points[0]?.pct ?? 0;
      let index = 0;
      return weeks.map((week) => {
        while (index < points.length && points[index].at < week + WEEK) value = points[index++].pct;
        return Math.round(value);
      });
    };
    return { weeks, student: sample(evolution.student), course: sample(evolution.course) };
  }, [entry, student]);
  return (
    <Card title={t('evolution.title')} sub={t('evolution.sub')}>
      {!data ? <p className="muted" style={{ margin: 0 }}>{t('tasks.noGrades')}</p> : (
        <WeeklyLines
          title={t('evolution.title')}
          weeks={data.weeks.map((week) => date(week).replace(/\s?\d{4}$/, ''))}
          series={[
            { key: 'student', label: student.fullname.split(' ')[0], color: 'var(--series-1)', values: data.student },
            { key: 'course', label: t('evolution.class'), color: '#8A96A3', values: data.course }
          ]}
          weekLabel={(index) => t('chart.weekOf', { date: date(data.weeks[index]) })}
          maxValue={100}
          reference={{ value: entry.analysis.passThresholdPct, label: t('chart.pass', { pct: entry.analysis.passThresholdPct }) }}
          format={(value) => `${value}%`}
        />
      )}
    </Card>
  );
}
