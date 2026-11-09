/*
  Ref report formatting: the HTML email, the "Ref Reports" workbook (one sheet per report, newest first)
  and the "Discipline" workbook (cards per player, grouped by team).
*/
const { Workbook, safeSheetName } = require("./xlsx");

const C = { green: "#064E3B", green2: "#0A5D47", lime: "#65A30D", mid: "#101820", off: "#E8EDE9", band: "#DDE8E1", line: "#C9D3CD",
  muted: "#4F5E57", yellow: "#FFD43B", yellowSoft: "#FFF3BF", red: "#E03131", redSoft: "#FFE3E3", white: "#FFFFFF", link: "#0B57D0" };
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const DAYS = "Sun Mon Tue Wed Thu Fri Sat".split(" ");

const s = v => (v == null ? "" : String(v)).trim();
const esc = v => s(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nl2br = v => esc(v).replace(/\r?\n/g, "<br>");
function parseDate(d) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s(d)); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; }
function fmtDate(d, long) { const x = parseDate(d); if (!x) return s(d); return `${long ? DAYS[x.getUTCDay()] + " " : ""}${MONTHS[x.getUTCMonth()]} ${x.getUTCDate()}${long ? ", " + x.getUTCFullYear() : ""}`; }
function fmtTime(t) { const m = /^(\d{1,2}):(\d{2})/.exec(s(t)); if (!m) return s(t); const h = +m[1]; return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`; }
function compOf(num) { const n = s(num); if (/^LC/i.test(n)) return "League's Cup"; if (n.includes("/")) return "Cross-over"; if (/^d1/i.test(n)) return "Division 1"; if (/^d2/i.test(n)) return "Division 2"; if (/^m/i.test(n)) return "Masters"; return ""; }
const titleCase = n => s(n).split(/\s+/).map(w => w && w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w).join(" ");
const normName = n => s(n).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const isSecondCaution = c => /second caution|two yellow|2nd yellow|second yellow/i.test(s(c.infraction));

// Short team label for sheet names: "Richmond All Blacks" -> "Richmond AB"
function shortTeam(name) {
  let n = s(name).replace(/\s+FC$/i, "").replace(/^FC\s+/i, "").trim();
  if (n.length <= 12) return n;
  const w = n.split(/\s+/);
  return (w[0] + " " + w.slice(1).map(x => x[0].toUpperCase()).join("")).slice(0, 12);
}

// A stored report record: { id, submittedAt, refName, refEmail, report:{…, game:{…}}, photos:[{name, url}] }
const gameOf = rec => (rec.report && rec.report.game) || {};
const gameKey = rec => { const g = gameOf(rec); return [g.date, normName(g.home), normName(g.away)].join("|"); };
function sheetNameFor(rec) { const g = gameOf(rec); return safeSheetName(`${fmtDate(g.date)} ${shortTeam(g.home)} v ${shortTeam(g.away)}`); }

/* ---------------- Email ---------------- */
function cardBadge(card, big) {
  const red = /red/i.test(card);
  return `<span style="display:inline-block;width:${big ? 12 : 10}px;height:${big ? 16 : 14}px;border-radius:2px;background:${red ? C.red : C.yellow};vertical-align:-2px;margin-right:6px"></span>`;
}
function emailHtml(rec, photoCids) {
  const r = rec.report || {}, g = r.game || {};
  const td = "padding:6px 10px;border-bottom:1px solid #e3e9e5;vertical-align:top;font-size:14px;color:#101820";
  const th = "padding:6px 10px;text-align:left;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#4F5E57;background:#F3F6F4;border-bottom:1px solid #dde4e0";
  const section = (title, inner) => `<tr><td style="padding:18px 20px 4px"><div style="font-size:13px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${C.green};border-bottom:2px solid ${C.lime};padding-bottom:4px;margin-bottom:8px">${title}</div>${inner}</td></tr>`;
  const table = (heads, rows, empty) => rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${heads.map(h => `<th style="${th}">${h}</th>`).join("")}</tr>${rows.map(cells => `<tr>${cells.map(c => `<td style="${td}">${c}</td>`).join("")}</tr>`).join("")}</table>`
    : `<div style="font-size:14px;color:${C.muted};padding:2px 0 6px">${empty}</div>`;
  const side = (label, team, x) => {
    x = x || {};
    const goals = table(["Goal scorer", "#"], (x.scorers || []).map(p => [esc(titleCase(p.name)), esc(p.jersey)]), "No goals");
    const keepers = table(["Goalkeeper", "Minutes"], (x.keepers || []).map(k => [esc(titleCase(k.name)), esc(k.minutes)]), "Not given");
    const cards = table(["Card", "Player", "Infraction"], (x.cards || []).map(c => [`${cardBadge(c.card)}<b>${/red/i.test(c.card) ? "Red" : "Yellow"}</b>`, esc(titleCase(c.name)), esc(c.infraction) + (s(c.description) ? `<div style="color:${C.muted};font-size:13px;margin-top:2px">${nl2br(c.description)}</div>` : "")]), "No cards");
    return section(`${label} · ${esc(team)}`, `${goals}<div style="height:8px"></div>${keepers}<div style="height:8px"></div>${cards}`);
  };
  const q = r.questions || {};
  const kv = rows => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="${td};width:42%;color:${C.muted}">${k}</td><td style="${td}">${v}</td></tr>`).join("")}</table>`;
  const photos = (photoCids || []).length ? section("Team list photos", photoCids.map(p => `<div style="display:inline-block;margin:0 10px 10px 0;text-align:center;vertical-align:top"><img src="cid:${p.cid}" alt="${esc(p.label)}" width="250" style="width:250px;max-width:100%;border:1px solid #dde4e0;border-radius:6px;display:block"><div style="font-size:12px;color:${C.muted};margin-top:4px">${esc(p.label)}</div></div>`).join("")) : "";
  const comp = compOf(g.number);
  const meta = [fmtDate(g.date, true), g.time ? fmtTime(g.time) : "", g.venue, g.number ? "Game #" + g.number : "", comp].filter(Boolean).map(esc).join(" &nbsp;·&nbsp; ");
  return `<!doctype html><html><body style="margin:0;padding:0;background:${C.off}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.off};padding:16px 0"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#fff;border-radius:10px;overflow:hidden;font-family:Segoe UI,Helvetica,Arial,sans-serif;border:1px solid #dde4e0">
<tr><td style="background:${C.green};padding:16px 20px;border-bottom:4px solid ${C.lime}">
  <div style="color:#cfe3d9;font-size:12px;letter-spacing:.06em;text-transform:uppercase;font-weight:700">RASA referee report</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px"><tr>
    <td style="color:#fff;font-size:18px;font-weight:700;width:40%">${esc(g.home)}<div style="font-size:11px;font-weight:600;color:#cfe3d9;text-transform:uppercase;letter-spacing:.05em">Home</div></td>
    <td align="center" style="color:#fff;font-size:34px;font-weight:800;white-space:nowrap">${esc(r.homeScore)} – ${esc(r.awayScore)}</td>
    <td align="right" style="color:#fff;font-size:18px;font-weight:700;width:40%">${esc(g.away)}<div style="font-size:11px;font-weight:600;color:#cfe3d9;text-transform:uppercase;letter-spacing:.05em">Away</div></td>
  </tr></table>
  <div style="color:#e6f0eb;font-size:13px;margin-top:10px">${meta}</div>
</td></tr>
${section("Officials", kv([["Referee", `<b>${esc(rec.refName)}</b><br><a href="mailto:${esc(rec.refEmail)}" style="color:${C.link}">${esc(rec.refEmail)}</a>`], ["Assistant referees", esc((g.officials || []).slice(1).join(", ")) || "None listed"], ["Listed referee", esc((g.officials || [])[0]) || "None listed"]]))}
${side("Home", g.home, r.home)}
${side("Away", g.away, r.away)}
${section("Field and comments", kv([["Field conditions", nl2br(r.field) || "No issues"], ["Injuries and other comments", nl2br(r.notes) || "None"]]))}
${section("Game questions", kv([["Game ball provided by", esc(q.ball) || "—"], ["Corner flags provided by", esc(q.flags) || "—"], ["Home team list (2 copies)", esc(q.listHome) || "—"], ["Visiting team list (2 copies)", esc(q.listAway) || "—"], ["Showed player cards", esc(q.cards) || "—"]]))}
${photos}
<tr><td style="padding:16px 20px;color:${C.muted};font-size:12px;border-top:1px solid #e3e9e5;margin-top:8px">Submitted ${esc(new Date(rec.submittedAt || Date.now()).toLocaleString("en-CA", { timeZone: "America/Vancouver", dateStyle: "medium", timeStyle: "short" }))} via app.rasasoccer.ca · Reply to this email to reach the referee.</td></tr>
</table></td></tr></table></body></html>`;
}

