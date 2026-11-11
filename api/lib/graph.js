/* Microsoft Graph helpers (app-only). Settings come from the Static Web App's environment variables. */
const clean = v => String(v || "").trim().replace(/^["']+|["']+$/g, "").trim();
const KEYS = ["GRAPH_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_SECRET", "MAIL_FROM", "MAIL_TO", "ONEDRIVE_DRIVE_ID", "ONEDRIVE_FOLDER_ID", "REPORTS_FILE", "DISCIPLINE_FILE", "SEASON_LABEL"];
// Non-secret defaults (folder addresses only - access is controlled by the app's permissions).
// An Azure environment variable with the same name takes priority.
const DEFAULTS = {
  ONEDRIVE_DRIVE_ID: "b!sZBm4cG47UStKjbz-lE2GU3H2dtR-Z1ChlPSZql2BTZSXiOkzUNrR6tocX3muaVA",   // matchreport@ OneDrive
  ONEDRIVE_FOLDER_ID: "01CHCMFWEK6G4RPBFAINC2VHXUHBKLHNX6"                                   // "RASA Ref Reports" folder
};
const settings = () => Object.fromEntries(KEYS.map(k => [k, clean(process.env[k]) || DEFAULTS[k] || ""]));

let cached = null;
async function token(env) {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(env.GRAPH_TENANT_ID)}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.GRAPH_CLIENT_ID, client_secret: env.GRAPH_CLIENT_SECRET, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" })
  });
  if (!res.ok) {
    const t = await res.text(); let code = ""; try { const j = JSON.parse(t); code = j.error || ""; if (j.error_codes) code += " AADSTS" + j.error_codes[0]; } catch (e) {}
    const err = new Error(`token ${res.status}: ${t.slice(0, 300)}`); err.code = `sign-in ${res.status} ${code}`.trim(); throw err;
  }
  const j = await res.json(); cached = { token: j.access_token, exp: Date.now() + (j.expires_in || 3000) * 1000 }; return cached.token;
}

// fetch against Graph with retries for throttling. Returns the Response (caller checks status).
async function graph(env, method, path, { body, headers = {}, raw = false } = {}) {
  const url = path.startsWith("http") ? path : "https://graph.microsoft.com/v1.0" + path;
  for (let attempt = 0; ; attempt++) {
    const t = await token(env);
    const res = await fetch(url, { method, headers: { Authorization: `Bearer ${t}`, ...(body && !raw && !Buffer.isBuffer(body) ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body == null ? undefined : (raw || Buffer.isBuffer(body) || typeof body === "string" ? body : JSON.stringify(body)) });
    if ((res.status === 429 || res.status === 503 || res.status === 504) && attempt < 3) {
      const wait = Math.min(8, +(res.headers.get("retry-after") || 2)) * 1000; await new Promise(r => setTimeout(r, wait)); continue;
    }
    return res;
  }
}
async function graphError(res, what) {
  const t = await res.text(); let code = ""; try { code = JSON.parse(t).error.code || ""; } catch (e) {}
  const err = new Error(`${what} ${res.status}: ${t.slice(0, 300)}`); err.status = res.status; err.code = `${what} ${res.status} ${code}`.trim(); return err;
}
module.exports = { settings, token, graph, graphError, clean };
