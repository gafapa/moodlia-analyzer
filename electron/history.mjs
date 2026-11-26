// @ts-check
// Risk levels of each analysed course, one snapshot per day, so the app can show how students
// moved between levels since the previous analysis. Stored only on this computer, keyed by a
// hash of the site address and the course id; only user ids and levels are kept.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const LEVELS = new Set(['high', 'medium', 'low']);
export const MAX_SNAPSHOTS = 30;

/** @typedef {{ day: string, risks: Record<string, string> }} Snapshot */

/** @param {string} siteUrl @param {number} courseId */
export function historyKey(siteUrl, courseId) {
  return `${createHash('sha256').update(siteUrl).digest('hex').slice(0, 16)}:${courseId}`;
}

/** Only numeric user ids with a known level are kept. @param {unknown} input */
export function cleanRisks(input) {
  /** @type {Record<string, string>} */
  const risks = {};
  if (!input || typeof input !== 'object') return risks;
  for (const [key, value] of Object.entries(input)) {
    if (/^\d{1,10}$/.test(key) && LEVELS.has(String(value))) risks[key] = String(value);
  }
  return risks;
}

export class RiskHistory {
  /** @param {string} directory */
  constructor(directory) {
    this.file = path.join(directory, 'risk-history.json');
  }

  async #readAll() {
    try {
      const parsed = JSON.parse(await fs.readFile(this.file, 'utf8'));
      return parsed && typeof parsed.courses === 'object' && parsed.courses ? /** @type {Record<string, Snapshot[]>} */ (parsed.courses) : {};
    } catch (error) {
      if (/** @type {any} */ (error).code === 'ENOENT' || error instanceof SyntaxError) return {};
      throw error;
    }
  }

  /**
   * Saves today's snapshot of a course, replacing an earlier one from the same day, and
   * returns the course's snapshots, oldest first.
   * @param {string} key @param {unknown} risks @param {Date} [now]
   */
  async record(key, risks, now = new Date()) {
    const courses = await this.#readAll();
    const day = now.toISOString().slice(0, 10);
    const list = (courses[key] ?? []).filter((entry) => entry && entry.day !== day);
    list.push({ day, risks: cleanRisks(risks) });
    list.sort((a, b) => a.day.localeCompare(b.day));
    courses[key] = list.slice(-MAX_SNAPSHOTS);
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(temporary, JSON.stringify({ version: 1, courses }), { mode: 0o600 });
    await fs.rename(temporary, this.file);
    return courses[key];
  }
}
