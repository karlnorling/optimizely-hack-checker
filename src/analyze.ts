import {
  HOST_CATEGORY,
  EARLIER_WAVE_HOSTS,
  EARLIER_WAVE_LABELS,
  PRESS_NAMED_DOMAINS,
  IOC_DOMAINS,
  IOC_IPS,
  WINDOW_OVERRIDES,
  TIMELINE,
} from './affectedSites.ts';

export type Risk = 'high' | 'possible' | 'unknown' | 'none';

/**
 * How a visited host relates to the incident:
 *  - ioc        attacker infrastructure
 *  - listed     exact host from the Report URI list
 *  - subdomain  subdomain (or bare domain) of a listed host
 *  - press      domain named in news coverage (exact host unknown)
 *  - earlier    only matches the earlier webshell.lol wave
 */
export type MatchKind = 'ioc' | 'listed' | 'subdomain' | 'press' | 'earlier';

export interface Match {
  kind: MatchKind;
  /** The list entry that matched. */
  key: string;
  category: string;
  /** Also hit by the earlier 13–16 Nov webshell.lol wave. */
  earlier?: boolean;
}

export interface InfectionWindow {
  start: number;
  end: number;
  note: string | null;
}

export interface Visit {
  time: number | null;
  risk: Risk;
  url: string;
}

export interface Finding {
  host: string;
  match: Match;
  risk: Risk;
  visits: Visit[];
  totalVisits: number;
  /** Visits inside the attack window (or with unknown time), uncapped. */
  windowVisits: number;
  /** Timed visits outside the attack window. */
  outsideVisits: number;
  sources: Set<string>;
  window: InfectionWindow;
}

export interface Flags {
  ioc: boolean;
  cardSkimmer: boolean;
  crypto: boolean;
  cryptoSite: boolean;
  unknownTimes: boolean;
}

export interface Results {
  findings: Finding[];
  overall: Risk;
  flags: Flags;
}

const EARLIER_SET = new Set(EARLIER_WAVE_HOSTS);
const PRESS_SET = new Set(PRESS_NAMED_DOMAINS);
const IOC_SET = new Set([...IOC_DOMAINS, ...IOC_IPS]);
const OVERRIDE_SET = new Set(Object.keys(WINDOW_OVERRIDES));

export const RISK_ORDER: Record<Risk, number> = { high: 4, possible: 3, unknown: 2, none: 1 };

/** Extract a normalised hostname from a URL or bare host. Returns null for non-web URLs. */
export function hostOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'http://' + s;
  let u: URL;
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
function suffixes(host: string): string[] {
  const parts = host.split('.');
  return parts.map((_, i) => parts.slice(i).join('.'));
}

function findInSet(host: string, set: ReadonlySet<string>): string | null {
  for (const s of suffixes(host)) if (set.has(s)) return s;
  return null;
}

/** Decide whether a host is related to the incident. */
export function matchHost(host: string | null): Match | null {
  if (!host) return null;
  const ioc = findInSet(host, IOC_SET);
  if (ioc) return { kind: 'ioc', key: ioc, category: 'Attacker infrastructure' };

  const earlier =
    !!findInSet(host, EARLIER_SET) || host.split('.').some((l) => EARLIER_WAVE_LABELS.includes(l));

  const exact = HOST_CATEGORY.get(host);
  if (exact) return { kind: 'listed', key: host, category: exact, earlier };

  for (const s of suffixes(host).slice(1)) {
    const cat = HOST_CATEGORY.get(s);
    if (cat) return { kind: 'subdomain', key: s, category: cat, earlier };
  }
  // A listed "www.x.com" also covers a visit to bare "x.com".
  const wwwCat = HOST_CATEGORY.get('www.' + host);
  if (wwwCat) return { kind: 'subdomain', key: 'www.' + host, category: wwwCat, earlier };

  const press = findInSet(host, PRESS_SET);
  if (press) return { kind: 'press', key: press, category: 'Named in news coverage', earlier };
  if (earlier) return { kind: 'earlier', key: host, category: 'Earlier webshell.lol wave', earlier };
  return null;
}

