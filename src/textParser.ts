// Parses pasted or plain-text history in the many shapes browsers and tools
// produce. Dates without a time zone are read in the user's local time zone,
// which is how every browser history page displays them.
//
// Supported shapes (mixable):
//  - Chromium history page copy (Chrome, Edge, Brave, Vivaldi, Opera, Arc):
//      Today - Tuesday, 17 November 2026      <- day heading
//      08:11                                  <- time line ("8:11 AM" too)
//      Some page title                        <- ignored
//      github.com                             <- domain line = one visit
//  - Firefox Library / Safari History copy: one URL per line (no times).
//  - CSV/TSV and similar: a URL plus a date on the same line, as ISO
//    ("2026-11-16 14:30"), numeric ("11/16/2026 2:30 PM", "16/11/2026 14:30"),
//    textual ("16 Nov 2026 14:30", "November 16, 2026"), or an epoch number
//    (Unix s/ms, Firefox µs, Chrome WebKit µs).
//  - Bare hostnames, optionally with any of the above dates.
import type { OnVisit, ParseStats } from './parsers.ts';

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';

const URL_RE = /\bhttps?:\/\/[^\s"'<>,]+/i;
const HOST_TOKEN_RE = /(?<![@\w.-])((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})(?![\w-])/i;
const WHOLE_HOST_RE = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}\.?$/i;

