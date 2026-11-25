// Small shared interface pieces: icons, the language selector, cards and bars.
import type { ReactNode } from 'react';
import { LANGUAGES, useI18n, type Language } from './i18n';

type IconName = 'cap' | 'book' | 'chart' | 'refresh' | 'globe' | 'search' | 'chevronLeft' | 'chevronRight' | 'lock' | 'monitor' | 'shield' | 'check';

const PATHS: Record<IconName, ReactNode> = {
  cap: <><path d="M22 10 12 5 2 10l10 5 10-5Z" /><path d="M6 12v5c3 2 9 2 12 0v-5" /></>,
  book: <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />,
  chart: <><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></>,
  refresh: <><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></>,
  globe: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  lock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  monitor: <><rect x="2" y="4" width="20" height="14" rx="2" /><path d="M8 22h8" /><path d="M12 18v4" /></>,
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />,
  check: <path d="M20 6 9 17l-5-5" />
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

export function LanguageSelect() {
  const { language, setLanguage, t } = useI18n();
  return (
    <label className="language">
      <Icon name="globe" size={16} />
      <span className="visually-hidden">{t('language.label')}</span>
      <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
        {LANGUAGES.map((entry) => <option key={entry.code} value={entry.code}>{entry.name}</option>)}
      </select>
    </label>
  );
}

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark"><Icon name="cap" /></span>
      <span style={{ display: 'flex', flexDirection: 'column' }}>
        <span className="brand-name">MoodlIA</span>
        <span className="brand-sub">Analyzer</span>
      </span>
    </div>
  );
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

export const pct = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${Math.round(value)}%`);

export function Kpi({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {note && <span className="kpi-note">{note}</span>}
    </div>
  );
}

export function Card({ title, sub, aside, children, labelledBy }: { title: string; sub?: string; aside?: ReactNode; children: ReactNode; labelledBy?: string }) {
  return (
    <section className="card" aria-labelledby={labelledBy}>
      <div className="card-head">
        <div>
          <h2 className="card-title" id={labelledBy}>{title}</h2>
          {sub && <p className="card-sub" style={{ margin: '4px 0 0' }}>{sub}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export type Risk = 'high' | 'medium' | 'low';

export function RiskMark({ risk }: { risk: Risk }) {
  return <span className={`mark-${risk}`} aria-hidden="true" />;
}

/** Horizontal bars with a value each; optional pass line and per-row class average mark. */
export function BarList({ rows, labelWidth = 110, passMark }: {
  rows: Array<{ key: string | number; label: string; value: number; max: number; text?: string; color?: string; avg?: number; title?: string }>;
  labelWidth?: number;
  passMark?: number;
}) {
  return (
    <div className="barlist" style={{ ['--label' as string]: `${labelWidth}px` }}>
      {rows.map((row) => {
        const width = row.max > 0 ? Math.max(0, Math.min(100, (row.value / row.max) * 100)) : 0;
        return (
          <div key={row.key} className="barrow" title={row.title}>
            <span className="barrow-label">{row.label}</span>
            <span className="track">
              {width > 0 && <span className="fill" style={{ width: `${Math.max(width, 1.5)}%`, background: row.color ?? 'var(--series-1)' }} />}
              {passMark !== undefined && <span className="pass" style={{ left: `${passMark}%` }} aria-hidden="true" />}
              {row.avg !== undefined && <span className="avg" style={{ left: `calc(${Math.max(0, Math.min(100, row.avg))}% - 1px)` }} aria-hidden="true" />}
            </span>
            <span className="barrow-value">{row.text ?? row.value}</span>
          </div>
        );
      })}
    </div>
  );
}
