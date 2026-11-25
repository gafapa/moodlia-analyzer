// Small helpers used by the analysis.

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function formatDateFromTimestamp(timestamp?: number | null): string {
  if (!timestamp) {
    return "Never";
  }
  return new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", year: "numeric" }).format(new Date(timestamp * 1000));
}
