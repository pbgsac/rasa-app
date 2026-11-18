/* Sign-in, ref accounts and dashboards (switched off for now: FEATURES.accounts). */
"use strict";

/* ---------- Referee accounts, invites and password resets ----------
   Prototype: there is no email service yet. Admins copy the links below and send them from their own email.
   In the full app each reset link carries a one-time code and is emailed automatically. */
const APP_URL = "https://app.rasasoccer.ca/";
const refAccounts = ()=>Object.entries(USERS).filter(([e,u])=>u.role==="referee").map(([email,u])=>({email,u}));
async function copyText(text, btn){
  let ok = false;
  try{ await navigator.clipboard.writeText(text); ok = true; }catch(e){}
  if(!ok){ const inp = btn && btn.closest("section,div") && document.querySelector("input.linkfield"); if(inp) inp.select(); }
  toast(ok ? "Link copied. Paste it into your email." : "Select the link and copy it.");
}
function refsAdminHTML(){
  const accts = refAccounts();
  const byOfficial = {}; accts.forEach(a=>{ if(a.u.official) byOfficial[a.u.official]=a; });
  const unlinked = accts.filter(a=>!a.u.official);
  const row = (name, a)=>{
    const reset = a && a.u.resetRequested;
    return `<tr class="${reset?"needs":""}"><td class="tm">${esc(name)}${reset?`<span class="due" title="Asked for a password reset ${esc(a.u.resetRequested)}">!</span>`:""}</td>
      <td>${a?esc(a.email):`<span class="muted">Not registered yet</span>`}${reset?`<div class="acts"><button class="btn btn-primary btn-sm" data-copyreset="${esc(a.email)}">Copy reset link</button><button class="btn btn-ghost btn-sm" data-resetdone="${esc(a.email)}">Mark as sent</button></div>`
        : (a && a.u.resetSent ? `<div class="muted small">Reset link sent ${esc(a.u.resetSent)}</div>` : "")}</td></tr>`;
  };
  const all = [...OFFICIALS.map(n=>[n, byOfficial[n]]), ...unlinked.map(a=>[a.u.name, a])];
  const rows = [...all.filter(([n,a])=>a&&a.u.resetRequested), ...all.filter(([n,a])=>!(a&&a.u.resetRequested))];
  const resets = accts.filter(a=>a.u.resetRequested).length;
  const invite = APP_URL + "#ref-signup";
  return `<div class="section">
    <div class="invite">
      <b>Invite referees</b>
      <p class="sub">Email this link to referees. They pick their name from the officials schedule, enter their email and create a password.</p>
      <div class="pick"><input class="linkfield" readonly value="${esc(invite)}" aria-label="Referee sign-up link"><button class="btn btn-primary btn-sm" data-copy="${esc(invite)}">Copy link</button></div>
      <p class="hint">Works once the app is live at app.rasasoccer.ca. <button class="linkbtn" data-previewsignup="1">Preview the sign-up page</button></p>
    </div>
    ${resets?`<p class="sub"><b class="bad">${resets} password reset request${resets>1?"s":""}.</b> Copy the reset link, email it to the referee, then mark it as sent.</p>`:""}
    <div class="std roster"><div class="std-h" style="--c:var(--pitch)"><h2>${rows.length} referees</h2><span class="swipe" hidden aria-hidden="true"><span class="swipe-txt">Slide for more</span><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span></div><div class="std-wrap"><table class="refs">
      <thead><tr><th scope="col" class="tm">Name</th><th scope="col">Email</th><th class="fill" aria-hidden="true"></th></tr></thead>
      <tbody>${rows.map(([n,a])=>row(n,a).replace("</tr>",'<td class="fill"></td></tr>')).join("")}</tbody></table></div></div>
    <p class="note">Names come from the officials schedule on rasasoccer.ca. Emails appear once a referee registers.</p></div>`;
}
function wireRefsAdmin(){
  const v = $("#view-dashboard");
  wireScrollArrows(v);
  v.querySelectorAll("[data-copy]").forEach(b=>b.onclick = ()=>copyText(b.dataset.copy, b));
  v.querySelectorAll("[data-copyreset]").forEach(b=>b.onclick = ()=>copyText(APP_URL + "#reset-password", b));
  v.querySelectorAll("[data-resetdone]").forEach(b=>b.onclick = ()=>{ const u = USERS[b.dataset.resetdone]; if(!u) return;
    u.resetRequested = null; u.resetSent = new Date().toLocaleDateString("en-CA",{month:"short",day:"numeric"}); u.resetReady = true;
    toast("Marked as sent"); renderDashboard(); renderTabs(); });
  v.querySelectorAll("[data-previewsignup]").forEach(b=>b.onclick = ()=>{ state.previewFromAdmin = state.user; state.user = null; go("ref-signup"); toast("Previewing as a referee. Sign in again to return."); });
}
function renderRefSignup(){
  const taken = new Set(refAccounts().map(a=>a.u.official).filter(Boolean));
  $("#rsName").innerHTML = `<option value="">Choose your name</option>${OFFICIALS.map(o=>`<option value="${esc(o)}" ${taken.has(o)?"disabled":""}>${esc(o)}${taken.has(o)?" (already registered)":""}</option>`).join("")}<option value="__other">I’m not on the list yet</option>`;
  $("#rsErr").hidden = true; $("#rsOtherWrap").hidden = true;
}
document.addEventListener("change", e=>{ if(e.target.id==="rsName") $("#rsOtherWrap").hidden = e.target.value!=="__other"; });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
document.addEventListener("submit", e=>{
  if(e.target.id==="refSignupForm"){
    e.preventDefault();
    const pick=$("#rsName").value, other=$("#rsOther").value.trim(), email=$("#rsEmail").value.trim().toLowerCase(), pw=$("#rsPw").value, pw2=$("#rsPw2").value;
    const err=$("#rsErr"); const fail=m=>{ err.textContent=m; err.hidden=false; };
    if(!pick) return fail("Choose your name from the list.");
    if(pick==="__other" && !other) return fail("Enter your full name.");
    if(!EMAIL_RE.test(email)) return fail("Enter a valid email address, like name@example.com.");
    if(USERS[email]) return fail("An account with this email already exists. Sign in instead, or use a different email.");
    if(pw.length<8) return fail("Use a password with at least 8 characters.");
    if(pw!==pw2) return fail("The two passwords don’t match.");
    USERS[email] = {role:"referee", name: pick==="__other" ? other : pick, official: pick==="__other" ? "" : pick, confirmed:false};
    DEMO_PW[email] = pw; pendingEmail = email; e.target.reset(); go("check-email");
  }
  if(e.target.id==="forgotForm"){
    e.preventDefault();
    const email=$("#fpEmail").value.trim().toLowerCase(), err=$("#fpErr");
    if(!EMAIL_RE.test(email)){ err.textContent="Enter the email you signed up with."; err.hidden=false; return; }
    err.hidden=true;
    const u = USERS[email];
    if(u) u.resetRequested = new Date().toLocaleDateString("en-CA",{month:"short",day:"numeric"});
    // Same message either way, so the page doesn't reveal which emails have accounts.
    $("#fpDone").innerHTML = `<b>Request sent.</b> If ${esc(email)} has an account, a league administrator will email you a link to set a new password.`;
    $("#fpDone").hidden = false; $("#fpEmail").value = "";
  }
  if(e.target.id==="resetForm"){
    e.preventDefault();
    const email=$("#rpEmail").value.trim().toLowerCase(), pw=$("#rpPw").value, pw2=$("#rpPw2").value, err=$("#rpErr");
    const fail=m=>{ err.textContent=m; err.hidden=false; };
    const u = USERS[email];
    if(!u || !(u.resetReady || u.resetRequested)) return fail("This reset link isn’t valid for that email. Ask the league for a new link.");
    if(pw.length<8) return fail("Use a password with at least 8 characters.");
    if(pw!==pw2) return fail("The two passwords don’t match.");
    delete u.pwHash; DEMO_PW[email] = pw; u.resetReady = false; u.resetRequested = null; u.resetSent = null;
    e.target.reset(); err.hidden = true; toast("Password updated. Sign in with your new password."); go("sign-in"); $("#email").value = email;
  }
});

