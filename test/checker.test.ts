import { test } from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import { Analyzer, matchHost, assessVisit, hostOf } from '../src/analyze.ts';
import { parseSqlite, parseJson, parseText, type OnVisit, type ParseStats } from '../src/parsers.ts';

const SQL = await initSqlJs();
const utc = (h: number, m = 0, d = 16) => Date.UTC(2026, 10, d, h, m);

function run(fn: (cb: OnVisit) => ParseStats) {
  const a = new Analyzer();
  const stats = fn((u, t) => a.add(u, t, 'test'));
  return { stats, ...a.results() };
}

test('host matching', () => {
  assert.equal(matchHost('www.bbc.com')?.kind, 'listed');
  assert.equal(matchHost('money.cnn.com')?.kind, 'subdomain');
  assert.equal(matchHost('bbc.com')?.kind, 'subdomain'); // www.bbc.com listed
  assert.equal(matchHost('www.salesforce.com')?.kind, 'press');
  assert.equal(matchHost('cdn.1688360.cc')?.kind, 'ioc');
  assert.equal(matchHost('www.vidaxl.de')?.kind, 'earlier');
  assert.equal(matchHost('www.faz.net')?.kind, 'earlier');
  assert.equal(matchHost('foxsports.com')?.earlier, true);
  assert.equal(matchHost('example.com'), null);
  assert.equal(matchHost('notcnn.com'), null);
  assert.equal(hostOf('chrome://settings'), null);
  assert.equal(hostOf('HTTPS://WWW.BBC.COM./news'), 'www.bbc.com');
});

test('visit risk windows', () => {
  const m = matchHost('www.bbc.com');
  assert.equal(assessVisit('www.bbc.com', m, utc(10)), 'high');
  assert.equal(assessVisit('www.bbc.com', m, utc(3)), 'possible');
  assert.equal(assessVisit('www.bbc.com', m, utc(21, 30)), 'possible'); // cleaned 21:07
  assert.equal(assessVisit('www.bbc.com', m, utc(10, 0, 18)), 'none');
  assert.equal(assessVisit('www.bbc.com', m, null), 'unknown');
  const z = matchHost('zoom.us');
  assert.equal(assessVisit('zoom.us', z, utc(9)), 'possible'); // before 11:20 override
  assert.equal(assessVisit('zoom.us', z, utc(12)), 'high');
  const t = matchHost('www.talktalk.co.uk');
  assert.equal(assessVisit('www.talktalk.co.uk', t, utc(23)), 'high'); // never confirmed clean
  const e = matchHost('www.faz.net');
  assert.equal(assessVisit('www.faz.net', e, utc(10, 0, 14)), 'possible');
  assert.equal(assessVisit('www.faz.net', e, utc(10, 0, 20)), 'none');
});

test('Chrome History database', () => {
  const db = new SQL.Database();
  db.run('CREATE TABLE urls(id INTEGER PRIMARY KEY, url TEXT); CREATE TABLE visits(id INTEGER PRIMARY KEY, url INTEGER, visit_time INTEGER);');
  const chrome = (ms: number) => (ms + 11644473600000) * 1000;
  db.run("INSERT INTO urls VALUES (1,'https://www.bbc.com/news'),(2,'https://example.com/'),(3,'https://www.ledger.com/')");
  db.run(`INSERT INTO visits VALUES (1,1,${chrome(utc(14))}),(2,2,${chrome(utc(14))}),(3,3,${chrome(utc(10, 0, 1))})`);
  const r = run((cb) => parseSqlite(SQL, db.export(), cb));
  assert.equal(r.stats.visits, 3);
  assert.match(r.stats.browser, /Chrome/);
  assert.equal(r.overall, 'high');
  assert.equal(r.flags.cardSkimmer, true);
  assert.equal(r.findings.find((f) => f.host === 'www.ledger.com')?.risk, 'none');
});

test('Firefox places.sqlite', () => {
  const db = new SQL.Database();
  db.run('CREATE TABLE moz_places(id INTEGER PRIMARY KEY, url TEXT); CREATE TABLE moz_historyvisits(id INTEGER PRIMARY KEY, place_id INTEGER, visit_date INTEGER);');
  db.run("INSERT INTO moz_places VALUES (1,'https://zoom.us/j/123')");
  db.run(`INSERT INTO moz_historyvisits VALUES (1,1,${utc(12) * 1000})`);
  const r = run((cb) => parseSqlite(SQL, db.export(), cb));
  assert.equal(r.stats.browser, 'Firefox');
  assert.equal(r.overall, 'high');
  assert.equal(r.flags.cardSkimmer, false);
});

test('Safari History.db', () => {
  const db = new SQL.Database();
  db.run('CREATE TABLE history_items(id INTEGER PRIMARY KEY, url TEXT); CREATE TABLE history_visits(id INTEGER PRIMARY KEY, history_item INTEGER, visit_time REAL);');
  db.run("INSERT INTO history_items VALUES (1,'https://www.alaskaair.com/')");
  db.run(`INSERT INTO history_visits VALUES (1,1,${(utc(18) - 978307200000) / 1000})`);
  const r = run((cb) => parseSqlite(SQL, db.export(), cb));
  assert.equal(r.stats.browser, 'Safari');
  assert.equal(r.overall, 'high');
});

test('Takeout JSON and pasted text', () => {
  const json = JSON.stringify({ 'Browser History': [{ url: 'https://www.cnn.com/', time_usec: utc(6) * 1000 }] });
  assert.equal(run((cb) => parseJson(json, cb)).overall, 'high');
  const text = 'www.zoom.us\n2026-11-16T15:00Z https://www.o2.co.uk/shop\nnothing here';
  const r = run((cb) => parseText(text, cb));
  assert.equal(r.stats.visits, 2);
  assert.equal(r.findings.find((f) => f.host === 'www.o2.co.uk')?.risk, 'high');
  assert.equal(r.findings.find((f) => f.host === 'www.zoom.us')?.risk, 'unknown');
});

test('unrelated SQLite rejected', () => {
  const db = new SQL.Database();
  db.run('CREATE TABLE foo(x)');
  assert.throws(() => parseSqlite(SQL, db.export(), () => {}), /not a recognised/);
});
