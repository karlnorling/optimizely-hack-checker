// Parsers for browser history exports. Everything runs locally.
// Each parser calls onVisit(url, timeMs|null) for every visit and returns
// { browser, visits, minTime, maxTime }.

const SQLITE_MAGIC = 'SQLite format 3\u0000';

// Chrome/Chromium: microseconds since 1601-01-01 UTC
const WEBKIT_EPOCH_OFFSET_MS = 11644473600000;
// Safari: seconds since 2001-01-01 UTC
const COCOA_EPOCH_OFFSET_MS = 978307200000;

export function chromeTimeToMs(us) {
  return us ? Number(us) / 1000 - WEBKIT_EPOCH_OFFSET_MS : null;
}
export function firefoxTimeToMs(us) {
  return us ? Number(us) / 1000 : null;
}
export function safariTimeToMs(sec) {
  return sec ? Number(sec) * 1000 + COCOA_EPOCH_OFFSET_MS : null;
}

export function isSqlite(bytes) {
  if (bytes.length < 16) return false;
  for (let i = 0; i < 16; i++) if (bytes[i] !== SQLITE_MAGIC.charCodeAt(i)) return false;
  return true;
}

function track(stats, t) {
  stats.visits++;
  if (t != null && !Number.isNaN(t)) {
    if (stats.minTime == null || t < stats.minTime) stats.minTime = t;
    if (stats.maxTime == null || t > stats.maxTime) stats.maxTime = t;
  }
}

const SQLITE_FORMATS = [
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
export function parseSqlite(SQL, bytes, onVisit) {
  const db = new SQL.Database(bytes);
  try {
    const tables = new Set(
      (db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values ?? []).map((r) => r[0]),
    );
    const fmt = SQLITE_FORMATS.find((f) => f.tables.every((t) => tables.has(t)));
    if (!fmt) {
      throw new Error(
        'This SQLite file is not a recognised browser history database (expected Chrome "History", Firefox "places.sqlite" or Safari "History.db").',
      );
    }
    const stats = { browser: fmt.browser, visits: 0, minTime: null, maxTime: null };
    const stmt = db.prepare(fmt.sql);
    try {
      while (stmt.step()) {
        const [url, raw] = stmt.get();
        const t = fmt.toMs(raw);
        track(stats, t);
        onVisit(url, t);
      }
    } finally {
      stmt.free();
    }
    return stats;
  } finally {
    db.close();
  }
}

/** Google Takeout "BrowserHistory.json" (Chrome sync history). */
export function parseJson(text, onVisit) {
  const data = JSON.parse(text);
  const items = Array.isArray(data) ? data : data['Browser History'] ?? data.browserHistory ?? null;
  if (!Array.isArray(items)) {
    throw new Error('JSON file not recognised. Expected a Google Takeout BrowserHistory.json file.');
  }
  const stats = { browser: 'Google Takeout (Chrome sync)', visits: 0, minTime: null, maxTime: null };
  for (const it of items) {
    const url = it.url ?? it.URL;
    let t = null;
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
export function parseText(text, onVisit, label = 'Pasted list') {
  const stats = { browser: label, visits: 0, minTime: null, maxTime: null };
  const urlRe = /(https?:\/\/[^\s"'<>]+)|((?:[a-z0-9-]+\.)+[a-z]{2,})/i;
  const dateRe = /\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?/;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(urlRe);
    if (!m) continue;
    const d = line.replace(m[0], '').match(dateRe);
    let t = null;
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
export async function parseFile(file, getSql, onVisit) {
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