/* ---------- Account ---------- */
function renderAccount(){
  const u = state.user; if(!u) return;
  const initials = u.name.split(" ").map(s=>s[0]).join("").slice(0,2);
  $("#view-account").innerHTML = `<div class="hello"><h1>Account</h1></div>
    <div class="acct">
      <span class="avatar big">${esc(initials)}</span>
      <div class="acct-who"><b>${esc(u.name)}</b><span>${esc(titleOf(u))}</span><small>${esc(u.email)} · <span class="okc">✓ Email confirmed</span></small></div>
    </div>
    ${u.role==="player"?`<p class="note">Managers, referees and administrators get their access once the league assigns their role.</p>`:""}
    <button class="btn btn-ghost" id="signOut" style="align-self:flex-start">Sign out</button>`;
  $("#signOut").onclick = ()=>{ state.user=null; toast("Signed out"); go("schedule"); };
}

/* ---------- Dashboards ---------- */
let scoreTarget = null;
function openScore(id){
  const g = games[id]; scoreTarget = g;
  $("#scoreSub").textContent = `${fmtDay(g.date)} · ${fmtTime(g.time).t} ${fmtTime(g.time).ap}${g.venue?" · "+g.venue:""}`;
  $("#sHomeL").textContent = tn(g.h); $("#sAwayL").textContent = tn(g.a);
  $("#sHome").value = g.hs ?? ""; $("#sAway").value = g.as ?? "";
  $("#scoreErr").hidden = true;
  $("#scoreModal").hidden = false; $("#sHome").focus();
}
function closeScore(){ $("#scoreModal").hidden = true; scoreTarget = null; }

