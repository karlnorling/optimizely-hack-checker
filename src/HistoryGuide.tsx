import { useState, type ReactNode } from 'react';

export type OS = 'mac' | 'windows' | 'linux';
export type BrowserId = 'chrome' | 'edge' | 'brave' | 'arc' | 'opera' | 'vivaldi' | 'firefox' | 'safari';

interface BrowserInfo {
  id: BrowserId;
  name: string;
  family: 'chromium' | 'firefox' | 'safari';
  /** Internal page that shows the profile folder; web pages can't link to these. */
  profilePage?: { url: string; field: string };
  /** Typical folder holding the history file, per OS. */
  folders: Partial<Record<OS, string>>;
  file: string;
}

const BROWSERS: readonly BrowserInfo[] = [
  {
    id: 'chrome',
    name: 'Chrome',
    family: 'chromium',
    profilePage: { url: 'chrome://version', field: 'Profile Path' },
    folders: {
      mac: '~/Library/Application Support/Google/Chrome/Default',
      windows: '%LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default',
      linux: '~/.config/google-chrome/Default',
    },
    file: 'History',
  },
  {
    id: 'edge',
    name: 'Edge',
    family: 'chromium',
    profilePage: { url: 'edge://version', field: 'Profile path' },
    folders: {
      mac: '~/Library/Application Support/Microsoft Edge/Default',
      windows: '%LOCALAPPDATA%\\Microsoft\\Edge\\User Data\\Default',
      linux: '~/.config/microsoft-edge/Default',
    },
    file: 'History',
  },
  {
    id: 'brave',
    name: 'Brave',
    family: 'chromium',
    profilePage: { url: 'brave://version', field: 'Profile Path' },
    folders: {
      mac: '~/Library/Application Support/BraveSoftware/Brave-Browser/Default',
      windows: '%LOCALAPPDATA%\\BraveSoftware\\Brave-Browser\\User Data\\Default',
      linux: '~/.config/BraveSoftware/Brave-Browser/Default',
    },
    file: 'History',
  },
  {
    id: 'arc',
    name: 'Arc',
    family: 'chromium',
    profilePage: { url: 'chrome://version', field: 'Profile Path' },
    folders: { mac: '~/Library/Application Support/Arc/User Data/Default' },
    file: 'History',
  },
  {
    id: 'opera',
    name: 'Opera',
    family: 'chromium',
    profilePage: { url: 'opera://about', field: 'Profile' },
    folders: {
      mac: '~/Library/Application Support/com.operasoftware.Opera',
      windows: '%APPDATA%\\Opera Software\\Opera Stable',
      linux: '~/.config/opera',
    },
    file: 'History',
  },
  {
    id: 'vivaldi',
    name: 'Vivaldi',
    family: 'chromium',
    profilePage: { url: 'vivaldi://about', field: 'Profile Path' },
    folders: {
      mac: '~/Library/Application Support/Vivaldi/Default',
      windows: '%LOCALAPPDATA%\\Vivaldi\\User Data\\Default',
      linux: '~/.config/vivaldi/Default',
    },
    file: 'History',
  },
  {
    id: 'firefox',
    name: 'Firefox',
    family: 'firefox',
    profilePage: { url: 'about:profiles', field: 'Root Directory' },
    folders: {
      mac: '~/Library/Application Support/Firefox/Profiles/<name>.default-release',
      windows: '%APPDATA%\\Mozilla\\Firefox\\Profiles\\<name>.default-release',
      linux: '~/.mozilla/firefox/<name>.default-release',
    },
    file: 'places.sqlite',
  },
  {
    id: 'safari',
    name: 'Safari',
    family: 'safari',
    folders: { mac: '~/Library/Safari' },
    file: 'History.db',
  },
];

const OS_NAMES: Record<OS, string> = { mac: 'macOS', windows: 'Windows', linux: 'Linux' };

interface Detected {
  os: OS | 'ios' | 'android' | null;
  browser: BrowserId | null;
}

