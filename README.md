# Optimizely Hack Checker

A client-side-only page that checks your browser history against the sites hit by the
16 November 2026 Optimizely supply-chain attack, and gives recommendations based on
_when_ you visited them.

Sources: [Report URI](https://blog.report-uri.com/worlds-largest-brands-infected-with-malware-via-optimizely/),
[BleepingComputer](https://www.bleepingcomputer.com/news/security/optimizely-supply-chain-attack-delivers-malware-to-cnn-fox-news-bbc-salesforce-sites/),
[TheCyberSecGuru](https://thecybersecguru.com/news/optimizely-supply-chain-attack-optimjack/).

## How it works

Web pages can't read browser history, so the user selects the history file and it is parsed locally:

| Browser                                       | File                                               | Parsed with            |
| --------------------------------------------- | -------------------------------------------------- | ---------------------- |
| Chrome / Edge / Brave / Arc / Opera / Vivaldi | `History`                                          | sql.js (SQLite → WASM) |
| Firefox                                       | `places.sqlite`                                    | sql.js                 |
| Safari                                        | `History.db`                                       | sql.js                 |
| Google Takeout                                | `BrowserHistory.json`                              | JSON                   |
| Anything                                      | pasted URLs/hosts (optionally with ISO timestamps) | text                   |

Only visits inside the attack window are reported (UTC):

- **high**: a listed host between 04:21 and 21:52 on 16 Nov, using per-site start and clean-up
  times where published (Zoom from 11:20; Ledger, Smartsheet and BBC clean-up times; TalkTalk,
  with no published clean-up, until Optimizely's statement at 01:02 UTC on 17 Nov).
- **possible**: inside the window, but on a related host of a listed domain or a domain named only
  in news coverage; a visit between the last clean capture (02:21) and the first infected one
  (04:21); or a visit to an earlier-wave site (webshell.lol, 13–16 Nov).
- **unknown**: a pasted visit with no date or time.
- Visits outside the window are counted but not listed.
- Visits to attacker domains (`1688360.cc`, the `.icu` routers, `webshell.lol`, …) are high from
  September until Optimizely's statement; later visits (e.g. while researching) are not flagged.

The production build adds a strict Content Security Policy (`default-src 'none'; connect-src 'self'`),
so the page can't send data anywhere.

Written in TypeScript and built with webpack.

- Host lists and timeline: `src/affectedSites.ts`
- Matching and scoring: `src/analyze.ts`
- Parsers: `src/parsers.ts`
- UI: `src/App.tsx`, `src/Recommendations.tsx`
- Build config: `webpack.config.mts`

## Develop

Requires Node 24 or later (the tests and webpack config use Node's built-in TypeScript support).

```sh
corepack enable  # once; uses the Yarn version pinned in package.json
yarn install
yarn dev         # dev server at http://localhost:5173
yarn typecheck   # tsc --noEmit
yarn test        # parser and scoring tests
yarn lint        # oxlint
yarn format      # oxfmt (format:check in CI)
yarn build       # static site in dist/
yarn preview     # serve the production build locally
```

The CI workflow (`.github/workflows/ci.yml`) runs lint, format check, typecheck, unit tests and
build on every pull request and push to `main`.

## Deploy to GitHub Pages

`yarn build    ` writes plain static files with relative paths to `dist/`, so the site works at any
URL path. `dist/` is not committed: the workflow builds it and publishes it as a Pages artifact.

1. Push to a GitHub repo on the `main` branch.
2. Go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. `.github/workflows/deploy.yml` typechecks, tests, builds and deploys `dist/` on every push to `main`.

## Verifying the live site

The page footer shows the commit and GitHub Actions run that built the live site, so you can check
it was built from this repository. The production build's Content Security Policy only allows the
page to load its own files, and once loaded it works offline.

## Contributing

Missing or wrong site? [Open an issue](https://github.com/karlnorling/optimizely-hack-checker/issues/new?template=add-site.yml)
with a public source. Please don't post your own browser history.

## License

[MIT](LICENSE)
