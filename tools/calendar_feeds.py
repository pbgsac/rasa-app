#!/usr/bin/env python3
"""Build calendar feeds (.ics) from games.json for "Add to Calendar" in the app.

Writes calendar/all.ics plus one file per team (calendar/<team-slug>.ics).
Phones subscribe to these, so a rescheduled game updates itself in people's calendars.
Run by tools/sync.py after each data sync; can also be run on its own:
  python3 tools/calendar_feeds.py [--out DIR]
"""
import argparse, datetime as dt, hashlib, json, os, re
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/Vancouver")
APP = "https://app.rasasoccer.ca"
GAME_MINUTES = 105  # 90 minutes plus half-time and warm-up

# Exact Google Maps pins for each field (supplied by the league), then park addresses as a fallback.
FIELD_PINS = [
    (r"hugh\s*boyd\W*red", "https://maps.app.goo.gl/pQwqAB7nWvmvmJ8J6"),
    (r"hugh\s*boyd\W*blue", "https://maps.app.goo.gl/3NZuufu9SCaf1Zgv8"),
    (r"hugh\s*boyd\W*oval", "https://maps.app.goo.gl/Pf5Mj5nR49rKxTTt6"),
    (r"hugh\s*boyd\W*south", "https://maps.app.goo.gl/tn9ng9k9PbFDX9CMA"),
    (r"mac\s*neill?\W*north", "https://maps.app.goo.gl/RvmxWJL3US9WB8g48"),
    (r"mac\s*neill?\W*south", "https://maps.app.goo.gl/2N3RKwXpdRDfBCdH7"),
    (r"richmond\s*high", "https://maps.app.goo.gl/fFhccXAw6F6FH1oh6"),
    (r"king\s*george", "https://maps.app.goo.gl/CnUgCLmYB2RJU2s38"),
    (r"minoru\W*oval", "https://maps.app.goo.gl/ppvnEuEzwm6VSPF68"),
    (r"minoru\W*3\b", "https://maps.app.goo.gl/zR7aZngbKNHGUutK6"),
    (r"minoru\W*2\b", "https://maps.app.goo.gl/kUjuC5abEZHNn3S2A"),
    (r"south\s*arm\W*1\b", "https://maps.app.goo.gl/3fSPq96UiDNkoXKe8"),
    (r"south\s*arm\W*3\b", "https://maps.app.goo.gl/Q5r14j1fHB6PsRjh9"),
    (r"south\s*arm\W*4\b", "https://maps.app.goo.gl/eZMJphywxoAjzwsx5"),
    (r"london", "https://maps.app.goo.gl/tpyB6q6h3DgQhHNW6"),
    (r"mcnair", "https://maps.app.goo.gl/QzLTyeNfBYdbUtAY9"),
]
ADDRESSES = [
    (r"hugh\s*boyd", "Hugh Boyd Park, 4040 Francis Rd, Richmond, BC"),
    (r"king\s*george", "King George Park, 4100 No. 5 Rd, Richmond, BC"),
    (r"macneil", "A.R. MacNeill Secondary, 6611 No. 4 Rd, Richmond, BC"),
    (r"mcnair", "Matthew McNair Secondary, 9500 No. 4 Rd, Richmond, BC"),
    (r"minoru", "Minoru Park, 7191 Granville Ave, Richmond, BC"),
    (r"richmond\s*high", "Richmond Secondary, 7171 Minoru Blvd, Richmond, BC"),
    (r"london", "London Secondary, 6600 Williams Rd, Richmond, BC"),
    (r"south\s*arm", "South Arm Park, Richmond, BC"),
]
COMP_NAMES = {"D1": "Division 1", "D2": "Division 2", "MS": "Masters", "XO": "Cross-over", "CUP": "League's Cup"}


def first(rules, text):
    for pat, val in rules:
        if re.search(pat, text or "", re.I):
            return val
    return ""


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def esc(s):
    return str(s).replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r\n", "\\n").replace("\n", "\\n")


def fold(line):
    """iCalendar lines are limited to 75 bytes; continue with a leading space."""
    out, b = [], line.encode("utf-8")
    while len(b) > (75 if not out else 74):      # continuation lines also carry a leading space
        cut = 75 if not out else 74
        while cut > 0 and (b[cut] & 0xC0) == 0x80:   # don't split a multi-byte character
            cut -= 1
        out.append(b[:cut].decode("utf-8")); b = b[cut:]
    out.append(b.decode("utf-8"))
    return "\r\n ".join(out)


def comp_of(g, div_of):
    n = (g.get("number") or "").strip()
    if n.startswith("LC"): return "CUP"
    if "/" in n: return "XO"
    m = re.match(r"^(d1|d2|m)-", n, re.I)
    if m: return {"d1": "D1", "d2": "D2", "m": "MS"}[m.group(1).lower()]
    a, b = div_of.get(g["home"]), div_of.get(g["away"])
    if a and a == b: return a
    if {a, b} == {"MS", "D2"}: return "XO"
    return "CUP"


