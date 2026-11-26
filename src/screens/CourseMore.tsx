// Course tabs and cards for the further analyses (src/analysis/advanced.ts): student profiles
// and risk changes, submission timing, grade spread, quiz questions, forum replies,
// activity completion, days since the last access and deadlines across courses.
import { useMemo, useState } from 'react';
import type { Analysed } from '../App';
import { weekStart } from '../analysis/courseCharts';
import { ACCESS_BUCKETS, OVERLOAD, PROFILES, TIMING_BUCKETS, WORKLOAD_PAST_WEEKS, type ProfileKey, type QuestionFlag, type TimingProfile } from '../analysis/advanced';
import { BoxPlots, Columns, ItemScatter, NetworkGraph, RiskFlowChart, WeeklyLines } from '../charts/Charts';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n/en';
import { BarList, Card, Kpi, Legend, StackedRows, initials, pct, type Risk } from '../ui';

export const TIMING_COLORS = TIMING_BUCKETS.map((bucket) => `var(--timing-${bucket})`);
const FLAG_ORDER: Record<QuestionFlag, number> = { negative: 0, weak: 1, hard: 2, easy: 3 };

/** Hours as "5 h" or "3 days", for the time before a due date or until a reply. */
function useDuration() {
  const { t } = useI18n();
  return (hours: number | null) => {
    if (hours === null) return '—';
    const sign = hours < 0 ? '−' : '';
    const absolute = Math.abs(hours);
    return absolute < 48 ? `${sign}${t('unit.hours', { count: Math.round(absolute) })}` : `${sign}${t('unit.days', { count: Math.round(absolute / 24) })}`;
  };
}