/** Infection window for a host, applying per-site overrides. */
export function windowFor(host: string): InfectionWindow {
  let start: number = TIMELINE.firstInfected;
  let end: number = TIMELINE.lastInfected;
  let note: string | null = null;
  const key = findInSet(host, OVERRIDE_SET);
  const o = key ? WINDOW_OVERRIDES[key] : undefined;
  if (o) {
    if (o.start !== undefined) start = o.start;
    if (o.end !== undefined) end = o.end === null ? TIMELINE.noCleanupEnd : o.end;
    note = o.note;
  }
  return { start, end, note };
}

/** Risk for a single visit (timeMs is null when the time is unknown). */
export function assessVisit(host: string, match: Match | null, timeMs: number | null): Risk {
  if (!match) return 'none';
  if (timeMs == null || Number.isNaN(timeMs)) return 'unknown';

  if (match.kind === 'ioc') {
    // Attacker infrastructure was first seen in mid-September 2026; the
    // window ends when Optimizely confirmed the injected code was removed.
    // Later visits (e.g. while researching the attack) are not counted.
    return timeMs >= TIMELINE.iocFirstSeen && timeMs <= TIMELINE.statement ? 'high' : 'none';
  }

  // Only visits inside the attack window count. A listed host is "high"; a
  // related host or a domain only named in the news is "possible", because
  // the time is right but the exact page may not have been infected. The
  // gap between the last clean capture (02:21) and the first infected one
  // (04:21) is "possible" too, since the injection happened somewhere in it.
  let risk: Risk = 'none';
  if (match.kind !== 'earlier') {
    const w = windowFor(host);
    if (timeMs >= w.start && timeMs <= w.end) {
      risk = match.kind === 'listed' ? 'high' : 'possible';
    } else if (timeMs >= TIMELINE.lastClean && timeMs < w.start && w.start === TIMELINE.firstInfected) {
      risk = 'possible';
    }
  }
  if (risk === 'none' && match.earlier) {
    if (timeMs >= TIMELINE.earlierWaveStart && timeMs < TIMELINE.earlierWaveEnd) risk = 'possible';
  }
  return risk;
}

export function worse(a: Risk, b: Risk): Risk {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

const MAX_VISITS_PER_HOST = 200;

/** Accumulates visits and produces findings. */
export class Analyzer {
  private findings = new Map<string, Finding>();
  private matchCache = new Map<string, Match | null>();

  /** Feed one visit. Returns true if it matched anything. */
  add(url: string, timeMs: number | null, source: string): boolean {
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
      f = { host, match, risk: 'none', visits: [], totalVisits: 0, windowVisits: 0, outsideVisits: 0, sources: new Set(), window: windowFor(host) };
      this.findings.set(host, f);
    }
    f.totalVisits++;
    if (risk !== 'none') f.windowVisits++;
    else if (timeMs != null && !Number.isNaN(timeMs)) f.outsideVisits++;
    f.sources.add(source);
    f.risk = worse(f.risk, risk);
    if (risk !== 'none' && f.visits.length < MAX_VISITS_PER_HOST) {
      f.visits.push({ time: timeMs, risk, url });
    }
    return true;
  }

  results(): Results {
    const list = [...this.findings.values()];
    for (const f of list) f.visits.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
    list.sort((a, b) => RISK_ORDER[b.risk] - RISK_ORDER[a.risk] || a.host.localeCompare(b.host));

    const exposed = list.filter((f) => f.risk !== 'none');
    const exposedVisits = exposed.flatMap((f) => f.visits);
    const overall = list.reduce<Risk>((acc, f) => worse(acc, f.risk), 'none');

    return {
      findings: list,
      overall,
      flags: {
        ioc: list.some((f) => f.match.kind === 'ioc' && f.risk !== 'none'),
        // Card skimmer was added at 13:43 UTC.
        cardSkimmer: exposedVisits.some((v) => v.time == null || v.time >= TIMELINE.skimmerAdded),
        // The webshell.lol injector was active before the clipper payload was
        // built at 08:10 UTC, so any exposed visit counts.
        crypto: exposed.length > 0,
        cryptoSite: exposed.some(
          (f) => f.match.category === 'Crypto & Trading' || f.match.category === 'Banking & Finance',
        ),
        unknownTimes: list.some((f) => f.risk === 'unknown'),
      },
    };
  }
}
