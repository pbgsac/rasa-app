/*
  Saves ref reports to one folder in matchreport@'s OneDrive (the app has access to that folder only):
    RASA Ref Reports/
      Ref Reports 2026.xlsx           one sheet per report, newest first
      Discipline Winter 2026.xlsx     cards per player, grouped by team
      Photos/<game>/…jpg              team list photos
      App data/reports.json           every report as data (the app rebuilds the workbooks from this; don't edit)
  Both workbooks are rebuilt from reports.json each time, so they always match, and a failed save fixes itself
  on the next report. Edits made by hand inside the two workbooks are replaced on the next rebuild.
*/
const { graph, graphError } = require("./graph");
const R = require("./reports");

const DATA = "App data/reports.json";
const enc = p => p.split("/").map(encodeURIComponent).join("/");
const itemPath = (env, p) => `/drives/${encodeURIComponent(env.ONEDRIVE_DRIVE_ID)}/items/${encodeURIComponent(env.ONEDRIVE_FOLDER_ID)}:/${enc(p)}:`;
const files = env => ({ reports: env.REPORTS_FILE || "Ref Reports 2026.xlsx", discipline: env.DISCIPLINE_FILE || "Discipline Winter 2026.xlsx", season: env.SEASON_LABEL || "Winter 2026–27" });
const configured = env => !!(env.ONEDRIVE_DRIVE_ID && env.ONEDRIVE_FOLDER_ID);

const folderIds = new Map();
async function ensureFolder(env, path) {          // creates "Photos/…" etc. inside the granted folder
  if (!path) return env.ONEDRIVE_FOLDER_ID;
  if (folderIds.has(path)) return folderIds.get(path);
  let res = await graph(env, "GET", itemPath(env, path));
  if (res.status === 404) {
    const parts = path.split("/"), name = parts.pop(), parentId = await ensureFolder(env, parts.join("/"));
    res = await graph(env, "POST", `/drives/${encodeURIComponent(env.ONEDRIVE_DRIVE_ID)}/items/${encodeURIComponent(parentId)}/children`,
      { body: { name, folder: {}, "@microsoft.graph.conflictBehavior": "replace" } });
    if (res.status === 409) res = await graph(env, "GET", itemPath(env, path));
  }
  if (!res.ok) throw await graphError(res, "folder");
  const id = (await res.json()).id; folderIds.set(path, id); return id;
}

async function upload(env, path, buf, contentType, ifMatch) {
  const parts = path.split("/"); const name = parts.pop(); const dir = parts.join("/");
  if (dir) await ensureFolder(env, dir);
  if (buf.length < 3.5 * 1024 * 1024) {
    const res = await graph(env, "PUT", itemPath(env, path) + "/content", { body: buf, raw: true, headers: { "Content-Type": contentType, ...(ifMatch ? { "If-Match": ifMatch } : {}) } });
    if (!res.ok) throw await graphError(res, "upload");
    return res.json();
  }
  // big files: upload session in 3.25 MB chunks
  let res = await graph(env, "POST", itemPath(env, path) + "/createUploadSession", { body: { item: { "@microsoft.graph.conflictBehavior": "replace" } } });
  if (!res.ok) throw await graphError(res, "upload-session");
  const { uploadUrl } = await res.json(); const step = 3_276_800; let item = null;
  for (let i = 0; i < buf.length; i += step) {
    const chunk = buf.subarray(i, Math.min(i + step, buf.length));
    const r = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Length": String(chunk.length), "Content-Range": `bytes ${i}-${i + chunk.length - 1}/${buf.length}` }, body: chunk });
    if (!r.ok && r.status !== 202) throw await graphError(r, "upload-chunk");
    if (r.status === 200 || r.status === 201) item = await r.json();
  }
  return item;
}

async function loadAll(env) {                      // -> {records, etag} or null when there's no data file yet
  const res = await graph(env, "GET", itemPath(env, DATA));
  if (res.status === 404) return null;
  if (!res.ok) throw await graphError(res, "read");
  const meta = await res.json();
  const body = await fetch(meta["@microsoft.graph.downloadUrl"]);
  if (!body.ok) throw await graphError(body, "download");
  const data = JSON.parse(await body.text());
  return { records: Array.isArray(data.reports) ? data.reports : [], etag: meta.eTag };
}
async function saveAll(env, records, etag) {
  const buf = Buffer.from(JSON.stringify({ note: "Data for the RASA app. The two Excel files are rebuilt from this file - please don't edit it.", updatedAt: new Date().toISOString(), reports: records }, null, 1));
  return upload(env, DATA, buf, "application/json", etag);
}

