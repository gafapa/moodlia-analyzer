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

export interface LineSeries { key: string; label: string; color: string; values: number[] }

/** Counts per week for a few series, with a crosshair tooltip. */
export function WeeklyLines({ title, weeks, series, weekLabel, maxValue, reference, format = String }: {
  title: string;
  weeks: string[];
  series: LineSeries[];
  weekLabel: (index: number) => string;
  /** Fixed top of the scale, such as 100 for percentages. */
  maxValue?: number;
  /** A dashed reference line, such as the pass mark. */
  reference?: { value: number; label: string };
  format?: (value: number) => string;
}) {
  const { ref, width } = useWidth();
  const tooltip = useTooltip();
  const [hover, setHover] = useState<number | null>(null);
  const height = 220;
  const margin = { top: 16, right: 16, bottom: 28, left: 36 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const max = maxValue ?? Math.max(1, ...series.flatMap((entry) => entry.values));
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
      <><strong>{weekLabel(clamped)}</strong>{series.map((entry) => <span key={entry.key} className="tip-row"><Swatch color={entry.color} shape="line" /> {entry.label}: {format(entry.values[clamped])}</span>)}</>
    ));
  };
  return (
    <div ref={ref}>
      <Frame title={title} legend={legend} tooltip={tooltip}>
        <svg width={width} height={height} role="img" aria-label={title} onPointerLeave={() => setHover(null)}>
          {yTicks.map((tick) => (
            <g key={tick}>
              <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} className="grid" />
              <text x={margin.left - 6} y={y(tick)} className="tick" textAnchor="end" dominantBaseline="middle">{format(tick)}</text>
            </g>
          ))}
          {reference && (
            <g>
              <line x1={margin.left} x2={width - margin.right} y1={y(reference.value)} y2={y(reference.value)} className="reference" />
              <text x={width - margin.right} y={y(reference.value) - 5} className="tick" textAnchor="end">{reference.label}</text>
            </g>
          )}
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

/** Vertical bars for a few categories, with an optional dashed reference line. */
export function Columns({ title, bars, reference, format = String, height = 200, highlight }: {
  title: string;
  bars: Array<{ key: string; label: string; value: number; tip?: ReactNode; color?: string }>;
  reference?: { value: number; label: string };
  format?: (value: number) => string;
  height?: number;
  /** Index of a bar to mark, such as the current week. */
  highlight?: number;
}) {
  const { ref, width } = useWidth();
  const tooltip = useTooltip();
  const margin = { top: 22, right: 12, bottom: 28, left: 32 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const max = Math.max(1, reference?.value ?? 0, ...bars.map((bar) => bar.value));
  const slot = plotW / Math.max(1, bars.length);
  const barW = Math.max(6, Math.min(56, slot * 0.7));
  const y = (value: number) => margin.top + plotH - (value / max) * plotH;
  const labelEvery = Math.max(1, Math.ceil(bars.length / Math.max(2, Math.floor(plotW / 56))));
  return (
    <div ref={ref}>
      <Frame title={title} tooltip={tooltip}>
        <svg width={width} height={height} role="img" aria-label={title}>
          {[...new Set([0, max])].map((tick) => (
            <g key={tick}>
              <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} className="grid" />
              <text x={margin.left - 6} y={y(tick)} className="tick" textAnchor="end" dominantBaseline="middle">{format(tick)}</text>
            </g>
          ))}
          {bars.map((bar, index) => {
            const cx = margin.left + slot * index + slot / 2;
            const left = cx - barW / 2;
            const top = y(bar.value);
            const content = bar.tip ?? <><strong>{bar.label}</strong>: {format(bar.value)}</>;
            return (
              <g key={bar.key}>
                {highlight === index && <rect x={margin.left + slot * index + 1} y={margin.top - 4} width={slot - 2} height={plotH + 4} fill="var(--viz-grid)" rx={4} />}
                {bar.value > 0 && (
                  <path
                    d={`M${left},${margin.top + plotH} V${top + Math.min(4, (margin.top + plotH - top))} Q${left},${top} ${left + 4},${top} H${left + barW - 4} Q${left + barW},${top} ${left + barW},${top + Math.min(4, (margin.top + plotH - top))} V${margin.top + plotH} Z`}
                    fill={bar.color ?? 'var(--viz-series-1)'}
                  />
                )}
                <rect
                  x={margin.left + slot * index} y={margin.top} width={slot} height={plotH} fill="transparent" tabIndex={0}
                  onPointerMove={(event) => tooltip.pointer(event, content)}
                  onFocus={(event) => tooltip.focus(event, content)}
                  onBlur={tooltip.hide}
                />
                {bars.length <= 16 && bar.value > 0 && <text x={cx} y={top - 6} className="value" textAnchor="middle">{format(bar.value)}</text>}
                {index % labelEvery === 0 && <text x={cx} y={height - 8} className="tick" textAnchor="middle">{bar.label}</text>}
              </g>
            );
          })}
          <line x1={margin.left} x2={width - margin.right} y1={margin.top + plotH} y2={margin.top + plotH} className="axis" />
          {reference && (
            <g>
              <line x1={margin.left} x2={width - margin.right} y1={y(reference.value)} y2={y(reference.value)} className="reference" />
              <text x={width - margin.right} y={y(reference.value) - 5} className="tick" textAnchor="end">{reference.label}</text>
            </g>
          )}
        </svg>
      </Frame>
    </div>
  );
}

