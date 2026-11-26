// The app's screens and the state they share: the saved sites, the connected site, its courses,
// and the analyses collected in this session.
import { useCallback, useEffect, useRef, useState } from 'react';
import { analyzer, type CourseSummary, type ProfileSummary, type Result, type SiteSummary } from './bridge';
import { CourseAnalyzer } from './analysis/courseAnalyzer';
import { advancedInsights, riskFlow, type AdvancedInsights, type RiskFlow } from './analysis/advanced';
import { courseInsights, type CourseInsights } from './analysis/insights';
import type { CourseAnalysis } from './analysis/types';
import { useI18n } from './i18n';
import { Course, type Tab } from './screens/Course';
import { Courses } from './screens/Courses';
import { Pending } from './screens/Pending';
import { SignIn } from './screens/SignIn';
import { Student } from './screens/Student';

const PASS_THRESHOLD_PCT = 50;

export interface Analysed {
  analysis: CourseAnalysis;
  insights: CourseInsights;
  advanced: AdvancedInsights;
  /** Changes of risk level since the previous analysis on another day. */
  flow: RiskFlow | null;
  collectedAt: string;
}

type View =
  | { name: 'signin' }
  | { name: 'pending' }
  | { name: 'courses' }
  | { name: 'course'; course: CourseSummary; tab: Tab }
  | { name: 'student'; course: CourseSummary; tab: Tab; studentId: number };

export function App() {
  const { t, error: errorText } = useI18n();
  const [view, setView] = useState<View>({ name: 'signin' });
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [site, setSite] = useState<SiteSummary | null>(null);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [analysed, setAnalysed] = useState<Record<number, Analysed>>({});
  const [progress, setProgress] = useState<Record<number, { message: string; percent: number }>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const collecting = useRef(new Set<number>());

  const refreshProfiles = useCallback(async () => {
    const result = await analyzer().profiles.list();
    if (result.ok) setProfiles(result.value);
  }, []);

  useEffect(() => { void refreshProfiles(); }, [refreshProfiles]);
  useEffect(() => analyzer().analysis.onProgress((update) => {
    setProgress((current) => ({ ...current, [update.courseId]: { message: update.message, percent: update.percent } }));
  }), []);

  const connect = async (profileId: string, notice = '') => {
    setBusy(true);
    setMessage('');
    const result = await analyzer().session.connect({ profileId });
    if (!result.ok) {
      setMessage(errorText(result.error));
      setBusy(false);
      return;
    }
    const list = await analyzer().session.courses();
    setBusy(false);
    if (!list.ok) {
      setMessage(errorText(list.error));
      return;
    }
    setSite(result.value);
    setCourses(list.value);
    setAnalysed({});
    setErrors({});
    setMessage(notice);
    // The teacher's pending work is the first screen after connecting.
    setView({ name: 'pending' });
  };

  const onSaved = async (saved: Result<{ id: string; tokensStored: boolean }>) => {
    await refreshProfiles();
    if (saved.ok) await connect(saved.value.id, saved.value.tokensStored ? '' : t('signin.notEncrypted'));
  };

  const switchSite = async () => {
    await analyzer().session.disconnect();
    setSite(null);
    setCourses([]);
    setAnalysed({});
    setView({ name: 'signin' });
  };

  const collect = async (course: CourseSummary, force = false) => {
    if (collecting.current.has(course.id) || (!force && analysed[course.id])) return;
    collecting.current.add(course.id);
    setErrors((current) => ({ ...current, [course.id]: '' }));
    setProgress((current) => ({ ...current, [course.id]: { message: '', percent: 0 } }));
    if (force) setAnalysed((current) => { const next = { ...current }; delete next[course.id]; return next; });
    const result = await analyzer().analysis.collect(course.id, {
      id: course.id, fullname: course.fullName, shortname: course.shortName, enablecompletion: course.enableCompletion
    });
    collecting.current.delete(course.id);
    if (!result.ok) {
      setErrors((current) => ({ ...current, [course.id]: errorText(result.error) }));
      return;
    }
    const analysis = new CourseAnalyzer(PASS_THRESHOLD_PCT).analyze(result.value);
    const saved = await analyzer().analysis.history(course.id, Object.fromEntries(analysis.students.map((student) => [student.id, student.riskLevel])));
    setAnalysed((current) => ({
      ...current,
      [course.id]: {
        analysis,
        insights: courseInsights(analysis),
        advanced: advancedInsights(analysis),
        flow: saved.ok ? riskFlow(saved.value) : null,
        collectedAt: result.value.collectedAt
      }
    }));
  };

  const openCourse = (course: CourseSummary, tab: Tab = 'summary') => {
    setView({ name: 'course', course, tab });
    void collect(course);
  };

  if (!site || view.name === 'signin') {
    return (
      <SignIn
        profiles={profiles}
        busy={busy}
        message={message}
        onConnect={(id) => void connect(id)}
        onSaved={(saved) => void onSaved(saved)}
        onRemove={async (id) => { await analyzer().profiles.remove(id); await refreshProfiles(); }}
      />
    );
  }

  if (view.name === 'student' && analysed[view.course.id]) {
    return <Student entry={analysed[view.course.id]} studentId={view.studentId} courseName={view.course.fullName} onBack={() => setView({ name: 'course', course: view.course, tab: view.tab })} />;
  }

  if (view.name === 'course' || view.name === 'student') {
    const course = view.course;
    return (
      <Course
        course={course}
        siteName={site.siteName}
        entry={analysed[course.id] ?? null}
        progress={progress[course.id] ?? null}
        error={errors[course.id] ?? ''}
        tab={view.tab}
        onTab={(tab) => setView({ name: 'course', course, tab })}
        onBack={() => setView({ name: 'courses' })}
        onPending={() => setView({ name: 'pending' })}
        onRefresh={() => void collect(course, true)}
        onOpenStudent={(studentId) => setView({ name: 'student', course, tab: view.tab, studentId })}
        onSwitchSite={() => void switchSite()}
      />
    );
  }

  if (view.name === 'pending') {
    return (
      <>
        {message && <p className="notice" role="status" style={{ margin: 16 }}>{message}</p>}
        <Pending
          site={site}
          courses={courses}
          analysed={analysed}
          progress={progress}
          errors={errors}
          collect={collect}
          onOpenCourse={(course) => openCourse(course)}
          onCourses={() => setView({ name: 'courses' })}
          onSwitchSite={() => void switchSite()}
        />
      </>
    );
  }

  return (
    <>
      {message && <p className="notice" role="status" style={{ margin: 16 }}>{message}</p>}
      <Courses site={site} courses={courses} analysed={analysed} onOpen={(course) => openCourse(course)} onPending={() => setView({ name: 'pending' })} onSwitchSite={() => void switchSite()} />
    </>
  );
}
