// Builds copy-paste-ready terminal commands for locating and copying a
// browser history file. Pure functions so they can be unit tested.

export type Shell = 'sh' | 'powershell';

/**
 * Escape a path for a POSIX shell (zsh/bash) using backslashes, e.g.
 * "~/Library/Application Support" -> "~/Library/Application\ Support".
 * A leading "~/" is kept unescaped so the shell still expands it to $HOME.
 * With `glob`, "*" is left unescaped so the shell expands it.
 */
export function escapeSh(path: string, { glob = false } = {}): string {
  const special = glob ? /([\s()'"&;$`\\!?[\]{}<>|#~^])/g : /([\s()'"&;$`\\!?*[\]{}<>|#~^])/g;
  const esc = (s: string) => s.replace(special, '\\$1');
  if (path === '~') return '~';
  if (path.startsWith('~/')) return '~/' + esc(path.slice(2));
  return esc(path);
}

/**
 * Convert a Windows path with %VARS% into a double-quoted PowerShell string,
 * e.g. "%LOCALAPPDATA%\Google" -> "\"$env:LOCALAPPDATA\Google\"".
 * Backslash is not an escape character in PowerShell, so quoting is how
 * spaces are handled there. Wildcards such as "*" still work inside quotes.
 */
export function quotePs(path: string): string {
  const body = path
    .replace(/[`"$]/g, '`$&')
    .replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (_, v: string) => `$env:${v.toUpperCase()}`);
  return `"${body}"`;
}

/** Joins path parts with the right separator for the shell. */
export function joinPath(shell: Shell, ...parts: string[]): string {
  const sep = shell === 'powershell' ? '\\' : '/';
  return parts.reduce((acc, p) => (acc.endsWith(sep) ? acc + p : acc + sep + p));
}

export interface CommandInput {
  shell: Shell;
  /**
   * Folder holding the history file, or, when `profile` is set, the parent
   * folder holding every profile (e.g. ".../Google/Chrome").
   */
  root: string;
  /** Profile folder name such as "Default", "Profile 1" or "*.default-release". */
  profile?: string;
  file: string;
  /** Short label used for the copied file name, e.g. "Chrome". */
  label: string;
  /** Add a macOS "reveal in Finder" command. */
  mac?: boolean;
}

export interface HistoryCommands {
  /** Lists every profile's history file, most recently modified first. */
  list?: string;
  /** Copies the chosen history file to the Desktop. */
  copy: string;
  /** macOS only: reveals the file in Finder. */
  reveal?: string;
  /** File name of the copy on the Desktop. */
  copyName: string;
}

export function historyCommands({ shell, root, profile, file, label, mac }: CommandInput): HistoryCommands {
  const safeLabel = label.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const ext = file.includes('.') ? file.slice(file.lastIndexOf('.')) : '';
  const copyName = `${safeLabel}-History${ext}`;
  const hasProfiles = profile !== undefined;
  const src = hasProfiles ? joinPath(shell, root, profile, file) : joinPath(shell, root, file);

  if (shell === 'powershell') {
    return {
      copyName,
      list: hasProfiles
        ? `Get-ChildItem ${quotePs(joinPath(shell, root, '*', file))} | Sort-Object LastWriteTime -Descending | Select-Object LastWriteTime, FullName`
        : undefined,
      copy: `Copy-Item ${quotePs(src)} "$([Environment]::GetFolderPath('Desktop'))\\${copyName}"`,
    };
  }

  // Only the profile segment may contain an intended wildcard.
  const shSrc = hasProfiles
    ? `${escapeSh(root)}/${escapeSh(profile, { glob: true })}/${escapeSh(file)}`
    : escapeSh(src);
  return {
    copyName,
    list: hasProfiles ? `ls -lt ${escapeSh(root)}/*/${escapeSh(file)}` : undefined,
    copy: `cp ${shSrc} ~/Desktop/${escapeSh(copyName)}`,
    reveal: mac ? `open -R ${shSrc}` : undefined,
  };
}
