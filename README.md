# Optimizely Hack Checker

A client-side-only page that checks your browser history against the sites hit by the
16 November 2026 Optimizely supply-chain attack, and gives recommendations based on
*when* you visited them.

Sources: [Report URI](https://blog.report-uri.com/worlds-largest-brands-infected-with-malware-via-optimizely/),
[BleepingComputer](https://www.bleepingcomputer.com/news/security/optimizely-supply-chain-attack-delivers-malware-to-cnn-fox-news-bbc-salesforce-sites/),
[TheCyberSecGuru](https://thecybersecguru.com/news/optimizely-supply-chain-attack-optimjack/).

## How it works

Web pages can't read browser history, so the user selects the history file and it is parsed locally:

| Browser | File | Parsed with |
| --- | --- | --- |
| Chrome / Edge / Brave / Arc / Opera / Vivaldi | `History` | sql.js (SQLite → WASM) |
| Firefox | `places.sqlite` | sql.js |
| Safari | `History.db` | sql.js |
| Google Takeout | `BrowserHistory.json` | JSON |
| Anything | pasted URLs/hosts (optionally with ISO timestamps) | text |

Every visit to a matching host is scored against the attack timeline (UTC):

- **high**: a listed host between 04:21 and 21:52 on 16 Nov, using per-site start and clean-up
  times where published (Zoom from 11:20; Ledger, Smartsheet and BBC clean-up times).
- **possible**: between 02:21 and 04:21, after clean-up up to the end of 17 Nov (a cached copy of
  the script could still load), a related host on the same domain, a domain named only in news
  coverage, or the earlier webshell.lol wave (13–16 Nov).
- Visits to attacker domains (`1688360.cc`, the `.icu` routers, `webshell.lol`, …) are flagged
  separately.

The production build adds a strict Content Security Policy (`default-src 'none'; connect-src 'self'`),
so the page can't send data anywhere.

Host lists and timeline: `src/affectedSites.js`. Matching and scoring: `src/analyze.js`.
Parsers: `src/parsers.js`.

## Develop

```sh
npm install
npm run dev      # local dev server
npm test         # parser and scoring tests
npm run build    # static site in dist/
npm run preview  # serve dist/ locally
```

## Deploy to GitHub Pages

`dist/` is plain static files with relative paths, so it works at any URL path.

1. Push to a GitHub repo on the `main` branch.
2. Go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. `.github/workflows/deploy.yml` tests, builds and deploys on every push to `main`.