export interface BoxRow { key: string; label: string; min: number; q1: number; median: number; q3: number; max: number; tip: ReactNode }

/** One horizontal box plot per row on a 0–100% scale, with the pass mark. */
export function BoxPlots({ title, rows, passMark, passLabel, labelWidth = 180 }: { title: string; rows: BoxRow[]; passMark: number; passLabel: string; labelWidth?: number }) {
  const { ref, width } = useWidth();
  const tooltip = useTooltip();
  const rowH = 30;
  const margin = { top: 20, right: 16, bottom: 26, left: Math.min(labelWidth, width * 0.4) };
  const height = margin.top + margin.bottom + rows.length * rowH;
  const plotW = width - margin.left - margin.right;
  const x = (value: number) => margin.left + (value / 100) * plotW;
  const maxChars = Math.max(8, Math.floor(margin.left / 7));
  return (
    <div ref={ref}>
      <Frame title={title} tooltip={tooltip}>
        <svg width={width} height={height} role="img" aria-label={title}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={x(tick)} x2={x(tick)} y1={margin.top} y2={height - margin.bottom} className="grid" />
              <text x={x(tick)} y={height - 8} className="tick" textAnchor="middle">{tick}%</text>
            </g>
          ))}
          <line x1={x(passMark)} x2={x(passMark)} y1={margin.top - 6} y2={height - margin.bottom} className="reference" />
          <text x={x(passMark) + 4} y={margin.top - 8} className="tick">{passLabel}</text>
          {rows.map((row, index) => {
            const cy = margin.top + index * rowH + rowH / 2;
            return (
              <g
                key={row.key}
                tabIndex={0}
                onPointerMove={(event) => tooltip.pointer(event, row.tip)}
                onFocus={(event) => tooltip.focus(event, row.tip)}
                onBlur={tooltip.hide}
              >
                <rect x={0} y={cy - rowH / 2} width={width} height={rowH} fill="transparent" />
                <text x={margin.left - 10} y={cy} className="tick strong" textAnchor="end" dominantBaseline="middle">{row.label.length > maxChars ? `${row.label.slice(0, maxChars - 1)}…` : row.label}</text>
                <line x1={x(row.min)} x2={x(row.max)} y1={cy} y2={cy} stroke="var(--viz-axis)" strokeWidth={1.5} />
                <line x1={x(row.min)} x2={x(row.min)} y1={cy - 5} y2={cy + 5} stroke="var(--viz-axis)" strokeWidth={1.5} />
                <line x1={x(row.max)} x2={x(row.max)} y1={cy - 5} y2={cy + 5} stroke="var(--viz-axis)" strokeWidth={1.5} />
                <rect x={x(row.q1)} y={cy - 9} width={Math.max(2, x(row.q3) - x(row.q1))} height={18} rx={4} fill="color-mix(in srgb, var(--viz-series-1) 28%, var(--viz-surface))" stroke="var(--viz-series-1)" strokeWidth={1.5} />
                <line x1={x(row.median)} x2={x(row.median)} y1={cy - 9} y2={cy + 9} stroke="var(--viz-ink)" strokeWidth={2.5} />
              </g>
            );
          })}
        </svg>
      </Frame>
    </div>
  );
}

