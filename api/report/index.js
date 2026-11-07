/*
  POST /api/report — a referee's game report from app.rasasoccer.ca.

  Sends one email FROM matchreport@rasasoccer.ca TO matchreport@rasasoccer.ca (Microsoft Graph),
  with the team-list photos and a report.json attached, and Reply-To set to the referee.
  The recipient is fixed here on the server, so this endpoint can't be used to email anyone else.

  Settings (Azure Static Web App > Settings > Environment variables):
    GRAPH_TENANT_ID      Microsoft 365 directory (tenant) ID
    GRAPH_CLIENT_ID      App registration's application (client) ID
    GRAPH_CLIENT_SECRET  App registration's client secret
    MAIL_FROM            matchreport@rasasoccer.ca
    MAIL_TO              optional, defaults to MAIL_FROM
*/
const ALLOWED_ORIGINS = [
  "https://app.rasasoccer.ca",
  "https://pbgsac.github.io",
  "https://ashy-water-0e8bef90f.3.azurestaticapps.net",
  "http://localhost:8765"
];
const MAX_PHOTOS = 6;                 // up to 3 per team
const MAX_PHOTO_B64 = 1_500_000;      // ~1.1 MB per photo after the app shrinks it
const MAX_TOTAL_B64 = 3_300_000;      // Graph's sendMail request limit is 4 MB
const MAX_TEXT = 20_000;

const recent = new Map();             // light per-instance rate limit: ip -> [timestamps]
function rateLimited(ip) {
  const now = Date.now(), win = 10 * 60 * 1000;
  const list = (recent.get(ip) || []).filter(t => now - t < win);
  list.push(now); recent.set(ip, list);
  return list.length > 8;
}

function cors(req) {
  const origin = (req.headers && (req.headers.origin || req.headers.Origin)) || "";
  const h = { "Vary": "Origin", "Content-Type": "application/json" };
  if (ALLOWED_ORIGINS.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}

const str = (v, max = 500) => (typeof v === "string" ? v : v == null ? "" : String(v)).slice(0, max).trim();
const esc = s => str(s, MAX_TEXT).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

function validate(body) {
  if (!body || typeof body !== "object") return "Missing report.";
  if (str(body.website)) return "Rejected.";   // honeypot field: people never fill it in
  if (!str(body.refName)) return "Missing referee name.";
  if (!EMAIL_RE.test(str(body.refEmail, 200))) return "Missing or invalid referee email.";
  if (!str(body.subject, 300)) return "Missing subject.";
  if (!str(body.text, MAX_TEXT)) return "Missing report text.";
  const photos = Array.isArray(body.photos) ? body.photos : [];
  if (photos.length > MAX_PHOTOS) return `Too many photos (max ${MAX_PHOTOS}).`;
  let total = 0;
  for (const p of photos) {
    const b64 = str(p && p.data, MAX_PHOTO_B64 + 10);
    if (!/^[A-Za-z0-9+/=\r\n]+$/.test(b64)) return "A photo couldn't be read.";
    if (b64.length > MAX_PHOTO_B64) return "A photo is too large.";
    if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(str(p.type, 40))) return "Photos must be images.";
    total += b64.length;
  }
  if (total > MAX_TOTAL_B64) return "The photos are too large together. Try fewer or smaller photos.";
  return null;
}

async function graphToken(env) {
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(env.GRAPH_TENANT_ID)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GRAPH_CLIENT_ID, client_secret: env.GRAPH_CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials"
    })
  });
  if (!res.ok) throw new Error(`token ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).access_token;
}

function buildMessage(body, env) {
  const from = env.MAIL_FROM, to = env.MAIL_TO || env.MAIL_FROM;
  const photos = (body.photos || []).map((p, i) => ({
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: str(p.name, 120).replace(/[\\/:*?"<>|]/g, "_") || `team-list-${i + 1}.jpg`,
    contentType: str(p.type, 40),
    contentBytes: str(p.data, MAX_PHOTO_B64 + 10).replace(/\s/g, "")
  }));
  const json = Buffer.from(JSON.stringify({ ...(body.report || {}), refName: str(body.refName), refEmail: str(body.refEmail, 200),
    submittedAt: new Date().toISOString(), source: "app.rasasoccer.ca" }, null, 2)).toString("base64");
  photos.push({ "@odata.type": "#microsoft.graph.fileAttachment", name: "report.json", contentType: "application/json", contentBytes: json });
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px">
    <p style="margin:0 0 8px"><b>Referee report</b> submitted by ${esc(body.refName)} (<a href="mailto:${esc(body.refEmail)}">${esc(body.refEmail)}</a>) via app.rasasoccer.ca.
    Reply to this email to reach the referee.</p>
    <pre style="font-family:Consolas,Menlo,monospace;font-size:13px;white-space:pre-wrap;background:#f4f6f5;padding:12px;border-radius:6px">${esc(body.text)}</pre>
    <p style="color:#555;margin:8px 0 0">${(body.photos || []).length} team list photo(s) attached, plus report.json.</p></div>`;
  return {
    message: {
      subject: str(body.subject, 300),
      body: { contentType: "HTML", content: html },
      toRecipients: [{ emailAddress: { address: to } }],
      replyTo: [{ emailAddress: { address: str(body.refEmail, 200), name: str(body.refName) } }],
      attachments: photos
    },
    saveToSentItems: true,
    from
  };
}

async function sendMail(body, env) {
  const token = await graphToken(env);
  const { message, saveToSentItems, from } = buildMessage(body, env);
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message, saveToSentItems })
  });
  if (res.status !== 202) throw new Error(`sendMail ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

module.exports = async function (context, req) {
  const headers = cors(req);
  if ((req.method || "").toUpperCase() === "OPTIONS") { context.res = { status: 204, headers }; return; }
  const env = process.env;
  if (!env.GRAPH_TENANT_ID || !env.GRAPH_CLIENT_ID || !env.GRAPH_CLIENT_SECRET || !env.MAIL_FROM) {
    context.res = { status: 503, headers, body: { ok: false, error: "Report sending isn't set up yet." } }; return;
  }
  const ip = str((req.headers && (req.headers["x-forwarded-for"] || req.headers["x-client-ip"])) || "", 100).split(",")[0];
  if (rateLimited(ip || "unknown")) { context.res = { status: 429, headers, body: { ok: false, error: "Too many reports from this device. Try again in a few minutes." } }; return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = null; } }
  else if (Buffer.isBuffer(body)) { try { body = JSON.parse(body.toString("utf8")); } catch (e) { body = null; } }
  const problem = validate(body);
  if (problem) { context.res = { status: 400, headers, body: { ok: false, error: problem } }; return; }
  try {
    await sendMail(body, env);
    context.log(`Report sent: ${str(body.subject, 300)}`);
    context.res = { status: 200, headers, body: { ok: true } };
  } catch (e) {
    context.log.error ? context.log.error(String(e)) : context.log(String(e));
    context.res = { status: 502, headers, body: { ok: false, error: "The report couldn't be emailed. Please try again." } };
  }
};
module.exports._test = { validate, buildMessage, cors };
