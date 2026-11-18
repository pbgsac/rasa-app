/* Main tabs, page routing, tap and change handlers, and start-up (loads last). */
"use strict";

/* ---------- Auth ---------- */
function renderAuthArea(){
  const a = $("#authArea");
  if(!FEATURES.accounts){ a.innerHTML = ""; return; }
  if(state.user){
    const initials = state.user.name.split(" ").map(s=>s[0]).join("").slice(0,2);
    a.innerHTML = `<button class="userchip" data-view="account" title="Your account"><span class="who"><b>${esc(state.user.name)}</b><small>${esc(titleOf(state.user))}</small></span><span class="avatar">${esc(initials)}</span></button>`;
  } else {
    a.innerHTML = `<button class="btn btn-on-bar" id="signInBtn">Sign in</button>`;
    $("#signInBtn").onclick = ()=>go("sign-in");
  }
}
function renderTabs(){
  const tabs = [["schedule","Schedule"],["standings","Standings"],["leaders","Leaders"]];
  if(FEATURES.gameReport && (!state.user || state.user.role==="player")) tabs.push(["game-report","Ref Report"]);
  const isOn = k=>state.view===k||(state.view==="team"&&k===(state.teamFrom||"standings"));
  // Same tabs as last time: just move the selection, so the change animates instead of redrawing
  const existing = [...$("#tabs").querySelectorAll(".tab")];
  if(!FEATURES.accounts && existing.length===tabs.length && existing.every((b,i)=>b.dataset.view===tabs[i][0])){
    existing.forEach(b=>{ if(isOn(b.dataset.view)) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current"); }); return; }
  if(!FEATURES.accounts){ $("#tabs").innerHTML = tabs.map(([k,n])=>`<button class="tab${k==="game-report"?" tab-end":""}" data-view="${k}" ${(state.view===k||(state.view==="team"&&k===(state.teamFrom||"standings")))?'aria-current="page"':""}>${n}</button>`).join(""); return; }
  if(state.user){ if(state.user.role!=="player") tabs.push(["dashboard", state.user.role==="manager"?"My team":state.user.role==="referee"?"My games":"Admin"]); tabs.push(["account","Account"]); }
  else tabs.push(["sign-in","Sign in"]);
  let dueN = 0;
  if(TEAM_REPORTS && state.user && state.user.role==="manager"){ const t=state.user.team; dueN = games.filter(g=>(g.h===t||g.a===t) && isPast(g) && !reportFor(g,t)).length; }
  if(state.user && state.user.role==="admin"){ dueN = refAccounts().filter(a=>a.u.resetRequested).length; }
  if(state.user && state.user.role==="referee"){ const me=state.refView; dueN = games.filter(g=>g.refs[0]===me && isPast(g) && (!hasScore(g) || !refReportFor(g))).length; }
  $("#tabs").innerHTML = tabs.map(([k,n])=>`<button class="tab${(k==="account"||k==="sign-in")?" tab-end":""}" data-view="${k}" ${(state.view===k||(k==="sign-in"&&/create-account|check-email|ref-signup|forgot-password|reset-password/.test(state.view)))?'aria-current="page"':""}>${n}${k==="dashboard"&&dueN?`<span class="dot" aria-label="${dueN} report${dueN>1?"s":""} due"></span>`:""}</button>`).join("");
}

/* ---------- Routing ---------- */
const VIEWS = ["schedule","standings","leaders","team","game-report","sign-in","create-account","check-email","ref-signup","forgot-password","reset-password","dashboard","account"];
function go(view, push=true){
  if(view==="team" && !(state.teamKey && TEAMS[state.teamKey])) view = "standings";
  if(view==="team" && state.view!=="team") state.teamFrom = state.view;
  if(!FEATURES.accounts && !["schedule","standings","leaders","team"].concat(FEATURES.gameReport?["game-report"]:[]).includes(view)) view = "schedule";
  if((view==="dashboard"||view==="account") && !state.user) view="sign-in";
  if((view==="sign-in"||view==="create-account"||view==="ref-signup") && state.user) view="dashboard";
  if(view==="dashboard" && state.user && state.user.role==="player") view="account";
  if(view==="check-email" && !pendingEmail) view = state.user ? "account" : "sign-in";
  state.view = view;
  VIEWS.forEach(k=>$("#view-"+k).hidden = k!==view);
  const hash = view==="team" ? "team/"+encodeURIComponent(state.teamKey) : view;
  if(push){ try{ if(location.hash!=="#"+hash){ if(view==="team"){ history.pushState(null,"","#"+hash); state.teamPushed = true; } else { history.replaceState(null,"","#"+hash); state.teamPushed = false; } } }catch(e){} }
  renderAuthArea(); renderTabs();
  if(view==="schedule") renderSchedule();
  if(view==="standings") renderStandings();
  if(view==="leaders") renderLeaders();
  if(view==="team") renderTeam(); else document.title = BASE_TITLE;
  const el = $("#view-"+view); if(el && view==="team"){ el.classList.remove("enter"); void el.offsetWidth; el.classList.add("enter"); }
  if(view==="game-report") renderGameReport();
  if(view==="account") renderAccount();
  if(view==="check-email") renderCheckEmail();
  if(view==="ref-signup") renderRefSignup();
  if(view==="forgot-password"){ $("#fpDone").hidden=true; $("#fpErr").hidden=true; }
  if(view==="dashboard") renderDashboard();
  window.scrollTo(0,0);
}

/* ---------- Events ---------- */
document.addEventListener("click", e=>{
  const ro = e.target.closest("[data-roster]"); if(ro){ openRosterEditor(+ro.dataset.roster); return; }
  const vp = e.target.closest("[data-viewplayers]"); if(vp){ const [i,...t]=vp.dataset.viewplayers.split("|"); viewPlayers(+i, t.join("|")); return; }
  const vro = e.target.closest("[data-viewroster]"); if(vro){ const [i,...t]=vro.dataset.viewroster.split("|"); viewRoster(+i, t.join("|")); return; }
  const mr = e.target.closest("[data-matchrosters]"); if(mr){ viewMatchRosters(+mr.dataset.matchrosters); return; }
  const rb = e.target.closest("[data-report]");
  if(rb){ openReport(+rb.dataset.report); return; }
  const rr = e.target.closest("[data-refreport]"); if(rr){ openRefReport(+rr.dataset.refreport); return; }
  const vr = e.target.closest("[data-view-ref]"); if(vr){ viewRefReport(+vr.dataset.viewRef); return; }
  const vt = e.target.closest("[data-view-team]"); if(vt){ const [i,...t]=vt.dataset.viewTeam.split("|"); viewTeamReport(+i, t.join("|")); return; }
  const rfm = e.target.closest("[data-refmode]"); if(rfm){ state.refMode = rfm.dataset.refmode; renderDashboard(); return; }
  const amd = e.target.closest("[data-adminmode]"); if(amd){ state.adminMode = amd.dataset.adminmode; renderDashboard(); return; }
  const af = e.target.closest("[data-afilter]"); if(af){ const k=af.dataset.afilter; state.adminFilter = (k==="clear"||state.adminFilter===k) ? null : k; state.adminMode="games"; renderDashboard(); return; }
  const sdt = e.target.closest("[data-stdtab]"); if(sdt){ state.stdTab = sdt.dataset.stdtab; renderStandings(); const b=document.querySelector(`[data-stdtab="${state.stdTab}"]`); if(b) b.focus({preventScroll:true}); return; }
  const ldt = e.target.closest("[data-ldtab]"); if(ldt){ state.ldTab = ldt.dataset.ldtab; renderLeaders(); const b=document.querySelector(`[data-ldtab="${state.ldTab}"]`); if(b) b.focus({preventScroll:true}); return; }
  const ld = e.target.closest("[data-lddiv]"); if(ld){ const cat = ld.dataset.ldcat; ["g","a","k"].forEach(c=>state.ldF[c] = ld.dataset.lddiv); renderLeaders();   // the division sticks across Goals / Assists / Clean Sheets
    const b = document.querySelector(`[data-lddiv="${ld.dataset.lddiv}"]`); if(b) b.focus({preventScroll:true}); return; }
  const tm = e.target.closest("[data-teammode]");
  if(tm){ state.teamMode = tm.dataset.teammode; renderDashboard(); return; }
  const tl = e.target.closest("[data-teamlink]");
  if(tl){ const key = tl.dataset.teamlink;
    if(state.view==="team" && state.teamKey===key) return;
    const target = tl.closest("tr") || tl; target.classList.remove("tapped"); void target.offsetWidth; target.classList.add("tapped");
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    clearTimeout(go._tap); go._tap = setTimeout(()=>openTeam(key), reduce ? 0 : 140); return; }
  if(e.target.closest("[data-teamback]")){ if(state.teamPushed){ state.teamPushed = false; history.back(); } else go(state.teamFrom||"standings"); return; }
  const ttab = e.target.closest("[data-teamtab]"); if(ttab){ state.teamTab = ttab.dataset.teamtab; renderTeam(); const b=document.querySelector(`[data-teamtab="${state.teamTab}"]`); if(b) b.focus({preventScroll:true}); return; }
  const t = e.target.closest("[data-view],[data-comp],[data-fill],[data-score]");
  if(!t) return;
  if(t.dataset.view) go(t.dataset.view);
  else if(t.dataset.comp){ state.comp=t.dataset.comp; renderSchedule(); }
  else if(t.dataset.fill){
    const email = Object.keys(USERS).find(k=>USERS[k].role===t.dataset.fill);
    $("#email").value=email; $("#pw").value="rasa2026"; $("#authErr").hidden=true;
  }
  else if(t.dataset.score) openScore(+t.dataset.score);
});
document.addEventListener("change", e=>{
  const t = e.target;
  if(t.id==="teamSel"){ state.team=t.value; renderSchedule(); }
  if(t.id==="compSel"){ state.comp=t.value; renderSchedule(); }
  if(t.id==="refView"){ state.refView=t.value; renderDashboard(); renderTabs(); }
  if(t.dataset && t.dataset.ref!==undefined){
    const g = games[+t.dataset.ref]; if(!t.value) return; g.refs = [t.value].concat(g.refs.slice(1).filter(x=>x!==t.value));
    toast(`${t.value} assigned to ${tn(g.h)} vs ${tn(g.a)} (preview only, not saved)`);
    renderDashboard();
  }
});
$("#segUp").onclick = ()=>{ state.mode="up"; renderSchedule(); };
$("#segRes").onclick = ()=>{ state.mode="res"; renderSchedule(); };

$("#authForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const email = $("#email").value.trim().toLowerCase(), pw = $("#pw").value;
  const err = $("#authErr");
  const u = USERS[email];
  if(!email || !pw){ err.textContent="Enter your email and password."; err.hidden=false; return; }
  const okPw = u && await passwordOK(email, pw);
  if(!okPw){ err.textContent="That email and password don’t match an account. Check them, or create an account below."; err.hidden=false; return; }
  if(!u.confirmed){ err.innerHTML = `Please confirm your email first. We sent a link to ${esc(email)}. <button type="button" class="linkbtn" id="resendFromSignin">Resend the email</button>`; err.hidden=false;
    $("#resendFromSignin").onclick = ()=>{ pendingEmail = email; go("check-email"); toast("Confirmation email sent again"); }; return; }
  err.hidden=true; state.user = Object.assign({email}, u); $("#pw").value="";
  state.teamMode="up"; toast(`Signed in as ${u.name}`); go(u.role==="player"?"account":"dashboard");
});

$("#signupForm").addEventListener("submit", e=>{
  e.preventDefault();
  const first=$("#suFirst").value.trim(), last=$("#suLast").value.trim(), email=$("#suEmail").value.trim().toLowerCase(), pw=$("#suPw").value, pw2=$("#suPw2").value;
  const err=$("#suErr"); const fail=m=>{ err.textContent=m; err.hidden=false; };
  if(!first||!last) return fail("Enter your first and last name.");
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email address, like name@example.com.");
  if(USERS[email]) return fail("An account with this email already exists. Sign in instead, or use a different email.");
  if(pw.length<8) return fail("Use a password with at least 8 characters.");
  if(pw!==pw2) return fail("The two passwords don’t match.");
  err.hidden=true;
  USERS[email] = {role:"player", name:`${first} ${last}`, confirmed:false, created:new Date()};
  DEMO_PW[email] = pw; pendingEmail = email;
  $("#signupForm").reset(); go("check-email");
});
function renderCheckEmail(){
  const email = pendingEmail, u = USERS[email];
  const v = $("#view-check-email");
  if(!u){ v.innerHTML = `<div class="empty">Nothing to confirm. <button class="linkbtn" data-view="sign-in">Go to sign in</button></div>`; return; }
  const first = u.name.split(" ")[0];
  v.innerHTML = `<div class="auth">
      <div><h1>Check your email</h1>
      <p>We sent a confirmation link to <b>${esc(email)}</b>. Open it to finish creating your account. The link works for 24 hours.</p></div>
      <p class="alt">Didn’t get it? Check your spam folder, or <button type="button" class="linkbtn" id="resend">send it again</button>.</p>
      <p class="alt">Wrong email? <button type="button" class="linkbtn" id="startOver">Start over</button></p>
    </div>
    <div class="mail">
      <div class="mail-tag">Preview: this is the email the app will send</div>
      <div class="mail-head">
        <div><span>From</span>RASA &lt;no-reply@rasasoccer.ca&gt;</div>
        <div><span>To</span>${esc(email)}</div>
        <div><span>Subject</span>Confirm your RASA account</div>
      </div>
      <div class="mail-body">
        <img src="logo.png" alt="" width="56" height="56">
        <p>Hi ${esc(first)},</p>
        <p>Thanks for creating a Richmond Adult Soccer Association account. Please confirm this is your email address.</p>
        <button type="button" class="btn btn-primary" id="confirmEmail">Confirm my email</button>
        <p class="fine">If you didn’t create this account, you can ignore this email. This link expires in 24 hours.</p>
      </div>
    </div>`;
  $("#resend").onclick = ()=>toast("Confirmation email sent again");
  $("#startOver").onclick = ()=>{ delete USERS[email]; delete DEMO_PW[email]; pendingEmail=null; go("create-account"); };
  $("#confirmEmail").onclick = ()=>{ u.confirmed = true; pendingEmail = null; state.user = Object.assign({email}, u); toast("Email confirmed. Welcome to RASA!"); go("account"); };
}

$("#scoreForm").addEventListener("submit", e=>{
  e.preventDefault();
  const h=$("#sHome").value, a=$("#sAway").value;
  if(h===""||a===""||+h<0||+a<0){ $("#scoreErr").hidden=false; return; }
  setAppScore(scoreTarget, h, a, state.user ? (state.user.role==="referee" ? (state.refView||state.user.name) : state.user.name) : "");
  toast(`Saved: ${tn(scoreTarget.h)} ${h}–${a} ${tn(scoreTarget.a)}`);
  closeScore(); renderDashboard(); renderTabs();
});
$("#scoreCancel").onclick = closeScore;
$("#reportForm").addEventListener("submit", submitReport);
$("#reportModal").addEventListener("click", e=>{ if(e.target.id==="reportModal") closeReport(); });
$("#scoreModal").addEventListener("click", e=>{ if(e.target.id==="scoreModal") closeScore(); });
document.addEventListener("keydown", e=>{ if(e.key!=="Escape") return;
  if(e.target.classList && e.target.classList.contains("cbx-in") && e.target.getAttribute("aria-expanded")==="true") return; // Escape closes the player list first
  if(!$("#scoreModal").hidden) closeScore(); if(!$("#reportModal").hidden) closeReport(); });
const teamFromHash = h=>{ const m = /^team\/(.+)$/.exec(h); if(!m) return null; try{ const k = decodeURIComponent(m[1]); return TEAMS[k] ? k : null; }catch(e){ return null; } };
window.addEventListener("hashchange", ()=>{ const h=location.hash.slice(1); const tk = teamFromHash(h);
  if(tk){ if(state.view!=="team" || state.teamKey!==tk){ state.teamKey = tk; state.teamTab = "up"; go("team",false); } return; }
  if(VIEWS.includes(h) && h!==state.view) go(h,false); });

function setBanner(){
  const b = $("#dataBanner");
  if(!dataInfo.updatedAt){ b.textContent = "Prototype · schedule from rasasoccer.ca · changes made here are not saved"; return; }
  const d = new Date(dataInfo.updatedAt);
  const when = isNaN(d) ? dataInfo.updatedAt : d.toLocaleString("en-CA",{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
  b.textContent = `Schedule from rasasoccer.ca, last checked ${when}`;
}
const start = location.hash.slice(1);
$("#list").innerHTML = `<div class="empty">Loading the schedule…</div>`;
const getJSON = f=>fetch(f,{cache:"no-store"}).then(r=>{ if(!r.ok) throw new Error(r.status); return r.json(); });
getJSON("games.json")
  .then(data=>{ loadGames(data); setBanner(); return Promise.all([getJSON("standings.json").then(s=>{standings=s;}).catch(()=>{}), getJSON("rosters.json").then(r=>{rosters=r;}).catch(()=>{})]); })
  .then(()=>{ renderInstall(); const tk = teamFromHash(start); if(tk){ state.teamKey = tk; go("team", false); } else go(VIEWS.includes(start)?start:"schedule", false); })
  .catch(()=>{
    go(VIEWS.includes(start)?start:"schedule", false);
    $("#list").innerHTML = `<div class="empty">The schedule couldn’t be loaded. Check your connection and reload the page.</div>`;
  });