/* ---------------- Ref Reports workbook ---------------- */
const ST = {
  title: { font: { bold: true, size: 16, color: C.white }, fill: C.green, align: { v: "center", indent: 1 } },
  sub: { font: { size: 11, color: C.white }, fill: C.green2, align: { v: "center", indent: 1 } },
  section: { font: { bold: true, size: 11, color: C.white }, fill: C.green, align: { v: "center", indent: 1 } },
  head: { font: { bold: true, size: 10, color: C.muted }, fill: C.off, border: { bottom: { color: C.line } } },
  label: { font: { color: C.muted }, align: { v: "top" }, border: { bottom: { color: "#E3E9E5" } } },
  val: { align: { v: "top", wrap: true }, border: { bottom: { color: "#E3E9E5" } } },
  valB: { font: { bold: true }, align: { v: "top", wrap: true }, border: { bottom: { color: "#E3E9E5" } } },
  muted: { font: { italic: true, color: C.muted } },
  link: { font: { color: C.link, underline: true }, border: { bottom: { color: "#E3E9E5" } } },
  yellow: { font: { bold: true, color: C.mid }, fill: C.yellow, align: { h: "center", v: "top" }, border: { bottom: { color: "#E3E9E5" } } },
  red: { font: { bold: true, color: C.white }, fill: C.red, align: { h: "center", v: "top" }, border: { bottom: { color: "#E3E9E5" } } }
};
function addReportSheet(wb, rec) {
  const r = rec.report || {}, g = r.game || {}, q = r.questions || {};
  const ws = wb.addSheet(sheetNameFor(rec));
  rec._sheet = ws.name;
  const hasRed = ["home", "away"].some(k => ((r[k] || {}).cards || []).some(c => /red/i.test(c.card)));
  const hasYellow = ["home", "away"].some(k => ((r[k] || {}).cards || []).length);
  if (hasRed) ws.tabColor(C.red); else if (hasYellow) ws.tabColor(C.yellow);
  [28, 28, 10, 34, 40].forEach((w, i) => ws.width(i, w));
  let row = 0;
  const full = (text, st, h) => { ws.set(row, 0, text, st); ws.fillRange(row, 1, row, 4, st); ws.merge(row, 0, row, 4); if (h) ws.height(row, h); row++; };
  full(`${s(g.home)}  ${s(r.homeScore)} – ${s(r.awayScore)}  ${s(g.away)}`, ST.title, 30);
  full([fmtDate(g.date, true), g.time ? fmtTime(g.time) : "", g.venue, g.number ? "Game #" + g.number : "", compOf(g.number)].filter(Boolean).join("  ·  "), ST.sub, 20);
  row++;
  const kv = (k, v, st) => { ws.set(row, 0, k, ST.label); ws.set(row, 1, v, st || ST.val); ws.fillRange(row, 2, row, 4, ST.val); ws.merge(row, 1, row, 4); row++; };
  full("OFFICIALS", ST.section, 18);
  kv("Referee", s(rec.refName), ST.valB);
  ws.set(row, 0, "Referee email", ST.label); ws.link(row, 1, s(rec.refEmail), "mailto:" + s(rec.refEmail), ST.link); ws.fillRange(row, 2, row, 4, ST.val); ws.merge(row, 1, row, 4); row++;
  kv("Assistant referees", (g.officials || []).slice(1).join(", ") || "None listed");
  kv("Submitted", new Date(rec.submittedAt || Date.now()).toLocaleString("en-CA", { timeZone: "America/Vancouver", dateStyle: "medium", timeStyle: "short" }));
  for (const [label, team, x] of [["HOME", g.home, r.home || {}], ["AWAY", g.away, r.away || {}]]) {
    row++;
    full(`${label} · ${s(team).toUpperCase()}`, ST.section, 18);
    ws.row(row, ["Goal scorers", "Player", "#", "", ""], [ST.head, ST.head, ST.head, ST.head, ST.head]); row++;
    if ((x.scorers || []).length) (x.scorers || []).forEach(p => { ws.row(row, ["", titleCase(p.name), s(p.jersey), "", ""], [ST.label, ST.val, ST.val, ST.val, ST.val]); row++; });
    else { ws.set(row, 1, "No goals", ST.muted); row++; }
    ws.row(row, ["Goalkeepers", "Player", "Minutes", "", ""], [ST.head, ST.head, ST.head, ST.head, ST.head]); row++;
    if ((x.keepers || []).length) (x.keepers || []).forEach(k => { ws.row(row, ["", titleCase(k.name), s(k.minutes), "", ""], [ST.label, ST.val, ST.val, ST.val, ST.val]); row++; });
    else { ws.set(row, 1, "Not given", ST.muted); row++; }
    ws.row(row, ["Discipline", "Player", "Card", "Infraction", "Details"], [ST.head, ST.head, ST.head, ST.head, ST.head]); row++;
    if ((x.cards || []).length) (x.cards || []).forEach(c => { const red = /red/i.test(c.card);
      ws.row(row, ["", titleCase(c.name), red ? "RED" : "YELLOW", s(c.infraction), s(c.description)], [ST.label, ST.valB, red ? ST.red : ST.yellow, ST.val, ST.val]); row++; });
    else { ws.set(row, 1, "No cards", ST.muted); row++; }
  }
  row++;
  full("FIELD AND COMMENTS", ST.section, 18);
  kv("Field conditions", s(r.field) || "No issues");
  kv("Injuries and other comments", s(r.notes) || "None");
  row++;
  full("GAME QUESTIONS", ST.section, 18);
  kv("Game ball provided by", s(q.ball) || "—");
  kv("Corner flags provided by", s(q.flags) || "—");
  kv("Home team list (2 copies)", s(q.listHome) || "—");
  kv("Visiting team list (2 copies)", s(q.listAway) || "—");
  kv("Showed player cards", s(q.cards) || "—");
  if ((rec.photos || []).length) {
    row++;
    full("TEAM LIST PHOTOS", ST.section, 18);
    rec.photos.forEach(p => { ws.set(row, 0, /^away/i.test(p.name) ? "Away list" : "Home list", ST.label);
      if (p.url) ws.link(row, 1, p.name, p.url, ST.link); else ws.set(row, 1, p.name, ST.val); ws.fillRange(row, 2, row, 4, ST.val); ws.merge(row, 1, row, 4); row++; });
  }
  ws.freeze(2, 0);
  return ws;
}
// Newest report first. Sheets are named from the game; the record remembers its sheet for links.
function buildReportsWorkbook(records) {
  const wb = new Workbook();
  const sorted = [...records].sort((a, b) => s(b.submittedAt).localeCompare(s(a.submittedAt)));
  sorted.forEach(rec => addReportSheet(wb, rec));
  if (!sorted.length) { const ws = wb.addSheet("No reports yet"); ws.set(0, 0, "Ref reports will appear here, newest first.", ST.muted); }
  return wb.toBuffer();
}

