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

/* ---------------- Team (manager) report email ----------------
   rec: { submittedAt, name, email, team, report:{ team, opponent, us, them, goals:{name:count}, assists:{name:count},
          referee, control, decisions, overall, ars:[{name, rating}], field, notes, game:{date, time, number, venue, comp, officials} } } */
function teamEmailHtml(rec, photoCids) {
  const r = rec.report || {}, g = r.game || {};
  const td = "padding:6px 10px;border-bottom:1px solid #e3e9e5;vertical-align:top;font-size:14px;color:#101820";
  const th = "padding:6px 10px;text-align:left;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#4F5E57;background:#F3F6F4;border-bottom:1px solid #dde4e0";
  const section = (title, inner) => `<tr><td style="padding:18px 20px 4px"><div style="font-size:13px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${C.green};border-bottom:2px solid ${C.lime};padding-bottom:4px;margin-bottom:8px">${title}</div>${inner}</td></tr>`;
  const table = (heads, rows, empty) => rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${heads.map(h => `<th style="${th}">${h}</th>`).join("")}</tr>${rows.map(cells => `<tr>${cells.map(c => `<td style="${td}">${c}</td>`).join("")}</tr>`).join("")}</table>`
    : `<div style="font-size:14px;color:${C.muted};padding:2px 0 6px">${empty}</div>`;
  const kv = rows => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="${td};width:42%;color:${C.muted}">${k}</td><td style="${td}">${v}</td></tr>`).join("")}</table>`;
  const counted = o => Object.entries(o || {}).filter(([n]) => s(n)).map(([n, c]) => [esc(titleCase(n)), esc(+c || 1)]);
  // Rating shown as filled/empty dots plus the number, e.g. ●●●●○ 4/5
  const rating = (n, of) => { n = Math.max(0, Math.min(of, +n || 0)); return `<span style="color:${C.green};letter-spacing:2px;font-size:15px">${"●".repeat(n)}</span><span style="color:#c9d3cd;letter-spacing:2px;font-size:15px">${"●".repeat(of - n)}</span> <b>${n}/${of}</b>`; };
  const photos = (photoCids || []).length ? section("Field photos", photoCids.map(p => `<div style="display:inline-block;margin:0 10px 10px 0;text-align:center;vertical-align:top"><img src="cid:${p.cid}" alt="${esc(p.label)}" width="250" style="width:250px;max-width:100%;border:1px solid #dde4e0;border-radius:6px;display:block"><div style="font-size:12px;color:${C.muted};margin-top:4px">${esc(p.label)}</div></div>`).join("")) : "";
  const meta = [fmtDate(g.date, true), g.time ? fmtTime(g.time) : "", g.venue, g.number ? "Game #" + g.number : "", g.comp || compOf(g.number)].filter(Boolean).map(esc).join(" &nbsp;·&nbsp; ");
  const ars = (r.ars || []).map(a => [esc(titleCase(a.name)), rating(a.rating, 5)]);
  return `<!doctype html><html><body style="margin:0;padding:0;background:${C.off}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.off};padding:16px 0"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#fff;border-radius:10px;overflow:hidden;font-family:Segoe UI,Helvetica,Arial,sans-serif;border:1px solid #dde4e0">
