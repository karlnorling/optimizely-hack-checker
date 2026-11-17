import { useCallback, useMemo, useRef, useState } from 'react';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm';
import { Analyzer, type MatchKind, type Results, type Risk } from './analyze.ts';
import { parseFile, parseText, type ParseStats } from './parsers.ts';
import {
  CATEGORIES,
  EARLIER_WAVE_HOSTS,
  EARLIER_WAVE_LABELS,
  IOC_DOMAINS,
  PRESS_NAMED_DOMAINS,
  SOURCE_URL,
  TIMELINE,
  TIMELINE_EVENTS,
  TOTAL_HOSTS,
} from './affectedSites.ts';
import { Recommendations } from './Recommendations.tsx';

/** A loaded history source: parse stats, or an error message. */
export type Source = { name: string; error: string } | ({ name: string; error: null } & ParseStats);

let sqlPromise: Promise<SqlJsStatic> | null = null;
const getSql = () => (sqlPromise ??= initSqlJs({ locateFile: () => wasmUrl }));

const fmtLocal = (ms: number | null) =>
  ms == null
    ? 'unknown time'
    : new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const fmtUtc = (ms: number | null) =>
  ms == null ? '' : new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
const fmtDate = (ms: number | null) => (ms == null ? '?' : new Date(ms).toLocaleDateString(undefined, { dateStyle: 'medium' }));

const RISK_LABEL: Record<Risk, string> = {
  high: 'High: visited while infected',
  possible: 'Possible: visited close to the window',
  unknown: 'Unknown: visit time not known',
  none: 'Not affected: visited outside the window',
};

const MATCH_LABEL: Record<MatchKind, string> = {
  ioc: 'Attacker domain',
  listed: 'Listed host',
  subdomain: 'Related host',
  press: 'Domain named in news',
  earlier: 'Earlier wave',
};

interface BrowserGuide {
  name: string;
  paths: ReadonlyArray<readonly [os: string, path: string]>;
  note: string;
}

const BROWSER_GUIDES: readonly BrowserGuide[] = [
  {
    name: 'Chrome',
    paths: [
      ['macOS', '~/Library/Application Support/Google/Chrome/Default/History'],
      ['Windows', '%LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default\\History'],
      ['Linux', '~/.config/google-chrome/Default/History'],
    ],
    note: 'Other profiles live in "Profile 1", "Profile 2"… next to "Default". Quit Chrome, or copy the file somewhere else first (Windows locks it while Chrome is open).',
  },
  {
    name: 'Edge',
    paths: [
      ['macOS', '~/Library/Application Support/Microsoft Edge/Default/History'],
      ['Windows', '%LOCALAPPDATA%\\Microsoft\\Edge\\User Data\\Default\\History'],
      ['Linux', '~/.config/microsoft-edge/Default/History'],
    ],
    note: 'Quit Edge, or copy the file elsewhere first.',
  },
  {
    name: 'Brave',
    paths: [
      ['macOS', '~/Library/Application Support/BraveSoftware/Brave-Browser/Default/History'],
      ['Windows', '%LOCALAPPDATA%\\BraveSoftware\\Brave-Browser\\User Data\\Default\\History'],
      ['Linux', '~/.config/BraveSoftware/Brave-Browser/Default/History'],
    ],
    note: 'Quit Brave, or copy the file elsewhere first.',
  },
  {
    name: 'Arc',
    paths: [['macOS', '~/Library/Application Support/Arc/User Data/Default/History']],
    note: 'Quit Arc, or copy the file elsewhere first.',
  },
  {
    name: 'Firefox',
    paths: [
      ['macOS', '~/Library/Application Support/Firefox/Profiles/<profile>/places.sqlite'],
      ['Windows', '%APPDATA%\\Mozilla\\Firefox\\Profiles\\<profile>\\places.sqlite'],
      ['Linux', '~/.mozilla/firefox/<profile>/places.sqlite'],
    ],
    note: 'Quit Firefox completely first. Recent visits sit in "places.sqlite-wal" until Firefox closes, so if Firefox is still open, 16 November may be missing. about:profiles shows the profile folder.',
  },
  {
    name: 'Safari',
    paths: [['macOS', '~/Library/Safari/History.db']],
    note: 'Quit Safari first so recent visits are written to the file. In Finder use Go → Go to Folder…, paste ~/Library/Safari, then copy History.db to your Desktop and select that copy. With iCloud sync on, this includes history from your iPhone and iPad.',
  },
  {
    name: 'Google Takeout',
    paths: [['Any', 'takeout.google.com → Chrome → BrowserHistory.json']],
    note: 'Covers Chrome history synced to your Google account, including Chrome on phones.',
  },
];