def event(g, names, div_of, stamp):
    first_team, second_team = names.get(g["home"], g["home"].title()), names.get(g["away"], g["away"].title())
    h, m = (int(x) for x in (g.get("time") or "21:00").split(":")[:2])
    start = dt.datetime.strptime(g["date"], "%Y-%m-%d").replace(hour=h, minute=m, tzinfo=TZ)
    end = start + dt.timedelta(minutes=GAME_MINUTES)
    utc = lambda t: t.astimezone(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    comp = COMP_NAMES[comp_of(g, div_of)]
    played = g.get("homeScore") is not None and g.get("awayScore") is not None
    summary = f"{first_team} {g['homeScore']}–{g['awayScore']} {second_team}" if played else f"{first_team} vs {second_team}"
    venue = g.get("venue") or ""
    addr = first(ADDRESSES, venue)
    pin = first(FIELD_PINS, venue)
    offs = [re.sub(r"(^|[\s-])([a-z])", lambda m: m.group(1) + m.group(2).upper(), o.strip()) for o in (g.get("officials") or [])]
    lines = [f"{comp}" + (f" · Game #{g['number']}" if g.get("number") else "")]
    if played: lines.append(f"Final: {first_team} {g['homeScore']}, {second_team} {g['awayScore']}")
    if venue: lines.append(f"Field: {venue}")
    if pin: lines.append(f"Map: {pin}")
    if offs: lines.append("Ref: " + offs[0] + (" · AR: " + ", ".join(offs[1:]) if len(offs) > 1 else ""))
    lines.append(f"Schedule and standings: {APP}")
    uid_src = g.get("gameId") or f"{g['date']}|{g['home']}|{g['away']}"
    uid = (g.get("gameId") or hashlib.sha1(uid_src.encode()).hexdigest()[:16]) + "@app.rasasoccer.ca"
    ev = ["BEGIN:VEVENT", f"UID:{uid}", f"DTSTAMP:{stamp}", f"DTSTART:{utc(start)}", f"DTEND:{utc(end)}",
          f"SUMMARY:{esc(summary)}", f"DESCRIPTION:{esc(chr(10).join(lines))}", f"CATEGORIES:{esc(comp)}", f"URL:{APP}"]
    if venue: ev.append(f"LOCATION:{esc(venue + (' - ' + addr if addr else ''))}")
    if not played and start > dt.datetime.now(TZ):
        ev += ["BEGIN:VALARM", "ACTION:DISPLAY", f"DESCRIPTION:{esc(summary)}", "TRIGGER:-PT2H", "END:VALARM"]
    ev.append("END:VEVENT")
    return ev


def calendar(name, events):
    head = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//RASA//app.rasasoccer.ca//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
            f"X-WR-CALNAME:{esc(name)}", "X-WR-TIMEZONE:America/Vancouver", "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H"]
    return "\r\n".join(fold(l) for l in head + [l for e in events for l in e] + ["END:VCALENDAR"]) + "\r\n"


def build(out="."):
    games = json.load(open(os.path.join(out, "games.json")))["games"]
    rosters = json.load(open(os.path.join(out, "rosters.json")))["teams"]
    standings = json.load(open(os.path.join(out, "standings.json")))
    names = {k: t["name"] for k, t in rosters.items()}
    by_full = {t["name"].lower(): k for k, t in rosters.items()}
    div_of = {}
    for d in standings.get("divisions", []):
        code = {"Division 1": "D1", "Division 2": "D2", "Masters Division": "MS", "Masters": "MS"}.get(d["name"])
        for r in d["rows"]:
            k = by_full.get(r["team"].lower())
            if k and code: div_of[k] = code
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    games = sorted((g for g in games if g.get("date")), key=lambda g: (g["date"], g.get("time") or ""))
    folder = os.path.join(out, "calendar"); os.makedirs(folder, exist_ok=True)
    written = {}
    def write(fname, title, gs):
        body = calendar(title, [event(g, names, div_of, stamp) for g in gs])
        path = os.path.join(folder, fname)
        # Only rewrite when the games changed (ignore the DTSTAMP line), so the repo isn't touched every sync
        strip = lambda s: re.sub(r"DTSTAMP:\d+T\d+Z", "", s)
        if not (os.path.exists(path) and strip(open(path, encoding="utf-8", newline="").read()) == strip(body)):
            open(path, "w", encoding="utf-8", newline="").write(body)
            written[fname] = True
    write("all.ics", "RASA – all games", games)
    for k, name in sorted(names.items(), key=lambda x: x[1]):
        write(f"{slug(name)}.ics", f"RASA – {name}", [g for g in games if k in (g["home"], g["away"])])
    return written


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--out", default=".")
    w = build(ap.parse_args().out)
    print("calendar feeds updated:", ", ".join(w) or "none")
