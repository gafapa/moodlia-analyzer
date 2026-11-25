// Course charts drawn as SVG. Colours come from the --viz-* custom properties in styles.css,
// which have light and dark values. Every mark has a hover tooltip; risk levels carry a
// shape and a label as well as a colour; the same data is also shown in tables.
import { useEffect, useRef, useState, type ReactNode } from 'react';

type Risk = 'high' | 'medium' | 'low';

/** Width of the chart's container, so text keeps its size instead of scaling with a viewBox. */
function useWidth(fallback = 640) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.floor(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

interface Tip { x: number; y: number; content: ReactNode }

function useTooltip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const place = (clientX: number, clientY: number, content: ReactNode) => {
    const box = frame.current?.getBoundingClientRect();
    if (box) setTip({ x: clientX - box.left, y: clientY - box.top, content });
  };
  return {
    frame,
    tip,
    pointer: (event: { clientX: number; clientY: number }, content: ReactNode) => place(event.clientX, event.clientY, content),
    focus: (event: { currentTarget: Element }, content: ReactNode) => {
      const box = event.currentTarget.getBoundingClientRect();
      place(box.left + box.width / 2, box.top, content);
    },
    hide: () => setTip(null)
  };
}

function Frame({ title, legend, children, tooltip, note }: { title: string; legend?: ReactNode; children: ReactNode; tooltip: ReturnType<typeof useTooltip>; note?: string }) {
  return (
    <figure className="chart">
      <figcaption>{title}</figcaption>
      {legend && <div className="legend">{legend}</div>}
      <div className="chart-body" ref={tooltip.frame} onPointerLeave={tooltip.hide}>
        {children}
        {tooltip.tip && (
          <div className="tooltip" role="status" style={{ left: tooltip.tip.x, top: tooltip.tip.y }}>{tooltip.tip.content}</div>
        )}
      </div>
      {note && <p className="chart-note">{note}</p>}
    </figure>
  );
}

function Swatch({ color, shape = 'square' }: { color: string; shape?: 'square' | 'line' | Risk }) {
  if (shape === 'line') return <svg width="16" height="10" aria-hidden="true"><line x1="0" y1="5" x2="16" y2="5" stroke={color} strokeWidth="2" /></svg>;
  if (shape === 'high' || shape === 'medium' || shape === 'low') return <svg width="12" height="12" aria-hidden="true"><RiskMark risk={shape} x={6} y={6} size={9} /></svg>;
  return <span className="swatch" style={{ background: color }} aria-hidden="true" />;
}

export const RISK_COLOR: Record<Risk, string> = { high: 'var(--viz-critical)', medium: 'var(--viz-warning)', low: 'var(--viz-good)' };

/** Triangle for high, square for medium, circle for low, ringed with the surface colour. */
function RiskMark({ risk, x, y, size }: { risk: Risk; x: number; y: number; size: number }) {
  const r = size / 2;
  const common = { fill: RISK_COLOR[risk], stroke: 'var(--viz-surface)', strokeWidth: 2 };
  if (risk === 'high') return <polygon points={`${x},${y - r * 1.15} ${x + r * 1.1},${y + r * 0.85} ${x - r * 1.1},${y + r * 0.85}`} {...common} />;
  if (risk === 'medium') return <rect x={x - r * 0.9} y={y - r * 0.9} width={r * 1.8} height={r * 1.8} rx={1.5} {...common} />;
  return <circle cx={x} cy={y} r={r} {...common} />;
}

const ticks = [0, 25, 50, 75, 100];

/** 100% bar of students by risk level. */
export function RiskBar({ title, counts, labels }: { title: string; counts: Record<Risk, number>; labels: Record<Risk, string> }) {
  const tooltip = useTooltip();
  const total = counts.high + counts.medium + counts.low;
  const order: Risk[] = ['high', 'medium', 'low'];
  return (
    <Frame title={title} tooltip={tooltip}>
      <div className="risk-bar">
        {order.filter((risk) => counts[risk] > 0).map((risk) => (
          <div
            key={risk}
            className="risk-segment"
            tabIndex={0}
            style={{ flexGrow: counts[risk], background: RISK_COLOR[risk] }}
            onPointerMove={(event) => tooltip.pointer(event, <><strong>{labels[risk]}</strong>: {counts[risk]} ({Math.round((counts[risk] / total) * 100)}%)</>)}
            onFocus={(event) => tooltip.focus(event, <><strong>{labels[risk]}</strong>: {counts[risk]}</>)}
            onBlur={tooltip.hide}
          />
        ))}
      </div>
      <div className="risk-labels">
        {order.map((risk) => (
          <span key={risk}><Swatch color={RISK_COLOR[risk]} shape={risk} /> {labels[risk]} <strong>{counts[risk]}</strong></span>
        ))}
      </div>
    </Frame>
  );
}

