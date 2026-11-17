// Parsers for browser history exports. Everything runs locally.
// Each parser calls onVisit(url, timeMs | null) for every visit and returns stats.
import type { SqlJsStatic } from 'sql.js';

export type OnVisit = (url: string, timeMs: number | null) => void;

export interface ParseStats {
  browser: string;
  visits: number;
  minTime: number | null;
  maxTime: number | null;
}

const SQLITE_MAGIC = 'SQLite format 3\u0000';

// Chrome/Chromium: microseconds since 1601-01-01 UTC
const WEBKIT_EPOCH_OFFSET_MS = 11644473600000;
// Safari: seconds since 2001-01-01 UTC
const COCOA_EPOCH_OFFSET_MS = 978307200000;

type RawTime = number | string | null | undefined;

export function chromeTimeToMs(us: RawTime): number | null {
  return us ? Number(us) / 1000 - WEBKIT_EPOCH_OFFSET_MS : null;
}
export function firefoxTimeToMs(us: RawTime): number | null {
  return us ? Number(us) / 1000 : null;
}
export function safariTimeToMs(sec: RawTime): number | null {
  return sec ? Number(sec) * 1000 + COCOA_EPOCH_OFFSET_MS : null;
}

export function isSqlite(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false;
  for (let i = 0; i < 16; i++) if (bytes[i] !== SQLITE_MAGIC.charCodeAt(i)) return false;
  return true;
}

function newStats(browser: string): ParseStats {
  return { browser, visits: 0, minTime: null, maxTime: null };
}

function track(stats: ParseStats, t: number | null): void {
  stats.visits++;
  if (t != null && !Number.isNaN(t)) {
    if (stats.minTime == null || t < stats.minTime) stats.minTime = t;
    if (stats.maxTime == null || t > stats.maxTime) stats.maxTime = t;
  }
}

interface SqliteFormat {
  browser: string;
  tables: readonly string[];
  sql: string;
  toMs: (raw: RawTime) => number | null;
}

const SQLITE_FORMATS: readonly SqliteFormat[] = [
  {
    browser: 'Chrome / Edge / Brave / Arc / Opera / Vivaldi',
    tables: ['urls', 'visits'],
    sql: 'SELECT u.url, v.visit_time FROM visits v JOIN urls u ON u.id = v.url',
    toMs: chromeTimeToMs,
  },
  {
    browser: 'Firefox',
    tables: ['moz_places', 'moz_historyvisits'],
    sql: 'SELECT p.url, v.visit_date FROM moz_historyvisits v JOIN moz_places p ON p.id = v.place_id',
    toMs: firefoxTimeToMs,
  },
  {
    browser: 'Safari',
    tables: ['history_items', 'history_visits'],
    sql: 'SELECT i.url, v.visit_time FROM history_visits v JOIN history_items i ON i.id = v.history_item',
    toMs: safariTimeToMs,
  },
];

/** Parse a SQLite history database. `SQL` is an initialised sql.js module. */
export function parseSqlite(SQL: SqlJsStatic, bytes: Uint8Array, onVisit: OnVisit): ParseStats {
  const db = new SQL.Database(bytes);
  try {
    const rows = db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values ?? [];
    const tables = new Set(rows.map((r) => String(r[0])));
    const fmt = SQLITE_FORMATS.find((f) => f.tables.every((t) => tables.has(t)));
    if (!fmt) {
      throw new Error(
        'This SQLite file is not a recognised browser history database (expected Chrome "History", Firefox "places.sqlite" or Safari "History.db").',
      );
    }
    const stats = newStats(fmt.browser);
    const stmt = db.prepare(fmt.sql);
    try {
      while (stmt.step()) {
        const [url, raw] = stmt.get();
        const t = fmt.toMs(raw as RawTime);
        track(stats, t);
        onVisit(String(url ?? ''), t);
      }
    } finally {
      stmt.free();
    }
    return stats;
  } finally {
    db.close();
  }
}

interface TakeoutItem {
  url?: string;
  URL?: string;
  time_usec?: number | string;
  lastVisitTime?: number | string;
  time?: string;
}

/** Google Takeout "BrowserHistory.json" (Chrome sync history). */
export function parseJson(text: string, onVisit: OnVisit): ParseStats {
  const data: unknown = JSON.parse(text);
  let items: unknown = null;
  if (Array.isArray(data)) items = data;
  else if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    items = o['Browser History'] ?? o['browserHistory'] ?? null;
  }
  if (!Array.isArray(items)) {
    throw new Error('JSON file not recognised. Expected a Google Takeout BrowserHistory.json file.');
  }
  const stats = newStats('Google Takeout (Chrome sync)');
  for (const it of items as TakeoutItem[]) {
    const url = it.url ?? it.URL ?? '';
    let t: number | null = null;
    if (it.time_usec != null) t = Number(it.time_usec) / 1000;
    else if (it.lastVisitTime != null) t = Number(it.lastVisitTime);
    else if (it.time) t = Date.parse(it.time);
    track(stats, t);
    onVisit(url, t);
  }
  return stats;
}

/**
 * Plain text: one URL or hostname per line. A line may optionally contain an
 * ISO date/time anywhere (e.g. "2026-11-16 09:12 https://www.bbc.com/"),
 * otherwise the visit time is unknown.
 */
export function parseText(text: string, onVisit: OnVisit, label = 'Pasted list'): ParseStats {
  const stats = newStats(label);
  const urlRe = /(https?:\/\/[^\s"'<>]+)|((?:[a-z0-9-]+\.)+[a-z]{2,})/i;
  const dateRe = /\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?/;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(urlRe);
    if (!m) continue;
    const d = line.replace(m[0], '').match(dateRe);
    let t: number | null = null;
    if (d) {
      const parsed = Date.parse(d[0].replace(' ', 'T'));
      if (!Number.isNaN(parsed)) t = parsed;
    }
    track(stats, t);
    onVisit(m[0], t);
  }
  return stats;
}

/** Dispatch on file content. `getSql` lazily initialises sql.js. */
export async function parseFile(
  file: File,
  getSql: () => Promise<SqlJsStatic>,
  onVisit: OnVisit,
): Promise<ParseStats> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (isSqlite(bytes)) {
    const SQL = await getSql();
    return parseSqlite(SQL, bytes, onVisit);
  }
  const text = new TextDecoder().decode(bytes);
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return parseJson(text, onVisit);
  if (/-wal$|-shm$|-journal$/i.test(file.name)) {
    throw new Error('This is a SQLite side file. Quit the browser and select the main history database instead.');
  }
  return parseText(text, onVisit, `Text file (${file.name})`);
}