export interface ItemPoint { key: string; label: string; facility: number; discrimination: number; flagged: boolean; tip: ReactNode }

/**
 * Quiz questions by facility (x) and discrimination (y). The shaded band is where questions
 * usually work best: facility between 30% and 70% and discrimination of 0.3 or more.
 */
export function ItemScatter({ title, points, labels }: { title: string; points: ItemPoint[]; labels: { facility: string; discrimination: string; good: string; flagged: string; fine: string } }) {
  const { ref, width } = useWidth();
  const tooltip = useTooltip();
  const height = 300;
  const margin = { top: 16, right: 16, bottom: 40, left: 48 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const low = Math.min(-0.2, ...points.map((point) => point.discrimination));
  const x = (value: number) => margin.left + (value / 100) * plotW;
  const y = (value: number) => margin.top + plotH - ((value - low) / (1 - low)) * plotH;
  const yTicks = [low <= -0.5 ? -0.5 : null, 0, 0.3, 0.6, 1].filter((tick): tick is number => tick !== null && tick >= low);
  const legend = (
    <>
      <span><Swatch color="var(--viz-critical)" shape="high" /> {labels.flagged}</span>
      <span><Swatch color="var(--viz-series-1)" /> {labels.fine}</span>
      <span><span className="swatch band" aria-hidden="true" /> {labels.good}</span>
    </>
  );
  return (
    <div ref={ref}>
      <Frame title={title} legend={legend} tooltip={tooltip}>
        <svg width={width} height={height} role="img" aria-label={title}>
          <rect x={x(30)} y={y(1)} width={x(70) - x(30)} height={y(0.3) - y(1)} fill="var(--viz-band)" />
          {yTicks.map((tick) => (
            <g key={tick}>
              <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} className={tick === 0 ? 'axis' : 'grid'} />
              <text x={margin.left - 6} y={y(tick)} className="tick" textAnchor="end" dominantBaseline="middle">{tick.toFixed(1)}</text>
            </g>
          ))}
          {ticks.map((tick) => <text key={tick} x={x(tick)} y={margin.top + plotH + 16} className="tick" textAnchor="middle">{tick}%</text>)}
          <text x={margin.left + plotW / 2} y={height - 4} className="axis-title" textAnchor="middle">{labels.facility}</text>
          <text transform={`translate(12 ${margin.top + plotH / 2}) rotate(-90)`} className="axis-title" textAnchor="middle">{labels.discrimination}</text>
          {points.map((point) => (
            <g
              key={point.key}
              tabIndex={0}
              className="point"
              aria-label={`${point.label}: ${Math.round(point.facility)}%, ${point.discrimination.toFixed(2)}`}
              onPointerMove={(event) => tooltip.pointer(event, point.tip)}
              onFocus={(event) => tooltip.focus(event, point.tip)}
              onBlur={tooltip.hide}
            >
              <circle cx={x(point.facility)} cy={y(point.discrimination)} r={12} fill="transparent" />
              {point.flagged
                ? <RiskMark risk="high" x={x(point.facility)} y={y(point.discrimination)} size={12} />
                : <circle cx={x(point.facility)} cy={y(point.discrimination)} r={5} fill="var(--viz-series-1)" stroke="var(--viz-surface)" strokeWidth={2} />}
              <text x={x(point.facility) + 8} y={y(point.discrimination) - 6} className="tick">{point.label}</text>
            </g>
          ))}
        </svg>
      </Frame>
    </div>
  );
}

export interface GraphNode { id: number; label: string; role: 'student' | 'teacher'; size: number; muted?: boolean; tip: ReactNode }
export interface GraphEdge { from: number; to: number; weight: number }

/**
 * Who replies to whom. Teachers sit in the middle and students around them; a line joins two
 * people who replied to each other, thicker with more replies. Hovering a person highlights
 * their replies.
 */