function HowTo() {
  const [open, setOpen] = useState('Chrome');
  const guide = BROWSER_GUIDES.find((g) => g.name === open) ?? BROWSER_GUIDES[0]!;
  return (
    <div className="howto">
      <div className="tabs" role="tablist">
        {BROWSER_GUIDES.map((g) => (
          <button
            key={g.name}
            role="tab"
            aria-selected={open === g.name}
            className={open === g.name ? 'tab active' : 'tab'}
            onClick={() => setOpen(g.name)}
          >
            {g.name}
          </button>
        ))}
      </div>
      <div className="tabpanel" role="tabpanel">
        <table className="paths">
          <tbody>
            {guide.paths.map(([os, p]) => (
              <tr key={os}>
                <th>{os}</th>
                <td>
                  <code>{p}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">{guide.note}</p>
        <p className="muted small">
          macOS tip: in the file picker press <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>G</kbd> to type a path, or{' '}
          <kbd>⌘</kbd> <kbd>⇧</kbd> <kbd>.</kbd> to show hidden folders such as Library.
        </p>
      </div>
    </div>
  );
}

function Coverage({ sources }: { sources: Source[] }) {
  if (!sources.length) return null;
  return (
    <ul className="coverage">
      {sources.map((s, i) => {
        if (s.error !== null) {
          return (
            <li key={i} className="err">
              <strong>{s.name}</strong> <span>{s.error}</span>
            </li>
          );
        }
        const coversIncident =
          s.minTime != null && s.maxTime != null && s.minTime <= TIMELINE.lastInfected && s.maxTime >= TIMELINE.firstInfected;
        return (
          <li key={i}>
            <strong>{s.name}</strong>{' '}
            <span className="muted">
              {s.browser}: {s.visits.toLocaleString()} visits
              {s.minTime != null && `, ${fmtDate(s.minTime)} to ${fmtDate(s.maxTime)}`}
            </span>
            {s.minTime != null && !coversIncident && (
              <div className="warn small">
                ⚠ This history does not cover 16 November 2026, so it can't show whether you were exposed. Quit the
                browser and load the file again, or check a different profile or device.
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Summary({ result, sources }: { result: Results; sources: Source[] }) {
  const totalVisits = sources.reduce((n, s) => n + (s.error === null ? s.visits : 0), 0);
  const exposed = result.findings.filter((f) => f.risk !== 'none');
  const { overall } = result;
  const text = ({
    high: `You visited ${exposed.length === 1 ? 'an affected site' : `${exposed.length} affected sites`} while the malicious script was live.`,
    possible: 'You visited affected sites close to the infection window. Exposure is possible but not confirmed.',
    unknown: 'You visited affected sites, but the visit times are unknown.',
    none: result.findings.length
      ? 'You visited affected sites, but not during the infection window.'
      : 'None of the affected sites appear in this history.',
  } satisfies Record<Risk, string>)[overall];
  return (
    <div className={`summary risk-${overall}`}>
      <div className="summary-title">{text}</div>
      <div className="small">
        Checked {totalVisits.toLocaleString()} visits from {sources.filter((s) => s.error === null).length} source(s).
      </div>
    </div>
  );
}

function Findings({ findings }: { findings: Results['findings'] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? findings : findings.filter((f) => f.risk !== 'none');
  const hidden = findings.length - visible.length;
  if (!findings.length) return null;
  return (
    <section>
      <h2>Matches in your history</h2>
      {visible.length === 0 && <p className="muted">No visits during or near the infection window.</p>}
      {visible.map((f) => (
        <details key={f.host} className={`finding risk-${f.risk}`} open={f.risk === 'high' || f.match.kind === 'ioc'}>
          <summary>
            <span className={`badge badge-${f.risk}`}>{f.risk}</span> <strong>{f.host}</strong>{' '}
            <span className="muted small">
              {MATCH_LABEL[f.match.kind]}
              {f.match.kind === 'subdomain' || f.match.kind === 'press' ? ` (${f.match.key})` : ''} · {f.match.category} ·{' '}
              {f.totalVisits} visit{f.totalVisits === 1 ? '' : 's'} in total
            </span>
          </summary>
          <p className="small">{RISK_LABEL[f.risk]}.</p>
          {f.window.note && <p className="small muted">{f.window.note}.</p>}
          {f.match.kind === 'press' && (
            <p className="small muted">
              News coverage named this domain but not the exact infected page, so a match here is less certain.
            </p>
          )}
          {f.match.earlier && (
            <p className="small muted">This domain was also hit by the earlier webshell.lol wave (13–16 Nov).</p>
          )}
          {f.visits.length > 0 && (
            <table className="visits">
              <thead>
                <tr>
                  <th>Your time</th>
                  <th>UTC</th>
                  <th>Risk</th>
                  <th>URL</th>
                </tr>
              </thead>
              <tbody>
                {f.visits.map((v, i) => (
                  <tr key={i}>
                    <td>{fmtLocal(v.time)}</td>
                    <td className="muted">{fmtUtc(v.time)}</td>
                    <td>
                      <span className={`badge badge-${v.risk}`}>{v.risk}</span>
                    </td>
                    <td className="url" title={v.url}>
                      {v.url}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </details>
      ))}
      {hidden > 0 && (
        <button className="link" onClick={() => setShowAll((s) => !s)}>
          {showAll ? 'Hide' : 'Show'} {hidden} affected site{hidden === 1 ? '' : 's'} you only visited outside the window
        </button>
      )}
    </section>
  );
}

function Timeline() {
  return (
    <details className="panel">
      <summary>
        <strong>Attack timeline</strong>
      </summary>
      <ol className="timeline">
        {TIMELINE_EVENTS.map(([iso, text]) => {
          const ms = Date.parse(iso);
          return (
            <li key={iso}>
              <span className="when">
                {fmtUtc(ms)}
                <br />
                <span className="muted small">{fmtLocal(ms)} (your time)</span>
              </span>
              <span>{text}</span>
            </li>
          );
        })}
      </ol>
      <p className="small muted">
        How visits are scored: <b>high</b> means a visit to a listed host between 04:21 and 21:52 UTC on 16 Nov, with
        per-site start and clean-up times applied where published. <b>Possible</b> means a visit between 02:21 and 04:21 UTC,
        after clean-up up to the end of 17 Nov (a cached copy of the script could still load), a related host on the
        same domain, or the earlier 13–16 Nov wave.
      </p>
    </details>
  );
}

function SiteList() {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return Object.entries(CATEGORIES)
      .map(([cat, hosts]): [string, readonly string[]] => [cat, needle ? hosts.filter((h) => h.includes(needle)) : hosts])
      .filter(([, hosts]) => hosts.length > 0);
  }, [q]);
  return (
    <details className="panel">
      <summary>
        <strong>All {TOTAL_HOSTS} affected hosts</strong>
      </summary>
      <input
        type="search"
        className="search"
        placeholder="Filter hosts…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Filter hosts"
      />
      {filtered.map(([cat, hosts]) => (
        <div key={cat} className="cat">
          <h4>
            {cat} <span className="muted">({hosts.length})</span>
          </h4>
          <p className="hosts">{hosts.join(', ')}</p>
        </div>
      ))}
      <div className="cat">
        <h4>Earlier webshell.lol wave (13–16 Nov, examples only)</h4>
        <p className="hosts">{[...EARLIER_WAVE_HOSTS, ...EARLIER_WAVE_LABELS.map((l) => `${l}.*`)].join(', ')}</p>
      </div>
      <div className="cat">
        <h4>Domains named in news coverage (exact host not given)</h4>
        <p className="hosts">{PRESS_NAMED_DOMAINS.join(', ')}</p>
      </div>
      <div className="cat">
        <h4>Attacker domains</h4>
        <p className="hosts">{IOC_DOMAINS.join(', ')}</p>
      </div>
      <p className="small muted">
        The source tables shorten a few rows ("+4 more"), so the list is not complete.
      </p>
    </details>
  );
}

export default function App() {
  const [sources, setSources] = useState<Source[]>([]);
  const [result, setResult] = useState<Results | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [pasted, setPasted] = useState('');
  const analyzerRef = useRef(new Analyzer());
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    const files = fileList ? [...fileList] : [];
    if (!files.length) return;
    setBusy(true);
    const analyzer = analyzerRef.current;
    const added: Source[] = [];
    for (const file of files) {
      try {
        const stats = await parseFile(file, getSql, (url, t) => analyzer.add(url, t, file.name));
        added.push({ name: file.name, error: null, ...stats });
      } catch (e) {
        added.push({ name: file.name, error: e instanceof Error ? e.message : String(e) });
      }
    }
    setSources((s) => [...s, ...added]);
    setResult(analyzer.results());
    setBusy(false);
  }, []);

  const handlePaste = () => {
    if (!pasted.trim()) return;
    const analyzer = analyzerRef.current;
    const stats = parseText(pasted, (url, t) => analyzer.add(url, t, 'pasted'), 'Pasted list');
    setSources((s) => [...s, { name: 'Pasted text', error: null, ...stats }]);
    setResult(analyzer.results());
    setPasted('');
  };

  const reset = () => {
    analyzerRef.current = new Analyzer();
    setSources([]);
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="container">
      <header>
        <h1>Optimizely Hack Checker</h1>
        <p className="lede">
          On <strong>16 November 2026</strong>, attackers injected malware into the Optimizely scripts of{' '}
          <strong>178 organisations</strong>, including CNN, BBC, Zoom, HSBC, Equifax and Ledger. The malware swapped
          crypto wallet addresses, skimmed payment cards, stole cookies and screenshots, and sent iPhones and iPads to
          exploit kits. Check whether your browser history includes those sites during the attack.
        </p>
        <p className="privacy">
          🔒 <strong>Everything runs in your browser.</strong> Your history is never uploaded. The page's Content
          Security Policy blocks it from contacting any other server, and you can disconnect from the internet before
          loading your file.
        </p>
      </header>

      <section>
        <h2>1. Find your history file</h2>
        <p className="muted">
          Web pages can't read your browser history, so you need to select the file yourself. You can load several
          files, for example one per browser or profile.
        </p>
        <HowTo />
      </section>

      <section>
        <h2>2. Load it</h2>
        <div
          className={`dropzone${drag ? ' drag' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            handleFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        >
          {busy ? (
            <span>Reading history…</span>
          ) : (
            <span>
              Drop <code>History</code>, <code>places.sqlite</code>, <code>History.db</code> or{' '}
              <code>BrowserHistory.json</code> here, or <u>choose files</u>
            </span>
          )}
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
        <details className="paste">
          <summary>Or paste URLs or hostnames</summary>
          <textarea
            rows={5}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={'One per line. Add a date and time to get a time-based result, e.g.\n2026-11-16 09:30 https://www.bbc.com/news\nwww.zoom.us'}
          />
          <button onClick={handlePaste} disabled={!pasted.trim()}>
            Check pasted list
          </button>
        </details>
        <Coverage sources={sources} />
        {sources.length > 0 && (
          <button className="link" onClick={reset}>
            Clear everything
          </button>
        )}
      </section>

      {result && (
        <>
          <section>
            <h2>3. Results</h2>
            <Summary result={result} sources={sources} />
          </section>
          <Findings findings={result.findings} />
          <Recommendations result={result} />
        </>
      )}

      <section>
        <h2>About the attack</h2>
        <Timeline />
        <SiteList />
      </section>

      <footer className="small muted">
        Sources:{' '}
        <a href={SOURCE_URL} target="_blank" rel="noreferrer">
          Report URI
        </a>
        ,{' '}
        <a
          href="https://www.bleepingcomputer.com/news/security/optimizely-supply-chain-attack-delivers-malware-to-cnn-fox-news-bbc-salesforce-sites/"
          target="_blank"
          rel="noreferrer"
        >
          BleepingComputer
        </a>
        ,{' '}
        <a href="https://thecybersecguru.com/news/optimizely-supply-chain-attack-optimjack/" target="_blank" rel="noreferrer">
          TheCyberSecGuru
        </a>
        ,{' '}
        <a href="https://thehackernews.com/2026/11/hijacked-optimizely-scripts-served-card.html" target="_blank" rel="noreferrer">
          The Hacker News
        </a>
        . This tool isn't affiliated with Optimizely or any affected company. A clean result only covers the history you
        loaded: private windows, cleared history and other devices aren't included.
      </footer>
    </div>
  );
}
