// Runs the function with a fake Microsoft Graph, so it can be tested without real credentials.
const assert = require("assert");
const fn = require("../report/index.js");
const calls = [];
global.fetch = async (url, opts) => {
  calls.push({ url, opts });
  if (url.includes("/oauth2/")) return { ok: true, json: async () => ({ access_token: "T" }) };
  if (url.includes("/sendMail")) return { status: 202, text: async () => "" };
  throw new Error("unexpected " + url);
};
const run = async (req) => { const ctx = { log: Object.assign(() => {}, { error: () => {} }) }; await fn(ctx, req); return ctx.res; };
const img = Buffer.alloc(2000, 7).toString("base64");
const good = { refName: "Billy Cheng", refEmail: "billy@example.com", subject: "REF REPORT | 2026-11-06 | #d1-9-33 | AC Richmond 2-1 Unicorn FC",
  text: "RASA REFEREE REPORT\nFinal score: 2-1", report: { homeScore: 2, awayScore: 1 },
  photos: [{ name: "home-list-1.jpg", type: "image/jpeg", data: img }, { name: "away-list-1.jpg", type: "image/jpeg", data: img }] };
(async () => {
  const hdr = { origin: "https://app.rasasoccer.ca" };
  // not configured -> 503
  let r = await run({ method: "POST", headers: hdr, body: JSON.stringify(good) });
  assert.strictEqual(r.status, 503);
  Object.assign(process.env, { GRAPH_TENANT_ID: "t", GRAPH_CLIENT_ID: "c", GRAPH_CLIENT_SECRET: "s", MAIL_FROM: "matchreport@rasasoccer.ca" });
  // preflight
  r = await run({ method: "OPTIONS", headers: hdr }); assert.strictEqual(r.status, 204); assert.strictEqual(r.headers["Access-Control-Allow-Origin"], hdr.origin);
  // unknown origin gets no CORS header
  r = await run({ method: "OPTIONS", headers: { origin: "https://evil.example" } }); assert.ok(!r.headers["Access-Control-Allow-Origin"]);
  // good report (sent as text/plain string)
  r = await run({ method: "POST", headers: { ...hdr, "x-forwarded-for": "1.1.1.1" }, body: JSON.stringify(good) });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  const send = calls.find(c => c.url.includes("/sendMail"));
  assert.ok(send.url.endsWith("/users/matchreport%40rasasoccer.ca/sendMail"));
  const msg = JSON.parse(send.opts.body).message;
  assert.strictEqual(msg.toRecipients[0].emailAddress.address, "matchreport@rasasoccer.ca");
  assert.strictEqual(msg.replyTo[0].emailAddress.address, "billy@example.com");
  assert.strictEqual(msg.attachments.length, 3);
  assert.deepStrictEqual(msg.attachments.map(a => a.name), ["home-list-1.jpg", "away-list-1.jpg", "report.json"]);
  assert.ok(msg.subject.startsWith("REF REPORT"));
  // body must not be able to change the recipient
  r = await run({ method: "POST", headers: { ...hdr, "x-forwarded-for": "2.2.2.2" }, body: { ...good, to: "someone@else.com", MAIL_TO: "x@y.z" } });
  const last = JSON.parse(calls.filter(c => c.url.includes("/sendMail")).pop().opts.body).message;
  assert.strictEqual(last.toRecipients[0].emailAddress.address, "matchreport@rasasoccer.ca");
  // validation
  const bad = async (patch, ip) => (await run({ method: "POST", headers: { ...hdr, "x-forwarded-for": ip }, body: { ...good, ...patch } }));
  assert.strictEqual((await bad({ refEmail: "nope" }, "3.3.3.3")).status, 400);
  assert.strictEqual((await bad({ website: "spam" }, "3.3.3.4")).status, 400);
  assert.strictEqual((await bad({ photos: [{ name: "x.exe", type: "application/x-msdownload", data: img }] }, "3.3.3.5")).status, 400);
  assert.strictEqual((await bad({ photos: Array(7).fill(good.photos[0]) }, "3.3.3.6")).status, 400);
  assert.strictEqual((await bad({ photos: [{ name: "big.jpg", type: "image/jpeg", data: "A".repeat(1_600_000) }] }, "3.3.3.7")).status, 400);
  // HTML in text is escaped
  r = await bad({ text: "<script>alert(1)</script>" }, "3.3.3.8"); assert.strictEqual(r.status, 200);
  assert.ok(!JSON.parse(calls.filter(c => c.url.includes("/sendMail")).pop().opts.body).message.body.content.includes("<script>"));
  // rate limit
  let st; for (let i = 0; i < 9; i++) st = (await run({ method: "POST", headers: { ...hdr, "x-forwarded-for": "9.9.9.9" }, body: good })).status;
  assert.strictEqual(st, 429);
  // Graph failure -> 502
  global.fetch = async (url) => url.includes("/oauth2/") ? { ok: true, json: async () => ({ access_token: "T" }) } : { status: 403, text: async () => "Access denied" };
  r = await run({ method: "POST", headers: { ...hdr, "x-forwarded-for": "4.4.4.4" }, body: good }); assert.strictEqual(r.status, 502);
  console.log("all report function tests passed");
})().catch(e => { console.error(e); process.exit(1); });
