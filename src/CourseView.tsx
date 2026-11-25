// Provisional course view: collects the course, runs the analysis and lists the results.
// The final interface is still to be designed.
import { useEffect, useState } from 'react';
import { analyzer, type CourseSummary } from './bridge';
import { CourseAnalyzer } from './analysis/courseAnalyzer';
import type { CourseAnalysis } from './analysis/types';

const PASS_THRESHOLD_PCT = 50;
const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value)}%`);

export function CourseView({ course, onBack }: { course: CourseSummary; onBack: () => void }) {
  const [progress, setProgress] = useState({ message: 'Starting', percent: 0 });
  const [analysis, setAnalysis] = useState<CourseAnalysis | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
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
  }, [course]);

  return (
    <main className="shell">
      <button type="button" onClick={onBack}>Back to courses</button>
      <h1>{course.fullName}</h1>
      {error && <p role="alert">{error}</p>}
      {!analysis && !error && (
        <p aria-live="polite">
          <progress max={100} value={progress.percent} /> {progress.message}
        </p>
      )}
      {analysis && (
        <>
          <p>
            {analysis.courseMetrics.totalStudents} students · risk: {analysis.courseMetrics.atRiskHigh} high,{' '}
            {analysis.courseMetrics.atRiskMedium} medium, {analysis.courseMetrics.atRiskLow} low · average grade{' '}
            {percent(analysis.courseMetrics.avgGradePct)} · completion {percent(analysis.courseMetrics.avgCompletion)}
          </p>
          {analysis.unavailable && Object.keys(analysis.unavailable).length > 0 && (
            <details>
              <summary>Data this token could not read ({Object.keys(analysis.unavailable).length})</summary>
              <ul>
                {Object.entries(analysis.unavailable).map(([operation, reason]) => <li key={operation}><code>{operation}</code>: {reason}</li>)}
              </ul>
            </details>
          )}
          <h2>Recommendations</h2>
          <ul>{analysis.teacherRecommendations.map((text) => <li key={text}>{text}</li>)}</ul>
          <h2>Students</h2>
          <table>
            <thead>
              <tr><th>Student</th><th>Risk</th><th>Grade</th><th>Engagement</th><th>Completion</th></tr>
            </thead>
            <tbody>
              {[...analysis.students]
                .sort((a, b) => b.prediction.riskProbability - a.prediction.riskProbability)
                .map((student) => (
                  <tr key={student.id}>
                    <td>{student.fullname}</td>
                    <td>{student.riskLevel}</td>
                    <td>{percent(student.metrics.finalGradePct)}</td>
                    <td>{Math.round(student.metrics.engagementScore)}</td>
                    <td>{percent(student.metrics.completionRate)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