/** Best-effort guess at the visitor's OS and browser. Purely local. */
export function detect(): Detected {
  if (typeof navigator === 'undefined') return { os: null, browser: null };
  const ua = navigator.userAgent;
  const nav = navigator as Navigator & { brave?: unknown; userAgentData?: { platform?: string } };
  const platform = (nav.userAgentData?.platform || navigator.platform || '').toLowerCase();

  let os: Detected['os'] = null;
  if (/iphone|ipad|ipod/i.test(ua) || (platform === 'macintel' && navigator.maxTouchPoints > 1)) os = 'ios';
  else if (/android/i.test(ua)) os = 'android';
  else if (platform.includes('mac')) os = 'mac';
  else if (platform.includes('win')) os = 'windows';
  else if (platform.includes('linux') || /linux|x11|cros/i.test(ua)) os = 'linux';

  let browser: BrowserId | null = null;
  if (nav.brave) browser = 'brave';
  else if (/Edg\//.test(ua)) browser = 'edge';
  else if (/OPR\//.test(ua)) browser = 'opera';
  else if (/Vivaldi/.test(ua)) browser = 'vivaldi';
  else if (/Firefox\//.test(ua)) browser = 'firefox';
  else if (/Chrome\//.test(ua)) browser = 'chrome'; // Arc is indistinguishable from Chrome
  else if (/Safari\//.test(ua)) browser = 'safari';
  return { os, browser };
}

function CopyText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the text is still selectable */
    }
  };
  return (
    <span className="copy">
      <code>{text}</code>
      <button type="button" className="copy-btn" onClick={copy} aria-label={`Copy ${text}`}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  );
}

function Kbd({ keys }: { keys: string[] }) {
  return (
    <>
      {keys.map((k, i) => (
        <span key={i}>
          {i > 0 && ' '}
          <kbd>{k}</kbd>
        </span>
      ))}
    </>
  );
}

/** How to open a folder path in the OS file manager. */
function OpenFolderStep({ os, folder }: { os: OS; folder: ReactNode }) {
  if (os === 'mac') {
    return (
      <li>
        Open that folder in Finder: click the desktop, press <Kbd keys={['⌘', '⇧', 'G']} /> (or choose{' '}
        <b>Go → Go to Folder…</b> in the menu bar), paste {folder} and press <kbd>Return</kbd>.
      </li>
    );
  }
  if (os === 'windows') {
    return (
      <li>
        Open that folder in File Explorer: press <Kbd keys={['⊞ Win', 'R']} />, paste {folder} and press{' '}
        <kbd>Enter</kbd>. Parts like <code>%APPDATA%</code> work as typed; Windows fills them in.
      </li>
    );
  }
  return (
    <li>
      Open that folder in your file manager: press <Kbd keys={['Ctrl', 'L']} /> to type a location, paste {folder}{' '}
      and press <kbd>Enter</kbd>. Folders starting with a dot are hidden; press <Kbd keys={['Ctrl', 'H']} /> to show
      them.
    </li>
  );
}

function desktopName(os: OS) {
  return os === 'windows' ? 'Desktop (or Documents)' : 'Desktop';
}

/** Explicit copy-and-paste instructions; dragging in Finder moves the file instead of copying it. */
function CopyFile({ os, file }: { os: OS; file: string }) {
  const mod = os === 'mac' ? '⌘' : 'Ctrl';
  return (
    <>
      Click <code>{file}</code> once, press <Kbd keys={[mod, 'C']} />, open your {desktopName(os)} and press{' '}
      <Kbd keys={[mod, 'V']} /> to paste a copy. <b>Don't drag it</b>: dragging can move the file out of the browser's
      folder instead of copying it.
    </>
  );
}

function Steps({ b, os }: { b: BrowserInfo; os: OS }) {
  const folder = b.folders[os];

  if (b.family === 'safari') {
    return (
      <ol className="steps">
        <li>
          <b>Quit Safari</b> with <Kbd keys={['⌘', 'Q']} />. Safari keeps recent visits in a side file until it quits,
          so without this step 16 November may be missing. Use a different browser to follow these steps, or note them
          down first.
        </li>
        <OpenFolderStep os="mac" folder={<CopyText text="~/Library/Safari" />} />
        <li>
          Find <code>History.db</code>. Ignore <code>History.db-wal</code>, <code>History.db-shm</code> and the
          other files next to it.
        </li>
        <li>
          <CopyFile os="mac" file="History.db" /> macOS protects <code>~/Library/Safari</code>, so browsers often
          can't open the original; the copy on your Desktop avoids that.
        </li>
        <li>Reopen Safari (or any browser), come back to this page and drop the copy from your Desktop below.</li>
        <li className="muted">When you're done, you can delete the copy from your Desktop.</li>
      </ol>
    );
  }

  const quitKeys = os === 'mac' ? ['⌘', 'Q'] : os === 'windows' ? ['Alt', 'F4'] : ['Ctrl', 'Q'];

  return (
    <ol className="steps">
      {b.profilePage && (
        <li>
          In {b.name}, open a new tab, paste <CopyText text={b.profilePage.url} /> into the address bar and press{' '}
          <kbd>{os === 'mac' ? 'Return' : 'Enter'}</kbd>.{' '}
          {b.family === 'firefox' ? (
            <>
              Find the profile marked <b>"This is the profile in use"</b>. Next to <b>{b.profilePage.field}</b>, click{' '}
              <b>{os === 'mac' ? 'Show in Finder' : os === 'windows' ? 'Open Folder' : 'Open Directory'}</b> and skip
              the next step.
            </>
          ) : (
            <>
              Copy the folder shown next to <b>{b.profilePage.field}</b>. This is the profile you're using right now;
              repeat these steps in each profile if you have several.
            </>
          )}
        </li>
      )}
      <OpenFolderStep
        os={os}
        folder={folder ? <>the folder from step 1 (usually <CopyText text={folder} />)</> : 'the folder from step 1'}
      />
      <li>
        Find the file named <code>{b.file}</code>
        {b.family === 'chromium' && (
          <>
            {' '}
            (it has no file extension{os === 'windows' ? '; Explorer shows its type as "File"' : ''}).
            Ignore <code>History-journal</code>, <code>History Provider Cache</code> and similar files
          </>
        )}
        {b.family === 'firefox' && (
          <>
            . Ignore <code>places.sqlite-wal</code> and <code>places.sqlite-shm</code>
          </>
        )}
        .
      </li>
      <li>
        {b.family === 'firefox' ? (
          <>
            <b>Quit Firefox completely</b> (<Kbd keys={quitKeys} />
            {os === 'windows' ? ', or menu → Exit' : ''}). Firefox keeps recent visits in a side file until it quits,
            so without this step 16 November may be missing. Then: <CopyFile os={os} file="places.sqlite" />
          </>
        ) : (
          <>
            <CopyFile os={os} file={b.file} />
            {os === 'windows' && (
              <>
                {' '}
                If Windows says the file is in use, quit {b.name} completely (also from the system tray icon near the
                clock) and try again.
              </>
            )}
          </>
        )}
      </li>
      <li>
        Come back to this page{b.family === 'firefox' ? ' (reopen Firefox or use another browser)' : ''} and drop the
        copy from your {desktopName(os)} below.
      </li>
      <li className="muted">When you're done, you can delete the copy.</li>
    </ol>
  );
}

function FallbackPaths({ b, os }: { b: BrowserInfo; os: OS }) {
  const others = (Object.keys(b.folders) as OS[]).filter((o) => o !== os);
  if (!others.length) return null;
  return (
    <details className="small">
      <summary>Paths on other operating systems</summary>
      <table className="paths">
        <tbody>
          {others.map((o) => (
            <tr key={o}>
              <th>{OS_NAMES[o]}</th>
              <td>
                <code>{b.folders[o]}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export function HistoryGuide() {
  const [detected] = useState(detect);
  const desktopOs: OS = detected.os === 'mac' || detected.os === 'windows' || detected.os === 'linux' ? detected.os : 'mac';
  const [os, setOs] = useState<OS>(desktopOs);
  const [browserId, setBrowserId] = useState<BrowserId>(detected.browser ?? 'chrome');

  const available = BROWSERS.filter((b) => b.folders[os]);
  const b = available.find((x) => x.id === browserId) ?? available[0]!;
  const isMobile = detected.os === 'ios' || detected.os === 'android';

  return (
    <div className="guide">
      {isMobile && (
        <div className="rec urgent small">
          <b>You're on {detected.os === 'ios' ? 'an iPhone or iPad' : 'a phone'}.</b> Phones don't let you export browser
          history as a file. See <a href="#mobile">checking a phone</a> below, or open this page on a computer.
        </div>
      )}

      <div className="pickers">
        <label>
          Computer
          <select value={os} onChange={(e) => setOs(e.target.value as OS)}>
            {(Object.keys(OS_NAMES) as OS[]).map((o) => (
              <option key={o} value={o}>
                {OS_NAMES[o]}
                {o === detected.os ? ' (detected)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Browser
          <select value={b.id} onChange={(e) => setBrowserId(e.target.value as BrowserId)}>
            {available.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
                {x.id === detected.browser ? ' (detected)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="tabpanel">
        <h3>
          {b.name} on {OS_NAMES[os]}
        </h3>
        <Steps b={b} os={os} />
        <FallbackPaths b={b} os={os} />
      </div>

      <details className="panel">
        <summary>
          <strong>Use more than one browser or profile?</strong>
        </summary>
        <p className="small">
          Each browser and each profile has its own history file. Repeat the steps for each one and drop all the files
          in together; the results are combined. In Chrome, Edge, Brave and Vivaldi, other profiles live in folders
          named <code>Profile 1</code>, <code>Profile 2</code> and so on, next to <code>Default</code>.
        </p>
      </details>

      <details className="panel">
        <summary>
          <strong>Use Google Takeout instead (Chrome with sync)</strong>
        </summary>
        <p className="small">
          If you sign in to Chrome with sync on, Google keeps your history from every device, including Chrome on
          phones.
        </p>
        <ol className="steps small">
          <li>
            Go to <b>takeout.google.com</b> and sign in.
          </li>
          <li>
            Click <b>Deselect all</b>, then tick <b>Chrome</b>. Click <b>All Chrome data included</b> and keep only{' '}
            <b>BrowserHistory</b>.
          </li>
          <li>
            Click <b>Next step</b>, then <b>Create export</b>. Google emails you a link, usually within minutes.
          </li>
          <li>
            Download and unzip the file. Open <code>Takeout/Chrome</code> and drop <code>History.json</code> (called{' '}
            <code>BrowserHistory.json</code> in older exports) below.
          </li>
        </ol>
      </details>

      <details className="panel" id="mobile" open={isMobile}>
        <summary>
          <strong>Checking a phone or tablet</strong>
        </summary>
        <ul className="small">
          <li>
            <b>iPhone and iPad (Safari):</b> if Safari is turned on under Settings → [your name] → iCloud on both the
            phone and a Mac, the Mac's <code>History.db</code> includes the phone's history. Follow the Safari steps on
            the Mac.
          </li>
          <li>
            <b>Chrome on any phone:</b> if Chrome sync is on, use Google Takeout above.
          </li>
          <li>
            <b>Otherwise:</b> open the browser's history on the phone (Safari: bookmarks icon → clock tab; Chrome: ⋮ →
            History) and scroll to 16 November. Type any affected sites you see into the paste box below, with the
            date and time, for example <code>2026-11-16 14:30 www.bbc.com</code>.
          </li>
          <li>
            Whatever you find, update iPhones and iPads to iOS 18.7.3 or later, or 26.3 or later. The attack
            targeted iOS directly.
          </li>
        </ul>
      </details>

      <details className="panel">
        <summary>
          <strong>Having trouble?</strong>
        </summary>
        <dl className="faq small">
          <dt>I can't see the Library or AppData folder.</dt>
          <dd>
            These folders are hidden. Use the paste-a-path steps above rather than clicking through folders. On macOS
            you can also press <Kbd keys={['⌘', '⇧', '.']} /> in Finder or a file picker to show hidden folders. On
            Windows, choose <b>View → Show → Hidden items</b> in File Explorer.
          </dd>
          <dt>The page says it can't read the file, or it's "not a recognised" database.</dt>
          <dd>
            Make sure you picked <code>History</code>, <code>places.sqlite</code> or <code>History.db</code> itself,
            not a file ending in <code>-journal</code>, <code>-wal</code> or <code>-shm</code>. Load the copy on your
            Desktop rather than the original.
          </dd>
          <dt>It says my history doesn't cover 16 November.</dt>
          <dd>
            Either the browser was still open when you copied the file (quit it and copy again), you picked a
            different profile, or the history was cleared. Private and incognito windows are never saved.
          </dd>
          <dt>Is it safe to copy these files?</dt>
          <dd>
            Yes. Copying doesn't change your browser. The page reads the copy in your browser and never uploads it.
            Delete the copy afterwards if you like.
          </dd>
        </dl>
      </details>
    </div>
  );
}