/** Students per grade range, with the pass mark. */
export function GradeHistogram({ title, distribution, passMark, passLabel, studentsLabel }: { title: string; distribution: Record<string, number>; passMark: number; passLabel: string; studentsLabel: string }) {
  const { ref, width } = useWidth();
  const tooltip = useTooltip();
  const height = 200;
  const margin = { top: 20, right: 12, bottom: 28, left: 32 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const bins = Object.entries(distribution).map(([range, count]) => {
    const [low, high] = range.split('-').map(Number);
    return { range, low, high: high === 100 ? 100 : high + 1, count };
  });
  const max = Math.max(1, ...bins.map((bin) => bin.count));
  const x = (pct: number) => margin.left + (pct / 100) * plotW;
  const y = (count: number) => margin.top + plotH - (count / max) * plotH;
  const yTicks = [...new Set([0, Math.ceil(max / 2), max])];
  return (
    <div ref={ref}>
      <Frame title={title} tooltip={tooltip}>
        <svg width={width} height={height} role="img" aria-label={title}>
          {yTicks.map((tick) => (
            <g key={tick}>
              <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} className="grid" />
              <text x={margin.left - 6} y={y(tick)} className="tick" textAnchor="end" dominantBaseline="middle">{tick}</text>
            </g>
          ))}
          {bins.map((bin) => {
            const left = x(bin.low) + 1;
            const barW = Math.max(2, x(bin.high) - x(bin.low) - 2);
            const top = y(bin.count);
            return (
              <g key={bin.range}>
                {bin.count > 0 && (
                  <path
                    d={`M${left},${margin.top + plotH} V${top + 4} Q${left},${top} ${left + 4},${top} H${left + barW - 4} Q${left + barW},${top} ${left + barW},${top + 4} V${margin.top + plotH} Z`}
                    fill="var(--viz-series-1)"
                  />
                )}
                <rect
                  x={left} y={margin.top} width={barW} height={plotH} fill="transparent" tabIndex={0}
                  onPointerMove={(event) => tooltip.pointer(event, <><strong>{bin.range}%</strong>: {bin.count} {studentsLabel}</>)}
                  onFocus={(event) => tooltip.focus(event, <><strong>{bin.range}%</strong>: {bin.count} {studentsLabel}</>)}
                  onBlur={tooltip.hide}
                />
                <text x={left + barW / 2} y={top - 6} className="value" textAnchor="middle">{bin.count}</text>
              </g>
            );
          })}
          <line x1={margin.left} x2={width - margin.right} y1={margin.top + plotH} y2={margin.top + plotH} className="axis" />
          {ticks.map((tick) => <text key={tick} x={x(tick)} y={height - 8} className="tick" textAnchor={tick === 0 ? 'start' : tick === 100 ? 'end' : 'middle'}>{tick}%</text>)}
          <line x1={x(passMark)} x2={x(passMark)} y1={margin.top - 6} y2={margin.top + plotH} className="reference" />
          <text x={x(passMark) + 4} y={margin.top - 8} className="tick">{passLabel}</text>
        </svg>
      </Frame>
    </div>
  );
}

export interface ScatterPoint { id: number; name: string; engagement: number; gradePct: number | null; riskLevel: Risk }

