#!/usr/bin/env python3
"""Pull schedule, scores, officials, standings and rosters from rasasoccer.ca
(eSportsDesk) and write games.json, standings.json and rosters.json.

Usage:
  python3 tools/sync.py [--out DIR] [--samples DIR] [--no-rosters]

--samples reads saved pages instead of the live site (for testing).
Files are only rewritten when their content actually changed.
"""
import argparse, datetime as dt, json, os, re, sys, time, urllib.request
from bs4 import BeautifulSoup

BASE = "https://www.rasasoccer.ca/leagues/"
LEAGUE = "clientid=6369&leagueID=27680"
SEASON = "Winter 2026-27"
UA = "Mozilla/5.0 (RASA app data sync; app.rasasoccer.ca)"

# Full team name on the site -> short uppercase name the app uses
SHORT = {"Richmond All Blacks": "RICHMOND ALL B.", "RFC HIBS": "RFC HIBS", "AC Richmond": "AC RICHMOND",
         "Unicorn FC": "UNICORN FC", "United FC": "UNITED FC", "Rangers FC": "RANGERS FC",
         "Freebird FC": "FREEBIRD FC", "Heatherbrae": "HEATHERBRAE", "Richlads FC": "RICHLADS FC",
         "Lion Rock": "LION ROCK", "Hammers FC": "HAMMERS FC", "EPFC Lions": "EPFC LIONS",
         "RUFC Graduates": "RUFC GRADUATES", "Club Ireland Rovers": "CLUB IRELAND R.",
         "Mainland United": "MAINLAND UNITE.", "West Coast Current": "WEST COAST CUR.",
         "Richmond Athletics FC": "RICHMOND ATHLE.", "Richmond Old Blacks": "RICHMOND OLD B.",
         "Rain City Gunners": "RAIN CITY GUNN.", "Glory FC": "GLORY FC"}
SHORT_CI = {k.lower(): v for k, v in SHORT.items()}


VENUES = {"Boyd Red": "Hugh Boyd - Red", "Boyd Blue": "Hugh Boyd - Blue", "Boyd South": "Hugh Boyd - South"}


def short(name):
    name = clean(name)
    return SHORT_CI.get(name.lower(), name.upper()[:15] if name else "")


def clean(s):
    s = (s or "").replace("–", "-").replace("—", "-").replace("�", "-").replace("\xa0", " ")
    return re.sub(r"\s+", " ", s).strip()


def decode(raw):
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("utf-8", errors="replace")


class Fetcher:
    def __init__(self, samples=None):
        self.samples = samples

    def get(self, path, sample_name=None):
        if self.samples:
            p = os.path.join(self.samples, sample_name or "")
            if not sample_name or not os.path.exists(p):
                raise FileNotFoundError(p)
            return decode(open(p, "rb").read())
        url = BASE + path
        for attempt in range(3):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=60) as r:
                    body = decode(r.read())
                time.sleep(0.7)  # be gentle with the site
                return body
            except Exception as e:
                if attempt == 2:
                    raise
                print(f"retry {url}: {e}", file=sys.stderr)
                time.sleep(5)


def to24(t):
    m = re.match(r"(\d{1,2}):(\d{2})\s*([AP]M)", t or "", re.I)
    if not m:
        return ""
    h = int(m.group(1)) % 12 + (12 if m.group(3).upper() == "PM" else 0)
    return f"{h:02d}:{m.group(2)}"


