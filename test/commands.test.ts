import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeSh, quotePs, historyCommands } from '../src/commands.ts';

test('escapeSh escapes spaces with backslashes and keeps ~ expandable', () => {
  assert.equal(
    escapeSh('~/Library/Application Support/Google/Chrome/Profile 1/History'),
    '~/Library/Application\\ Support/Google/Chrome/Profile\\ 1/History',
  );
  assert.equal(escapeSh("~/it's (here)"), "~/it\\'s\\ \\(here\\)");
  assert.equal(escapeSh('*.default-release'), '\\*.default-release');
  assert.equal(escapeSh('*.default-release', { glob: true }), '*.default-release');
});

test('quotePs converts %VARS% and quotes', () => {
  assert.equal(quotePs('%LOCALAPPDATA%\\Google\\Chrome\\User Data'), '"$env:LOCALAPPDATA\\Google\\Chrome\\User Data"');
});

test('macOS Chrome commands', () => {
  const c = historyCommands({
    shell: 'sh',
    root: '~/Library/Application Support/Google/Chrome',
    profile: 'Profile 1',
    file: 'History',
    label: 'Chrome',
    mac: true,
  });
  assert.equal(c.list, 'ls -lt ~/Library/Application\\ Support/Google/Chrome/*/History');
  assert.equal(c.copy, 'cp ~/Library/Application\\ Support/Google/Chrome/Profile\\ 1/History ~/Desktop/Chrome-History');
  assert.equal(c.reveal, 'open -R ~/Library/Application\\ Support/Google/Chrome/Profile\\ 1/History');
});

test('Firefox glob stays unescaped; Safari has no profiles', () => {
  const ff = historyCommands({ shell: 'sh', root: '~/.mozilla/firefox', profile: '*.default-release', file: 'places.sqlite', label: 'Firefox' });
  assert.equal(ff.copy, 'cp ~/.mozilla/firefox/*.default-release/places.sqlite ~/Desktop/Firefox-History.sqlite');
  const sf = historyCommands({ shell: 'sh', root: '~/Library/Safari', file: 'History.db', label: 'Safari', mac: true });
  assert.equal(sf.list, undefined);
  assert.equal(sf.copy, 'cp ~/Library/Safari/History.db ~/Desktop/Safari-History.db');
});

test('Windows PowerShell commands', () => {
  const c = historyCommands({
    shell: 'powershell',
    root: '%LOCALAPPDATA%\\Google\\Chrome\\User Data',
    profile: 'Default',
    file: 'History',
    label: 'Chrome',
  });
  assert.equal(
    c.list,
    'Get-ChildItem "$env:LOCALAPPDATA\\Google\\Chrome\\User Data\\*\\History" | Sort-Object LastWriteTime -Descending | Select-Object LastWriteTime, FullName',
  );
  assert.equal(
    c.copy,
    `Copy-Item "$env:LOCALAPPDATA\\Google\\Chrome\\User Data\\Default\\History" "$([Environment]::GetFolderPath('Desktop'))\\Chrome-History"`,
  );
});