<tr><td style="background:${C.green};padding:16px 20px;border-bottom:4px solid ${C.lime}">
  <div style="color:#cfe3d9;font-size:12px;letter-spacing:.06em;text-transform:uppercase;font-weight:700">RASA team report · ${esc(r.team)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px"><tr>
    <td style="color:#fff;font-size:18px;font-weight:700;width:40%">${esc(r.team)}<div style="font-size:11px;font-weight:600;color:#cfe3d9;text-transform:uppercase;letter-spacing:.05em">Reporting team</div></td>
    <td align="center" style="color:#fff;font-size:34px;font-weight:800;white-space:nowrap">${esc(r.us)} – ${esc(r.them)}</td>
    <td align="right" style="color:#fff;font-size:18px;font-weight:700;width:40%">${esc(r.opponent)}<div style="font-size:11px;font-weight:600;color:#cfe3d9;text-transform:uppercase;letter-spacing:.05em">Opponent</div></td>
  </tr></table>
  <div style="color:#e6f0eb;font-size:13px;margin-top:10px">${meta}</div>
</td></tr>
${section("Submitted by", kv([["Manager", `<b>${esc(rec.name)}</b><br><a href="mailto:${esc(rec.email)}" style="color:${C.link}">${esc(rec.email)}</a>`], ["Team", esc(r.team)]]))}
${section("Goals and assists", `${table(["Goal scorer", "Goals"], counted(r.goals), "No goals listed")}<div style="height:8px"></div>${table(["Assisted by", "Assists"], counted(r.assists), "No assists listed")}`)}
${section(`Referee${r.referee ? " · " + esc(r.referee) : ""}`, kv([["Control of the game", rating(r.control, 5)], ["Decision making", rating(r.decisions, 5)], ["Overall score", rating(r.overall, 10)]]))}
${ars.length ? section("Assistant referees", table(["Assistant referee", "Rating"], ars, "")) : ""}
${section("Field and comments", kv([["Field condition", nl2br(r.field) || "No issues"], ["Comments", nl2br(r.notes) || "None"]]))}
${photos}
<tr><td style="padding:16px 20px;color:${C.muted};font-size:12px;border-top:1px solid #e3e9e5">Submitted ${esc(new Date(rec.submittedAt || Date.now()).toLocaleString("en-CA", { timeZone: "America/Vancouver", dateStyle: "medium", timeStyle: "short" }))} via app.rasasoccer.ca · Reply to this email to reach the manager.</td></tr>
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

/* ---------------- Team Reports workbook ----------------
   Team report record: { submittedAt, name, email, team, report:{ team, opponent, us, them, goals, assists, referee,
   control, decisions, overall, ars:[{name, rating}], field, notes, game:{date, time, number, venue, comp, home, away, officials} }, photos:[{name, url}] } */
const submittedText = rec => new Date(rec.submittedAt || Date.now()).toLocaleString("en-CA", { timeZone: "America/Vancouver", dateStyle: "medium", timeStyle: "short" });
function teamSheetNameFor(rec) { const r = rec.report || {}, g = r.game || {}; return safeSheetName(`${fmtDate(g.date)} ${shortTeam(r.team)} v ${shortTeam(r.opponent)}`); }
const byNewest = records => [...records].sort((a, b) => s(b.submittedAt).localeCompare(s(a.submittedAt)));
// Give every record its sheet name, in the same order the Team Reports workbook creates them
function nameTeamSheets(records) { const tmp = new Workbook(); tmp.addSheet("Directory"); byNewest(records).forEach(rec => { rec._sheet = tmp.addSheet(teamSheetNameFor(rec)).name; }); }
const BAND_A = { fill: C.white, border: { bottom: { color: "#E3E9E5" } }, align: { v: "center" } };
const BAND_B = { fill: C.band, border: { bottom: { color: "#D2DDD6" } }, align: { v: "center" } };
const HEAD = { font: { bold: true, color: C.white }, fill: C.green, align: { v: "center", wrap: true }, border: { bottom: { color: C.lime, style: "medium" } } };
const HEADC = { ...HEAD, align: { h: "center", v: "center", wrap: true } };
const center = b => ({ ...b, align: { h: "center", v: "center" } });
const boldOf = b => ({ ...b, font: { bold: true } });
const linkOf = b => ({ ...b, font: { color: C.link, underline: true } });
const titleRow = (ws, text, lastCol, note) => {
  ws.set(0, 0, text, { font: { bold: true, size: 16, color: C.white }, fill: C.green, align: { v: "center", indent: 1 } });
  ws.fillRange(0, 1, 0, lastCol, { fill: C.green }); ws.merge(0, 0, 0, lastCol); ws.height(0, 30);
  if (note) { ws.set(1, 0, note, { font: { italic: true, color: C.muted }, align: { wrap: true, v: "center" } }); ws.merge(1, 0, 1, lastCol); ws.height(1, 32); }
};

function addTeamReportSheet(wb, rec) {
  const r = rec.report || {}, g = r.game || {};
  const ws = wb.addSheet(teamSheetNameFor(rec)); rec._sheet = ws.name;
  [28, 30, 12, 30, 30].forEach((w, i) => ws.width(i, w));
  let row = 0;
  const full = (text, st, h) => { ws.set(row, 0, text, st); ws.fillRange(row, 1, row, 4, st); ws.merge(row, 0, row, 4); if (h) ws.height(row, h); row++; };
  const kv = (k, v, st) => { ws.set(row, 0, k, ST.label); ws.set(row, 1, v, st || ST.val); ws.fillRange(row, 2, row, 4, ST.val); ws.merge(row, 1, row, 4); row++; };
  const rating = (n, of) => (+n ? `${+n} / ${of}` : "—");
  full(`${s(r.team)}  ${s(r.us)} – ${s(r.them)}  ${s(r.opponent)}`, ST.title, 30);
  full([fmtDate(g.date, true), g.time ? fmtTime(g.time) : "", g.venue, g.number ? "Game #" + g.number : "", g.comp || compOf(g.number)].filter(Boolean).join("  ·  "), ST.sub, 20);
  ws.link(row, 0, "← Back to Directory", { sheet: "Directory" }, { font: { color: C.link, underline: true } }); row += 2;
  full("SUBMITTED BY", ST.section, 18);
  kv("Manager", s(rec.name), ST.valB);
  ws.set(row, 0, "Manager email", ST.label); ws.link(row, 1, s(rec.email), "mailto:" + s(rec.email), ST.link); ws.fillRange(row, 2, row, 4, ST.val); ws.merge(row, 1, row, 4); row++;
  kv("Team", s(r.team));
  kv("Submitted", submittedText(rec));
  row++;
  full("GOALS AND ASSISTS", ST.section, 18);
  for (const [label, obj, none] of [["Goal scorers", r.goals, "No goals listed"], ["Assists", r.assists, "No assists listed"]]) {
    ws.row(row, [label, "Player", label === "Assists" ? "Assists" : "Goals", "", ""], Array(5).fill(ST.head)); row++;
    const list = Object.entries(obj || {}).filter(([n]) => s(n));
    if (list.length) list.forEach(([n, c]) => { ws.row(row, ["", titleCase(n), +c || 1, "", ""], [ST.label, ST.val, ST.val, ST.val, ST.val]); row++; });
    else { ws.set(row, 1, none, ST.muted); row++; }
  }
  row++;
  full(`REFEREE${r.referee ? " · " + s(r.referee).toUpperCase() : ""}`, ST.section, 18);
  kv("Control of the game", rating(r.control, 5), ST.valB);
  kv("Decision making", rating(r.decisions, 5), ST.valB);
  kv("Overall score", rating(r.overall, 10), ST.valB);
  if ((r.ars || []).length) {
    row++;
    full("ASSISTANT REFEREES", ST.section, 18);
    r.ars.forEach(a => kv(titleCase(a.name), rating(a.rating, 5), ST.valB));
  }
  row++;
  full("FIELD AND COMMENTS", ST.section, 18);
  kv("Field condition", s(r.field) || "No issues");
  kv("Comments", s(r.notes) || "None");
  if ((rec.photos || []).length) {
    row++;
    full("FIELD PHOTOS", ST.section, 18);
    rec.photos.forEach((p, i) => { ws.set(row, 0, "Photo " + (i + 1), ST.label);
      if (p.url) ws.link(row, 1, p.name, p.url, ST.link); else ws.set(row, 1, p.name, ST.val); ws.fillRange(row, 2, row, 4, ST.val); ws.merge(row, 1, row, 4); row++; });
  }
  ws.freeze(2, 0);
  return ws;
}
// Directory first, then one sheet per report (newest first)
function buildTeamReportsWorkbook(records, seasonLabel) {
  const wb = new Workbook(), sorted = byNewest(records);
  const dir = wb.addSheet("Directory");
  sorted.forEach(rec => addTeamReportSheet(wb, rec));
  titleRow(dir, `Team Reports · ${seasonLabel}`, 7, "Every team report from managers, newest first. Click a report to open its sheet. If a manager sends a report for the same game again, both are kept here; the Ref Ratings workbook uses the latest one.");
  dir.row(2, ["Date", "Game #", "Reporting team", "Score", "Opponent", "Manager", "Submitted", "Report"], [HEAD, HEADC, HEAD, HEADC, HEAD, HEAD, HEAD, HEAD]); dir.height(2, 30);
  [13, 10, 24, 9, 24, 24, 22, 30].forEach((w, i) => dir.width(i, w));
  if (!sorted.length) dir.set(3, 0, "Team reports will appear here, newest first.", ST.muted);
  sorted.forEach((rec, i) => {
    const r = rec.report || {}, g = r.game || {}, b = i % 2 ? BAND_B : BAND_A, row = 3 + i;
    dir.row(row, [fmtDate(g.date), s(g.number), s(r.team), `${s(r.us)}–${s(r.them)}`, s(r.opponent), s(rec.name), submittedText(rec)], [b, center(b), boldOf(b), center(boldOf(b)), b, b, b]);
    dir.link(row, 7, rec._sheet, { sheet: rec._sheet }, linkOf(b), "Open this report");
  });
  dir.freeze(3, 0);
  if (sorted.length) dir.autoFilter(2, 0, 2 + sorted.length, 7);
  return wb.toBuffer();
}

/* ---------------- Ref Ratings (from team reports) ---------------- */
// One report per team per game: the latest wins (a corrected report replaces the earlier one)
function latestPerTeamGame(records) {
  const m = new Map();
  for (const rec of records) { const k = gameKey(rec) + "|" + normName((rec.report || {}).team); const ex = m.get(k); if (!ex || s(rec.submittedAt) > s(ex.submittedAt)) m.set(k, rec); }
  return [...m.values()];
}
const avg = list => list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length * 100) / 100 : null;
function computeRatings(records) {
  const people = new Map(), all = [];
  const person = name => { const k = normName(name); if (!people.has(k)) people.set(k, { name: titleCase(name), control: [], decisions: [], overall: [], ar: [], games: new Set() }); return people.get(k); };
  for (const rec of latestPerTeamGame(records)) {
    const r = rec.report || {}, g = r.game || {};
    const base = { date: s(g.date), game: `${s(g.home)} v ${s(g.away)}`, number: s(g.number), by: s(r.team), rec };
    if (s(r.referee) && (+r.control || +r.decisions || +r.overall)) {
      const p = person(r.referee);
      if (+r.control) p.control.push(+r.control); if (+r.decisions) p.decisions.push(+r.decisions); if (+r.overall) p.overall.push(+r.overall);
      p.games.add("R|" + gameKey(rec) + "|" + normName(r.team));
      all.push({ ...base, official: p.name, role: "Referee", control: +r.control || null, decisions: +r.decisions || null, overall: +r.overall || null, ar: null });
    }
    for (const a of r.ars || []) {
      if (!s(a.name) || !+a.rating) continue;
      const p = person(a.name); p.ar.push(+a.rating); p.games.add("A|" + gameKey(rec) + "|" + normName(r.team));
      all.push({ ...base, official: p.name, role: "Assistant referee", control: null, decisions: null, overall: null, ar: +a.rating });
    }
  }
  const list = [...people.values()].map(p => ({ name: p.name, refN: p.overall.length || p.control.length || p.decisions.length, control: avg(p.control), decisions: avg(p.decisions), overall: avg(p.overall),
    arN: p.ar.length, ar: avg(p.ar), total: p.games.size })).sort((a, b) => a.name.localeCompare(b.name));
  all.sort((a, b) => b.date.localeCompare(a.date) || a.official.localeCompare(b.official));
  return { officials: list, ratings: all };
}
function buildRefRatingsWorkbook(records, teamBookUrl, seasonLabel) {
  nameTeamSheets(records);   // so each rating can link to its report's sheet
  const { officials, ratings } = computeRatings(records);
  const wb = new Workbook();
  // How an average looks: green when good, red when low (on a 5 or 10 scale)
  const scored = (b, v, of) => { const st = center(b); if (v == null) return st; const pct = v / of;
    return pct >= 0.8 ? { ...st, fill: "#D9F0DE", font: { bold: true, color: "#14532D" } } : pct < 0.5 ? { ...st, fill: "#FADBD8", font: { bold: true, color: "#7F1D1D" } } : { ...st, font: { bold: true } }; };

  const ws = wb.addSheet("Officials");
  titleRow(ws, `Ref Ratings · ${seasonLabel}`, 7, "Average of every rating from team managers' reports. As referee: control of the game and decision making out of 5, overall score out of 10. As assistant referee: out of 5. Green is 80% or more, red is under 50%. Use the arrows to sort or filter.");
  ws.row(2, ["Official", "Games rated as referee", "Control of the game (avg /5)", "Decision making (avg /5)", "Overall score (avg /10)", "Games rated as assistant", "Assistant rating (avg /5)", "Ratings in total"],
    [HEAD, HEADC, HEADC, HEADC, HEADC, HEADC, HEADC, HEADC]); ws.height(2, 44);
  [26, 12, 14, 14, 14, 12, 14, 11].forEach((w, i) => ws.width(i, w));
  if (!officials.length) ws.set(3, 0, "Ratings will appear here once managers send team reports.", ST.muted);
  officials.forEach((p, i) => { const b = i % 2 ? BAND_B : BAND_A, row = 3 + i;
    ws.row(row, [p.name, p.refN || null, p.control, p.decisions, p.overall, p.arN || null, p.ar, p.total],
      [boldOf(b), center(b), scored(b, p.control, 5), scored(b, p.decisions, 5), scored(b, p.overall, 10), center(b), scored(b, p.ar, 5), center(b)]); });
  ws.freeze(3, 1);
  if (officials.length) ws.autoFilter(2, 0, 2 + officials.length, 7);

  const ar = wb.addSheet("All ratings");
  ar.row(0, ["Date", "Game", "Game #", "Official", "Role", "Rated by", "Control (/5)", "Decisions (/5)", "Overall (/10)", "Assistant (/5)", "Report"], [HEAD, HEAD, HEADC, HEAD, HEAD, HEAD, HEADC, HEADC, HEADC, HEADC, HEAD]); ar.height(0, 30);
  [12, 30, 10, 24, 17, 22, 11, 12, 12, 12, 30].forEach((w, i) => ar.width(i, w));
  ratings.forEach((x, i) => { const b = i % 2 ? BAND_B : BAND_A, row = 1 + i;
    ar.row(row, [fmtDate(x.date), x.game, x.number, x.official, x.role, x.by, x.control, x.decisions, x.overall, x.ar], [b, b, center(b), boldOf(b), b, b, center(b), center(b), center(b), center(b)]);
    const url = sheetLink(teamBookUrl, x.rec._sheet);
    if (url) ar.link(row, 10, x.rec._sheet, url, linkOf(b), "Open the team report"); else ar.set(row, 10, x.rec._sheet, b); });
  ar.freeze(1, 0);
  if (ratings.length) ar.autoFilter(0, 0, ratings.length, 10);
  return wb.toBuffer();
}

module.exports = { emailHtml, teamEmailHtml, buildReportsWorkbook, buildDisciplineWorkbook, computeDiscipline, sheetNameFor, gameKey, latestPerGame, shortTeam, fmtDate, normName,
  buildTeamReportsWorkbook, buildRefRatingsWorkbook, computeRatings, teamSheetNameFor, latestPerTeamGame };