/** Each student by engagement and current grade. */
export function EngagementScatter({ title, points, passMark, labels, onSelect }: {
  title: string;
  points: ScatterPoint[];
  passMark: number;
  labels: { engagement: string; grade: string; pass: string; risk: Record<Risk, string>; withoutGrade: (count: number) => string };
  onSelect?: (id: number) => void;
}) {
  const { ref, width } = useWidth();
  const tooltip = useTooltip();
  const height = 280;
  const margin = { top: 16, right: 16, bottom: 40, left: 44 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const x = (value: number) => margin.left + (value / 100) * plotW;
  const y = (value: number) => margin.top + plotH - (value / 100) * plotH;
  const plotted = points.filter((point): point is ScatterPoint & { gradePct: number } => point.gradePct !== null);
  const missing = points.length - plotted.length;
  const describe = (point: ScatterPoint & { gradePct: number }) => (
    <><strong>{point.name}</strong><br />{labels.grade}: {Math.round(point.gradePct)}% · {labels.engagement}: {point.engagement}<br />{labels.risk[point.riskLevel]}</>
  );
  const legend = (['high', 'medium', 'low'] as Risk[]).map((risk) => <span key={risk}><Swatch color={RISK_COLOR[risk]} shape={risk} /> {labels.risk[risk]}</span>);
  return (
    <div ref={ref}>
      <Frame title={title} legend={legend} tooltip={tooltip} note={missing > 0 ? labels.withoutGrade(missing) : undefined}>
        <svg width={width} height={height} role="img" aria-label={title}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} className="grid" />
              <text x={margin.left - 6} y={y(tick)} className="tick" textAnchor="end" dominantBaseline="middle">{tick}%</text>
              <text x={x(tick)} y={margin.top + plotH + 16} className="tick" textAnchor="middle">{tick}</text>
            </g>
          ))}
          <line x1={margin.left} x2={width - margin.right} y1={y(passMark)} y2={y(passMark)} className="reference" />
          <text x={width - margin.right} y={y(passMark) - 5} className="tick" textAnchor="end">{labels.pass}</text>
          <text x={margin.left + plotW / 2} y={height - 4} className="axis-title" textAnchor="middle">{labels.engagement}</text>
          <text transform={`translate(12 ${margin.top + plotH / 2}) rotate(-90)`} className="axis-title" textAnchor="middle">{labels.grade}</text>
          {plotted.map((point) => (
            <g
              key={point.id}
              tabIndex={0}
              role="button"
              aria-label={`${point.name}: ${Math.round(point.gradePct)}%, ${point.engagement}`}
              className="point"
              onPointerMove={(event) => tooltip.pointer(event, describe(point))}
              onFocus={(event) => tooltip.focus(event, describe(point))}
              onBlur={tooltip.hide}
              onClick={() => onSelect?.(point.id)}
              onKeyDown={(event) => { if (event.key === 'Enter') onSelect?.(point.id); }}
            >
              <circle cx={x(point.engagement)} cy={y(point.gradePct)} r={12} fill="transparent" />
              <RiskMark risk={point.riskLevel} x={x(point.engagement)} y={y(point.gradePct)} size={11} />
            </g>
          ))}
        </svg>
      </Frame>
    </div>
  );
}

export interface AssignmentColumn { id: number; name: string; dueLabel: string; students: number; onTime: number; late: number }

/** Share of students who submitted each assignment, on time and late, in due-date order. */
export function AssignmentColumns({ title, columns, labels }: { title: string; columns: AssignmentColumn[]; labels: { onTime: string; late: string; submitted: string } }) {
  const { ref, width } = useWidth();
  const tooltip = useTooltip();
  const height = 220;
  const margin = { top: 12, right: 12, bottom: 16, left: 44 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const y = (pct: number) => margin.top + plotH - (pct / 100) * plotH;
  const step = plotW / Math.max(1, columns.length);
  const gap = step > 6 ? 2 : 1;
  const barW = Math.max(1, step - gap);
  const describe = (column: AssignmentColumn) => (
    <><strong>{column.name}</strong><br />{column.dueLabel}<br />{labels.submitted}: {column.onTime + column.late}/{column.students} · {labels.late}: {column.late}</>
  );
  const legend = <><span><Swatch color="var(--viz-series-1)" /> {labels.onTime}</span><span><Swatch color="var(--viz-series-2)" /> {labels.late}</span></>;
  return (
    <div ref={ref}>
      <Frame title={title} legend={legend} tooltip={tooltip}>
        <svg width={width} height={height} role="img" aria-label={title}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} className="grid" />
              <text x={margin.left - 6} y={y(tick)} className="tick" textAnchor="end" dominantBaseline="middle">{tick}%</text>
            </g>
          ))}
          {columns.map((column, index) => {
            const left = margin.left + index * step + gap / 2;
            const onTimePct = column.students ? (column.onTime / column.students) * 100 : 0;
            const latePct = column.students ? (column.late / column.students) * 100 : 0;
            const radius = Math.min(4, barW / 2);
            const segment = (from: number, to: number, fill: string, rounded: boolean) => {
              const top = y(to);
              const bottom = y(from);
              if (bottom - top < 0.5) return null;
              const r = rounded ? Math.min(radius, bottom - top) : 0;
              return <path d={`M${left},${bottom} V${top + r} Q${left},${top} ${left + r},${top} H${left + barW - r} Q${left + barW},${top} ${left + barW},${top + r} V${bottom} Z`} fill={fill} />;
            };
            return (
              <g key={column.id}>
                {segment(0, onTimePct - (latePct > 0 && barW > 3 ? 0.6 : 0), 'var(--viz-series-1)', latePct === 0)}
                {segment(onTimePct, onTimePct + latePct, 'var(--viz-series-2)', true)}
                <rect
                  x={left} y={margin.top} width={Math.max(barW, 4)} height={plotH} fill="transparent" tabIndex={0}
                  onPointerMove={(event) => tooltip.pointer(event, describe(column))}
                  onFocus={(event) => tooltip.focus(event, describe(column))}
                  onBlur={tooltip.hide}
                />
              </g>
            );
          })}
          <line x1={margin.left} x2={width - margin.right} y1={y(0)} y2={y(0)} className="axis" />
        </svg>
      </Frame>
    </div>
  );
}

