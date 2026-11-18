# RASA app (app.rasasoccer.ca)

The league app for the Richmond Adult Soccer Association: schedule and results, standings,
leaders, team pages, and Add to Calendar. Data is copied automatically from rasasoccer.ca.

- **How it's organised, how to make changes, and the league's rules:** see [CLAUDE.md](CLAUDE.md).
- **Making a change:** create a branch, open a pull request, try the Azure preview link it posts,
  then the president merges it. Merging into `main` publishes it.
- **Trying it locally:** `python3 -m http.server 8000` in this folder, then open http://localhost:8000.

## Hosting
- GitHub Pages from `main`, served at app.rasasoccer.ca (`CNAME`; GoDaddy DNS has a CNAME record
  `app` pointing to the GitHub Pages address).
- Azure Static Web App (ashy-water-0e8bef90f) for the server functions in `api/`.
