import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseText } from '../src/textParser.ts';

type V = [url: string, t: number | null];
function parse(text: string, now = new Date(2026, 10, 17, 9, 0)): V[] {
  const out: V[] = [];
  parseText(text, (u, t) => out.push([u, t]), 'test', { now });
  return out;
}
const local = (d: number, h: number, m: number, s = 0) => new Date(2026, 10, d, h, m, s).getTime();

test('Chrome history page copy (en-GB, 24h)', () => {
  const v = parse(`Today - Tuesday, 17 November 2026
08:11
Add step-by-step guide for finding the browser history file by karlnorling · Pull Request #4
github.com
Monday, 16 November 2026
14:30
BBC News - Home - bbc.co.uk
www.bbc.com
07:41
Latest pres`);
  assert.deepEqual(v, [
    ['github.com', local(17, 8, 11)],
    ['www.bbc.com', local(16, 14, 30)],
  ]);
});

test('Chrome/Edge history page copy (en-US, 12h) and relative headings', () => {
  const v = parse(`Yesterday - Monday, November 16, 2026
2:05 PM
Zoom
zoom.us
Today
9:15 AM
Ledger
www.ledger.com`);
  assert.deepEqual(v, [
    ['zoom.us', local(16, 14, 5)],
    ['www.ledger.com', local(17, 9, 15)],
  ]);
});

test('a time applies only to the next visit', () => {
  const v = parse(`Monday, 16 November 2026
10:05
Zoom
zoom.us
https://www.ledger.com/`);
  assert.deepEqual(v, [
    ['zoom.us', local(16, 10, 5)],
    ['https://www.ledger.com/', null],
  ]);
});

test('titles that mention a date are not headings', () => {
  const v = parse(`Monday, 16 November 2026
10:00
Report for 1 December 2026 planning
www.bbc.com`);
  assert.deepEqual(v, [['www.bbc.com', local(16, 10, 0)]]);
});

test('Firefox / Safari copy: URLs only, unknown time', () => {
  const v = parse(`https://www.bbc.com/news
https://zoom.us/j/123`);
  assert.deepEqual(v, [
    ['https://www.bbc.com/news', null],
    ['https://zoom.us/j/123', null],
  ]);
});

test('CSV/TSV with inline dates', () => {
  const v = parse(`2026-11-16T14:30:00Z,https://www.bbc.com/
"BBC","https://www.cnn.com/","2026-11-16 09:00"
11/16/2026 2:30 PM\thttps://www.o2.co.uk/
16/11/2026 14:30;https://www.ledger.com/
16 Nov 2026 08:00 https://zoom.us/
https://gitlab.com/ November 16, 2026 at 6:45 pm`);
  assert.deepEqual(v, [
    ['https://www.bbc.com/', Date.UTC(2026, 10, 16, 14, 30)],
    ['https://www.cnn.com/', local(16, 9, 0)],
    ['https://www.o2.co.uk/', local(16, 14, 30)],
    ['https://www.ledger.com/', local(16, 14, 30)],
    ['https://zoom.us/', local(16, 8, 0)],
    ['https://gitlab.com/', local(16, 18, 45)],
  ]);
});

test('epoch timestamps', () => {
  const ms = Date.UTC(2026, 10, 16, 12, 0);
  const v = parse(`https://a.example.com/,${ms / 1000}
https://b.example.com/,${ms}
https://c.example.com/,${ms * 1000}
https://d.example.com/,${(ms + 11644473600000) * 1000}`);
  assert.deepEqual(v.map((x) => x[1]), [ms, ms, ms, ms]);
});

test('bare hostnames, with and without dates; date-only near the window is unknown', () => {
  const v = parse(`www.zoom.us
2026-11-16 14:00 www.bbc.com
2026-11-16 www.cnn.com
2026-10-01 www.foxnews.com
not a host line`);
  assert.equal(v.length, 4);
  assert.deepEqual(v[0], ['www.zoom.us', null]);
  assert.deepEqual(v[1], ['www.bbc.com', local(16, 14, 0)]);
  assert.deepEqual(v[2], ['www.cnn.com', null]);
  assert.deepEqual(v[3], ['www.foxnews.com', new Date(2026, 9, 1, 12).getTime()]);
});