function NameList({ ids, entry, onOpenStudent, empty }: { ids: number[]; entry: Analysed; onOpenStudent: (id: number) => void; empty: string }) {
  const names = new Map(entry.analysis.students.map((student) => [student.id, student.fullname]));
  if (ids.length === 0) return <p className="muted" style={{ margin: 0 }}>{empty}</p>;
  return (
    <div className="names">
      {ids.map((id) => (
        <button key={id} type="button" className="chip" onClick={() => onOpenStudent(id)}>
          <span className="avatar" style={{ width: 22, height: 22, fontSize: 10, marginRight: 6, display: 'inline-flex' }}>{initials(names.get(id) ?? '?')}</span>
          {names.get(id) ?? `#${id}`}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

export function Profiles({ entry, onOpenStudent }: { entry: Analysed; onOpenStudent: (id: number) => void }) {
  const { t, date } = useI18n();
  const { analysis, advanced, flow } = entry;
  const [selected, setSelected] = useState<ProfileKey | null>(null);
  const members = (key: ProfileKey) => analysis.students.filter((student) => advanced.profiles[student.id] === key).map((student) => student.id);
  const total = Math.max(1, analysis.students.length);
  const riskLabels: Record<Risk, string> = { high: t('risk.high'), medium: t('risk.medium'), low: t('risk.low') };
  return (
    <>
      <Card title={t('profiles.title')} sub={t('profiles.sub')}>
        <div className="profiles">
          {PROFILES.map((key) => {
            const count = members(key).length;
            return (
              <button key={key} type="button" className="profile" aria-pressed={selected === key} onClick={() => setSelected(selected === key ? null : key)}>
                <span className="profile-head">
                  <span className="profile-name">{t(`profile.${key}` as MessageKey)}</span>
                  <span className="profile-count">{count}</span>
                </span>
                <span className="profile-bar"><span style={{ width: `${(count / total) * 100}%` }} /></span>
                <span className="profile-text">{t(`profile.${key}.text` as MessageKey, { pct: analysis.passThresholdPct })}</span>
              </button>
            );
          })}
        </div>
        {selected && (
          <>
            <h3 className="card-title" style={{ fontSize: 14 }}>{t('profiles.members', { profile: t(`profile.${selected}` as MessageKey) })}</h3>
            <NameList ids={members(selected)} entry={entry} onOpenStudent={onOpenStudent} empty={t('profiles.noMembers')} />
            <p className="card-foot">{t(`profile.${selected}.action` as MessageKey)}</p>
          </>
        )}
        <p className="card-foot">{t('profiles.foot')}</p>
      </Card>
      <Card title={t('flow.title')} sub={flow ? t('flow.sub', { from: date(Date.parse(flow.from) / 1000), to: date(Date.parse(flow.to) / 1000) }) : undefined}>
        {!flow ? <p className="muted" style={{ margin: 0 }}>{t('flow.none')}</p> : (
          <div className="grid" style={{ ['--min' as string]: '320px' }}>
            <RiskFlowChart title={t('flow.title')} matrix={flow.matrix} labels={riskLabels} fromLabel={date(Date.parse(flow.from) / 1000)} toLabel={date(Date.parse(flow.to) / 1000)} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h3 className="card-title" style={{ fontSize: 14 }}>{t('flow.worse', { count: flow.worse.length })}</h3>
              <NameList ids={flow.worse} entry={entry} onOpenStudent={onOpenStudent} empty={t('flow.noneWorse')} />
              <h3 className="card-title" style={{ fontSize: 14 }}>{t('flow.better', { count: flow.better.length })}</h3>
              <NameList ids={flow.better} entry={entry} onOpenStudent={onOpenStudent} empty={t('flow.noneBetter')} />
            </div>
          </div>
        )}
        <p className="card-foot">{t('flow.foot')}</p>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------------------------

export function TimingCard({ entry }: { entry: Analysed }) {
  const { t } = useI18n();
  const duration = useDuration();
  const timing = entry.advanced.timing;
  const segments = TIMING_BUCKETS.map((bucket, index) => ({ label: t(`timing.${bucket}` as MessageKey), color: TIMING_COLORS[index] }));
  const profileCounts = (['early', 'onTime', 'lastMinute', 'late'] as TimingProfile[]).map((key) => ({
    key,
    count: Object.values(timing.students).filter((student) => student.profile === key).length
  }));
  const maxProfile = Math.max(1, ...profileCounts.map((entry) => entry.count));
  return (
    <>
      <section className="grid" style={{ ['--min' as string]: '200px' }}>
        <Kpi label={t('timing.kpiLastMinute')} value={pct(timing.lastMinuteShare)} note={t('timing.kpiLastMinuteNote')} />
        <Kpi label={t('timing.kpiMedian')} value={duration(timing.medianHours)} note={t('timing.kpiMedianNote')} />
        <Kpi label={t('timing.kpiLate')} value={timing.counts[0]} note={t('timing.kpiLateNote', { count: timing.total })} />
      </section>
      <div className="grid" style={{ ['--min' as string]: '380px' }}>
        <Card title={t('timing.title')} sub={t('timing.sub')} aside={<Legend items={segments.map((segment) => [segment.label, segment.color])} />}>
          {timing.assignments.length === 0 ? <p className="muted" style={{ margin: 0 }}>{t('timing.none')}</p> : (
            <StackedRows
              segments={segments}
              rows={timing.assignments.map((assignment) => ({ key: assignment.id, label: assignment.name, values: assignment.counts, title: `${assignment.name} · ${t('timing.median', { time: duration(assignment.medianHours) })}` }))}
            />
          )}
        </Card>
        <Card title={t('timing.students')} sub={t('timing.studentsSub')}>
          <BarList labelWidth={150} rows={profileCounts.map((entry) => ({
            key: entry.key, label: t(`timing.profile.${entry.key}` as MessageKey), value: entry.count, max: maxProfile,
            color: entry.key === 'late' ? 'var(--timing-late)' : entry.key === 'lastMinute' ? 'var(--timing-lastDay)' : entry.key === 'early' ? 'var(--timing-early)' : 'var(--timing-days3to7)'
          }))} />
          <p className="card-foot">{t('timing.foot')}</p>
        </Card>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------

export function SpreadCard({ entry }: { entry: Analysed }) {
  const { t } = useI18n();
  const pass = entry.analysis.passThresholdPct;
  const rows = [...entry.advanced.spread].sort((a, b) => (b.q3 - b.q1) - (a.q3 - a.q1)).slice(0, 12);
  return (
    <Card title={t('spread.title')} sub={t('spread.sub')}>
      {rows.length === 0 ? <p className="muted" style={{ margin: 0 }}>{t('kpi.noGradingYet')}</p> : (
        <>
          <BoxPlots
            title={t('spread.title')}
            passMark={pass}
            passLabel={t('chart.pass', { pct: pass })}
            labelWidth={220}
            rows={rows.map((row) => ({
              key: row.key, label: row.name, min: row.min, q1: row.q1, median: row.median, q3: row.q3, max: row.max,
              tip: <><strong>{row.name}</strong><br />{t('spread.tip', { median: Math.round(row.median), q1: Math.round(row.q1), q3: Math.round(row.q3), count: row.count, below: row.belowPass })}</>
            }))}
          />
          <p className="card-foot">{t('spread.foot')}</p>
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------

export function Quizzes({ entry }: { entry: Analysed }) {
  const { t } = useI18n();
  const quizzes = entry.advanced.quizzes;
  const [quizId, setQuizId] = useState<number | null>(quizzes[0]?.id ?? null);
  const quiz = quizzes.find((item) => item.id === quizId) ?? quizzes[0];
  if (!quiz) {
    return <p className="empty">{entry.analysis.unavailable?.get_quiz_attempt_review ? t('quiz.unavailable') : t('quiz.none')}</p>;
  }
  const flagged = quiz.questions.filter((question) => question.flag === 'negative' || question.flag === 'weak');
  const rows = [...quiz.questions].sort((a, b) => (a.flag ? FLAG_ORDER[a.flag] : 9) - (b.flag ? FLAG_ORDER[b.flag] : 9) || a.slot - b.slot);
  const consistency = quiz.consistency;
  const consistencyNote = consistency === null ? t('quiz.consistencyUnknown') : consistency >= 0.75 ? t('quiz.consistencyGood') : consistency >= 0.5 ? t('quiz.consistencyFair') : t('quiz.consistencyLow');
  const typeName = (type: string) => {
    const key = `qtype.${type}` as MessageKey;
    const text = t(key);
    return text === key ? type : text;
  };
  return (
    <>
      {quizzes.length > 1 && (
        <label className="field" style={{ maxWidth: 420 }}>
          <span>{t('quiz.pick')}</span>
          <select className="select" value={quiz.id} onChange={(event) => setQuizId(Number(event.target.value))}>
            {quizzes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      )}
      <section className="grid" style={{ ['--min' as string]: '200px' }}>
        <Kpi label={t('quiz.attempts')} value={quiz.attempts} note={t('quiz.attemptsNote')} />
        <Kpi label={t('quiz.average')} value={pct(quiz.average)} />
        <Kpi label={t('quiz.consistency')} value={consistency === null ? '—' : consistency.toFixed(2)} note={consistencyNote} />
        <Kpi label={t('quiz.flagged')} value={flagged.length} note={t('quiz.flaggedNote', { count: quiz.questions.length })} />
      </section>
      <div className="grid" style={{ ['--min' as string]: '420px' }}>
        <Card title={t('quiz.map')} sub={t('quiz.mapSub')}>
          {quiz.questions.every((question) => question.discrimination === null || question.facility === null)
            ? <p className="muted" style={{ margin: 0 }}>{t('quiz.fewAttempts')}</p>
            : (
              <ItemScatter
                title={t('quiz.map')}
                labels={{ facility: t('quiz.facility'), discrimination: t('quiz.discrimination'), good: t('quiz.band'), flagged: t('quiz.flaggedLegend'), fine: t('quiz.fine') }}
                points={quiz.questions.filter((question) => question.facility !== null && question.discrimination !== null).map((question) => ({
                  key: String(question.slot),
                  label: question.number,
                  facility: question.facility as number,
                  discrimination: question.discrimination as number,
                  flagged: question.flag === 'negative' || question.flag === 'weak',
                  tip: <><strong>{t('quiz.question', { number: question.number })}</strong>{question.text && <><br />{question.text}</>}<br />{t('quiz.tip', { facility: Math.round(question.facility as number), discrimination: (question.discrimination as number).toFixed(2) })}</>
                }))}
              />
            )}
        </Card>
        <Card title={t('quiz.guide')}>
          <ul className="reasons">
            <li><span className="reason-icon" aria-hidden="true">i</span>{t('quiz.guideFacility')}</li>
            <li><span className="reason-icon" aria-hidden="true">i</span>{t('quiz.guideDiscrimination')}</li>
            <li><span className="reason-icon" aria-hidden="true">i</span>{t('quiz.guideConsistency')}</li>
          </ul>
        </Card>
      </div>
      <Card title={t('quiz.table')}>
        <div className="table-wrap">
          <table style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>{t('quiz.colNumber')}</th>
                <th>{t('quiz.colText')}</th>
                <th>{t('quiz.colType')}</th>
                <th>{t('quiz.facility')}</th>
                <th>{t('quiz.discrimination')}</th>
                <th>{t('quiz.colReview')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((question) => (
                <tr key={question.slot}>
                  <td className="num">{question.number}</td>
                  <td><span className="qtext" title={question.text}>{question.varies ? t('quiz.random') : question.text || '—'}</span></td>
                  <td>{typeName(question.type)}</td>
                  <td className="num">{pct(question.facility)}</td>
                  <td className="num">{question.discrimination === null ? '—' : question.discrimination.toFixed(2)}</td>
                  <td>{question.flag ? <span className={`flag ${question.flag}`}>{question.flag === 'negative' || question.flag === 'weak' ? '▲' : '■'} {t(`quiz.flag.${question.flag}` as MessageKey)}</span> : <span className="muted">{t('quiz.flag.ok')}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="card-foot">{t('quiz.foot')}</p>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------------------------

export function Forums({ entry, onOpenStudent }: { entry: Analysed; onOpenStudent: (id: number) => void }) {
  const { t } = useI18n();
  const duration = useDuration();
  const { analysis, advanced } = entry;
  const network = advanced.network;
  const nodes = useMemo(() => {
    const inGraph = network.nodes.map((node) => ({
      id: node.id,
      label: node.name,
      role: node.role,
      size: node.posts,
      muted: node.sent === 0 && node.received === 0,
      tip: <><strong>{node.name}</strong><br />{t('forums.tip', { posts: node.posts, sent: node.sent, received: node.received })}</>
    }));
    const silent = network.silent.map((id) => {
      const name = analysis.students.find((student) => student.id === id)?.fullname ?? `#${id}`;
      return { id, label: name, role: 'student' as const, size: 0, muted: true, tip: <><strong>{name}</strong><br />{t('forums.silentTip')}</> };
    });
    return [...inGraph, ...silent];
  }, [analysis, network, t]);
  if (network.discussions === 0) return <p className="empty">{t('forums.none')}</p>;
  return (
    <>
      <section className="grid" style={{ ['--min' as string]: '200px' }}>
        <Kpi label={t('forums.discussions')} value={network.discussions} />
        <Kpi label={t('forums.unanswered')} value={network.unanswered} note={t('forums.unansweredNote')} />
        <Kpi label={t('forums.firstReply')} value={duration(network.firstReplyHours)} note={t('forums.firstReplyNote')} />
        <Kpi label={t('forums.teacherShare')} value={pct(network.teacherShare)} note={t('forums.teacherShareNote')} />
      </section>
      <div className="grid" style={{ ['--min' as string]: '420px' }}>
        <Card title={t('forums.network')} sub={t('forums.networkSub')}>
          <NetworkGraph
            title={t('forums.network')}
            nodes={nodes}
            edges={network.edges}
            labels={{ student: t('forums.student'), teacher: t('forums.teacher'), noReplies: t('forums.noReplies') }}
            onSelect={onOpenStudent}
          />
          {(network.teacherShare ?? 0) >= 70 && <p className="card-foot">{t('forums.teacherCentred')}</p>}
        </Card>
        <Card title={t('forums.outside')} sub={t('forums.outsideSub')}>
          <h3 className="card-title" style={{ fontSize: 14 }}>{t('forums.silent', { count: network.silent.length })}</h3>
          <NameList ids={network.silent} entry={entry} onOpenStudent={onOpenStudent} empty={t('forums.nobody')} />
          <h3 className="card-title" style={{ fontSize: 14 }}>{t('forums.isolated', { count: network.isolated.length })}</h3>
          <NameList ids={network.isolated} entry={entry} onOpenStudent={onOpenStudent} empty={t('forums.nobody')} />
        </Card>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------

export function Completion({ entry, onOpenStudent }: { entry: Analysed; onOpenStudent: (id: number) => void }) {
  const { t } = useI18n();
  const { activities, rows, unused } = entry.advanced.completion;
  if (activities.length === 0) return <p className="empty">{t('completion.none')}</p>;
  const labels = { done: t('completion.done'), failed: t('completion.failed'), todo: t('completion.todo') };
  const average = activities.reduce((sum, activity) => sum + activity.rate, 0) / activities.length;
  const columns = `repeat(${activities.length}, minmax(0, 1fr))`;
  const sorted = [...rows].sort((a, b) => a.done - b.done || a.name.localeCompare(b.name));
  return (
    <>
      <section className="grid" style={{ ['--min' as string]: '200px' }}>
        <Kpi label={t('completion.average')} value={pct(average)} note={t('completion.activities', { count: activities.length })} />
        <Kpi label={t('completion.unused')} value={unused} note={t('completion.unusedNote')} />
      </section>
      <Card title={t('completion.matrix')} sub={t('completion.matrixSub')} aside={<Legend items={[[labels.done, 'var(--series-3)'], [labels.failed, 'var(--series-2)'], [labels.todo, '#E6EAEE']]} />}>
        <div className="heatmap" role="img" aria-label={t('completion.matrixAria', { students: rows.length, activities: activities.length })} style={{ ['--cells-min' as string]: `${activities.length * 10}px` }}>
          <div className="heat-row">
            <span className="heat-name muted" style={{ cursor: 'default' }}>{t('completion.rate')}</span>
            <div className="col-rates" style={{ gridTemplateColumns: columns }}>
              {activities.map((activity) => (
                <span key={activity.cmid} className={activity.rate < 20 ? 'low' : undefined} title={`${activity.name}: ${Math.round(activity.rate)}%`}><i style={{ height: `${Math.max(2, activity.rate)}%` }} /></span>
              ))}
            </div>
            <span className="heat-count">{pct(average)}</span>
          </div>
          {sorted.map((row) => (
            <div key={row.id} className="heat-row">
              <button type="button" className="heat-name" onClick={() => onOpenStudent(row.id)}>{row.name}</button>
              <div className="heat-cells" style={{ gridTemplateColumns: columns }}>
                {row.cells.map((cell, index) => <span key={activities[index].cmid} className={`heat-cell ${cell}`} title={`${row.name} · ${activities[index].name}: ${labels[cell]}`} />)}
              </div>
              <span className="heat-count">{row.done}/{activities.length}</span>
            </div>
          ))}
        </div>
        {unused > 0 && <p className="card-foot">{t('completion.lowList', { names: activities.filter((activity) => activity.rate < 20).slice(0, 4).map((activity) => `«${activity.name}»`).join(', ') })}</p>}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------------------------

export function AccessCard({ entry }: { entry: Analysed }) {
  const { t } = useI18n();
  const access = entry.advanced.access;
  const bucketLabel = (index: number) => {
    if (index === ACCESS_BUCKETS.length) return t('access.never');
    const [low, high] = ACCESS_BUCKETS[index];
    return high >= 998 ? t('accessDist.over', { days: low - 1 }) : t('accessDist.range', { from: low, to: high });
  };
  const colors = ['var(--timing-early)', 'var(--timing-early)', 'var(--timing-days3to7)', 'var(--timing-days1to3)', 'var(--timing-lastDay)', 'var(--timing-late)', 'var(--timing-late)'];
  return (
    <div className="grid" style={{ ['--min' as string]: '420px' }}>
      <Card title={t('accessDist.title')} sub={t('accessDist.sub', { days: access.medianDays ?? '—' })}>
        <Columns
          title={t('accessDist.title')}
          bars={access.counts.map((value, index) => ({ key: String(index), label: bucketLabel(index), value, color: colors[index], tip: <><strong>{bucketLabel(index)}</strong>: {t('chart.studentsCount', { count: value })}</> }))}
        />
      </Card>
      <Card title={t('accessDist.curve')} sub={t('accessDist.curveSub')}>
        <WeeklyLines
          title={t('accessDist.curve')}
          weeks={access.curve.map((_, day) => String(day))}
          series={[{ key: 'active', label: t('accessDist.active'), color: 'var(--series-1)', values: access.curve.map((value) => Math.round(value)) }]}
          weekLabel={(day) => t('accessDist.withinDays', { days: day })}
          maxValue={100}
          format={(value) => `${value}%`}
        />
        <p className="card-foot">{t('accessDist.curveFoot', { week: Math.round(access.curve[7] ?? 0) })}</p>
      </Card>
    </div>
  );
}

export function WorkloadCard({ entry }: { entry: Analysed }) {
  const { t, date } = useI18n();
  const workload = entry.advanced.workload;
  if (!workload) {
    return (
      <Card title={t('workload.title')}>
        <p className="muted" style={{ margin: 0 }}>{entry.analysis.unavailable?.get_user_courses ? t('workload.unavailable') : t('workload.none')}</p>
      </Card>
    );
  }
  const current = weekStart(Math.floor(Date.now() / 1000));
  const short = (seconds: number) => date(seconds).replace(/\s?\d{4}$/, '');
  return (
    <Card title={t('workload.title')} sub={t('workload.sub', { count: OVERLOAD })}>
      <Columns
        title={t('workload.title')}
        highlight={WORKLOAD_PAST_WEEKS}
        bars={workload.weeks.map((week, index) => ({
          key: String(week),
          label: short(week),
          value: workload.overloaded[index],
          color: week < current ? 'var(--timing-days1to3)' : 'var(--series-2)',
          tip: <><strong>{t('chart.weekOf', { date: date(week) })}</strong><br />{t('workload.tip', { count: workload.overloaded[index], average: workload.average[index].toFixed(1) })}</>
        }))}
      />
      <p className="card-foot">{t('workload.foot', { covered: workload.covered, courses: workload.courses })}</p>
    </Card>
  );
}
