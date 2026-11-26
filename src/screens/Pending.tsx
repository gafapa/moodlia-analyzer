// The teacher's panel: pending work across the courses in progress they teach, in tabs. "Today"
// shows the most urgent items and the overall picture; the other tabs group the work by what
// it is (grading, students, calendar, forums, courses). Each item opens its Moodle page in the
// default browser.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { analyzer, type CourseSummary, type SiteSummary } from '../bridge';
import type { Analysed } from '../App';
import { mostUrgent, teacherTodo, teaches, type TodoItem, type TodoKind } from '../analysis/todo';
import { BACKLOG_BUCKETS, CALENDAR_DAYS, teacherOverview, type CalendarEvent } from '../analysis/teacher';
import { Columns, WeeklyLines } from '../charts/Charts';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n/en';
import { BarList, Card, Icon, Kpi, LanguageSelect, Legend, StackedRows, pct } from '../ui';

const RECENT_DAYS = 60;
type PanelTab = 'today' | 'grading' | 'students' | 'calendar' | 'forums' | 'courses';
const PANEL_TABS: PanelTab[] = ['today', 'grading', 'students', 'calendar', 'forums', 'courses'];

const KIND_COLOR: Record<TodoKind, string> = {
  grade: 'var(--series-2)',
  manualGrading: 'var(--series-2)',
  forum: 'var(--series-1)',
  contact: 'var(--risk-high)',
  deadline: 'var(--risk-medium)',
  quizClosing: 'var(--risk-medium)',
  overdue: 'var(--timing-late)',
  drafts: 'var(--series-1)',
  questions: '#8A96A3'
};
const AGE_COLORS = ['#F3C29F', 'var(--series-2)', 'var(--timing-late)'];
const RISK_COLORS = ['var(--risk-high)', 'var(--risk-medium)', 'var(--risk-low)'];

/** Courses in progress the teacher entered recently; all courses in progress if none. */
export function defaultPendingCourses(courses: CourseSummary[], now = Math.floor(Date.now() / 1000)): number[] {
  const current = courses.filter((course) => course.endDate === null || course.endDate >= now);
  const recent = current.filter((course) => (course.lastAccess ?? 0) >= now - RECENT_DAYS * 86400);
  return (recent.length ? recent : current).map((course) => course.id);
}

function storageKey(site: SiteSummary) {
  return `moodlia-analyzer.pending.${site.siteUrl}`;
}

function loadSelection(site: SiteSummary, courses: CourseSummary[]): number[] {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey(site)) ?? 'null');
    if (Array.isArray(stored)) {
      const known = new Set(courses.map((course) => course.id));
      const ids = stored.filter((id): id is number => typeof id === 'number' && known.has(id));
      if (ids.length) return ids;
    }
  } catch {
    // Without storage the default selection is used.
  }
  return defaultPendingCourses(courses);
}

