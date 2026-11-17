import { COVERAGE, OFFICIAL_STATEMENT, RESEARCH, type Link } from './links.ts';

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';

function LinkList({ links }: { links: readonly Link[] }) {
  return (
    <ul className="links">
      {links.map((l) => (
        <li key={l.url}>
          <a href={l.url} target="_blank" rel="noreferrer">
            {l.title}
          </a>{' '}
          <span className="muted">· {l.publisher}</span>
          {l.note && <div className="small muted">{l.note}</div>}
        </li>
      ))}
    </ul>
  );
}

export function OfficialStatement() {
  const s = OFFICIAL_STATEMENT;
  return (
    <div className="official">
      <div className="small muted">
        Official statement · <b>{s.publisher}</b> · {fmt(s.posted)} · status: {s.status}
      </div>
      <h3>{s.title}</h3>
      <blockquote>{s.quote}</blockquote>
      <div className="small">
        Affected component: {s.component}.{' '}
        <a href={s.url} target="_blank" rel="noreferrer">
          Read on status.optimizely.com
        </a>{' '}
        ·{' '}
        <a href={s.social.url} target="_blank" rel="noreferrer">
          {s.social.publisher}
        </a>
      </div>
      <p className="small muted">
        Optimizely told reporters the vulnerability was in the Experimentation account signup flow, and that it ended
        active sessions, revoked tokens and has notified all affected customers. Check the status page for later
        updates.
      </p>
    </div>
  );
}

export function SourceLinks() {
  return (
    <details className="panel" open>
      <summary>
        <strong>Research and news coverage</strong>
      </summary>
      <h4>Research</h4>
      <LinkList links={RESEARCH} />
      <h4>News</h4>
      <LinkList links={COVERAGE} />
    </details>
  );
}
