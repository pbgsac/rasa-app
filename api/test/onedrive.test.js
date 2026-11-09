// End-to-end test of report -> email -> OneDrive with a fake Microsoft Graph (in-memory OneDrive + inbox).
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const fixtures = require("./fixtures");
const OUT = process.argv[2];                       // optional folder to write the generated files for inspection
Object.assign(process.env, { GRAPH_TENANT_ID: "t", GRAPH_CLIENT_ID: "c", GRAPH_CLIENT_SECRET: "s", MAIL_FROM: "matchreport@rasasoccer.ca", ONEDRIVE_DRIVE_ID: "drv", ONEDRIVE_FOLDER_ID: "root-folder" });

const files = new Map();   // path -> {buf, etag, id}
const folders = new Map([["", "root-folder"]]);
let etagN = 1, idN = 1, sent = [], failUploads = false, conflictOnce = false;
const jpg = Buffer.alloc(3000, 9).toString("base64");
const asJson = (status, obj, hdr = {}) => ({ status, ok: status < 300, headers: { get: k => hdr[k.toLowerCase()] || null }, json: async () => obj, text: async () => JSON.stringify(obj) });
// inbox with two earlier real reports, a test report, and a non-report email
const inboxMsg = (i, subject, data, photos = true) => ({ id: "m" + i, subject, receivedDateTime: data && data.submittedAt || "2026-11-01T00:00:00Z", data, photos });
const toJson = rec => ({ ...rec.report, refName: rec.refName, refEmail: rec.refEmail, submittedAt: rec.submittedAt, source: "app.rasasoccer.ca" });
const inbox = [inboxMsg(1, "REF REPORT | 2026-11-01 | #d1-8-30 | AC Richmond 3-1 Unicorn FC", toJson(fixtures[0])),
  inboxMsg(2, "REF REPORT | 2026-11-05 | #d1-9-33 | Unicorn FC 0-2 RFC Hibs", toJson(fixtures[1])),
  inboxMsg(3, "TEST — REF REPORT | app.rasasoccer.ca test, please ignore", { test: true }),
  inboxMsg(4, "Fwd: field booking", null)];

global.fetch = async (url, opts = {}) => {
  const m = (opts.method || "GET").toUpperCase(), h = opts.headers || {};
  if (url.includes("/oauth2/")) return asJson(200, { access_token: "T", expires_in: 3600 });
  if (url.endsWith("/sendMail")) { sent.push(JSON.parse(opts.body)); return { status: 202, ok: true, text: async () => "" }; }
  if (url.startsWith("https://download/")) { const f = files.get(decodeURIComponent(url.slice(17))); return { status: 200, ok: true, text: async () => f.buf.toString("utf8") }; }
  let mm;
  if ((mm = /\/users\/[^/]+\/mailFolders\/inbox\/messages/.exec(url))) return asJson(200, { value: inbox.map(x => ({ id: x.id, subject: x.subject, receivedDateTime: x.receivedDateTime })) });
  if ((mm = /\/users\/[^/]+\/messages\/([^/]+)\/attachments/.exec(url))) {
    const msg = inbox.find(x => x.id === decodeURIComponent(mm[1]));
    const v = msg.data ? [{ name: "report.json", contentType: "application/json", contentBytes: Buffer.from(JSON.stringify(msg.data)).toString("base64") }] : [];
    if (msg.photos && msg.data) v.push({ name: "home-team-list-1.jpg", contentType: "image/jpeg", contentBytes: jpg }, { name: "away-team-list-1.jpg", contentType: "image/jpeg", contentBytes: jpg });
    return asJson(200, { value: v });
  }
  if ((mm = /\/items\/([^/:]+)\/children$/.exec(url)) && m === "POST") {
    const parent = [...folders].find(([, id]) => id === decodeURIComponent(mm[1]))[0]; const name = JSON.parse(opts.body).name;
    const p = parent ? parent + "/" + name : name; if (!folders.has(p)) folders.set(p, "f" + idN++); return asJson(201, { id: folders.get(p) });
  }
  if ((mm = /\/items\/root-folder:\/(.+?):(\/content|\/createUploadSession)?$/.exec(url))) {
    const p = mm[1].split("/").map(decodeURIComponent).join("/");
    if (!mm[2] && m === "GET") {
      if (folders.has(p)) return asJson(200, { id: folders.get(p) });
      const f = files.get(p); if (!f) return asJson(404, { error: { code: "itemNotFound" } });
      return asJson(200, { id: f.id, eTag: f.etag, "@microsoft.graph.downloadUrl": "https://download/" + encodeURIComponent(p) });
    }
    if (mm[2] === "/content" && m === "PUT") {
      if (failUploads) return asJson(500, { error: { code: "generalException" } });
      const dir = p.split("/").slice(0, -1).join("/"); if (dir && !folders.has(dir)) return asJson(404, { error: { code: "itemNotFound" } });
      const ex = files.get(p);
      if (h["If-Match"] && (conflictOnce || (ex && ex.etag !== h["If-Match"]))) { conflictOnce = false; return asJson(412, { error: { code: "resourceModified" } }); }
      const f = { buf: Buffer.from(opts.body), etag: '"e' + etagN++ + '"', id: ex ? ex.id : "i" + idN++ }; files.set(p, f);
      return asJson(200, { id: f.id, eTag: f.etag, webUrl: "https://rasasoccer-my.sharepoint.com/personal/matchreport/Documents/RASA%20Ref%20Reports/" + encodeURIComponent(p) });
    }
  }
  throw new Error("unexpected " + m + " " + url);
};

