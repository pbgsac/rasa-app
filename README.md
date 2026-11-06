# RASA app (app.rasasoccer.ca)

Web app for the Richmond Adult Soccer Association: public schedule and standings, plus
sign-in areas for managers, referees and administrators.

## Status: preview
This is the working prototype. Schedule, referees, standings and the Hammers FC player list are
copied from rasasoccer.ca (eSportsDesk) every 4 hours. Accounts, reports and uploads are
**not saved yet**; they reset when the page reloads. That needs the back end (next phase).

## Files
- `index.html` – the whole app
- `games.json`, `standings.json`, `rosters.json` – data copied from rasasoccer.ca
- `logo.png`, `icon-*.png`, `apple-touch-icon.png`, `manifest.webmanifest`, `sw.js` – logo and
  "Add to Home Screen" support
- `CNAME` – tells GitHub Pages to serve this at app.rasasoccer.ca

## Hosting
GitHub Pages from the `main` branch. DNS (GoDaddy): a CNAME record `app` pointing to
`<github-account>.github.io`.
