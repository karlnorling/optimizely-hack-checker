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
import { HistoryGuide } from './HistoryGuide.tsx';
import { OfficialStatement, SourceLinks } from './Sources.tsx';
import { REPO_URL } from './links.ts';

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
  possible: 'Possible: visited during the attack window, but this exact page may not have been infected',
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
  const count = (r: Risk) => result.findings.filter((f) => f.risk === r).length;
  const high = count('high');
  const others = count('possible') + count('unknown');
  const { overall } = result;
  const text = ({
    high:
      `You visited ${high === 1 ? 'an affected site' : `${high} affected sites`} while the malicious script was live.` +
      (others ? ` ${others} more ${others === 1 ? 'needs' : 'need'} a closer look.` : ''),
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
  // Only visits inside the attack window are shown; the rest are just counted.
  const visible = findings.filter((f) => f.risk !== 'none');
  const outside = findings.filter((f) => f.risk === 'none');
  const outsideVisits = outside.reduce((n, f) => n + f.totalVisits, 0);
  if (!findings.length) return null;
  return (
    <section>
      <h2>Visits during the attack</h2>
      {visible.length === 0 && <p className="muted">No visits to affected sites during the attack window.</p>}
      {visible.map((f) => (
        <details key={f.host} className={`finding risk-${f.risk}`} open={f.risk === 'high' || f.match.kind === 'ioc'}>
          <summary>
            <span className={`badge badge-${f.risk}`}>{f.risk}</span> <strong>{f.host}</strong>{' '}
            <span className="muted small">
              {MATCH_LABEL[f.match.kind]}
              {f.match.kind === 'subdomain' || f.match.kind === 'press' ? ` (${f.match.key})` : ''} · {f.match.category} ·{' '}
              {f.visits.length} visit{f.visits.length === 1 ? '' : 's'}
              {f.risk === 'unknown' ? ', time unknown' : ' in the attack window'}
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
      {outside.length > 0 && (
        <p className="small muted">
          Not shown: {outsideVisits.toLocaleString()} visit{outsideVisits === 1 ? '' : 's'} to {outside.length} affected
          site{outside.length === 1 ? '' : 's'} outside the attack window. Those visits weren't exposed.
        </p>
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
        Only visits inside the attack window are shown. The window is 04:21 to 21:52 UTC on 16 Nov, using each
        site's own start and clean-up time where published, or 13–16 Nov for sites hit by the earlier wave.{' '}
        <b>High</b> means a listed host. <b>Possible</b> means a related host on the same domain, a domain named only in
        news coverage, or the earlier wave. <b>Unknown</b> means a pasted visit without a time. Visits outside the
        window are counted but not listed.
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
        <div className="privacy">
          <p>
            🔒 <strong>Nothing you load or paste here is sent to any server.</strong> This page runs entirely in your
            browser (client-side only): your history file is read on your own device and never uploaded, stored or
            logged.
          </p>
          <ul className="small">
            <li>
              The page's Content Security Policy blocks it from contacting any other server, so it couldn't send your
              data anywhere even if it tried.
            </li>
            <li>You can disconnect from the internet after the page loads, and it still works.</li>
            <li>
              It's open source, so anyone can check this:{' '}
              <a href={REPO_URL} target="_blank" rel="noreferrer">
                view the code on GitHub
              </a>
              .
            </li>
          </ul>
        </div>
      </header>

      <section>
        <h2>1. Find your history file</h2>
        <p className="muted">
          Web pages aren't allowed to read your browser history, so you need to give this page a copy of the
          history file. It takes about two minutes. Pick your computer and browser for step-by-step instructions.
        </p>
        <HistoryGuide />
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
        <div className="paste">
          <h3>Or paste your history</h3>
          <p className="small muted">
            No file needed. Open your browser's history page, select everything and copy it, then paste it here. Lists
            of hosts or URLs, and spreadsheet or CSV exports, work too. Dates and times are picked up when they're
            included.
          </p>
          <details className="small">
            <summary>How to copy your history, by browser</summary>
            <ul>
              <li>
                <b>Chrome, Edge, Brave, Vivaldi, Opera, Arc:</b> press <kbd>Ctrl</kbd> <kbd>H</kbd> (<kbd>⌘</kbd>{' '}
                <kbd>Y</kbd> on a Mac), scroll down past 16 November so it loads, then press <kbd>Ctrl</kbd>{' '}
                <kbd>A</kbd> (<kbd>⌘</kbd> <kbd>A</kbd>) and <kbd>Ctrl</kbd> <kbd>C</kbd> (<kbd>⌘</kbd> <kbd>C</kbd>).
                Dates and times come along with each site.
              </li>
              <li>
                <b>Firefox:</b> press <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>H</kbd> (<kbd>⌘</kbd> <kbd>Shift</kbd>{' '}
                <kbd>H</kbd>) to open the Library, pick a day in the left column, click an entry, select all and copy.
                This copies URLs only, without times.
              </li>
              <li>
                <b>Safari:</b> choose History → Show All History (<kbd>⌘</kbd> <kbd>Y</kbd>), expand the days around 16
                November, select the entries and copy. This copies URLs only, without times.
              </li>
              <li>
                <b>Anything else:</b> one URL or hostname per line. Add a date and time on the same line for a
                time-based result, for example <code>2026-11-16 14:30 www.bbc.com</code>.
              </li>
            </ul>
            <p>
              Times without a time zone are read in your computer's time zone, the same way the history page shows
              them.
            </p>
          </details>
          <textarea
            rows={7}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            aria-label="Pasted history"
            placeholder={'Paste here. For example:\n\nMonday, 16 November 2026\n14:30\nBBC News - Home\nwww.bbc.com\n\nhttps://zoom.us/j/123\n2026-11-16 09:30 www.ledger.com'}
          />
          <button onClick={handlePaste} disabled={!pasted.trim()}>
            Check pasted history
          </button>
        </div>
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
        <OfficialStatement />
        <SourceLinks />
        <Timeline />
        <SiteList />
      </section>

      <footer className="small muted">
        <p>
          Open source on{' '}
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
          . Host list and timeline from{' '}
          <a href={SOURCE_URL} target="_blank" rel="noreferrer">
            Report URI
          </a>
          ; see <b>Research and news coverage</b> above for all sources. This tool isn't affiliated with Optimizely or
          any affected company.
        </p>
        <p>
          A clean result only covers the history you loaded: private windows, cleared history and other devices aren't
          included.
        </p>
      </footer>
    </div>
  );
}