function renderDashboard(){
  const u = state.user, v = $("#view-dashboard");
  if(!u){ go("sign-in"); return; }
  const first = u.name.split(" ")[0];
  const reportBtn = g => (isPast(g) && !hasScore(g)) ? `<button class="btn btn-primary btn-sm" data-score="${g.id}">Report score</button>`
                      : (isPast(g) ? `<button class="btn btn-ghost btn-sm" data-score="${g.id}">Edit</button>` : "");
  let html = "";

  if(u.role==="manager"){
    const mine = games.filter(g=>g.h===u.team||g.a===u.team);
    const up = mine.filter(g=>!isPast(g)).sort((x,y)=>(x.date+x.time).localeCompare(y.date+y.time));
    const past = mine.filter(isPast).sort((x,y)=>(y.date+y.time).localeCompare(x.date+x.time));
    const n = up[0];
    let w=0,d=0,l=0; past.filter(hasScore).forEach(g=>{const us=g.h===u.team?g.hs:g.as, them=g.h===u.team?g.as:g.hs; us>them?w++:us<them?l++:d++;});
    const pos = positionOf(u.team);
    html += `<div class="team-h"><h1>${esc(tn(u.team))}</h1>${pos?`<a class="standpill" href="#standings" data-view="standings" title="${esc(COMPS[TEAMS[u.team].d].n)}: see full standings"><b>${ord(pos.pos)} place</b></a>`:""}</div>`;
    if(n){
      const opp = n.h===u.team ? n.a : n.h;
      html += `<div class="next"><small>Next game${dayTag(n.date)?" · "+dayTag(n.date):""}</small>
        <div class="vs">vs ${esc(tn(opp))}</div>
        <div class="where">${esc(fmtDay(n.date))} · ${fmtTime(n.time).t} ${fmtTime(n.time).ap} · ${esc(n.venue||"Location TBA")}</div>${n.refs.length?`<div class="where ref">${JERSEY}${refText(n.refs)}</div>`:""}</div>`;
    }
    const mode = state.teamMode;
    const due = TEAM_REPORTS ? past.filter(g=>!reportFor(g, u.team)).length : 0;
    const mgrRosterSide = g=>{
      const r = rosterFor(g,u.team);
      if(isLocked(g)) return r ? `<div class="btns"><button class="btn btn-ghost btn-sm" data-viewroster="${g.id}|${esc(u.team)}">View roster</button><button class="btn btn-ghost btn-sm" data-viewplayers="${g.id}|${esc(u.team)}">View players</button></div>` : "";
      return `<div class="btns"><button class="btn ${r?"btn-ghost":"btn-primary"} btn-sm" data-roster="${g.id}">${r?"Edit roster":"Submit roster"}</button>${r?`<button class="btn btn-ghost btn-sm" data-viewplayers="${g.id}|${esc(u.team)}">View players</button>`:""}</div>`;
    };
    const mgrRosterExtra = g=>{
      const r = rosterFor(g,u.team);
      if(isLocked(g)) return `<div class="reported">${r?`✓ Official roster: <b>${r.players.length}</b> players`:`<span class="bad">No roster was submitted</span>`}</div>`;
      const soon = (lockAt(g) - new Date()) < 48*3600000;
      return r ? `<div class="reported">✓ Roster saved: <b>${r.players.length}</b> players · locks ${esc(fmtLock(g))}</div>`
               : `<div class="reported ${soon?"due-line":"muted-line"}">Roster not submitted · locks ${esc(fmtLock(g))}</div>`;
    };
    html += `<div class="seg" role="group" aria-label="Show">${[["up","Upcoming"],["res","Results"],["players","Players"]].map(([k,l])=>`<button data-teammode="${k}" aria-pressed="${mode===k}">${l}${k==="res"&&due?`<span class="due" title="${due} game report${due>1?"s":""} due" aria-label="${due} report${due>1?"s":""} due">!</span>`:""}</button>`).join("")}</div>`;
    if(mode==="players") html += rosterHTML(u.team);
    else html += `<div class="section">${mode==="up"
      ? (up.map(g=>matchCard(g,{showDate:true, side:mgrRosterSide, extra:mgrRosterExtra})).join("")||'<div class="empty">No games scheduled.</div>')
      : (past.map(g=>matchCard(g,{showDate:true,
          side: g=> `<div class="btns">${(!TEAM_REPORTS || reportFor(g,u.team)) ? "" : `<button class="btn btn-primary btn-sm" data-report="${g.id}">Submit report</button>`}${rosterFor(g,u.team)?`<button class="btn btn-ghost btn-sm" data-viewroster="${g.id}|${esc(u.team)}">View roster</button><button class="btn btn-ghost btn-sm" data-viewplayers="${g.id}|${esc(u.team)}">View players</button>`:""}</div>`,
          extra: g=>{ if(!TEAM_REPORTS) return ""; const r=reportFor(g,u.team); return r ? `<div class="reported">✓ Report submitted by <b>${esc(r.by)}</b> · ${esc(r.when)}</div>` : `<div class="reported due-line">Game report due</div>`; }
        })).join("")||'<div class="empty">No results yet.</div>')}</div>`;
  }

  if(u.role==="referee"){
    const linked = !!u.official;
    if(linked) state.refView = u.official;
    if(!OFFICIALS.includes(state.refView) && !linked) state.refView = OFFICIALS[0] || "";
    const me = state.refView;
    const mine = games.filter(g=>g.refs.includes(me));
    const past = mine.filter(isPast).sort((x,y)=>(y.date+y.time).localeCompare(x.date+x.time));
    const up = mine.filter(g=>!isPast(g)).sort((x,y)=>(x.date+x.time).localeCompare(y.date+y.time));
    const isCentre = g=>g.refs[0]===me;
    const todo = past.filter(g=>isCentre(g) && (!hasScore(g) || !refReportFor(g)));
    const done = past.filter(g=>!todo.includes(g));
    html += linked ? `<div class="hello"><h1>My games</h1></div>`
      : `<div class="hello"><h1>My games</h1><p>This demo account isn’t linked to a referee. Choose an official to see their games from rasasoccer.ca.</p></div>
      <div class="row"><label for="refView" style="font-weight:600">Viewing as</label><select class="select" id="refView">${OFFICIALS.map(o=>`<option ${o===me?"selected":""}>${esc(o)}</option>`).join("")}</select></div>`;
    const scoresDue = todo.filter(g=>!hasScore(g)).length, reportsDue = todo.filter(g=>!refReportFor(g)).length;
    html += `<div class="tiles">
      <div class="tile ${scoresDue?"alert":""}"><div class="n">${scoresDue}</div><div class="l">Scores to report</div></div>
      <div class="tile ${reportsDue?"alert":""}"><div class="n">${reportsDue}</div><div class="l">Referee reports due</div></div></div>`;
    const refSide = g=>{
      if(!isCentre(g)) return `<div class="btns"><button class="btn btn-ghost btn-sm" data-matchrosters="${g.id}">View rosters</button></div>`;
      const b = [];
      if(!hasScore(g)) b.push(`<button class="btn btn-primary btn-sm" data-score="${g.id}">Report score</button>`);
      if(!refReportFor(g)) b.push(`<button class="btn ${hasScore(g)?"btn-primary":"btn-ghost"} btn-sm" data-refreport="${g.id}">Submit ref report</button>`);
      else b.push(`<button class="btn btn-ghost btn-sm" data-view-ref="${g.id}">View report</button>`);
      b.push(`<button class="btn btn-ghost btn-sm" data-matchrosters="${g.id}">View rosters</button>`);
      return `<div class="btns">${b.join("")}</div>`;
    };
    const refExtra = g=>{
      if(!isCentre(g)) return `<div class="reported muted-line">You were an assistant referee. The referee submits the report.</div>`;
      const lines = [];
      lines.push(hasScore(g) ? `<span class="ok">✓ Score reported</span>` : `<span class="bad">Score not reported: please send it right after the game</span>`);
      const r = refReportFor(g);
      lines.push(r ? `<span class="ok">✓ Ref report submitted · ${esc(r.when)}</span>` : `<span class="bad">${refDueText(g)}</span>`);
      return `<div class="reported stack">${lines.join("")}</div>`;
    };
    const rm = state.refMode;
    html += `<div class="seg" role="group" aria-label="Show">${[["up","Upcoming"],["done","Done"]].map(([k,l])=>`<button data-refmode="${k}" aria-pressed="${rm===k}">${l}${k==="done"&&todo.length?`<span class="due" aria-label="${todo.length} to report">!</span>`:""}</button>`).join("")}</div>`;
    const rosterBtn = g=> isLocked(g) ? `<button class="btn btn-ghost btn-sm" data-matchrosters="${g.id}">View rosters</button>` : "";
    if(rm==="up") html += `<div class="section">${up.map(g=>matchCard(g,{showDate:true, side:g=>`<div class="btns">${rosterBtn(g)}</div>`,
      extra:g=> isLocked(g) ? "" : `<div class="reported muted-line">Team rosters available at ${esc(fmtLock(g))}</div>`})).join("")||'<div class="empty">No upcoming games.</div>'}</div>`;
    else html += `<div class="section">${todo.length?`<p class="sub">Report the score right after each game, and your referee report within 24 hours.</p>`:""}${todo.concat(done).map(g=>matchCard(g,{showDate:true,side:refSide,extra:refExtra})).join("")||'<div class="empty">No games yet.</div>'}</div>`;
  }

  if(u.role==="admin"){
    const allPast = games.filter(isPast);
    const noScore = allPast.filter(g=>!hasScore(g));
    const refMissing = allPast.filter(g=>g.refs.length && !refReportFor(g));
    const teamMissing = allPast.reduce((n,g)=>n + [g.h,g.a].filter(t=>TEAMS[t] && !reportFor(g,t)).length, 0);
    html += `<div class="hello"><h1>League admin</h1></div>`;
    const F = state.adminFilter;
    const tile = (k,n,l)=>`<button class="tile tbtn ${n?"alert":""}" data-afilter="${k}" aria-pressed="${F===k}" title="${F===k?"Show all recent games":"Show only these games"}"><div class="n">${n}</div><div class="l">${l}</div></button>`;
    const webTodo = games.filter(webDiffers);
    html += `<div class="tiles">${tile("score",noScore.length,"Scores not reported")}${tile("web",webTodo.length,"Scores to update on rasasoccer.ca")}${tile("ref",refMissing.length,"Referee reports not submitted")}${TEAM_REPORTS?tile("team",teamMissing,"Team reports not submitted"):""}</div>`;
    const resets = refAccounts().filter(a=>a.u.resetRequested).length;
    html += `<div class="seg" role="group" aria-label="Show">${[["games","Recent games"],["refs","Refs"]].map(([k,l])=>`<button data-adminmode="${k}" aria-pressed="${state.adminMode===k}">${l}${k==="refs"&&resets?`<span class="due" aria-label="${resets} password reset request${resets>1?"s":""}">!</span>`:""}</button>`).join("")}</div>`;
    if(state.adminMode==="refs"){ html += refsAdminHTML(); v.innerHTML = html; wireRefsAdmin(); return; }
    const teamGap = g=>[g.h,g.a].some(t=>TEAMS[t] && !reportFor(g,t));
    const byNewest = (x,y)=>(y.date+y.time).localeCompare(x.date+x.time);
    let recent, older = 0;
    if(F){
      recent = (F==="score"?noScore : F==="web"?webTodo : F==="ref"?refMissing : allPast.filter(teamGap)).slice().sort(byNewest);
    } else {
      const edge = new Date(today); edge.setDate(edge.getDate() - 7*state.adminWeeks);
      recent = allPast.filter(g=>parseD(g.date)>=edge).sort(byNewest);
      older = allPast.length - recent.length;
    }
    const FL = {score:"Scores not reported", web:"Scores to update on rasasoccer.ca", ref:"Referee reports not submitted", team:"Team reports not submitted"};
    const adminExtra = g=>{
      const rows = [];
      if(webDiffers(g)) rows.push(`<div class="st"><span class="lbl">rasasoccer.ca</span><span class="bad">${g.webHs===null||g.webAs===null ? "Score not posted yet" : `Shows ${g.webHs}–${g.webAs}, app has ${g.hs}–${g.as}`}</span></div>`);
      if(!g.refs.length) rows.push(`<div class="st"><span class="lbl">Referee</span><span class="muted">No referee assigned</span></div>`);
      else { const r = refReportFor(g);
        rows.push(`<div class="st"><span class="lbl">Referee</span>${r ? `<button class="linkbtn" data-view-ref="${g.id}">See ref report</button>` : `<span class="bad">Ref report not submitted</span>`}</div>`); }
      if(TEAM_REPORTS) [g.h,g.a].filter(t=>TEAMS[t]).forEach(t=>{ const r = reportFor(g,t);
        rows.push(`<div class="st"><span class="lbl">${esc(tn(t))}</span>${r ? `<button class="linkbtn" data-view-team="${g.id}|${esc(t)}">See team report</button>` : `<span class="bad">Team report not submitted</span>`}</div>`); });
      return `<div class="statuses">${rows.join("")}</div>`;
    };
    const scoreSide = g=> hasScore(g) ? "" : `<button class="btn btn-primary btn-sm" data-score="${g.id}">Enter score</button>`;
    html += `<div class="section"><h2>${F?esc(FL[F]):"Recent games"}</h2>${F?`<div class="row"><span class="count">${recent.length} ${recent.length===1?"game":"games"}, whole season</span><button class="chip" data-afilter="clear">Show all recent games ✕</button></div>`:`<p class="sub">Referees report the score right after the game and their report within 24 hours.</p>`}
      ${recent.map(g=>matchCard(g,{showDate:true,side:scoreSide,extra:adminExtra})).join("")||`<div class="empty">${F?"Nothing outstanding here.":"No games in this period."}</div>`}
      ${older?`<button class="btn btn-ghost more" id="adminMore">See earlier games <span class="count">· ${older} more</span></button>`:""}</div>`;
  }
  v.innerHTML = html;
  wireScrollArrows(v);
  const am = $("#adminMore"); if(am) am.onclick = ()=>{ state.adminWeeks += 2; renderDashboard(); };
}