const report = require("../report/index.js");
const sync = require("../sync/index.js");
const call = async (fn, req) => { const ctx = { log: Object.assign(() => {}, { error: () => {} }) }; await fn(ctx, { headers: { origin: "https://app.rasasoccer.ca" }, ...req }); return ctx.res; };
const body = rec => ({ refName: rec.refName, refEmail: rec.refEmail, subject: "REF REPORT | x", text: "plain text version", report: rec.report,
  photos: [{ name: "home-team-list-1.jpg", type: "image/jpeg", data: jpg }, { name: "away-team-list-1.jpg", type: "image/jpeg", data: jpg }] });
const data = () => JSON.parse(files.get("App data/reports.json").buf.toString("utf8")).reports;

(async () => {
  // 1. first sync collects the two earlier reports from the inbox (skips the test + non-report emails)
  let r = await call(sync, { method: "GET" });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body)); assert.strictEqual(r.body.reports, 2); assert.strictEqual(r.body.backfilled, 2);
  assert.ok(files.has("Ref Reports 2026.xlsx") && files.has("Discipline Winter 2026.xlsx"));
  assert.ok([...files.keys()].some(k => k.startsWith("Photos/Nov 1 AC Richmond v Unicorn FC") && k.endsWith("home-team-list-1.jpg")), [...files.keys()].join("\n"));
  // rate limit on sync
  assert.strictEqual((await call(sync, { method: "GET" })).status, 429);

  // 2. a new report: email is HTML with inline photos, and it's saved + workbooks rebuilt
  r = await call(report, { method: "POST", headers: { origin: "https://app.rasasoccer.ca", "x-forwarded-for": "5.5.5.1" }, body: JSON.stringify(body(fixtures[2])) });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.saved, true, JSON.stringify(r.body));
  const msg = sent.pop().message;
  assert.ok(msg.body.content.includes("RASA referee report") && msg.body.content.includes("cid:photo1@rasa"));
  assert.ok(msg.attachments.filter(a => a.isInline).length === 2);
  assert.strictEqual(data().length, 3);

  // 3. two reports at the same moment: the data file changed underneath -> retried, nothing lost
  conflictOnce = true;
  r = await call(report, { method: "POST", headers: { origin: "https://app.rasasoccer.ca", "x-forwarded-for": "5.5.5.2" }, body: JSON.stringify(body(fixtures[3])) });
  assert.strictEqual(r.body.saved, true); assert.strictEqual(data().length, 4);

  // 4. OneDrive down: the referee still gets "sent" (email went out), saved=false
  sent = [];
  failUploads = true;
  r = await call(report, { method: "POST", headers: { origin: "https://app.rasasoccer.ca", "x-forwarded-for": "5.5.5.3" }, body: JSON.stringify(body(fixtures[4])) });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.saved, false); assert.strictEqual(sent.length, 1);
  failUploads = false;

  // 5. next report fixes things up: all reports present in the rebuilt workbooks
  r = await call(report, { method: "POST", headers: { origin: "https://app.rasasoccer.ca", "x-forwarded-for": "5.5.5.4" }, body: JSON.stringify(body(fixtures[4])) });
  assert.strictEqual(r.body.saved, true); assert.strictEqual(data().length, 5);

  if (OUT) for (const [p, f] of files) if (/\.xlsx$/.test(p)) fs.writeFileSync(path.join(OUT, p), f.buf);
  console.log("all OneDrive tests passed;", files.size, "files in the fake OneDrive");
})().catch(e => { console.error(e); process.exit(1); });
