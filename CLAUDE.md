# RASA app – guide for helpers (and their Claude)

The league app for the Richmond Adult Soccer Association at **app.rasasoccer.ca**: schedule,
standings, leaders, team pages and Add to Calendar. Players use it on their phones, so it is
phone-first. It is plain HTML, CSS and JavaScript: no framework, no build step, nothing to install.

## How changes go live
- `main` is the live app. Anything merged into `main` is published automatically, within a
  minute or two, to GitHub Pages (app.rasasoccer.ca) and to the Azure Static Web App
  (ashy-water-0e8bef90f.3.azurestaticapps.net).
- **Never push straight to `main`.** Make a branch, commit there, and open a pull request.
  Azure posts a preview link on the pull request so the change can be tried on a phone. The
  league president reviews and merges.
- The only thing that writes to `main` directly is the data sync bot (see below).

## Where things are
| Path | What it is |
|---|---|
| `index.html` | The page frame: header, main tabs, empty screens, pop-up shells. Loads the files below. |
| `css/base.css` | Shared look: colours (CSS variables), fonts, header, main tabs, sub-tabs, drop-downs, tables, pop-ups, install button. |
| `css/schedule.css` `standings.css` `team.css` `leaders.css` `calendar.css` | One file per screen. |
| `css/refs.css` | Sign-in, accounts, dashboards, ref reports, match-day rosters (switched off for now). |
| `js/core.js` | Team list, data loading, helpers (`$`, `esc`, dates), app `state`, `FEATURES` switches, field map pins, drop-down menus. |
| `js/schedule.js` `standings.js` `leaders.js` `team.js` `calendar.js` `install.js` | One file per screen or feature. |
| `js/accounts.js` `js/reports.js` | Sign-in, dashboards, team and referee reports (switched off for now). |
| `js/app.js` | Main tabs, page routing, tap/change handlers and start-up. Loads last. |
| `games.json` `standings.json` `rosters.json` `calendar/*.ics` | Data copied from rasasoccer.ca by the sync bot. **Don't edit by hand**; the next sync overwrites it. |
| `tools/sync.py` `tools/calendar_feeds.py` | The scraper and the calendar-feed builder used by the sync. |
| `api/` | Azure Functions (Node 20): `/api/report` (paused) and `/api/sync-reports`. |
| `sw.js` `manifest.webmanifest` icons | Installed-app support. |
| `CNAME` | Serves GitHub Pages at app.rasasoccer.ca. |

## Rules for the code
- **Load order matters.** CSS files load in the order listed in `index.html`; a later file wins
  over an earlier one when two rules are equally specific. JS files share one set of global names;
  `core.js` loads first and `app.js` last. Code that runs immediately when a file loads may only
  use things from files above it. Code inside functions can use anything.
- No two files may declare the same top-level name. Pick distinct names (e.g. prefix with the screen).
- Colours come from the variables at the top of `css/base.css` (`--brand`, `--accent`, `--ink`,
  `--muted`, `--line`, `--surface`, `--surface-2`, `--bg`, division colours `--d1` `--d2` `--ms` `--cup`).
  Phones always use light mode; dark mode only follows the system setting on computers.
- Check every visual change at **320px wide** (iPhone SE) as well as a normal phone and a computer.
- Features that are switched off are behind `FEATURES` in `js/core.js`. Leave them off unless the
  president asks.
- If you change which files the app loads (add, rename or remove a CSS/JS file), bump `CACHE` in
  `sw.js` so installed apps start clean.
- Data quirk: in `games.json`, `home` is the team rasasoccer.ca lists **first** (the site's away
  side). The app's `HOME(g)` / `AWAY(g)` helpers handle this; use them rather than `g.home`/`g.away`.

## Trying it on your computer
From the project folder run `python3 -m http.server 8000`, then open http://localhost:8000.
(Opening `index.html` straight from the file system won't work, because the data is loaded with fetch.)
API tests: `cd api && npm test` (no packages needed).

## Data sync
`.github/workflows/sync-data.yml` runs `tools/sync.py` every 2 hours (GitHub often runs it later,
every 6–8 hours). It scrapes rasasoccer.ca, rebuilds the calendar feeds, commits only if something
changed, and redeploys to Azure. It can also be started by hand from the Actions tab
("Run workflow").

## League rules (please keep to these)
- **Ref reports through the app are paused** until sign-in exists: the Ref Report screen is hidden
  (`FEATURES.gameReport`) and `/api/report` refuses submissions unless the Azure setting
  `REPORTS_OPEN` is `true`. Referees email matchreport@rasasoccer.ca for now.
- **No keys or passwords in the code.** Microsoft Graph settings (`GRAPH_TENANT_ID`,
  `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `MAIL_FROM`, `ONEDRIVE_DRIVE_ID`, `ONEDRIVE_FOLDER_ID`)
  live only in Azure → Static Web App → Environment variables.
- **Privacy:** never show players' dates of birth. Team staff appear by first name and title only,
  with no emails or phone numbers. Don't publish anyone's personal email address.
- The OneDrive workbooks "Ref Reports 2026" and "Discipline Winter 2026" are rebuilt from
  `App data/reports.json` on every report. Don't edit them by hand.
- Keep everything in league-owned accounts (rasasoccer.ca Microsoft 365, the league's GitHub
  organization), not personal ones.
