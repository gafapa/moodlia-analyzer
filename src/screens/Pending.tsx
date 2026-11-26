// The teacher's pending work across the courses in progress, on one screen. Each item opens the
// Moodle page where it is dealt with, in the default browser.
import { useEffect, useMemo, useRef, useState } from 'react';
import { analyzer, type CourseSummary, type SiteSummary } from '../bridge';
import type { Analysed } from '../App';
import { TODO_KINDS, teacherTodo, teaches, type TodoItem, type TodoKind } from '../analysis/todo';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n/en';
import { Icon, LanguageSelect } from '../ui';

const RECENT_DAYS = 60;
const KIND_COLOR: Record<TodoKind, string> = {
  grade: 'var(--series-2)',
  manualGrading: 'var(--series-2)',
  forum: 'var(--series-1)',
  contact: 'var(--risk-high)',
  deadline: 'var(--risk-medium)',
  questions: '#8A96A3'
};

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
  const { t, error: errorText, date } = useI18n();
  const [selected, setSelected] = useState<number[]>(() => loadSelection(site, courses));
  const [choosing, setChoosing] = useState(false);
  const [running, setRunning] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
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
  const todo = useMemo(
    () => teacherTodo(ready.map((course) => ({ analysis: analysed[course.id].analysis, name: course.fullName }))),
    [ready, analysed]
  );
  const total = TODO_KINDS.reduce((sum, kind) => sum + todo[kind].filter((item) => item.reason !== 'more').length, 0);
  const notTeaching = ready.filter((course) => !teaches(analysed[course.id].analysis));
  const waiting = chosen.length - ready.length - chosen.filter((course) => errors[course.id]).length;

  const open = async (item: TodoItem) => {
    setNotice('');
    const result = await analyzer().session.open(item.path);
    if (!result.ok) setNotice(errorText(result.error));
  };
  const toggle = (id: number) => setSelected((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  const detail = (item: TodoItem) => {
    if (item.kind === 'contact') return item.reason === 'more' ? '' : t(`todo.contact.${item.reason}` as MessageKey, item.values);
    if (item.kind === 'deadline') return t('todo.deadline.detail', { ...item.values, date: date(item.values.due) });
    return t(`todo.${item.kind}.detail` as MessageKey, item.values);
  };
  const title = (item: TodoItem) => (item.reason === 'more' ? t('todo.contact.more', item.values) : item.title || t('todo.untitled'));
  const currentCourses = courses.filter((course) => course.endDate === null || course.endDate >= Math.floor(Date.now() / 1000));

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
            <p className="page-sub">{ready.length ? t('todo.sub', { count: total, courses: ready.length - notTeaching.length }) : t('todo.subEmpty')}</p>
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

        {ready.length > 0 && (
          <section className="grid" style={{ ['--min' as string]: '150px' }} aria-label={t('todo.title')}>
            {TODO_KINDS.map((kind) => (
              <a key={kind} className="kpi todo-kpi" href={`#todo-${kind}`}>
                <span className="kpi-label"><span className="dot" style={{ background: KIND_COLOR[kind] }} aria-hidden="true" />{t(`todo.${kind}` as MessageKey)}</span>
                <span className="kpi-value">{todo[kind].filter((item) => item.reason !== 'more').length}</span>
              </a>
            ))}
          </section>
        )}

        {ready.length > 0 && total === 0 && waiting === 0 && <p className="empty">{t('todo.none')}</p>}

        {TODO_KINDS.filter((kind) => todo[kind].length > 0).map((kind) => (
          <section key={kind} id={`todo-${kind}`} className="card" aria-labelledby={`todo-${kind}-title`}>
            <div className="card-head">
              <div>
                <h2 className="card-title" id={`todo-${kind}-title`}>{t(`todo.${kind}` as MessageKey)}</h2>
                <p className="card-sub" style={{ margin: '4px 0 0' }}>{t(`todo.${kind}.sub` as MessageKey)}</p>
              </div>
            </div>
            <ul className="todo-list">
              {todo[kind].map((item, index) => (
                <li key={`${item.courseId}-${item.path}-${index}`} className="todo-item">
                  <span className="dot" style={{ background: KIND_COLOR[kind] }} aria-hidden="true" />
                  <span className="todo-text">
                    <span className="todo-title">{title(item)}</span>
                    <span className="todo-detail">
                      <button type="button" className="btn-link todo-course" onClick={() => { const course = courses.find((entry) => entry.id === item.courseId); if (course) onOpenCourse(course); }}>{item.courseName}</button>
                      {detail(item) && <> · {detail(item)}</>}
                    </span>
                  </span>
                  <button type="button" className="btn btn-soft todo-open" onClick={() => void open(item)}>
                    {t(`todo.${kind}.action` as MessageKey)}<span aria-hidden="true"> ↗</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {notTeaching.length > 0 && <p className="fine">{t('todo.notTeaching', { names: notTeaching.map((course) => course.fullName).join(', ') })}</p>}
        <p className="fine">{t('todo.foot')}</p>
      </div>
    </div>
  );
}
