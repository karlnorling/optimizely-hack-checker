import {
  HOST_CATEGORY,
  EARLIER_WAVE_HOSTS,
  EARLIER_WAVE_LABELS,
  PRESS_NAMED_DOMAINS,
  IOC_DOMAINS,
  IOC_IPS,
  WINDOW_OVERRIDES,
  TIMELINE,
} from './affectedSites.js';

const EARLIER_SET = new Set(EARLIER_WAVE_HOSTS);
const PRESS_SET = new Set(PRESS_NAMED_DOMAINS);
const IOC_SET = new Set([...IOC_DOMAINS, ...IOC_IPS]);

export const RISK_ORDER = { high: 4, possible: 3, unknown: 2, none: 1 };

/** Extract a normalised hostname from a URL or bare host. Returns null for non-web URLs. */
export function hostOf(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'http://' + s;
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const h = u.hostname.toLowerCase().replace(/\.$/, '');
  return h || null;
}

/** All dot-suffixes of a host, longest first: a.b.c -> [a.b.c, b.c, c] */
function suffixes(host) {
  const parts = host.split('.');
  const out = [];
  for (let i = 0; i < parts.length; i++) out.push(parts.slice(i).join('.'));
  return out;
}

function findInSet(host, set) {
  for (const s of suffixes(host)) if (set.has(s)) return s;
  return null;
}

/**
 * Decide whether a host is related to the incident.
 * Returns null, or { kind, key, category, earlier } where kind is one of
 *  'ioc'          attacker infrastructure
 *  'listed'       exact host from the Report URI list
 *  'subdomain'    subdomain of a listed host
 *  'press'        domain named in news coverage (exact host unknown)
 *  'earlier'      only matches the earlier webshell.lol wave
 */
export function matchHost(host) {
  if (!host) return null;
  const ioc = findInSet(host, IOC_SET);
  if (ioc) return { kind: 'ioc', key: ioc, category: 'Attacker infrastructure' };

  const earlier =
    !!findInSet(host, EARLIER_SET) || host.split('.').some((l) => EARLIER_WAVE_LABELS.includes(l));

  if (HOST_CATEGORY.has(host)) {
    return { kind: 'listed', key: host, category: HOST_CATEGORY.get(host), earlier };
  }
  for (const s of suffixes(host).slice(1)) {
    if (HOST_CATEGORY.has(s)) return { kind: 'subdomain', key: s, category: HOST_CATEGORY.get(s), earlier };
  }
  // A listed "www.x.com" also covers a visit to bare "x.com".
  if (HOST_CATEGORY.has('www.' + host)) {
    return { kind: 'subdomain', key: 'www.' + host, category: HOST_CATEGORY.get('www.' + host), earlier };
  }
  const press = findInSet(host, PRESS_SET);
  if (press) return { kind: 'press', key: press, category: 'Named in news coverage', earlier };
  if (earlier) return { kind: 'earlier', key: host, category: 'Earlier webshell.lol wave', earlier };
  return null;
}

/** Infection window for a host, applying per-site overrides. */
export function windowFor(host) {
  let start = TIMELINE.firstInfected;
  let end = TIMELINE.lastInfected;
  let note = null;
  const key = findInSet(host, new Set(Object.keys(WINDOW_OVERRIDES)));
  if (key) {
    const o = WINDOW_OVERRIDES[key];
    if (o.start !== undefined) start = o.start;
    if (o.end !== undefined) end = o.end === null ? TIMELINE.cacheTail : o.end;
    note = o.note;
  }
  return { start, end, note };
}

/** Risk for a single visit (timeMs may be null when the time is unknown). */
export function assessVisit(host, match, timeMs) {
  if (!match) return 'none';
  if (timeMs == null || Number.isNaN(timeMs)) return 'unknown';

  if (match.kind === 'ioc') {
    // Attacker infrastructure was active from mid-September onwards.
    return timeMs >= Date.UTC(2026, 8, 1) ? 'high' : 'possible';
  }

  let risk = 'none';
  if (match.kind !== 'earlier') {
    const w = windowFor(host);
    if (timeMs >= w.start && timeMs <= w.end) {
      risk = match.kind === 'listed' ? 'high' : 'possible';
    } else if (timeMs >= TIMELINE.lastClean && timeMs < TIMELINE.cacheTail) {
      // Just before first sighting, or after clean-up (stale cached snippet).
      risk = 'possible';
    }
  }
  if (risk === 'none' && match.earlier) {
    if (timeMs >= TIMELINE.earlierWaveStart && timeMs < TIMELINE.earlierWaveEnd) risk = 'possible';
  }
  return risk;
}

export function worse(a, b) {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

const MAX_VISITS_PER_HOST = 200;

/** Accumulates visits and produces findings. */
export class Analyzer {
  constructor() {
    this.findings = new Map(); // host -> finding
    this.matchCache = new Map();
  }

  /** Feed one visit. Returns true if it matched anything. */
  add(url, timeMs, source) {
    const host = hostOf(url);
    if (!host) return false;
    let match = this.matchCache.get(host);
    if (match === undefined) {
      match = matchHost(host);
      this.matchCache.set(host, match);
    }
    if (!match) return false;

    const risk = assessVisit(host, match, timeMs);
    let f = this.findings.get(host);
    if (!f) {
      f = { host, match, risk: 'none', visits: [], totalVisits: 0, sources: new Set(), window: windowFor(host) };
      this.findings.set(host, f);
    }
    f.totalVisits++;
    f.sources.add(source);
    f.risk = worse(f.risk, risk);
    if (risk !== 'none' && f.visits.length < MAX_VISITS_PER_HOST) {
      f.visits.push({ time: timeMs, risk, url });
    }
    return true;
  }

  results() {
    const list = [...this.findings.values()];
    for (const f of list) f.visits.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
    list.sort((a, b) => RISK_ORDER[b.risk] - RISK_ORDER[a.risk] || a.host.localeCompare(b.host));

    const exposed = list.filter((f) => f.risk === 'high' || f.risk === 'possible' || f.risk === 'unknown');
    const exposedVisits = exposed.flatMap((f) => f.visits.filter((v) => v.risk !== 'none'));
    const overall = list.reduce((acc, f) => worse(acc, f.risk), 'none');

    return {
      findings: list,
      overall,
      flags: {
        ioc: list.some((f) => f.match.kind === 'ioc' && f.risk !== 'none'),
        // Card skimmer was added at 13:43 UTC.
        cardSkimmer: exposedVisits.some((v) => v.time == null || v.time >= TIMELINE.skimmerAdded),
        // Crypto clipper payload (track.js) was built at 08:10 UTC; the webshell.lol
        // injector was active before that, so any exposed visit counts.
        crypto: exposed.length > 0,
        iosExploit: exposedVisits.some((v) => v.time == null || v.time >= TIMELINE.firstInfected),
        cryptoSite: exposed.some((f) => f.match.category === 'Crypto & Trading' || f.match.category === 'Banking & Finance'),
        unknownTimes: list.some((f) => f.risk === 'unknown'),
      },
    };
  }
}