DATE_RE = re.compile(r"\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*\.?\s+([A-Z][a-z]{2})\w*\.?\s+(\d{1,2}),\s*(\d{4})")
MONTHS = {m: i for i, m in enumerate("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(), 1)}


def table_date(table):
    """The date header sits in the text just before each day's table."""
    node = table
    for _ in range(400):
        node = node.find_previous(string=DATE_RE)
        if node is None:
            return None
        m = DATE_RE.search(node)
        if m:
            return f"{m.group(4)}-{MONTHS[m.group(2)]:02d}-{int(m.group(3)):02d}"
    return None


def team_cell(td):
    a = td.select_one("span.d-sm-inline a") or td.find("a")
    name = clean(a.get_text()) if a else clean(td.get_text(" "))
    if not a:  # placeholder like "WINNER LC14": drop the division badge text
        badge = td.select_one(".divName")
        if badge:
            badge.extract()
        name = clean(td.get_text(" "))
    gid = tid = None
    if a and a.get("href"):
        m = re.search(r"gameID=(\d+)", a["href"]); gid = m.group(1) if m else None
        m = re.search(r"teamID=(\d+)", a["href"], re.I); tid = m.group(1) if m else None
    div = td.select_one(".divName .badge")
    return name, gid, tid, clean(div.get_text()) if div else ""


def score(td):
    txt = clean(td.get_text())
    return int(txt) if re.fullmatch(r"\d+", txt) else None


def parse_schedule(html):
    soup = BeautifulSoup(html, "html.parser")
    games = []
    for table in soup.find_all("table"):
        heads = [clean(th.get_text()) for th in table.select("thead th")]
        if len(heads) < 7 or heads[0] not in ("Time", "Result") or "Away" not in heads:
            continue
        date = table_date(table)
        officials_layout = "Officials" in heads
        for tr in table.select("tbody tr"):
            tds = tr.find_all("td", recursive=False)
            if len(tds) < 7:
                continue
            first = clean(tds[0].get_text(" "))
            number = clean(tds[1].get_text())
            if officials_layout:
                away, hm, venue_td, off_td = tds[2], tds[3], tds[4], tds[6]
                s_away = s_home = None
            else:
                away, hm, venue_td, off_td = tds[2], tds[4], tds[6], None
                s_away, s_home = score(tds[3]), score(tds[5])
            an, gid, atid, adiv = team_cell(away)
            hn, gid2, htid, hdiv = team_cell(hm)
            g = {"date": date, "time": to24(first) if heads[0] == "Time" else "",
                 "home": short(an), "away": short(hn),  # app convention: "home" = team listed first (site's Away)
                 "venue": VENUES.get(clean(venue_td.get_text(" ")), clean(venue_td.get_text(" "))),
                 "homeScore": s_away, "awayScore": s_home, "number": number,
                 "gameId": gid or gid2 or "",
                 "status": "" if heads[0] == "Time" else first}
            if off_td is not None:
                g["officials"] = [clean(x).lstrip("•• ").strip() for x in off_td.stripped_strings
                                  if clean(x).lstrip("•• ").strip()]
            if "BYE" in (g["home"], g["away"]):
                continue
            games.append(g)
    return games


def parse_standings(html):
    soup = BeautifulSoup(html, "html.parser")
    divisions = []
    for table in soup.find_all("table"):
        heads = [clean(th.get_text()) for th in table.select("thead th")] or \
                [clean(th.get_text()) for th in table.find_all("th")]
        if "GF" not in heads or "STR" not in heads:
            continue
        hdr = table.find_previous(string=re.compile(r"DIVISION", re.I))
        name = clean(hdr).title() if hdr else ""
        idx = {h: i for i, h in enumerate(heads)}
        rows = []
        for tr in table.find_all("tr"):
            tds = tr.find_all("td")
            if len(tds) < len(heads):
                continue
            full = tr.select_one("td span.d-sm-inline") or tds[idx["Team"]]
            num = lambda k: int(clean(tds[idx[k]].get_text()).replace("+", "") or 0)
            rows.append({"team": clean(full.get_text()), "gp": num("GP"), "w": num("W"), "l": num("L"),
                         "t": num("T"), "d": num("D"), "pts": num("PTS"), "gf": num("GF"), "ga": num("GA"),
                         "diff": num("DIFF"), "streak": clean(tds[idx["STR"]].get_text())})
        divisions.append({"name": name, "rows": rows})
    order = {"Division 1": 0, "Division 2": 1, "Masters Division": 2}
    divisions.sort(key=lambda d: order.get(d["name"], 9))
    return divisions


def team_ids(html):
    soup = BeautifulSoup(html, "html.parser")
    ids = {}
    for a in soup.select('a[href*="stats_1team.cfm"]'):
        m = re.search(r"teamID=(\d+)", a["href"], re.I)
        sp = a.select_one("span.d-sm-inline")
        if m and sp:
            ids[clean(sp.get_text())] = m.group(1)
    return ids


def parse_players(html):
    soup = BeautifulSoup(html, "html.parser")
    for table in soup.find_all("table"):
        heads = [clean(th.get_text()) for th in table.find_all("th")]
        if "Player" not in heads or "BY" not in heads:
            continue
        idx = {h: i for i, h in enumerate(heads)}
        out = []
        for tr in table.find_all("tr"):
            tds = tr.find_all("td")
            if len(tds) < len(heads):
                continue
            a = tds[idx["Player"]].select_one("span.d-sm-block a") or tds[idx["Player"]].find("a")
            if not a:
                continue  # TEAM TOTALS
            m = re.search(r"playerID=(\d+)", a.get("href", ""), re.I)
            val = lambda k: clean(tds[idx[k]].get_text())
            n = lambda k: int(val(k)) if re.fullmatch(r"\d+", val(k)) else 0
            num = val("#")
            out.append({"name": clean(a.get_text()), "number": int(num) if num.isdigit() else None,
                        "pos": val("Pos"), "born": val("BY"), "gp": n("GP"), "g": n("G"), "a": n("A"),
                        "yc": n("YC"), "rc": n("RC"), "_pid": m.group(1) if m else None})
        return out
    return []


def parse_photos(html):
    photos = {}
    for m in re.finditer(r'playerID=(\d+)[^"]*"[^>]*>[^<]*</a>\s*</span>\s*</div>.*?background-image:url\(\'([^\']+)\'\)',
                         html, re.S):
        pid, url = m.group(1), m.group(2)
        if "_pic." in url:
            photos[pid] = "https://www.rasasoccer.ca" + url.split("?")[0] if url.startswith("/") else url.split("?")[0]
    return photos


def write_if_changed(path, data):
    old = None
    if os.path.exists(path):
        try:
            old = json.load(open(path))
        except Exception:
            pass
    strip = lambda d: {k: v for k, v in (d or {}).items() if k != "updatedAt"}
    if old is not None and strip(old) == strip(data):
        return False
    json.dump(data, open(path, "w"), indent=1, ensure_ascii=False)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=".")
    ap.add_argument("--samples")
    ap.add_argument("--no-rosters", action="store_true")
    args = ap.parse_args()
    f = Fetcher(args.samples)
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    gpath, spath, rpath = (os.path.join(args.out, n) for n in ("games.json", "standings.json", "rosters.json"))
    old_games = json.load(open(gpath))["games"] if os.path.exists(gpath) else []

    # --- schedule + scores (all months) ---
    games = parse_schedule(f.get(f"schedules.cfm?{LEAGUE}&monthID=0", "sched_all.html"))
    if len(games) < 50:
        sys.exit(f"Only {len(games)} games parsed - site layout may have changed; not writing anything.")

    # --- officials (all months) ---
    try:
        offs = parse_schedule(f.get(f"schedules.cfm?{LEAGUE}&schedType=officials&gameType=&monthID=0", "officials_all.html"))
    except FileNotFoundError:
        offs = parse_schedule(f.get("", "officials.html"))
    off_by_id = {o["gameId"]: o.get("officials", []) for o in offs if o["gameId"]}
    off_by_key = {(o["date"], o["home"], o["away"]): o.get("officials", []) for o in offs}

    # Results tables don't show kickoff time: keep the one we already know.
    old_time = {(g["date"], g["home"], g["away"]): g.get("time", "") for g in old_games}
    old_off = {(g["date"], g["home"], g["away"]): g.get("officials", []) for g in old_games}
    for g in games:
        key = (g["date"], g["home"], g["away"])
        g["officials"] = off_by_id.get(g["gameId"]) or off_by_key.get(key) or old_off.get(key, [])
        if not g["time"]:
            g["time"] = old_time.get((g["date"], g["home"], g["away"]), "") or "21:00"
    games.sort(key=lambda g: (g["date"] or "", g["time"], g["number"]))
    changed = []
    if write_if_changed(gpath, {"source": BASE + f"schedules.cfm?{LEAGUE}", "season": SEASON,
                                "updatedAt": now, "games": games}):
        changed.append("games.json")

    # --- standings ---
    st_html = f.get(f"standings.cfm?{LEAGUE}", "standings.html")
    divisions = parse_standings(st_html)
    if divisions and all(d["rows"] for d in divisions):
        if write_if_changed(spath, {"source": BASE + f"standings.cfm?{LEAGUE}", "season": SEASON,
                                    "updatedAt": now, "divisions": divisions}):
            changed.append("standings.json")

    # --- rosters + player stats + photos ---
    if not args.no_rosters:
        old_r = json.load(open(rpath)) if os.path.exists(rpath) else {"teams": {}}
        teams = {}
        for full, tid in sorted(team_ids(st_html).items()):
            key = short(full)
            src = BASE + f"stats_1team.cfm?{LEAGUE}&teamID={tid}"
            try:
                players = parse_players(f.get(f"stats_1team.cfm?{LEAGUE}&teamID={tid}", f"team_{tid}.html"))
                photos = parse_photos(f.get(f"rostersV2.cfm?{LEAGUE}&teamID={tid}&rosterDisplay=cards", f"cards_{tid}.html"))
            except FileNotFoundError:
                continue
            except Exception as e:
                print(f"{full}: {e}", file=sys.stderr)
                if key in old_r["teams"]:
                    teams[key] = old_r["teams"][key]
                continue
            old_photo = {p["name"].lower(): p.get("photo", "") for p in old_r["teams"].get(key, {}).get("players", [])}
            for p in players:
                pid = p.pop("_pid")
                p["photo"] = photos.get(pid) or old_photo.get(p["name"].lower(), "")
            teams[key] = {"name": full, "source": src, "players": players}
        if args.samples and not teams:
            pass
        elif len(teams) >= 15:
            if write_if_changed(rpath, {"updatedAt": now, "teams": teams}):
                changed.append("rosters.json")
        else:
            print(f"Only {len(teams)} teams fetched; keeping existing rosters.json", file=sys.stderr)

    print("changed:", ", ".join(changed) or "nothing")


if __name__ == "__main__":
    main()
