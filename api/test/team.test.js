// Team (manager) reports: runs the function with a fake Microsoft Graph, so no real email is sent.
const assert = require("assert");
delete process.env.REPORTS_OPEN;   // reports are open by default now
Object.assign(process.env, { GRAPH_TENANT_ID: "t", GRAPH_CLIENT_ID: "c", GRAPH_CLIENT_SECRET: "s", MAIL_FROM: "matchreport@rasasoccer.ca",
  ONEDRIVE_DRIVE_ID: "drive", ONEDRIVE_FOLDER_ID: "folder" });   // OneDrive is set up, but team reports must not touch it
const fn = require("../report/index.js");
const { teamEmailHtml } = require("../lib/reports.js");
const calls = [];
global.fetch = async (url, opts) => {
  calls.push({ url, opts });
  if (url.includes("/oauth2/")) return { ok: true, json: async () => ({ access_token: "T" }) };
  if (url.includes("/sendMail")) return { status: 202, text: async () => "" };
  throw new Error("unexpected call (team reports should only send mail): " + url);
};
const run = async (req) => { const ctx = { log: Object.assign(() => {}, { error: () => {} }) }; await fn(ctx, req); return ctx.res; };
const sent = () => JSON.parse(calls.filter(c => c.url.includes("/sendMail")).pop().opts.body).message;
const img = Buffer.alloc(1500, 9).toString("base64");
const report = { team: "Hammers FC", opponent: "Heatherbrae", us: 3, them: 1, goals: { "Alex Smith": 2, "Sam Lee": 1 }, assists: { "Jo Park": 1 },
  referee: "Billy Cheng", control: 4, decisions: 3, overall: 7, ars: [{ name: "Kanwal Sangha", rating: 5 }], field: "Lines faded\nnet torn", notes: "",
  game: { date: "2026-11-15", time: "15:00", number: "LC-3", venue: "Hugh Boyd - Red", comp: "League's Cup", home: "Heatherbrae", away: "Hammers FC", officials: ["Billy Cheng", "Kanwal Sangha"] } };
const good = { type: "team", name: "Pat Manager", email: "pat@example.com", team: "Hammers FC",
  subject: "TEAM REPORT | 2026-11-15 | #LC-3 | Hammers FC 3-1 Heatherbrae", text: "RASA TEAM REPORT", report,
  photos: [{ name: "field-photo-1.jpg", type: "image/jpeg", data: img }] };
(async () => {
  const hdr = { origin: "https://app.rasasoccer.ca" };
  // open by default, goes to stats@ and president@, reply-to the manager
  let r = await run({ method: "POST", headers: { ...hdr, "x-forwarded-for": "5.5.5.1" }, body: JSON.stringify(good) });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.saved, false);
  const send = calls.find(c => c.url.includes("/sendMail"));
  assert.ok(send.url.endsWith("/users/matchreport%40rasasoccer.ca/sendMail"), "sent from matchreport@");
  let msg = sent();
  assert.deepStrictEqual(msg.toRecipients.map(x => x.emailAddress.address), ["stats@rasasoccer.ca", "president@rasasoccer.ca"]);
  assert.strictEqual(msg.replyTo[0].emailAddress.address, "pat@example.com");
  assert.deepStrictEqual(msg.attachments.map(a => a.name), ["field-photo-1.jpg", "report.json"]);
  assert.ok(msg.subject.startsWith("TEAM REPORT"));
  const html = msg.body.content;
  for (const t of ["RASA team report", "Hammers FC", "Heatherbrae", "3 – 1", "Pat Manager", "Alex Smith", "Billy Cheng", "4/5", "3/5", "7/10", "Kanwal Sangha", "Lines faded<br>net torn", "cid:photo1@rasa"])
    assert.ok(html.includes(t), "email should include " + t);
  const json = JSON.parse(Buffer.from(msg.attachments[1].contentBytes, "base64").toString());
  assert.strictEqual(json.type, "team"); assert.strictEqual(json.managerEmail, "pat@example.com");
  // nothing went to OneDrive
  assert.ok(!calls.some(c => /drives\//.test(c.url)), "team reports are not saved to OneDrive");
  // the request can't change who receives it
  r = await run({ method: "POST", headers: { ...hdr, "x-forwarded-for": "5.5.5.2" }, body: { ...good, to: "x@evil.example", TEAM_REPORT_TO: "x@evil.example", toRecipients: ["x@evil.example"] } });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(sent().toRecipients.map(x => x.emailAddress.address), ["stats@rasasoccer.ca", "president@rasasoccer.ca"]);
  // the league can change the list in Azure settings
  process.env.TEAM_REPORT_TO = "stats@rasasoccer.ca, bad-address, president@rasasoccer.ca";
  r = await run({ method: "POST", headers: { ...hdr, "x-forwarded-for": "5.5.5.3" }, body: good });
  assert.deepStrictEqual(sent().toRecipients.map(x => x.emailAddress.address), ["stats@rasasoccer.ca", "president@rasasoccer.ca"]);
  delete process.env.TEAM_REPORT_TO;
  // validation
  for (const [bad, why] of [[{ ...good, team: "" }, /team/i], [{ ...good, email: "nope" }, /email/i], [{ ...good, name: "" }, /name/i], [{ ...good, website: "x" }, /Rejected/]]) {
    r = await run({ method: "POST", headers: { ...hdr, "x-forwarded-for": "5.5.5.4" }, body: bad });
    assert.strictEqual(r.status, 400); assert.ok(why.test(r.body.error), r.body.error);
  }
  // a team report never needs ref fields, and a ref report still needs them
  r = await run({ method: "POST", headers: { ...hdr, "x-forwarded-for": "5.5.5.5" }, body: { ...good, type: undefined } });
  assert.strictEqual(r.status, 400); assert.ok(/referee/i.test(r.body.error));
  // paused again when the league switches it off in Azure
  process.env.REPORTS_OPEN = "false";
  r = await run({ method: "POST", headers: { ...hdr, "x-forwarded-for": "5.5.5.6" }, body: good });
  assert.strictEqual(r.status, 403);
  delete process.env.REPORTS_OPEN;
  // template copes with an empty report
  assert.ok(teamEmailHtml({ name: "A B", email: "a@b.c", report: { team: "X", opponent: "Y", game: {} } }).includes("No goals listed"));
  console.log("all team report tests passed");
})().catch(e => { console.error(e); process.exit(1); });