export interface LineSeries { key: string; label: string; color: string; values: number[] }

/** Counts per week for a few series, with a crosshair tooltip. */
export function WeeklyLines({ title, weeks, series, weekLabel }: { title: string; weeks: string[]; series: LineSeries[]; weekLabel: (index: number) => string }) {
  const { ref, width } = useWidth();
  const tooltip = useTooltip();
  const [hover, setHover] = useState<number | null>(null);
  const height = 220;
  const margin = { top: 16, right: 16, bottom: 28, left: 36 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const max = Math.max(1, ...series.flatMap((entry) => entry.values));
  const x = (index: number) => margin.left + (weeks.length > 1 ? (index / (weeks.length - 1)) * plotW : plotW / 2);
  const y = (value: number) => margin.top + plotH - (value / max) * plotH;
  const yTicks = [...new Set([0, Math.round(max / 2), max])];
  const labelEvery = Math.max(1, Math.ceil(weeks.length / Math.max(2, Math.floor(plotW / 70))));
  const legend = series.map((entry) => <span key={entry.key}><Swatch color={entry.color} shape="line" /> {entry.label}</span>);
  const move = (event: React.PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const index = Math.round(((event.clientX - box.left) / box.width) * (weeks.length - 1));
    const clamped = Math.max(0, Math.min(weeks.length - 1, index));
    setHover(clamped);
    tooltip.pointer(event, (
      <><strong>{weekLabel(clamped)}</strong>{series.map((entry) => <span key={entry.key} className="tip-row"><Swatch color={entry.color} shape="line" /> {entry.label}: {entry.values[clamped]}</span>)}</>
    ));
  };
  return (
    <div ref={ref}>
      <Frame title={title} legend={legend} tooltip={tooltip}>
        <svg width={width} height={height} role="img" aria-label={title} onPointerLeave={() => setHover(null)}>
          {yTicks.map((tick) => (
            <g key={tick}>
              <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} className="grid" />
              <text x={margin.left - 6} y={y(tick)} className="tick" textAnchor="end" dominantBaseline="middle">{tick}</text>
            </g>
          ))}
          {weeks.map((label, index) => (index % labelEvery === 0 ? (
            <text key={`${label}-${index}`} x={x(index)} y={height - 8} className="tick" textAnchor={index === 0 ? 'start' : index === weeks.length - 1 ? 'end' : 'middle'}>{label}</text>
          ) : null))}
          <line x1={margin.left} x2={width - margin.right} y1={y(0)} y2={y(0)} className="axis" />
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={margin.top} y2={margin.top + plotH} className="crosshair" />}
          {series.map((entry) => (
            <g key={entry.key}>
              <polyline fill="none" stroke={entry.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={entry.values.map((value, index) => `${x(index)},${y(value)}`).join(' ')} />
              {hover !== null && <circle cx={x(hover)} cy={y(entry.values[hover])} r={4} fill={entry.color} stroke="var(--viz-surface)" strokeWidth={2} />}
            </g>
          ))}
          <rect x={margin.left} y={margin.top} width={plotW} height={plotH} fill="transparent" onPointerMove={move} />
        </svg>
      </Frame>
    </div>
  );
}

/** Horizontal bars, one per item, with the pass mark. */
export function PercentBars({ title, rows, passMark, emptyLabel }: { title: string; rows: Array<{ key: string; label: string; pct: number | null; detail: string }>; passMark: number; emptyLabel: string }) {
  const tooltip = useTooltip();
  return (
    <Frame title={title} tooltip={tooltip}>
      {rows.length === 0 ? <p className="muted">{emptyLabel}</p> : (
        <div className="percent-bars">
          {rows.map((row) => (
            <div key={row.key} className="percent-row" tabIndex={0}
              onPointerMove={(event) => tooltip.pointer(event, <><strong>{row.label}</strong><br />{row.detail}</>)}
              onFocus={(event) => tooltip.focus(event, <><strong>{row.label}</strong><br />{row.detail}</>)}
              onBlur={tooltip.hide}
            >
              <span className="percent-label">{row.label}</span>
              <span className="percent-track">
                {row.pct !== null && <span className="percent-fill" style={{ width: `${Math.max(0, Math.min(100, row.pct))}%`, background: row.pct < passMark ? 'var(--viz-critical)' : 'var(--viz-series-1)' }} />}
                <span className="percent-pass" style={{ left: `${passMark}%` }} />
              </span>
              <span className="percent-value">{row.pct === null ? '—' : `${Math.round(row.pct)}%`}</span>
            </div>
          ))}
        </div>
      )}
    </Frame>
  );
}