const photoFolder = rec => { const g = (rec.report && rec.report.game) || {};
  const stamp = (rec.submittedAt || new Date().toISOString()).replace(/[-:]/g, "").slice(0, 13).replace("T", "-");
  return `Photos/${R.fmtDate(g.date)} ${g.home} v ${g.away} ${stamp}`.replace(/[\\:*?"<>|#%]/g, "-").replace(/\s+/g, " ").trim(); };
async function savePhotos(env, rec, photos) {
  const out = [];
  for (const p of photos || []) {
    try { const item = await upload(env, `${photoFolder(rec)}/${p.name}`, Buffer.from(p.data, "base64"), p.type || "image/jpeg"); out.push({ name: p.name, url: item.webUrl }); }
    catch (e) { out.push({ name: p.name, url: "" }); }
  }
  return out;
}

async function rebuildWorkbooks(env, records) {
  const f = files(env);
  const reports = await upload(env, f.reports, R.buildReportsWorkbook(records), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  const discipline = await upload(env, f.discipline, R.buildDisciplineWorkbook(records, reports && reports.webUrl, f.season), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  return { reportsUrl: reports && reports.webUrl, disciplineUrl: discipline && discipline.webUrl };
}

// Earlier reports, before saving was switched on: read report.json attachments from the matchreport@ inbox.
// Needs the "Application Mail.Read" role for the mailbox; quietly skipped without it.
async function backfillFromMailbox(env) {
  const mb = encodeURIComponent(env.MAIL_FROM), found = [];
  let url = `/users/${mb}/mailFolders/inbox/messages?$select=id,subject,receivedDateTime&$filter=hasAttachments eq true&$top=50`;
  for (let page = 0; url && page < 20; page++) {
    const res = await graph(env, "GET", url);
    if (!res.ok) { if (res.status === 403 || res.status === 401) return { records: [], skipped: "no mailbox read access" }; throw await graphError(res, "mail"); }
    const j = await res.json();
    for (const m of j.value || []) {
      if (!/REF REPORT/i.test(m.subject || "") || /^TEST/i.test(m.subject || "")) continue;
      const a = await graph(env, "GET", `/users/${mb}/messages/${encodeURIComponent(m.id)}/attachments`);
      if (!a.ok) continue;
      const atts = (await a.json()).value || [];
      const js = atts.find(x => x.name === "report.json" && x.contentBytes);
      if (!js) continue;
      let data; try { data = JSON.parse(Buffer.from(js.contentBytes, "base64").toString("utf8")); } catch (e) { continue; }
      if (data.test || !data.game) continue;
      const { refName, refEmail, submittedAt, source, ...report } = data;
      found.push({ rec: { submittedAt: submittedAt || m.receivedDateTime, refName, refEmail, report, photos: [] },
        photos: atts.filter(x => /\.(jpe?g|png|webp|heic)$/i.test(x.name || "") && x.contentBytes).map(x => ({ name: x.name, type: x.contentType, data: x.contentBytes })) });
    }
    url = j["@odata.nextLink"] || null;
  }
  const seen = new Set(), records = [];
  for (const f of found.sort((a, b) => String(a.rec.submittedAt).localeCompare(String(b.rec.submittedAt)))) {
    const key = f.rec.submittedAt + "|" + f.rec.refEmail; if (seen.has(key)) continue; seen.add(key);
    f.rec.photos = await savePhotos(env, f.rec, f.photos); records.push(f.rec);
  }
  return { records };
}

// Add one new report (photos first, then data with a retry if another report saved at the same moment).
async function addReport(env, rec, photos) {
  rec.photos = await savePhotos(env, rec, photos);
  let records;
  for (let attempt = 0; attempt < 4; attempt++) {
    let state = await loadAll(env);
    if (!state) { const bf = await backfillFromMailbox(env).catch(() => ({ records: [] })); state = { records: bf.records, etag: null }; }
    records = state.records.filter(r => !(r.submittedAt === rec.submittedAt && r.refEmail === rec.refEmail)).concat([rec]);
    try { await saveAll(env, records, state.etag); break; }
    catch (e) { if (e.status === 412 && attempt < 3) continue; throw e; }
  }
  const urls = await rebuildWorkbooks(env, records);
  return { count: records.length, ...urls };
}

// Rebuild both workbooks (and, the first time, collect earlier reports from the inbox).
async function sync(env) {
  let state = await loadAll(env), backfilled = 0, note;
  if (!state) { const bf = await backfillFromMailbox(env); backfilled = bf.records.length; note = bf.skipped; await saveAll(env, bf.records, null); state = { records: bf.records }; }
  const urls = await rebuildWorkbooks(env, state.records);
  return { reports: state.records.length, backfilled, note, ...urls };
}

module.exports = { configured, addReport, sync, files, photoFolder };