export function Pending({ site, courses, analysed, progress, errors, collect, onOpenCourse, onCourses, onSwitchSite }: {
  site: SiteSummary;
  courses: CourseSummary[];
  analysed: Record<number, Analysed>;
  progress: Record<number, { message: string; percent: number }>;
  errors: Record<number, string>;
  collect: (course: CourseSummary, force?: boolean) => Promise<void>;
  onOpenCourse: (course: CourseSummary) => void;
  onCourses: () => void;
  onSwitchSite: () => void;
}) {
  const { t, error: errorText } = useI18n();
  const [selected, setSelected] = useState<number[]>(() => loadSelection(site, courses));
  const [choosing, setChoosing] = useState(false);
  const [running, setRunning] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<PanelTab>('today');
  const [day, setDay] = useState(0);
  const queue = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(site), JSON.stringify(selected));
    } catch {
      // The selection lasts until the app closes.
    }
  }, [site, selected]);

  // The loop below reads the latest selection and results, not the ones of the render that started it.
  const latest = useRef({ selected, analysed, errors });
  latest.current = { selected, analysed, errors };

  // Analyses the selected courses that are not analysed yet, one at a time. Courses added
  // while it runs are picked up before it stops.
  const run = async (force = false) => {
    if (queue.current) return;
    queue.current = true;
    const done = new Set<number>();
    for (;;) {
      const now = latest.current;
      const id = now.selected.find((entry) => !done.has(entry) && (force || (!now.analysed[entry] && !now.errors[entry])));
      if (id === undefined) break;
      done.add(id);
      const course = courses.find((entry) => entry.id === id);
      if (!course) continue;
      setRunning(id);
      await collect(course, force);
    }
    setRunning(null);
    queue.current = false;
  };
  useEffect(() => { void run(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selected]);

  const chosen = courses.filter((course) => selected.includes(course.id));
  const ready = chosen.filter((course) => analysed[course.id]);
  const taught = ready.filter((course) => teaches(analysed[course.id].analysis));
  const notTeaching = ready.filter((course) => !teaches(analysed[course.id].analysis));
  const waiting = chosen.length - ready.length - chosen.filter((course) => errors[course.id]).length;
  const todo = useMemo(
    () => teacherTodo(taught.map((course) => ({ analysis: analysed[course.id].analysis, name: course.fullName }))),
    [taught, analysed]
  );
  const overview = useMemo(
    () => teacherOverview(taught.map((course) => ({ id: course.id, name: course.fullName, analysis: analysed[course.id].analysis, insights: analysed[course.id].insights }))),
    [taught, analysed]
  );
  const count = (kind: TodoKind) => todo[kind].filter((item) => item.reason !== 'more').length;
  const total = (Object.keys(todo) as TodoKind[]).reduce((sum, kind) => sum + count(kind), 0);

  const open = async (path: string) => {
    setNotice('');
    const result = await analyzer().session.open(path);
    if (!result.ok) setNotice(errorText(result.error));
  };
  const openCourse = (id: number) => {
    const course = courses.find((entry) => entry.id === id);
    if (course) onOpenCourse(course);
  };
  const toggle = (id: number) => setSelected((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  const currentCourses = courses.filter((course) => course.endDate === null || course.endDate >= Math.floor(Date.now() / 1000));
  const tabCount: Record<PanelTab, number> = {
    today: 0,
    grading: count('grade') + count('manualGrading'),
    students: count('contact') + count('overdue') + count('drafts') + overview.crossCourse.length,
    calendar: count('deadline') + count('quizClosing'),
    forums: count('forum'),
    courses: count('questions')
  };
  const list = (kinds: TodoKind[]) => kinds.filter((kind) => todo[kind].length > 0).map((kind) => (
    <TodoCard key={kind} kind={kind} items={todo[kind]} onOpen={(item) => void open(item.path)} onCourse={openCourse} />
  ));

  return (
    <div className="page">
      <div className="page-inner">
        <header className="page-header" style={{ alignItems: 'center' }}>
          <div className="brand" style={{ padding: 0 }}>
            <span className="brand-mark"><Icon name="cap" /></span>
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="brand-name">{site.siteName}</span>
              <span className="brand-sub">{t('nav.readOnly')}</span>
            </span>
          </div>
          <div className="actions">
            <button type="button" className="btn" onClick={onCourses}><Icon name="book" size={16} />{t('nav.courses')}</button>
            <button type="button" className="btn" onClick={() => void run(true)} disabled={running !== null}><Icon name="refresh" size={16} />{t('todo.refresh')}</button>
            <button type="button" className="btn" onClick={onSwitchSite}>{t('courses.switchSite')}</button>
            <LanguageSelect />
          </div>
        </header>

        <section className="page-header" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1 className="page-title">{t('todo.title')}</h1>
            <p className="page-sub">{ready.length ? t('todo.sub', { count: total, courses: taught.length }) : t('todo.subEmpty')}</p>
          </div>
          <button type="button" className="btn" aria-expanded={choosing} onClick={() => setChoosing(!choosing)}>{t('todo.courses', { count: chosen.length })}</button>
        </section>

        {choosing && (
          <section className="card" aria-label={t('todo.choose')}>
            <p className="card-sub" style={{ margin: 0 }}>{t('todo.chooseSub')}</p>
            <div className="chips">
              {currentCourses.map((course) => (
                <button key={course.id} type="button" className="chip" aria-pressed={selected.includes(course.id)} onClick={() => toggle(course.id)}>{course.fullName}</button>
              ))}
            </div>
          </section>
        )}

        {waiting > 0 && (
          <div className="card" aria-live="polite">
            <span className="card-title">{t('todo.reading', { done: ready.length, total: chosen.length })}</span>
            <progress max={100} value={running !== null ? progress[running]?.percent ?? 0 : 0} style={{ width: '100%' }} />
            <span className="muted">{running !== null ? courses.find((course) => course.id === running)?.fullName : ''}</span>
          </div>
        )}
        {notice && <p className="alert" role="alert" style={{ margin: 0 }}>{notice}</p>}
        {chosen.filter((course) => errors[course.id]).map((course) => (
          <p key={course.id} className="alert" style={{ margin: 0 }}>{course.fullName}: {errors[course.id]}</p>
        ))}

        {taught.length > 0 && (
          <>
            <div className="tabs" role="tablist" aria-label={t('todo.title')}>
              {PANEL_TABS.map((id) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} className="tab" onClick={() => setTab(id)}>
                  {t(`panel.tab.${id}` as MessageKey)}{tabCount[id] > 0 && <span className="tab-count">{tabCount[id]}</span>}
                </button>
              ))}
            </div>
            <p className="tab-intro">{t(`panel.tab.${tab}.intro` as MessageKey)}</p>

            {tab === 'today' && (
              <>
                <section className="grid" style={{ ['--min' as string]: '170px' }}>
                  <Kpi label={t('panel.kpi.toGrade')} value={count('grade') ? todo.grade.reduce((sum, item) => sum + item.values.count, 0) : 0} note={count('grade') ? t('panel.kpi.oldest', { days: Math.max(...todo.grade.map((item) => item.values.days)) }) : t('panel.kpi.upToDate')} />
                  <Kpi label={t('todo.contact')} value={count('contact')} />
                  <Kpi label={t('todo.forum')} value={count('forum')} />
                  <Kpi label={t('panel.kpi.due')} value={count('deadline') + count('quizClosing')} note={t('panel.kpi.dueNote')} />
                </section>
                <Card title={t('panel.urgent')} sub={t('panel.urgentSub')}>
                  {total === 0 ? <p className="muted" style={{ margin: 0 }}>{t('todo.none')}</p> : (
                    <TodoRows items={mostUrgent(todo)} showKind onOpen={(item) => void open(item.path)} onCourse={openCourse} />
                  )}
                </Card>
                <div className="grid" style={{ ['--min' as string]: '420px' }}>
                  <Backlog overview={overview} />
                  <Card title={t('panel.next')} sub={t('panel.nextSub', { days: CALENDAR_DAYS })}>
                    <DayStrip overview={overview} selected={null} onSelect={(index) => { setDay(index); setTab('calendar'); }} />
                  </Card>
                </div>
                <Card title={t('panel.activity')} sub={t('panel.activitySub')}>
                  <ActivityLines overview={overview} />
                </Card>
              </>
            )}

            {tab === 'grading' && (
              <>
                <div className="grid" style={{ ['--min' as string]: '420px' }}>
                  <Card title={t('panel.throughput')} sub={t('panel.throughputSub')}>
                    <Throughput overview={overview} />
                  </Card>
                  <Backlog overview={overview} />
                </div>
                <div className="grid" style={{ ['--min' as string]: '420px' }}>
                  <Card title={t('panel.turnaround')} sub={t('panel.turnaroundSub')}>
                    <BarList labelWidth={200} rows={overview.courses.filter((course) => course.medianGradingDays !== null).map((course) => ({
                      key: course.id, label: course.name, title: course.name, value: course.medianGradingDays ?? 0,
                      max: Math.max(14, ...overview.courses.map((entry) => entry.medianGradingDays ?? 0)),
                      text: t('unit.daysShort', { count: course.medianGradingDays ?? 0 }),
                      color: (course.medianGradingDays ?? 0) > 14 ? 'var(--timing-late)' : (course.medianGradingDays ?? 0) > 7 ? 'var(--series-2)' : 'var(--series-3)'
                    }))} />
                    <p className="card-foot">{t('panel.turnaroundFoot')}</p>
                  </Card>
                  <Card title={t('panel.feedback')} sub={t('panel.feedbackSub')}>
                    <BarList labelWidth={200} rows={overview.courses.filter((course) => course.feedbackRate !== null).map((course) => ({
                      key: course.id, label: course.name, title: course.name, value: course.feedbackRate ?? 0, max: 100, text: pct(course.feedbackRate),
                      color: 'var(--series-1)'
                    }))} />
                  </Card>
                </div>
                {list(['grade', 'manualGrading'])}
                {tabCount.grading === 0 && <p className="empty">{t('panel.gradingNone')}</p>}
              </>
            )}

            {tab === 'students' && (
              <>
                <div className="grid" style={{ ['--min' as string]: '420px' }}>
                  <Card title={t('panel.riskByCourse')} sub={t('panel.riskByCourseSub')} aside={<Legend items={[[t('risk.high'), RISK_COLORS[0]], [t('risk.medium'), RISK_COLORS[1]], [t('risk.low'), RISK_COLORS[2]]]} />}>
                    <StackedRows segments={[{ label: t('risk.high'), color: RISK_COLORS[0] }, { label: t('risk.medium'), color: RISK_COLORS[1] }, { label: t('risk.low'), color: RISK_COLORS[2] }]}
                      rows={overview.courses.map((course) => ({ key: course.id, label: course.name, values: [course.risk.high, course.risk.medium, course.risk.low] }))} />
                  </Card>
                  <Card title={t('panel.crossCourse')} sub={t('panel.crossCourseSub')}>
                    {overview.crossCourse.length === 0 ? <p className="muted" style={{ margin: 0 }}>{t('panel.crossCourseNone')}</p> : (
                      <ul className="todo-list">
                        {overview.crossCourse.slice(0, 10).map((student) => (
                          <li key={student.id} className="todo-item">
                            <span className="dot" style={{ background: student.courses.some((course) => course.risk === 'high') ? 'var(--risk-high)' : 'var(--risk-medium)' }} aria-hidden="true" />
                            <span className="todo-text">
                              <span className="todo-title">{student.name}</span>
                              <span className="todo-detail">{student.courses.map((course) => `${course.name} (${t(`risk.${course.risk}` as MessageKey).toLocaleLowerCase()})`).join(' · ')}</span>
                            </span>
                            <button type="button" className="btn btn-soft todo-open" onClick={() => void open(`/user/profile.php?id=${student.id}`)}>{t('todo.contact.action')}<span aria-hidden="true"> ↗</span></button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </div>
                {list(['contact', 'overdue', 'drafts'])}
              </>
            )}

            {tab === 'calendar' && (
              <>
                <Card title={t('panel.next')} sub={t('panel.calendarSub')}>
                  <DayStrip overview={overview} selected={day} onSelect={setDay} />
                  <DayEvents events={overview.calendar[day]?.events ?? []} onOpen={(event) => void open(event.path)} onCourse={openCourse} />
                </Card>
                {list(['deadline', 'quizClosing'])}
              </>
            )}

            {tab === 'forums' && (
              <>
                <Card title={t('panel.posts')} sub={t('panel.postsSub')}>
                  <Columns title={t('panel.posts')} bars={overview.activity.days.map((dayStart, index) => ({
                    key: String(dayStart), label: shortDay(dayStart), value: overview.activity.posts[index], color: 'var(--series-1)'
                  }))} />
                </Card>
                {list(['forum'])}
                {count('forum') === 0 && <p className="empty">{t('panel.forumsNone')}</p>}
              </>
            )}

            {tab === 'courses' && (
              <>
                <CourseTable overview={overview} onCourse={openCourse} />
                <Card title={t('panel.active')} sub={t('panel.activeSub')}>
                  <BarList labelWidth={200} rows={overview.courses.map((course) => ({
                    key: course.id, label: course.name, title: course.name, value: course.activeWeek ?? 0, max: 100, text: pct(course.activeWeek),
                    color: (course.activeWeek ?? 0) < 50 ? 'var(--series-2)' : 'var(--series-3)'
                  }))} />
                </Card>
                {list(['questions'])}
              </>
            )}
          </>
        )}

        {ready.length > 0 && taught.length === 0 && waiting === 0 && <p className="empty">{t('todo.none')}</p>}
        {notTeaching.length > 0 && <p className="fine">{t('todo.notTeaching', { names: notTeaching.map((course) => course.fullName).join(', ') })}</p>}
        <p className="fine">{t('todo.foot')}</p>
      </div>
    </div>
  );
}

function shortDay(seconds: number) {
  return new Date(seconds * 1000).getDate().toString();
}

function useItemText() {
  const { t, date } = useI18n();
  return {
    detail: (item: TodoItem) => {
      if (item.kind === 'contact') return item.reason === 'more' ? '' : t(`todo.contact.${item.reason}` as MessageKey, item.values);
      if (item.kind === 'deadline' || item.kind === 'quizClosing') return t(`todo.${item.kind}.detail` as MessageKey, { ...item.values, date: date(item.values.due) });
      if (item.kind === 'drafts') return t(item.values.past ? 'todo.drafts.detailPast' : 'todo.drafts.detail', item.values);
      return t(`todo.${item.kind}.detail` as MessageKey, item.values);
    },
    title: (item: TodoItem) => (item.reason === 'more' ? t('todo.contact.more', item.values) : item.title || t('todo.untitled'))
  };
}

function TodoRows({ items, showKind = false, onOpen, onCourse }: { items: TodoItem[]; showKind?: boolean; onOpen: (item: TodoItem) => void; onCourse: (id: number) => void }) {
  const { t } = useI18n();
  const text = useItemText();
  return (
    <ul className="todo-list">
      {items.map((item, index) => (
        <li key={`${item.courseId}-${item.kind}-${item.path}-${index}`} className="todo-item">
          <span className="dot" style={{ background: KIND_COLOR[item.kind] }} aria-hidden="true" />
          <span className="todo-text">
            <span className="todo-title">{showKind && <span className="todo-kind">{t(`todo.${item.kind}` as MessageKey)}</span>}{text.title(item)}</span>
            <span className="todo-detail">
              <button type="button" className="btn-link todo-course" onClick={() => onCourse(item.courseId)}>{item.courseName}</button>
              {text.detail(item) && <> · {text.detail(item)}</>}
            </span>
          </span>
          <button type="button" className="btn btn-soft todo-open" onClick={() => onOpen(item)}>
            {t(`todo.${item.kind}.action` as MessageKey)}<span aria-hidden="true"> ↗</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

const LIST_PREVIEW = 8;

function TodoCard({ kind, items, onOpen, onCourse }: { kind: TodoKind; items: TodoItem[]; onOpen: (item: TodoItem) => void; onCourse: (id: number) => void }) {
  const { t } = useI18n();
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, LIST_PREVIEW);
  return (
    <Card title={`${t(`todo.${kind}` as MessageKey)} · ${items.filter((item) => item.reason !== 'more').length}`} sub={t(`todo.${kind}.sub` as MessageKey)}>
      <TodoRows items={shown} onOpen={onOpen} onCourse={onCourse} />
      {items.length > LIST_PREVIEW && (
        <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? t('panel.showLess') : t('panel.showAll', { count: items.length })}
        </button>
      )}
    </Card>
  );
}

function Backlog({ overview }: { overview: ReturnType<typeof teacherOverview> }) {
  const { t } = useI18n();
  const segments = [
    { label: t('panel.age.recent', { days: BACKLOG_BUCKETS[0] }), color: AGE_COLORS[0] },
    { label: t('panel.age.middle', { from: BACKLOG_BUCKETS[0], to: BACKLOG_BUCKETS[1] }), color: AGE_COLORS[1] },
    { label: t('panel.age.old', { days: BACKLOG_BUCKETS[1] }), color: AGE_COLORS[2] }
  ];
  return (
    <Card title={t('panel.backlog')} sub={t('panel.backlogSub')} aside={<Legend items={segments.map((segment) => [segment.label, segment.color])} />}>
      {overview.backlog.length === 0 ? <p className="muted" style={{ margin: 0 }}>{t('panel.kpi.upToDate')}</p> : (
        <StackedRows labelWidth={180} segments={segments} rows={overview.backlog.map((course) => ({ key: course.id, label: course.name, values: course.counts }))} />
      )}
    </Card>
  );
}

function Throughput({ overview }: { overview: ReturnType<typeof teacherOverview> }) {
  const { t, date } = useI18n();
  const { weeks, received, graded } = overview.throughput;
  return (
    <WeeklyLines
      title={t('panel.throughput')}
      weeks={weeks.map((week) => date(week).replace(/\s?\d{4}$/, ''))}
      series={[
        { key: 'received', label: t('panel.received'), color: 'var(--series-2)', values: received },
        { key: 'graded', label: t('panel.graded'), color: 'var(--series-1)', values: graded }
      ]}
      weekLabel={(index) => t('chart.weekOf', { date: date(weeks[index]) })}
    />
  );
}

function ActivityLines({ overview }: { overview: ReturnType<typeof teacherOverview> }) {
  const { t, date } = useI18n();
  const { days, submissions, posts, attempts } = overview.activity;
  return (
    <WeeklyLines
      title={t('panel.activity')}
      weeks={days.map((day) => date(day).replace(/\s?\d{4}$/, ''))}
      series={[
        { key: 'submissions', label: t('chart.submissions'), color: 'var(--series-1)', values: submissions },
        { key: 'attempts', label: t('chart.quizAttempts'), color: 'var(--series-2)', values: attempts },
        { key: 'posts', label: t('chart.forumPosts'), color: 'var(--series-3)', values: posts }
      ]}
      weekLabel={(index) => date(days[index])}
    />
  );
}

/** Two weeks of days with the number of deadlines in each; a day opens its list. */
function DayStrip({ overview, selected, onSelect }: { overview: ReturnType<typeof teacherOverview>; selected: number | null; onSelect: (index: number) => void }) {
  const { t, weekdays } = useI18n();
  const names = weekdays();
  const max = Math.max(1, ...overview.calendar.map((entry) => entry.events.length));
  return (
    <div className="day-strip" role="group" aria-label={t('panel.next')}>
      {overview.calendar.map((entry, index) => {
        const date = new Date(entry.day * 1000);
        const events = entry.events.length;
        const missing = entry.events.reduce((sum, event) => sum + event.missing, 0);
        const level = events === 0 ? 0 : Math.min(4, 1 + Math.floor((events / max) * 3.999));
        return (
          <button
            key={entry.day}
            type="button"
            className={`day level-${level}${selected === index ? ' selected' : ''}${date.getDay() === 0 || date.getDay() === 6 ? ' weekend' : ''}`}
            aria-pressed={selected === index}
            title={t('panel.dayTip', { count: events, missing })}
            onClick={() => onSelect(index)}
          >
            <span className="day-name">{names[(date.getDay() + 6) % 7]}</span>
            <span className="day-number">{date.getDate()}</span>
            <span className="day-count">{events || ''}</span>
          </button>
        );
      })}
    </div>
  );
}

function DayEvents({ events, onOpen, onCourse }: { events: CalendarEvent[]; onOpen: (event: CalendarEvent) => void; onCourse: (id: number) => void }) {
  const { t, dateTime } = useI18n();
  if (events.length === 0) return <p className="muted" style={{ margin: 0 }}>{t('panel.dayNone')}</p>;
  return (
    <ul className="todo-list">
      {events.map((event, index) => (
        <li key={`${event.path}-${index}`} className="todo-item">
          <span className="dot" style={{ background: event.kind === 'quiz' ? 'var(--series-2)' : 'var(--series-1)' }} aria-hidden="true" />
          <span className="todo-text">
            <span className="todo-title"><span className="todo-kind">{t(`deadlines.kind.${event.kind}` as MessageKey)}</span>{event.name}</span>
            <span className="todo-detail">
              <button type="button" className="btn-link todo-course" onClick={() => onCourse(event.courseId)}>{event.courseName}</button>
              {' · '}{dateTime(event.due)}{' · '}{t('panel.eventMissing', { missing: event.missing, students: event.students })}
            </span>
          </span>
          <button type="button" className="btn btn-soft todo-open" onClick={() => onOpen(event)}>{t('todo.deadline.action')}<span aria-hidden="true"> ↗</span></button>
        </li>
      ))}
    </ul>
  );
}

function CourseTable({ overview, onCourse }: { overview: ReturnType<typeof teacherOverview>; onCourse: (id: number) => void }) {
  const { t } = useI18n();
  const cell = (value: ReactNode, warn = false) => <td className="num" style={warn ? { color: 'var(--risk-high-ink)', fontWeight: 600 } : undefined}>{value}</td>;
  return (
    <Card title={t('panel.health')} sub={t('panel.healthSub')}>
      <div className="table-wrap">
        <table style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th>{t('panel.col.course')}</th>
              <th>{t('kpi.students')}</th>
              <th>{t('panel.col.risk')}</th>
              <th>{t('kpi.submitted')}</th>
              <th>{t('kpi.avgGrade')}</th>
              <th>{t('kpi.toGrade')}</th>
              <th>{t('panel.col.gradingDays')}</th>
              <th>{t('panel.col.active')}</th>
            </tr>
          </thead>
          <tbody>
            {overview.courses.map((course) => (
              <tr key={course.id}>
                <td><button type="button" className="btn-link" style={{ whiteSpace: 'normal', textAlign: 'left' }} onClick={() => onCourse(course.id)}>{course.name}</button></td>
                {cell(course.students)}
                <td><span className="pill high">{course.risk.high}</span> <span className="pill medium">{course.risk.medium}</span></td>
                {cell(pct(course.submissionRate), (course.submissionRate ?? 100) < 60)}
                {cell(pct(course.avgGrade), (course.avgGrade ?? 100) < 50)}
                {cell(course.toGrade, course.toGrade > 20)}
                {cell(course.medianGradingDays === null ? '—' : t('unit.days', { count: course.medianGradingDays }), (course.medianGradingDays ?? 0) > 14)}
                {cell(pct(course.activeWeek), (course.activeWeek ?? 100) < 50)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="card-foot">{t('panel.healthFoot')}</p>
    </Card>
  );
}