const ISO_RE = /(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:\s*(Z|[+-]\d{2}:?\d{2}))?)?/;
const NUMERIC_DATE_RE = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/;
const DMY_TEXT_RE = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\.?\\s+${MONTH_RE},?\\s+(\\d{4})\\b`, 'i');
const MDY_TEXT_RE = new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'i');
const TIME_RE = /\b(\d{1,2})[:.](\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?(?![\d/])/i;
const TIME_ONLY_RE = /^(\d{1,2})[:.](\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i;
const EPOCH_RE = /(?<![\d.])(\d{10}|\d{13}|\d{16}|\d{17})(?![\d.])/;
const RELATIVE_RE = /^(today|yesterday)\b/i;

const WEBKIT_EPOCH_OFFSET_MS = 11644473600000;
const MIN_MS = Date.UTC(2000, 0, 1);
const MAX_MS = Date.UTC(2100, 0, 1);

interface Ymd {
  y: number;
  m: number; // 0-based
  d: number;
}

interface Hm {
  h: number;
  min: number;
  s: number;
}

function validYmd(y: number, m: number, d: number): Ymd | null {
  if (m < 0 || m > 11 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  return { y, m, d };
}

function to24h(h: number, ampm: string | undefined): number {
  if (!ampm) return h;
  const pm = ampm.toLowerCase().startsWith('p');
  if (h === 12) return pm ? 12 : 0;
  return pm ? h + 12 : h;
}

function parseTimeParts(m: RegExpMatchArray): Hm | null {
  const h = to24h(Number(m[1]), m[4]);
  const min = Number(m[2]);
  const s = m[3] ? Number(m[3]) : 0;
  if (h > 23 || min > 59 || s > 59) return null;
  return { h, min, s };
}

/** Finds a calendar date in the text (no time). Returns the date and the matched text. */
function findDate(text: string): { date: Ymd; match: string } | null {
  let m = text.match(DMY_TEXT_RE);
  if (m) {
    const date = validYmd(Number(m[3]), MONTHS[m[2]!.toLowerCase().slice(0, 3)] ?? -1, Number(m[1]));
    if (date) return { date, match: m[0] };
  }
  m = text.match(MDY_TEXT_RE);
  if (m) {
    const date = validYmd(Number(m[3]), MONTHS[m[1]!.toLowerCase().slice(0, 3)] ?? -1, Number(m[2]));
    if (date) return { date, match: m[0] };
  }
  m = text.match(NUMERIC_DATE_RE);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = Number(m[3]);
    // a/b/yyyy: if one part is over 12 it must be the day. Otherwise assume
    // month/day (US). Every day of the attack window (13–18) is over 12, so
    // dates that matter are never ambiguous.
    const date = a > 12 ? validYmd(y, b - 1, a) : validYmd(y, a - 1, b);
    if (date) return { date, match: m[0] };
  }
  return null;
}

function localMs(d: Ymd, t: Hm): number {
  return new Date(d.y, d.m, d.d, t.h, t.min, t.s).getTime();
}

/** A date with no time: unknown if it could be in the attack window, otherwise local noon. */
function dateOnlyMs(d: Ymd): number | null {
  const noon = new Date(d.y, d.m, d.d, 12).getTime();
  const nearWindow = noon >= Date.UTC(2026, 10, 12, 12) && noon <= Date.UTC(2026, 10, 19, 12);
  return nearWindow ? null : noon;
}

function epochToMs(digits: string): number | null {
  const n = Number(digits);
  let ms: number;
  if (digits.length === 10) ms = n * 1000;
  else if (digits.length === 13) ms = n;
  else if (digits.length === 16) ms = n / 1000;
  else ms = n / 1000 - WEBKIT_EPOCH_OFFSET_MS; // 17 digits: Chrome/WebKit µs since 1601
  return ms >= MIN_MS && ms <= MAX_MS ? ms : null;
}

/** Full timestamp written on the same line as the visit, if any. */
function inlineTimestamp(rest: string): { ms: number | null; found: boolean } {
  const iso = rest.match(ISO_RE);
  if (iso) {
    if (iso[4] === undefined) {
      const date = validYmd(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
      return { ms: date ? dateOnlyMs(date) : null, found: true };
    }
    const s = iso[0].replace(' ', 'T').replace(/\s+(?=Z|[+-]\d)/, '');
    const ms = Date.parse(s);
    return { ms: Number.isNaN(ms) ? null : ms, found: true };
  }
  const found = findDate(rest);
  if (found) {
    const tm = rest.replace(found.match, ' ').match(TIME_RE);
    const time = tm ? parseTimeParts(tm) : null;
    return { ms: time ? localMs(found.date, time) : dateOnlyMs(found.date), found: true };
  }
  const ep = rest.match(EPOCH_RE);
  if (ep) {
    const ms = epochToMs(ep[1]!);
    if (ms != null) return { ms, found: true };
  }
  return { ms: null, found: false };
}

const WEEKDAY_RE = /\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day|nesday|rsday|urday)?\b\.?/gi;

/** True if the line is only a date heading, not a title that mentions a date. */
function isHeading(line: string, dateText: string): boolean {
  const leftover = line
    .replace(dateText, ' ')
    .replace(/\b(today|yesterday)\b/gi, ' ')
    .replace(WEEKDAY_RE, ' ')
    .replace(/[\s,.\-–—·|:]+/g, '');
  return leftover === '';
}

function today(): Ymd {
  const n = new Date();
  return { y: n.getFullYear(), m: n.getMonth(), d: n.getDate() };
}

function addDays(d: Ymd, days: number): Ymd {
  const x = new Date(d.y, d.m, d.d + days);
  return { y: x.getFullYear(), m: x.getMonth(), d: x.getDate() };
}

export interface TextParseOptions {
  /** Overrides "today" for relative headings; used by tests. */
  now?: Date;
}

export function parseText(text: string, onVisit: OnVisit, label = 'Pasted list', opts: TextParseOptions = {}): ParseStats {
  const stats: ParseStats = { browser: label, visits: 0, minTime: null, maxTime: null };
  const base = opts.now
    ? { y: opts.now.getFullYear(), m: opts.now.getMonth(), d: opts.now.getDate() }
    : today();

  // State for grouped history-page pastes.
  let groupDate: Ymd | null = null;
  let groupTime: Hm | null = null;
  let grouped = false;

  const emit = (url: string, t: number | null) => {
    stats.visits++;
    if (t != null) {
      if (stats.minTime == null || t < stats.minTime) stats.minTime = t;
      if (stats.maxTime == null || t > stats.maxTime) stats.maxTime = t;
    }
    onVisit(url, t);
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    // Time-only line (Chromium history page): applies to the next domain line.
    const timeOnly = line.match(TIME_ONLY_RE);
    if (timeOnly) {
      groupTime = parseTimeParts(timeOnly);
      grouped = true;
      continue;
    }

    const url = line.match(URL_RE)?.[0] ?? null;
    const wholeHost = WHOLE_HOST_RE.test(line) ? line.replace(/\.$/, '') : null;
    const target = url ?? wholeHost ?? (grouped ? null : (line.match(HOST_TOKEN_RE)?.[1] ?? null));

    if (!target) {
      // Not a visit: maybe a day heading ("Today - Tuesday, 17 November 2026",
      // "Yesterday", "Monday, November 16, 2026"). Anything else is a title.
      const date = findDate(line);
      const rel = line.match(RELATIVE_RE);
      if (date && isHeading(line, date.match)) {
        groupDate = date.date;
        groupTime = null;
        grouped = true;
      } else if (rel) {
        groupDate = rel[1]!.toLowerCase() === 'today' ? base : addDays(base, -1);
        groupTime = null;
        grouped = true;
      }
      continue;
    }

    const rest = line.replace(target, ' ');
    const inline = inlineTimestamp(rest);
    let t: number | null = null;
    if (inline.found) {
      t = inline.ms;
    } else if (groupDate) {
      const tm = rest.match(TIME_RE);
      const time = (tm ? parseTimeParts(tm) : null) ?? groupTime;
      t = time ? localMs(groupDate, time) : dateOnlyMs(groupDate);
    }
    emit(target, t);
    // Each entry on a history page has its own time line; don't carry it over.
    groupTime = null;
  }
  return stats;
}
