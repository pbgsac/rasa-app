/*
  GET /api/sync-reports — rebuild the "Ref Reports" and "Discipline" workbooks in matchreport@'s OneDrive.
  The first time (no data file yet) it also collects earlier reports from the matchreport@ inbox.
  Safe to call any time: it only reads reports and rewrites the two workbooks. Limited to once a minute.
*/
const { settings } = require("../lib/graph");
const store = require("../lib/store");
const ORIGINS = ["https://app.rasasoccer.ca", "https://pbgsac.github.io", "https://ashy-water-0e8bef90f.3.azurestaticapps.net", "http://localhost:8765"];
let last = 0;
module.exports = async function (context, req) {
  const origin = (req.headers && req.headers.origin) || "";
  const headers = { "Content-Type": "application/json", Vary: "Origin", ...(ORIGINS.includes(origin) ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } : {}) };
  if ((req.method || "").toUpperCase() === "OPTIONS") { context.res = { status: 204, headers }; return; }
  const env = settings();
  if (!env.GRAPH_TENANT_ID || !env.GRAPH_CLIENT_ID || !env.GRAPH_CLIENT_SECRET || !env.MAIL_FROM || !store.configured(env)) {
    context.res = { status: 503, headers, body: { ok: false, error: "OneDrive saving isn't set up yet." } }; return;
  }
  if (Date.now() - last < 60_000) { context.res = { status: 429, headers, body: { ok: false, error: "Already ran in the last minute. Try again shortly." } }; return; }
  last = Date.now();
  try {
    const r = await store.sync(env);
    context.res = { status: 200, headers, body: { ok: true, reports: r.reports, backfilled: r.backfilled, note: r.note || undefined } };
  } catch (e) {
    context.log(`sync failed: ${e.message}`);
    // Setup check (no secrets): which Graph app permissions the token carries, and whether the folder itself is reachable.
    let check = {};
    try {
      const { token, graph } = require("../lib/graph");
      const t = await token(env); const claims = JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString("utf8"));
      check.appPermissions = claims.roles || []; check.appId = claims.appid;
      const f = await graph(env, "GET", `/drives/${encodeURIComponent(env.ONEDRIVE_DRIVE_ID)}/items/${encodeURIComponent(env.ONEDRIVE_FOLDER_ID)}?$select=name`);
      check.folder = f.status === 200 ? "reachable: " + (await f.json()).name : "status " + f.status;
    } catch (x) { check.error = String(x.code || x.message).slice(0, 120); }
    context.res = { status: 502, headers, body: { ok: false, error: "Couldn't update the OneDrive files.", code: String(e.code || "error").slice(0, 120), check } };
    return;
    context.res = { status: 502, headers, body: { ok: false, error: "Couldn't update the OneDrive files.", code: String(e.code || "error").slice(0, 120) } };
  }
};
