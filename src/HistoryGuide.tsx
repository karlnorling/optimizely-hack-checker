import { useState, type ReactNode } from 'react';
import { historyCommands } from './commands.ts';

export type OS = 'mac' | 'windows' | 'linux';
export type BrowserId = 'chrome' | 'edge' | 'brave' | 'arc' | 'opera' | 'vivaldi' | 'firefox' | 'safari';

interface BrowserInfo {
  id: BrowserId;
  name: string;
  family: 'chromium' | 'firefox' | 'safari';
  /** Internal page that shows the profile folder; web pages can't link to these. */
  profilePage?: { url: string; field: string };
  /**
   * Per OS: the folder holding the history file or, for browsers with
   * profiles, the parent folder that holds every profile folder.
   */
  roots: Partial<Record<OS, string>>;
  /** Profile folder used when the user hasn't chosen one; absent = no profiles. */
  defaultProfile?: string;
  file: string;
}

const BROWSERS: readonly BrowserInfo[] = [
  {
    id: 'chrome',
    name: 'Chrome',
    family: 'chromium',
    profilePage: { url: 'chrome://version', field: 'Profile Path' },
    roots: {
      mac: '~/Library/Application Support/Google/Chrome',
      windows: '%LOCALAPPDATA%\\Google\\Chrome\\User Data',
      linux: '~/.config/google-chrome',
    },
    defaultProfile: 'Default',
    file: 'History',
  },
  {
    id: 'edge',
    name: 'Edge',
    family: 'chromium',
    profilePage: { url: 'edge://version', field: 'Profile path' },
    roots: {
      mac: '~/Library/Application Support/Microsoft Edge',
      windows: '%LOCALAPPDATA%\\Microsoft\\Edge\\User Data',
      linux: '~/.config/microsoft-edge',
    },
    defaultProfile: 'Default',
    file: 'History',
  },
  {
    id: 'brave',
    name: 'Brave',
    family: 'chromium',
    profilePage: { url: 'brave://version', field: 'Profile Path' },
    roots: {
      mac: '~/Library/Application Support/BraveSoftware/Brave-Browser',
      windows: '%LOCALAPPDATA%\\BraveSoftware\\Brave-Browser\\User Data',
      linux: '~/.config/BraveSoftware/Brave-Browser',
    },
    defaultProfile: 'Default',
    file: 'History',
  },
  {
    id: 'arc',
    name: 'Arc',
    family: 'chromium',
    profilePage: { url: 'chrome://version', field: 'Profile Path' },
    roots: { mac: '~/Library/Application Support/Arc/User Data' },
    defaultProfile: 'Default',
    file: 'History',
  },
  {
    id: 'opera',
    name: 'Opera',
    family: 'chromium',
    profilePage: { url: 'opera://about', field: 'Profile' },
    roots: {
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
    roots: {
      mac: '~/Library/Application Support/Vivaldi',
      windows: '%LOCALAPPDATA%\\Vivaldi\\User Data',
      linux: '~/.config/vivaldi',
    },
    defaultProfile: 'Default',
    file: 'History',
  },
  {
    id: 'firefox',
    name: 'Firefox',
    family: 'firefox',
    profilePage: { url: 'about:profiles', field: 'Root Directory' },
    roots: {
      mac: '~/Library/Application Support/Firefox/Profiles',
      windows: '%APPDATA%\\Mozilla\\Firefox\\Profiles',
      linux: '~/.mozilla/firefox',
    },
    defaultProfile: '*.default-release',
    file: 'places.sqlite',
  },
  {
    id: 'safari',
    name: 'Safari',
    family: 'safari',
    roots: { mac: '~/Library/Safari' },
    file: 'History.db',
  },
];

const sepFor = (os: OS) => (os === 'windows' ? '\\' : '/');

/** Full folder holding the history file for a browser, OS and profile. */
function folderFor(b: BrowserInfo, os: OS, profile?: string): string | undefined {
  const root = b.roots[os];
  if (!root || b.defaultProfile === undefined) return root;
  return root + sepFor(os) + (profile || b.defaultProfile);
}

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
      Open that folder in your file manager: press <Kbd keys={['Ctrl', 'L']} /> to type a location, paste {folder} and
      press <kbd>Enter</kbd>. Folders starting with a dot are hidden; press <Kbd keys={['Ctrl', 'H']} /> to show them.
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

function Steps({ b, os, profile }: { b: BrowserInfo; os: OS; profile: string }) {
  // Finder and Explorer can't expand wildcards, so for Firefox point at the
  // Profiles folder and let the user pick the profile folder inside it.
  const folder = b.family === 'firefox' ? b.roots[os] : folderFor(b, os, profile);

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
          Find <code>History.db</code>. Ignore <code>History.db-wal</code>, <code>History.db-shm</code> and the other
          files next to it.
        </li>
        <li>
          <CopyFile os="mac" file="History.db" /> macOS protects <code>~/Library/Safari</code>, so browsers often can't
          open the original; the copy on your Desktop avoids that.
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
              Copy the folder shown next to <b>{b.profilePage.field}</b>. This is the profile you're using right now.
              {b.defaultProfile && (
                <>
                  {' '}
                  It ends in <code>Default</code>, or <code>Profile 1</code>, <code>Profile 2</code> and so on if you've
                  ever added a profile. Type that last part into <b>Profile folder</b> above to update the paths and
                  commands on this page.
                </>
              )}
            </>
          )}
        </li>
      )}
      <OpenFolderStep
        os={os}
        folder={
          b.family === 'firefox' && folder ? (
            <>
              <CopyText text={folder} /> and open the folder whose name ends in <code>.default-release</code>
            </>
          ) : folder ? (
            <>
              the folder from step 1 (for the <b>{profile || b.defaultProfile || 'default'}</b> profile that's{' '}
              <CopyText text={folder} />)
            </>
          ) : (
            'the folder from step 1'
          )
        }
      />
      <li>
        Find the file named <code>{b.file}</code>
        {b.family === 'chromium' && (
          <>
            {' '}
            (it has no file extension{os === 'windows' ? '; Explorer shows its type as "File"' : ''}). Ignore{' '}
            <code>History-journal</code>, <code>History Provider Cache</code> and similar files
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
            {os === 'windows' ? ', or menu → Exit' : ''}). Firefox keeps recent visits in a side file until it quits, so
            without this step 16 November may be missing. Then: <CopyFile os={os} file="places.sqlite" />
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

function CommandBlock({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the command is still selectable */
    }
  };
  return (
    <div className="cmd">
      <pre>
        <code>{cmd}</code>
      </pre>
      <button type="button" className="copy-btn" onClick={copy} aria-label="Copy command">
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function TerminalSteps({ b, os, profile }: { b: BrowserInfo; os: OS; profile: string }) {
  const root = b.roots[os];
  if (!root) return null;
  const shell = os === 'windows' ? 'powershell' : 'sh';
  const cmds = historyCommands({
    shell,
    root,
    profile: b.defaultProfile === undefined ? undefined : profile || b.defaultProfile,
    file: b.file,
    label: b.name,
    mac: os === 'mac',
  });
  const desktop = os === 'windows' ? 'Desktop' : '~/Desktop';

  return (
    <details className="panel terminal">
      <summary>
        <strong>Prefer the {os === 'windows' ? 'PowerShell' : 'Terminal'}? Copy it with a command</strong>
      </summary>
      <ol className="steps small">
        <li>
          {os === 'mac' && (
            <>
              Open Terminal: press <Kbd keys={['⌘', 'Space']} />, type <b>Terminal</b> and press <kbd>Return</kbd>.
            </>
          )}
          {os === 'linux' && (
            <>
              Open a terminal (<Kbd keys={['Ctrl', 'Alt', 'T']} /> on most desktops).
            </>
          )}
          {os === 'windows' && (
            <>
              Open PowerShell: right-click the Start button and choose <b>Terminal</b> or <b>Windows PowerShell</b>.
            </>
          )}
        </li>
        {(b.family === 'firefox' || b.family === 'safari') && (
          <li>
            <b>Quit {b.name} first</b>, so its most recent visits are written to the file.
          </li>
        )}
        {cmds.list && (
          <li>
            See which profile you use. This lists every profile's history file, most recently used first:
            <CommandBlock cmd={cmds.list} />
            {b.family === 'firefox' ? (
              <>
                The folder at the top is the one you use. If it doesn't end in <code>.default-release</code>, type its
                name into <b>Profile folder</b> above.
              </>
            ) : (
              <>
                The file at the top is your active profile. If its folder isn't{' '}
                <code>{profile || b.defaultProfile}</code>, type its name (for example <code>Profile 1</code>) into{' '}
                <b>Profile folder</b> above and the commands below update.
              </>
            )}
          </li>
        )}
        <li>
          Copy the history file to your Desktop:
          <CommandBlock cmd={cmds.copy} />
          {b.family === 'safari' && (
            <>
              If Terminal says <i>Operation not permitted</i>, macOS is protecting the Safari folder. Use the Finder
              steps above instead, or allow Terminal under System Settings → Privacy &amp; Security → Full Disk Access.
            </>
          )}
        </li>
        {cmds.reveal && (
          <li>
            Optional: show the original file in Finder.
            <CommandBlock cmd={cmds.reveal} />
          </li>
        )}
        <li>
          Drop <code>{cmds.copyName}</code> from your {desktop} onto this page.
        </li>
      </ol>
      <p className="small muted">
        {shell === 'sh' ? (
          <>
            Spaces in paths are escaped with a backslash (<code>Application\ Support</code>), so paste the commands as
            they are. Without the backslash the shell splits the path in two and says the files don't exist.
          </>
        ) : (
          <>
            PowerShell doesn't use backslashes for escaping, so paths with spaces are wrapped in double quotes instead.
          </>
        )}
      </p>
    </details>
  );
}

function FallbackPaths({ b, os, profile }: { b: BrowserInfo; os: OS; profile: string }) {
  const others = (Object.keys(b.roots) as OS[]).filter((o) => o !== os);
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
                <code>{folderFor(b, o, profile)}</code>
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
  const desktopOs: OS =
    detected.os === 'mac' || detected.os === 'windows' || detected.os === 'linux' ? detected.os : 'mac';
  const [os, setOs] = useState<OS>(desktopOs);
  const [browserId, setBrowserId] = useState<BrowserId>(detected.browser ?? 'chrome');
  const [profileInput, setProfile] = useState('');
  const profile = profileInput.trim();

  const available = BROWSERS.filter((b) => b.roots[os]);
  const b = available.find((x) => x.id === browserId) ?? available[0]!;
  const isMobile = detected.os === 'ios' || detected.os === 'android';

  return (
    <div className="guide">
      {isMobile && (
        <div className="rec urgent small">
          <b>You're on {detected.os === 'ios' ? 'an iPhone or iPad' : 'a phone'}.</b> Phones don't let you export
          browser history as a file. See <a href="#mobile">checking a phone</a> below, or open this page on a computer.
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
          <select
            value={b.id}
            onChange={(e) => {
              setBrowserId(e.target.value as BrowserId);
              setProfile('');
            }}
          >
            {available.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
                {x.id === detected.browser ? ' (detected)' : ''}
              </option>
            ))}
          </select>
        </label>
        {b.defaultProfile !== undefined && (
          <label>
            Profile folder
            <input
              type="text"
              list={`profiles-${b.id}`}
              value={profileInput}
              placeholder={b.defaultProfile}
              onChange={(e) => setProfile(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />
            <datalist id={`profiles-${b.id}`}>
              {(b.family === 'firefox'
                ? ['*.default-release', '*.default']
                : ['Default', 'Profile 1', 'Profile 2', 'Profile 3']
              ).map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
        )}
      </div>

      <div className="tabpanel">
        <h3>
          {b.name} on {OS_NAMES[os]}
        </h3>
        <Steps b={b} os={os} profile={profile} />
        <TerminalSteps b={b} os={os} profile={profile} />
        <FallbackPaths b={b} os={os} profile={profile} />
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
            History) and scroll to 16 November. Type any affected sites you see into the paste box below, with the date
            and time, for example <code>2026-11-16 14:30 www.bbc.com</code>.
          </li>
          <li>
            Whatever you find, update iPhones and iPads to iOS 18.7.3 or later, or 26.3 or later. The attack targeted
            iOS directly.
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
            Make sure you picked <code>History</code>, <code>places.sqlite</code> or <code>History.db</code> itself, not
            a file ending in <code>-journal</code>, <code>-wal</code> or <code>-shm</code>. Load the copy on your
            Desktop rather than the original.
          </dd>
          <dt>It says my history doesn't cover 16 November.</dt>
          <dd>
            Either the browser was still open when you copied the file (quit it and copy again), you picked a different
            profile, or the history was cleared. Private and incognito windows are never saved.
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
