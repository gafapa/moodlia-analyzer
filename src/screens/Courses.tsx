// The connected site's courses: search, period filter, a comparison of the courses analysed in
// this session, and one card per course.
import { useMemo, useState } from 'react';
import type { CourseSummary, SiteSummary } from '../bridge';
import { useI18n } from '../i18n';
import type { Analysed } from '../App';
import { BarList, Icon, LanguageSelect, pct } from '../ui';

type Period = 'current' | 'past' | 'all';

export function Courses({ site, courses, analysed, onOpen, onPending, onSwitchSite }: {
  site: SiteSummary;
  courses: CourseSummary[];
  analysed: Record<number, Analysed>;
  onOpen: (course: CourseSummary) => void;
  onPending: () => void;
  onSwitchSite: () => void;
}) {
  const { t, date, relative } = useI18n();
  const now = Math.floor(Date.now() / 1000);
  const isPast = (course: CourseSummary) => course.endDate !== null && course.endDate < now;
  const hasCurrent = courses.some((course) => !isPast(course));
  const [period, setPeriod] = useState<Period>(hasCurrent ? 'current' : 'all');
  const [query, setQuery] = useState('');

  const shown = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return courses
      .filter((course) => period === 'all' || (period === 'past' ? isPast(course) : !isPast(course)))
      .filter((course) => !needle || `${course.fullName} ${course.shortName}`.toLocaleLowerCase().includes(needle))
      .sort((a, b) => (b.lastAccess ?? 0) - (a.lastAccess ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses, period, query]);

  const compared = courses.filter((course) => analysed[course.id]);

  return (
    <div className="page">
      <div className="page-inner">
        <header className="page-header" style={{ alignItems: 'center' }}>
          <div className="brand" style={{ padding: 0 }}>
            <span className="brand-mark"><Icon name="cap" /></span>
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="brand-name">{site.siteName}</span>
              <span className="brand-sub">{t('courses.siteLine', { release: site.moodleRelease.split(' ')[0] })}</span>
            </span>
          </div>
          <div className="actions">
            <button type="button" className="btn" onClick={onPending}><Icon name="check" size={16} />{t('todo.title')}</button>
            <button type="button" className="btn" onClick={onSwitchSite}>{t('courses.switchSite')}</button>
            <LanguageSelect />
          </div>
        </header>

        <section className="page-header" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1 className="page-title">{t('courses.title')}</h1>
            <p className="page-sub">{t('courses.count', { count: shown.length })}</p>
          </div>
          <div className="actions">
            <label className="search">
              <Icon name="search" size={16} />
              <span className="visually-hidden">{t('courses.search')}</span>
              <input type="search" placeholder={t('courses.search')} value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <div className="segmented" role="group" aria-label={t('courses.period')}>
              {(['current', 'past', 'all'] as Period[]).map((value) => (
                <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)}>{t(`courses.period.${value}`)}</button>
              ))}
            </div>
          </div>
        </section>

        {compared.length >= 2 && (
          <section className="card" aria-labelledby="compare">
            <div className="card-head">
              <div>
                <h2 className="card-title" id="compare">{t('courses.compareTitle')}</h2>
                <p className="card-sub" style={{ margin: '4px 0 0' }}>{t('courses.compareSub')}</p>
              </div>
              <div className="legend">
                <span><span className="key" style={{ background: 'var(--series-1)' }} />{t('courses.submitted')}</span>
                <span><span className="key" style={{ background: 'var(--series-2)' }} />{t('courses.avgGrade')}</span>
              </div>
            </div>
            {compared.map((course) => {
              const metrics = analysed[course.id].analysis.courseMetrics;
              return (
                <div key={course.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 280px) minmax(0, 1fr)', gap: 16, alignItems: 'center' }}>
                  <span style={{ fontWeight: 600 }}>{course.fullName}</span>
                  <BarList labelWidth={0} rows={[
                    { key: 's', label: '', value: metrics.avgSubmissionRate ?? 0, max: 100, text: pct(metrics.avgSubmissionRate), color: 'var(--series-1)' },
                    { key: 'g', label: '', value: metrics.avgGradePct ?? 0, max: 100, text: pct(metrics.avgGradePct), color: 'var(--series-2)' }
                  ]} />
                </div>
              );
            })}
          </section>
        )}

        {shown.length === 0 ? <p className="empty">{t('courses.none')}</p> : (
          <section className="grid" style={{ ['--min' as string]: '360px' }} aria-label={t('courses.title')}>
            {shown.map((course) => {
              const entry = analysed[course.id];
              const metrics = entry?.analysis.courseMetrics;
              const total = metrics ? metrics.atRiskHigh + metrics.atRiskMedium + metrics.atRiskLow : 0;
              return (
                <article key={course.id} className="course-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                      <span className="pill neutral" style={{ alignSelf: 'flex-start' }}>{course.shortName}</span>
                      <h2>{course.fullName}</h2>
                    </span>
                    <span className="kpi-note" style={{ whiteSpace: 'nowrap' }}>{entry ? relative(entry.collectedAt) : t('courses.notAnalysed')}</span>
                  </div>
                  {entry && metrics ? (
                    <>
                      <div className="course-stats">
                        <span className="risk-count"><span className="stat-label">{t('courses.students')}</span><span className="risk-count-value">{metrics.totalStudents}</span></span>
                        <span className="risk-count"><span className="stat-label">{t('courses.avgGrade')}</span><span className="risk-count-value">{pct(metrics.avgGradePct)}</span></span>
                        <span className="risk-count"><span className="stat-label">{t('courses.toGrade')}</span><span className="risk-count-value">{entry.insights.grading.pending}</span></span>
                      </div>
                      {total > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)' }}>
                            <span>{t('courses.risk')}</span>
                            <span>{t('courses.riskLine', { high: metrics.atRiskHigh, medium: metrics.atRiskMedium, low: metrics.atRiskLow })}</span>
                          </span>
                          <span className="risk-bar" style={{ height: 8 }} aria-hidden="true">
                            {metrics.atRiskHigh > 0 && <span style={{ flex: metrics.atRiskHigh, background: 'var(--risk-high)' }} />}
                            {metrics.atRiskMedium > 0 && <span style={{ flex: metrics.atRiskMedium, background: 'var(--risk-medium)' }} />}
                            {metrics.atRiskLow > 0 && <span style={{ flex: metrics.atRiskLow, background: 'var(--risk-low)' }} />}
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="course-stats">
                      {course.enrolledCount !== null && <span className="risk-count"><span className="stat-label">{t('courses.enrolled')}</span><span className="risk-count-value">{course.enrolledCount}</span></span>}
                      <span className="risk-count" style={{ gridColumn: course.enrolledCount !== null ? 'span 2' : 'span 3' }}>
                        <span className="stat-label">{t('courses.dates')}</span>
                        <span style={{ fontSize: 14, fontWeight: 500, paddingTop: 6 }}>{course.startDate ? date(course.startDate) : '—'} – {course.endDate ? date(course.endDate) : t('courses.noEnd')}</span>
                      </span>
                    </div>
                  )}
                  <button type="button" className="btn btn-soft" onClick={() => onOpen(course)}>{entry ? t('courses.open') : t('courses.analyse')}</button>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}