export function NetworkGraph({ title, nodes, edges, labels, onSelect }: {
  title: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  labels: { student: string; teacher: string; noReplies: string };
  onSelect?: (id: number) => void;
}) {
  const { ref, width } = useWidth();
  const tooltip = useTooltip();
  const [focus, setFocus] = useState<number | null>(null);
  const height = Math.max(320, Math.min(520, width * 0.62));
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 44;
  const teachers = nodes.filter((node) => node.role === 'teacher');
  // Students with replies first, so the connected part of the circle stays together.
  const students = nodes.filter((node) => node.role === 'student').sort((a, b) => Number(a.muted) - Number(b.muted) || b.size - a.size);
  const position = new Map<number, { x: number; y: number }>();
  students.forEach((node, index) => {
    const angle = (index / Math.max(1, students.length)) * Math.PI * 2 - Math.PI / 2;
    position.set(node.id, { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
  });
  teachers.forEach((node, index) => {
    const angle = (index / Math.max(1, teachers.length)) * Math.PI * 2;
    const r = teachers.length === 1 ? 0 : Math.min(60, radius * 0.25);
    position.set(node.id, { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
  });
  const maxSize = Math.max(1, ...nodes.map((node) => node.size));
  const nodeR = (node: GraphNode) => 4 + Math.sqrt(node.size / maxSize) * 10;
  // Replies in both directions share one line.
  const pairs = new Map<string, { a: number; b: number; weight: number }>();
  for (const edge of edges) {
    const [a, b] = edge.from < edge.to ? [edge.from, edge.to] : [edge.to, edge.from];
    const key = `${a}-${b}`;
    const entry = pairs.get(key) ?? { a, b, weight: 0 };
    entry.weight += edge.weight;
    pairs.set(key, entry);
  }
  const maxWeight = Math.max(1, ...[...pairs.values()].map((pair) => pair.weight));
  const legend = (
    <>
      <span><Swatch color="var(--viz-series-1)" /> {labels.student}</span>
      <span><Swatch color="var(--viz-series-2)" /> {labels.teacher}</span>
      <span><span className="swatch hollow" aria-hidden="true" /> {labels.noReplies}</span>
    </>
  );
  return (
    <div ref={ref}>
      <Frame title={title} legend={legend} tooltip={tooltip}>
        <svg width={width} height={height} role="img" aria-label={title} onPointerLeave={() => setFocus(null)}>
          {[...pairs.values()].map((pair) => {
            const from = position.get(pair.a);
            const to = position.get(pair.b);
            if (!from || !to) return null;
            const active = focus === null || focus === pair.a || focus === pair.b;
            // Curved towards the centre so lines between neighbours stay visible.
            const mx = (from.x + to.x) / 2 + (cx - (from.x + to.x) / 2) * 0.35;
            const my = (from.y + to.y) / 2 + (cy - (from.y + to.y) / 2) * 0.35;
            return (
              <path
                key={`${pair.a}-${pair.b}`}
                d={`M${from.x},${from.y} Q${mx},${my} ${to.x},${to.y}`}
                fill="none"
                stroke={active && focus !== null ? 'var(--viz-series-1)' : 'var(--viz-axis)'}
                strokeOpacity={active ? 0.75 : 0.12}
                strokeWidth={1 + (pair.weight / maxWeight) * 4}
              />
            );
          })}
          {nodes.map((node) => {
            const at = position.get(node.id);
            if (!at) return null;
            const r = nodeR(node);
            const fill = node.muted ? 'var(--viz-surface)' : node.role === 'teacher' ? 'var(--viz-series-2)' : 'var(--viz-series-1)';
            return (
              <g
                key={node.id}
                tabIndex={0}
                role={onSelect && node.role === 'student' ? 'button' : undefined}
                className="point"
                aria-label={node.label}
                onPointerMove={(event) => { setFocus(node.id); tooltip.pointer(event, node.tip); }}
                onFocus={(event) => { setFocus(node.id); tooltip.focus(event, node.tip); }}
                onBlur={() => { setFocus(null); tooltip.hide(); }}
                onClick={() => node.role === 'student' && onSelect?.(node.id)}
                onKeyDown={(event) => { if (event.key === 'Enter' && node.role === 'student') onSelect?.(node.id); }}
              >
                <circle cx={at.x} cy={at.y} r={Math.max(12, r + 3)} fill="transparent" />
                <circle cx={at.x} cy={at.y} r={r} fill={fill} stroke={node.muted ? 'var(--viz-axis)' : 'var(--viz-surface)'} strokeWidth={2} strokeDasharray={node.muted ? '3 2' : undefined} />
                {(focus === node.id || node.role === 'teacher') && (
                  <text x={at.x} y={at.y - r - 6} className="tick strong" textAnchor="middle">{node.label.split(' ')[0]}</text>
                )}
              </g>
            );
          })}
        </svg>
      </Frame>
    </div>
  );
}

/** How many students moved from each risk level to each other level between two analyses. */
export function RiskFlowChart({ title, matrix, labels, fromLabel, toLabel }: { title: string; matrix: number[][]; labels: Record<Risk, string>; fromLabel: string; toLabel: string }) {
  const { ref, width } = useWidth();
  const tooltip = useTooltip();
  const levels: Risk[] = ['high', 'medium', 'low'];
  const height = 260;
  const margin = { top: 28, bottom: 12 };
  const nodeW = 14;
  const left = Math.min(150, width * 0.28);
  const right = width - Math.min(150, width * 0.28);
  const total = Math.max(1, matrix.flat().reduce((sum, value) => sum + value, 0));
  const gap = 10;
  const usable = height - margin.top - margin.bottom - gap * 2;
  const outTotals = levels.map((_, from) => matrix[from].reduce((sum, value) => sum + value, 0));
  const inTotals = levels.map((_, to) => matrix.reduce((sum, row) => sum + row[to], 0));
  const stack = (totals: number[]) => {
    let y = margin.top;
    return totals.map((value) => {
      const h = (value / total) * usable;
      const entry = { y, h };
      y += h + gap;
      return entry;
    });
  };
  const leftNodes = stack(outTotals);
  const rightNodes = stack(inTotals);
  const leftCursor = leftNodes.map((node) => node.y);
  const rightCursor = rightNodes.map((node) => node.y);
  const ribbons: ReactNode[] = [];
  levels.forEach((fromLevel, from) => {
    levels.forEach((toLevel, to) => {
      const value = matrix[from][to];
      if (value === 0) return;
      const h = (value / total) * usable;
      const y0 = leftCursor[from];
      const y1 = rightCursor[to];
      leftCursor[from] += h;
      rightCursor[to] += h;
      const x0 = left + nodeW;
      const x1 = right;
      const mid = (x0 + x1) / 2;
      const tip = <><strong>{labels[fromLevel]} → {labels[toLevel]}</strong>: {value}</>;
      ribbons.push(
        <path
          key={`${from}-${to}`}
          d={`M${x0},${y0} C${mid},${y0} ${mid},${y1} ${x1},${y1} V${y1 + h} C${mid},${y1 + h} ${mid},${y0 + h} ${x0},${y0 + h} Z`}
          fill={RISK_COLOR[toLevel]}
          fillOpacity={from === to ? 0.22 : 0.5}
          tabIndex={0}
          onPointerMove={(event) => tooltip.pointer(event, tip)}
          onFocus={(event) => tooltip.focus(event, tip)}
          onBlur={tooltip.hide}
        />
      );
    });
  });
  return (
    <div ref={ref}>
      <Frame title={title} tooltip={tooltip}>
        <svg width={width} height={height} role="img" aria-label={title}>
          <text x={left} y={14} className="tick strong" textAnchor="start">{fromLabel}</text>
          <text x={right + nodeW} y={14} className="tick strong" textAnchor="end">{toLabel}</text>
          {ribbons}
          {levels.map((level, index) => (
            <g key={level}>
              {outTotals[index] > 0 && (
                <>
                  <rect x={left} y={leftNodes[index].y} width={nodeW} height={Math.max(2, leftNodes[index].h)} rx={3} fill={RISK_COLOR[level]} />
                  <text x={left - 8} y={leftNodes[index].y + leftNodes[index].h / 2} className="tick" textAnchor="end" dominantBaseline="middle">{labels[level]} · {outTotals[index]}</text>
                </>
              )}
              {inTotals[index] > 0 && (
                <>
                  <rect x={right} y={rightNodes[index].y} width={nodeW} height={Math.max(2, rightNodes[index].h)} rx={3} fill={RISK_COLOR[level]} />
                  <text x={right + nodeW + 8} y={rightNodes[index].y + rightNodes[index].h / 2} className="tick" textAnchor="start" dominantBaseline="middle">{labels[level]} · {inTotals[index]}</text>
                </>
              )}
            </g>
          ))}
        </svg>
      </Frame>
    </div>
  );
}