/* ---------------- Discipline ---------------- */
// Latest report per game wins (a corrected report replaces the earlier one).
function latestPerGame(records) {
  const m = new Map();
  for (const rec of records) { const k = gameKey(rec); const ex = m.get(k); if (!ex || s(rec.submittedAt) > s(ex.submittedAt)) m.set(k, rec); }
  return [...m.values()];
}
/* Counts per player. Two yellows in one game = a sending-off: those yellows don't count, the red does (once).
   A yellow followed by a red for "second caution" is treated the same way. */
function computeDiscipline(records) {
  const players = new Map(), all = [];
  for (const rec of latestPerGame(records)) {
    const r = rec.report || {}, g = r.game || {};
    for (const [sideKey, team, opp] of [["home", g.home, g.away], ["away", g.away, g.home]]) {
      const byPlayer = new Map();
      for (const c of ((r[sideKey] || {}).cards || [])) { const k = normName(c.name); if (!k) continue; if (!byPlayer.has(k)) byPlayer.set(k, []); byPlayer.get(k).push(c); }
      for (const [k, cards] of byPlayer) {
        const Y = cards.filter(c => !/red/i.test(c.card)), R = cards.filter(c => /red/i.test(c.card));
        let yCount = Y.length, rCount = R.length, twoYellows = false;
        if (Y.length >= 2) { twoYellows = true; yCount = 0; rCount = Math.max(R.length, 1); }
        else if (Y.length === 1 && R.some(isSecondCaution)) { twoYellows = true; yCount = 0; }
        const pk = normName(team) + "|" + k;
        if (!players.has(pk)) players.set(pk, { team: s(team), name: titleCase(cards[0].name), y: 0, r: 0, cards: [] });
        const p = players.get(pk);
        if (/[A-Z]/.test(s(cards[0].name)) && p.name === p.name.toLowerCase()) p.name = titleCase(cards[0].name);
        p.y += yCount; p.r += rCount;
        const base = { date: s(g.date), opp: s(opp), rec };
        if (twoYellows) p.cards.push({ ...base, type: "R", note: "2 yellows", infraction: "Second caution (two yellow cards)" });
        else { for (let i = 0; i < yCount; i++) p.cards.push({ ...base, type: "Y", infraction: s(Y[i].infraction) }); }
        if (!twoYellows) R.forEach(c => p.cards.push({ ...base, type: "R", infraction: s(c.infraction) }));
        else R.slice(1).forEach(c => p.cards.push({ ...base, type: "R", infraction: s(c.infraction) }));
        cards.forEach(c => all.push({ date: s(g.date), team: s(team), opp: s(opp), player: titleCase(c.name), card: /red/i.test(c.card) ? "Red" : "Yellow", infraction: s(c.infraction), description: s(c.description), rec }));
      }
    }
  }
  const list = [...players.values()].map(p => ({ ...p, points: p.y + 3 * p.r, cards: p.cards.sort((a, b) => a.date.localeCompare(b.date)) }));
  list.sort((a, b) => a.team.localeCompare(b.team) || b.points - a.points || b.r - a.r || a.name.localeCompare(b.name));
  all.sort((a, b) => b.date.localeCompare(a.date) || a.team.localeCompare(b.team) || a.player.localeCompare(b.player));
  return { players: list, cards: all };
}
// Link to one report's sheet in the Ref Reports workbook (Excel for the web opens at that sheet).
function sheetLink(bookUrl, sheet) {
  if (!bookUrl || !sheet) return null;
  return bookUrl + (bookUrl.includes("?") ? "&" : "?") + "web=1&activeCell=" + encodeURIComponent(`'${sheet}'!A1`);
}
function buildDisciplineWorkbook(records, reportsBookUrl, seasonLabel) {
  // make sure every record knows its sheet name (same naming as the Ref Reports workbook)
  const tmp = new Workbook(); [...records].sort((a, b) => s(b.submittedAt).localeCompare(s(a.submittedAt))).forEach(rec => { rec._sheet = tmp.addSheet(sheetNameFor(rec)).name; });
  const { players, cards } = computeDiscipline(records);
  const wb = new Workbook();
  const H = { font: { bold: true, color: C.white }, fill: C.green, align: { v: "center", wrap: true }, border: { bottom: { color: C.lime, style: "medium" } } };
  const Hc = { ...H, align: { h: "center", v: "center", wrap: true } };
  const bandA = { fill: C.white, border: { bottom: { color: "#E3E9E5" } }, align: { v: "center" } };
  const bandB = { fill: C.band, border: { bottom: { color: "#D2DDD6" } }, align: { v: "center" } };
  const num = b => ({ ...b, align: { h: "center", v: "center" } });
  const bold = b => ({ ...b, font: { bold: true } });
  const yCell = { font: { color: C.mid, underline: true }, fill: C.yellow, align: { h: "center", v: "center" }, border: { right: { color: C.white, style: "medium" }, bottom: { color: C.white } } };
  const rCell = { font: { color: C.white, underline: true, bold: true }, fill: C.red, align: { h: "center", v: "center" }, border: { right: { color: C.white, style: "medium" }, bottom: { color: C.white } } };

  // Sheet 1: Discipline by player
  const ws = wb.addSheet("Discipline");
  const maxCards = Math.max(1, ...players.map(p => p.cards.length));
  const last = 4 + maxCards;
  ws.set(0, 0, `Discipline · ${seasonLabel}`, { font: { bold: true, size: 16, color: C.white }, fill: C.green, align: { v: "center", indent: 1 } });
  ws.fillRange(0, 1, 0, last, { fill: C.green }); ws.merge(0, 0, 0, Math.max(4, last)); ws.height(0, 30);
  ws.set(1, 0, "Penalty points: yellow card = 1, red card = 3. Two yellows in one game count as one red (the two yellows aren't added). Use the arrow on Team to filter. Click a card to open that game's report.", { font: { italic: true, color: C.muted }, align: { wrap: true, v: "center" } });
  ws.merge(1, 0, 1, Math.max(4, last)); ws.height(1, 32);
  ws.set(2, 0, "Key:", { font: { bold: true, color: C.muted } }); ws.set(2, 1, "Yellow card", { ...yCell, font: { color: C.mid } }); ws.set(2, 2, "Red card", { ...rCell, font: { color: C.white, bold: true } });
  ws.row(3, ["Team", "Player", "Yellow cards", "Red cards", "Penalty points", ...Array.from({ length: maxCards }, (_, i) => `Card ${i + 1}`)], [H, H, Hc, Hc, Hc, ...Array(maxCards).fill(Hc)]);
  ws.height(3, 30);
  [24, 26, 10, 10, 11].forEach((w, i) => ws.width(i, w)); for (let i = 0; i < maxCards; i++) ws.width(5 + i, 28);
  let row = 4, prevTeam = null, band = false;
  if (!players.length) { ws.set(row, 0, "No cards reported yet.", { font: { italic: true, color: C.muted } }); row++; }
  for (const p of players) {
    if (p.team !== prevTeam) { band = !band; prevTeam = p.team; }
    const b = band ? bandA : bandB;
    ws.row(row, [p.team, p.name, p.y, p.r, p.points], [bold(b), b, num(b), num(b), { ...num(b), font: { bold: true } }]);
    p.cards.forEach((c, i) => {
      const text = `${fmtDate(c.date)} vs ${shortTeam(c.opp)}${c.note ? " (" + c.note + ")" : ""}`;
      const url = sheetLink(reportsBookUrl, c.rec._sheet);
      const st = c.type === "R" ? rCell : yCell;
      if (url) ws.link(row, 5 + i, text, url, st, `${c.type === "R" ? "Red" : "Yellow"} card · ${c.infraction} · open the report (sheet "${c.rec._sheet}")`);
      else ws.set(row, 5 + i, text, st);
    });
    for (let i = p.cards.length; i < maxCards; i++) ws.set(row, 5 + i, null, b);
    row++;
  }
  ws.freeze(4, 2);
  ws.autoFilter(3, 0, Math.max(4, row - 1), last);

  // Sheet 2: Team totals
  const tt = wb.addSheet("Team totals");
  const teams = new Map(); players.forEach(p => { const t = teams.get(p.team) || { y: 0, r: 0, pts: 0, n: 0 }; t.y += p.y; t.r += p.r; t.pts += p.points; t.n++; teams.set(p.team, t); });
  tt.row(0, ["Team", "Players carded", "Yellow cards", "Red cards", "Penalty points"], [H, Hc, Hc, Hc, Hc]); tt.height(0, 30);
  [26, 12, 12, 12, 12].forEach((w, i) => tt.width(i, w));
  [...teams.entries()].sort((a, b) => b[1].pts - a[1].pts || a[0].localeCompare(b[0])).forEach(([t, v], i) => { const b = i % 2 ? bandB : bandA; tt.row(i + 1, [t, v.n, v.y, v.r, v.pts], [bold(b), num(b), num(b), num(b), { ...num(b), font: { bold: true } }]); });
  tt.freeze(1, 1); tt.autoFilter(0, 0, Math.max(1, teams.size), 4);

  // Sheet 3: every card as reported
  const ac = wb.addSheet("All cards");
  ac.row(0, ["Date", "Team", "Player", "Card", "Infraction", "Details", "Opponent", "Report"], [H, H, H, Hc, H, H, H, H]); ac.height(0, 30);
  [12, 22, 24, 9, 40, 40, 22, 26].forEach((w, i) => ac.width(i, w));
  cards.forEach((c, i) => { const b = i % 2 ? bandB : bandA, red = c.card === "Red";
    ac.row(i + 1, [fmtDate(c.date), c.team, c.player, c.card, c.infraction, c.description, c.opp], [b, bold(b), b, red ? rCell : yCell, b, b, b]);
    ac.set(i + 1, 3, c.card, { ...(red ? rCell : yCell), font: { color: red ? C.white : C.mid, bold: red } });
    const url = sheetLink(reportsBookUrl, c.rec._sheet);
    if (url) ac.link(i + 1, 7, c.rec._sheet, url, { ...b, font: { color: C.link, underline: true } }); else ac.set(i + 1, 7, c.rec._sheet, b); });
  ac.freeze(1, 0); ac.autoFilter(0, 0, Math.max(1, cards.length), 7);
  return wb.toBuffer();
}

module.exports = { emailHtml, buildReportsWorkbook, buildDisciplineWorkbook, computeDiscipline, sheetNameFor, gameKey, latestPerGame, shortTeam, fmtDate, normName };
