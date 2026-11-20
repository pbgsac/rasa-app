/* Game Reports: Ref Reports and Team Reports (no sign-in, FEATURES.gameReport), plus the switched-off sign-in versions and match-day rosters. */
"use strict";

/* ---------- Reports (prototype: kept in memory; games before Nov 1, 2026 carry sample reports) ---------- */
const TEAM_MANAGERS = {"HAMMERS FC":["Alex Morgan","Chris Doyle"]};
const TEAM_REPORTS = false;   // Manager game reports are switched off for now to keep things simple.
const DEMO_SUBMITTED_BEFORE = "2026-11-01";
const teamReports = {}, refReports = {};
const gameKey = g=>`${g.date}|${g.h}|${g.a}`;
const reportKey = (g,team)=>`${gameKey(g)}|${team}`;
const dayAfter = g=>{ const d=parseD(g.date); d.setDate(d.getDate()+1); return d.toLocaleDateString("en-CA",{month:"short",day:"numeric"}); };
function reportFor(g, team){
  const k = reportKey(g,team);
  if(teamReports[k]) return teamReports[k];
  if(g.date < DEMO_SUBMITTED_BEFORE && TEAMS[team]){
    const mgrs = TEAM_MANAGERS[team], by = mgrs ? mgrs[g.id % mgrs.length] : `${tn(team)} manager`;
    const us = g.h===team?g.hs:g.as, them = g.h===team?g.as:g.hs;
    return {sample:true, by, when:dayAfter(g), team, us, them, goals:{}, assists:{}, control:4, decisions:4, overall:8, ars:g.refs.slice(1).map(name=>({name, rating:4})),
            field:"No field issues.", files:[], notes:"Sample report for the prototype."};
  }
  return null;
}
function refReportFor(g){
  const k = gameKey(g);
  if(refReports[k]) return refReports[k];
  if(g.date < DEMO_SUBMITTED_BEFORE && g.refs.length){
    return {sample:true, by:g.refs[0], when:dayAfter(g), homeScore:g.as, awayScore:g.hs,
      home:{scorers:[], keepers:[], cards:[]}, away:{scorers:[], keepers:[], cards:[]}, field:"No issues.", notes:"Sample report for the prototype.", questions:null};
  }
  return null;
}
function refDueText(g){
  const [hh,mm] = g.time.split(":").map(Number); const d = parseD(g.date); d.setHours(hh+24,mm);
  if(d < new Date()) return "Ref report overdue (was due 24 hours after kickoff)";
  return "Ref report due by " + d.toLocaleString("en-CA",{weekday:"short",hour:"numeric",minute:"2-digit"});
}

/* ---------- Report forms ---------- */
const rateRow = (name,n,label)=>`<div class="stars n${n}" role="radiogroup" aria-label="${esc(label)}">${Array.from({length:n},(_,i)=>`<label><input type="radio" name="${name}" value="${i+1}"><span>${i+1}</span></label>`).join("")}</div>`;
const rosterNames = team=>(rosters && rosters.teams && rosters.teams[team] && rosters.teams[team].players || []).map(p=>p.name).sort((a,b)=>a.split(" ").slice(-1)[0].localeCompare(b.split(" ").slice(-1)[0]));
const listText = (arr, f)=>arr.length ? arr.map(f).join(", ") : "None listed";
let formGame = null, picks = null;
function showModal(html, kind){
  const f = $("#reportForm"); f.innerHTML = html; f.dataset.kind = kind;
  $("#reportModal").hidden = false; f.scrollTop = 0;
  const c = $("#reportCancel"); if(c) c.onclick = closeReport;
}
function closeReport(){ $("#reportModal").hidden = true; formGame = null; }
const checked = n=>(document.querySelector(`input[name="${n}"]:checked`)||{}).value;
const joinMissing = m=>"Please add " + m.join(", ").replace(/, ([^,]*)$/, " and $1") + ".";

// Manager (team) report. With opts.public it's the no-sign-in Team Reports flow (state.tr holds name, email, team).
const MAX_FIELD_PHOTOS = 3;
function openReport(id, opts={}){
  const pub = !!opts.public, u = state.user, g = games[id]; formGame = g; formGame.publicTeam = pub; pickerSeq = 0;
  picks = {goals:{}, assists:{}, files:[]};
  const team = pub ? state.tr.team : u.team, opp = g.h===team ? g.a : g.h;
  const us = g.h===team ? g.hs : g.as, them = g.h===team ? g.as : g.hs;
  const pickRow = (id, label, btn)=>`<div class="pick pick-add">${playerPicker(team,{label, placeholder:"Player name"})}<button type="button" class="btn btn-ghost btn-sm" id="${id}">${btn}</button></div>`;
  showModal(`
    <h2 id="reportTitle">Team report</h2>
    <p class="sub">${esc(tn(team))} vs ${esc(tn(opp))} · ${esc(fmtDay(g.date))} · ${fmtTime(g.time).t} ${fmtTime(g.time).ap}${g.venue?" · "+esc(g.venue):""}</p>
    ${pub ? `<fieldset><legend>Manager</legend><p class="refname"><b>${esc(state.tr.name)}</b> · ${esc(state.tr.email)}</p><p class="hint">Reporting for ${esc(tn(team))}</p></fieldset>` : ""}
    <fieldset><legend>Final score</legend>
      <div class="score-grid">
        <label for="rUs">${esc(tn(team))}</label><input id="rUs" type="number" min="0" max="30" inputmode="numeric" value="${us??""}">
        <label for="rThem">${esc(tn(opp))}</label><input id="rThem" type="number" min="0" max="30" inputmode="numeric" value="${them??""}">
      </div></fieldset>
    <p class="hint">${rosterHint(g, team)}</p>
    <fieldset><legend>Goal scorers</legend>
      ${pickRow("rAddGoal","Player who scored","Add goal")}
      <div class="chips" id="rGoals"></div></fieldset>
    <fieldset><legend>Assists</legend>
      ${pickRow("rAddAssist","Player who assisted","Add assist")}
      <div class="chips" id="rAssists"></div></fieldset>
    <fieldset><legend>Referee${g.refs.length?": "+esc(g.refs[0]):""}</legend>
      <p class="q">Overall control of the game</p><p class="hint">1 is poor, 5 is excellent.</p>${rateRow("rControl",5,"Overall control of the game")}
      <p class="q">Overall decision making</p><p class="hint">1 is poor, 5 is excellent.</p>${rateRow("rDecisions",5,"Overall decision making")}
      <p class="q">Overall score</p><p class="hint">Out of 10.</p>${rateRow("rOverall",10,"Overall score out of 10")}
    </fieldset>
    ${g.refs.length>1?`<fieldset><legend>Assistant referees</legend><p class="hint">Rate each assistant referee. 1 is poor, 5 is excellent.</p>
      ${g.refs.slice(1).map((n,i)=>`<p class="q">${esc(n)}</p>${rateRow("rAR"+i,5,"Rating for "+n)}`).join("")}</fieldset>`:""}
    <fieldset><legend>Field condition</legend>
      <label for="rField" class="hint">Describe any field issues: surface, lines, nets, lights, anything unsafe.</label>
      <textarea id="rField" rows="4" placeholder="No issues"></textarea>
      <label class="btn btn-ghost btn-sm photo-btn"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9Zm3 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/></svg>Add photos<input id="rFiles" type="file" accept="image/*" multiple class="sr-only"></label>
      <p class="hint">Optional, up to ${MAX_FIELD_PHOTOS} photos.</p>
      <div class="thumbs" id="rThumbs"></div></fieldset>
    <fieldset><legend>Comments <span class="opt-l">(optional)</span></legend><textarea id="rNotes" rows="3" placeholder="Anything else the league should know"></textarea></fieldset>
    <p class="err" id="reportErr" hidden></p>
    <div class="actions"><button type="button" class="btn btn-ghost" id="reportCancel">Cancel</button><button type="submit" class="btn btn-primary" id="teamSubmit">${pub?"Send report":"Submit report"}</button></div>`, "team");
  const draw = ()=>{
    $("#rGoals").innerHTML = Object.entries(picks.goals).map(([n,c])=>`<button type="button" class="chip" data-rm="goals" data-n="${esc(n)}" title="Remove one">${esc(n)}${c>1?" ×"+c:""} <span aria-hidden="true">✕</span></button>`).join("");
    $("#rAssists").innerHTML = Object.entries(picks.assists).map(([n,c])=>`<button type="button" class="chip" data-rm="assists" data-n="${esc(n)}" title="Remove one">${esc(n)}${c>1?" ×"+c:""} <span aria-hidden="true">✕</span></button>`).join("");
    $("#rThumbs").innerHTML = picks.files.map((f,i)=>`<figure class="thumb">${f.busy?`<div class="vid">…</div>`:`<img src="${f.url}" alt="Field photo ${i+1}">`}<figcaption>Photo ${i+1}</figcaption><button type="button" class="x" data-rmfile="${i}" aria-label="Remove photo ${i+1}">✕</button></figure>`).join("");
  };
  const add = (btnId, kind)=>{ const input = $("#"+btnId).closest(".pick").querySelector(".cbx-in"); const p = nameCase(input.value.trim().replace(/\s+/g," "));
    if(!p){ input.focus(); return; } picks[kind][p] = (picks[kind][p]||0)+1; input.value = ""; closePicker(input); draw(); };
  $("#rAddGoal").onclick = ()=>add("rAddGoal","goals");
  $("#rAddAssist").onclick = ()=>add("rAddAssist","assists");
  $("#reportForm").onclick = e=>{
    const b = e.target.closest("[data-rm]"); if(b){ const o=picks[b.dataset.rm], n=b.dataset.n; if(--o[n]<=0) delete o[n]; draw(); return; }
    const x = e.target.closest("[data-rmfile]"); if(x){ picks.files.splice(+x.dataset.rmfile,1); draw(); }
  };
  $("#reportForm").onchange = null;
  $("#rFiles").onchange = async e=>{ const files = [...e.target.files]; e.target.value = ""; const err = $("#reportErr");
    for(const f of files){
      if(picks.files.length >= MAX_FIELD_PHOTOS){ err.textContent = `Up to ${MAX_FIELD_PHOTOS} photos.`; err.hidden = false; break; }
      if(!/^image\//.test(f.type||"image/")) continue;
      const slot = {busy:true}; picks.files.push(slot); draw();
      try{ Object.assign(slot, await shrinkPhoto(f), {busy:false}); }
      catch(x){ picks.files.splice(picks.files.indexOf(slot),1); err.textContent = "That photo couldn’t be opened. Try taking it again, or pick a JPEG or PNG."; err.hidden = false; }
      draw(); } };
  $("#rUs").focus();
}
function submitTeamReport(){
  const err = $("#reportErr"), g = formGame, pub = !!g.publicTeam;
  const team = pub ? state.tr.team : state.user.team, opp = g.h===team ? g.a : g.h;
  const us = $("#rUs").value, them = $("#rThem").value;
  const control = checked("rControl"), decisions = checked("rDecisions"), overall = checked("rOverall");
  const missing = [];
  if(us===""||them==="") missing.push("the final score");
  if(!control) missing.push("a rating for control of the game");
  if(!decisions) missing.push("a rating for decision making");
  if(!overall) missing.push("an overall score");
  const ars = g.refs.slice(1).map((name,i)=>({name, rating:+checked("rAR"+i)||0}));
  if(ars.some(a=>!a.rating)) missing.push("a rating for each assistant referee");
  if(picks.files.some(f=>f.busy)) missing.push("a moment for the photos to finish loading");
  if(missing.length){ err.textContent = joinMissing(missing); err.hidden=false; err.scrollIntoView({block:"nearest"}); return; }
  const goals = Object.values(picks.goals).reduce((a,b)=>a+b,0), assists = Object.values(picks.assists).reduce((a,b)=>a+b,0);
  if(goals > +us){ err.textContent = `You listed ${goals} goals but a final score of ${us}. Remove a scorer or fix the score.`; err.hidden=false; err.scrollIntoView({block:"nearest"}); return; }
  if(assists > goals){ err.textContent = `You listed more assists (${assists}) than goals (${goals}).`; err.hidden=false; err.scrollIntoView({block:"nearest"}); return; }
  const r = {by: pub ? state.tr.name : state.user.name, email: pub ? state.tr.email : (state.user.email||""), when:new Date().toLocaleDateString("en-CA",{month:"short",day:"numeric"}),
    team:tn(team), opponent:tn(opp), us:+us, them:+them, goals:{...picks.goals}, assists:{...picks.assists}, referee:g.refs[0]||"", control:+control, decisions:+decisions, overall:+overall, ars,
    field:$("#rField").value.trim(), notes:$("#rNotes").value.trim()};
  if(pub){ sendTeamReport(g, team, r); return; }
  teamReports[reportKey(g,team)] = {...r, team, files:picks.files.slice()};
  closeReport(); toast("Report submitted. Your co-managers will see it's done."); renderDashboard(); renderTabs();
}

// Referee report (matches the league's referee report form)
const YELLOW_OFFENCES = ["Unsporting behaviour","Dissent by word or action","Persistent infringement of the Laws of the Game","Delaying the restart of play",
  "Failure to respect the required distance when play is restarted with a corner kick, throw-in or free kick",
  "Entering or re-entering the field of play without the referee's permission","Deliberately leaving the field of play without the referee's permission"];
const RED_OFFENCES = ["Serious foul play","Violent conduct","Spitting at an opponent or any other person",
  "Denying the opposing team a goal or an obvious goal-scoring opportunity","Using offensive, insulting or abusive language and/or gestures",
  "Receiving a second caution in the same match"];
const PROVIDED = ["Home team","Away team","Neither team","Both teams"];
const rosterOf = team=>(rosters && rosters.teams && rosters.teams[team] && rosters.teams[team].players) || [];
let pickerSeq = 0;
// A text box that shows the team's players as you type. Goalkeepers can be listed first.
function playerPicker(team, opts={}){
  const id = "pp" + (++pickerSeq);
  const gid = formGame ? formGame.id : "";
  return `<div class="cbx"><input id="${id}" class="cbx-in" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-list"
    autocomplete="off" placeholder="${opts.placeholder||"Start typing a name"}" data-team="${esc(team)}" data-game="${gid}" ${opts.gk?'data-gk="1"':""} ${opts.label?`aria-label="${esc(opts.label)}"`:""}>
    <ul id="${id}-list" class="cbx-list" role="listbox" hidden></ul></div>`;
}
function pickerOptions(input){
  const q = input.value.trim().toLowerCase();
  const g = input.dataset.game!=="" ? games[+input.dataset.game] : null;
  let ps = gamePlayers(g, input.dataset.team).players.slice();
  const last = n=>n.trim().split(/\s+/).slice(-1)[0].toLowerCase();
  ps.sort((a,b)=> (input.dataset.gk ? ((b.pos==="GK")-(a.pos==="GK")) : 0) || last(a.name).localeCompare(last(b.name)));
  if(q) ps = ps.filter(p=>p.name.toLowerCase().includes(q) || String(p.number??"")===q);
  return ps.slice(0,60);
}
function openPicker(input){
  const list = document.getElementById(input.getAttribute("aria-controls"));
  const ps = pickerOptions(input);
  const typed = input.value.trim();
  list.innerHTML = ps.map((p,i)=>`<li role="option" id="${input.id}-o${i}" data-name="${esc(p.name)}" data-num="${p.number??""}">${esc(p.name)}${p.number!=null?` <span class="muted">#${p.number}</span>`:""}${p.pos==="GK"?` <span class="gk">GK</span>`:""}</li>`).join("")
    + (typed && !ps.some(p=>p.name.toLowerCase()===typed.toLowerCase()) ? `<li role="option" data-name="${esc(typed)}" data-num="" class="free">Use “${esc(typed)}” (not on the ${input.dataset.game!=="" && gamePlayers(games[+input.dataset.game], input.dataset.team).fromRoster ? "match day roster" : "team list"})</li>` : "")
    + (!ps.length && !typed ? `<li class="empty-opt" aria-disabled="true">No players on file for this team. Type the name.</li>` : "");
  list.hidden = false; input.setAttribute("aria-expanded","true"); input.dataset.active = "-1";
}
function closePicker(input){ const list = document.getElementById(input.getAttribute("aria-controls")); if(list) list.hidden = true; input.setAttribute("aria-expanded","false"); }
function choosePlayer(input, li){
  input.value = li.dataset.name; closePicker(input);
  const num = input.closest(".prow") && input.closest(".prow").querySelector(".jersey-in");
  if(num && li.dataset.num!=="") num.value = li.dataset.num;
}
document.addEventListener("focusin", e=>{ if(e.target.classList && e.target.classList.contains("cbx-in")) openPicker(e.target); });
document.addEventListener("input", e=>{ if(e.target.classList && e.target.classList.contains("cbx-in")) openPicker(e.target); });
document.addEventListener("focusout", e=>{ if(e.target.classList && e.target.classList.contains("cbx-in")) setTimeout(()=>closePicker(e.target), 150); });
document.addEventListener("mousedown", e=>{ const li = e.target.closest(".cbx-list li[data-name]"); if(!li) return; e.preventDefault(); choosePlayer(li.closest(".cbx").querySelector(".cbx-in"), li); });
document.addEventListener("keydown", e=>{
  const input = e.target; if(!(input.classList && input.classList.contains("cbx-in"))) return;
  const list = document.getElementById(input.getAttribute("aria-controls")); if(!list) return;
  const items = [...list.querySelectorAll("li[data-name]")]; let i = +input.dataset.active;
  if(e.key==="ArrowDown"||e.key==="ArrowUp"){ e.preventDefault(); if(list.hidden) openPicker(input);
    i = e.key==="ArrowDown" ? Math.min(items.length-1, i+1) : Math.max(0, i-1);
    items.forEach((li,j)=>li.classList.toggle("on", j===i)); input.dataset.active = i;
    if(items[i]){ input.setAttribute("aria-activedescendant", items[i].id||""); items[i].scrollIntoView({block:"nearest"}); } }
  else if(e.key==="Enter" && !list.hidden && items[i]){ e.preventDefault(); choosePlayer(input, items[i]); }
  else if(e.key==="Escape" && !list.hidden){ e.stopImmediatePropagation(); closePicker(input); }
});

function openRefReport(id, opts={}){
  const g = games[id]; formGame = g; pickerSeq = 0; formGame.publicReport = !!opts.public;
  const pub = !!opts.public;
  const refName = pub ? state.rr.name : (state.user && state.user.role==="referee") ? (state.refView || state.user.name) : (g.refs[0] || "");
  const refEmail = pub ? state.rr.email : (state.user && state.user.role==="referee") ? (state.user.email||"") : "";
  const home = HOME(g), away = AWAY(g);
  const homeScore = g.as, awayScore = g.hs;
  // opts: plain strings, or {v, label, sub} to show a team name with "Home"/"Away" under it
  const radios = (name, opts)=>`<div class="stars wide${opts.length===4?" four":""}" role="radiogroup">${opts.map(o=>{ const x = typeof o==="string" ? {v:o, label:o} : o;
    return `<label><input type="radio" name="${name}" value="${esc(x.v)}"><span>${esc(x.label)}${x.sub?`<small>${esc(x.sub)}</small>`:""}</span></label>`; }).join("")}</div>`;
  // Who provided it: the two teams by name (saved as e.g. "Heatherbrae (home)"), then Neither / Both
  const provided = [{v:`${tn(home)} (home)`, label:tn(home), sub:"Home"}, {v:`${tn(away)} (away)`, label:tn(away), sub:"Away"}, "Neither team", "Both teams"];
  const teamBlock = (side, team)=>`
    <fieldset class="teamset"><legend>${side==="home"?"Home":"Away"}: ${esc(tn(team))}</legend>
      <p class="hint">${rosterHint(g, team)}</p>
      <p class="q">Goal scorers</p>
      <div class="rows" id="sc-${side}"></div>
      <button type="button" class="btn btn-ghost btn-sm" data-addscorer="${side}">Add goal scorer</button>
      <p class="q">Goalkeepers</p>
      <div class="rows" id="gk-${side}"></div>
      <button type="button" class="btn btn-ghost btn-sm" data-addgk="${side}">Add keeper change</button>
    </fieldset>`;
  const discBlock = (side, team)=>`
    <fieldset><legend>${side==="home"?"Home":"Away"} team discipline: ${esc(tn(team))} <span class="opt-l">(if any)</span></legend>
      <p class="hint">${rosterHint(g, team)}</p>
      <div class="rows" id="dc-${side}"></div>
      <button type="button" class="btn btn-ghost btn-sm" data-addcard="${side}">Add card</button>
    </fieldset>`;
  showModal(`
    <h2 id="reportTitle">Referee report</h2>
    <p class="sub">${esc(fmtDay(g.date))} · ${fmtTime(g.time).t} ${fmtTime(g.time).ap}${g.venue?" · "+esc(g.venue):""}${g.number?" · #"+esc(g.number):""}</p>
    <p class="sub"><b>Home:</b> ${esc(tn(home))} · <b>Away:</b> ${esc(tn(away))}${g.refs.length>1?` · AR: ${g.refs.slice(1).map(esc).join(", ")}`:""}</p>
    ${pub ? `<fieldset><legend>Referee</legend>
      <p class="refname"><b>${esc(refName)}</b> · ${esc(refEmail)}</p>
      ${g.refs[0] && !refMatch(refName, g.refs[0]) ? `<p class="hint">The officials schedule lists <b>${esc(g.refs[0])}</b> as the referee for this game.</p>` : ""}
    </fieldset>` : `<fieldset><legend>Referee</legend>
      ${g.refs[0] ? `<p class="refname"><b>${esc(refName)}</b> <span class="muted">(from the officials schedule)</span></p>`
        : `<div class="field"><label for="fRefName">Referee name</label><input id="fRefName" type="text" autocomplete="name" value="${esc(refName)}"></div>`}
      <div class="field"><label for="fEmail">Email:</label><input id="fEmail" type="email" autocomplete="email" placeholder="you@example.com" value="${esc(refEmail)}"></div>
    </fieldset>`}
    <fieldset><legend>Final score</legend>
      <div class="score-grid">
        <label for="fHome">${esc(tn(home))} (home)</label><input id="fHome" type="number" min="0" max="15" inputmode="numeric" value="${homeScore??""}">
        <label for="fAway">${esc(tn(away))} (away)</label><input id="fAway" type="number" min="0" max="15" inputmode="numeric" value="${awayScore??""}">
      </div></fieldset>
    ${teamBlock("home", home)}
    ${teamBlock("away", away)}
    ${discBlock("home", home)}
    ${discBlock("away", away)}
    <fieldset><legend>Field conditions <span class="opt-l">(if any issues)</span></legend><textarea id="fField" rows="5" placeholder="Field, lines, goal posts, nets, lights"></textarea></fieldset>
    <fieldset><legend>Injuries and other comments <span class="opt-l">(optional)</span></legend><textarea id="fNotes" rows="3" placeholder="Injuries (player, team, what happened), notable events, team conduct"></textarea></fieldset>
    <fieldset><legend>Game questions</legend>
      <p class="q">Official game ball provided by?</p>${radios("qBall", provided)}
      <p class="q">Corner flags provided by?</p>${radios("qFlags", provided)}
      <p class="q">2 copies of official team list provided by ${esc(tn(home))} <span class="q-side">(home)</span>?</p>${radios("qListHome", ["Yes","No"])}
      <p class="q">2 copies of official team list provided by ${esc(tn(away))} <span class="q-side">(away)</span>?</p>${radios("qListAway", ["Yes","No"])}
      <p class="q">Showed player cards?</p>${radios("qCards", provided)}
      ${pub ? "" : `<p class="hint">You’ll attach photos of both team lists to the email in the last step.</p>`}
    </fieldset>
    ${pub ? `<fieldset><legend>Team list photos</legend>
      <p class="hint">Take a clear photo of each team’s signed team list. At least one per team, up to ${MAX_PHOTOS_PER_TEAM}.</p>
      ${["home","away"].map(s=>`<div class="phrow"><p class="q">${s==="home"?"Home":"Away"}: ${esc(tn(s==="home"?home:away))}</p>
        <div class="thumbs" id="ph-${s}"></div>
        <label class="btn btn-ghost btn-sm photo-btn"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9Zm3 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/></svg>Insert photo<input type="file" accept="image/*" multiple data-photo="${s}" class="sr-only"></label></div>`).join("")}
    </fieldset>` : ""}
    <p class="err" id="reportErr" hidden></p>
    <div class="actions"><button type="button" class="btn btn-ghost" id="reportCancel">Cancel</button><button type="submit" class="btn btn-primary" id="refSubmit">${pub?"Send report":"Submit report"}</button></div>`, "ref");
  const teamOf = side=> side==="home" ? home : away;
  const rm = `<button type="button" class="x2" data-rmrow aria-label="Remove">✕</button>`;
  const addScorer = side=>{ const d=document.createElement("div"); d.className="prow";
    d.innerHTML = `${playerPicker(teamOf(side),{label:"Goal scorer"})}<input class="jersey-in" type="text" inputmode="numeric" placeholder="#" aria-label="Jersey number" maxlength="3">${rm}`; $("#sc-"+side).appendChild(d); };
  const addGK = side=>{ const n = $("#gk-"+side).children.length; const d=document.createElement("div"); d.className="prow";
    d.innerHTML = `${playerPicker(teamOf(side),{gk:true,label:n?"Second goalkeeper":"Goalkeeper",placeholder:n?"Keeper who came on":"Starting keeper"})}<input class="min-in" type="number" min="0" max="120" inputmode="numeric" placeholder="Min" aria-label="Minutes played">${n?rm:""}`; $("#gk-"+side).appendChild(d); };
  const addCard = side=>{ const d=document.createElement("div"); d.className="crow";
    d.innerHTML = `<div class="prow">${playerPicker(teamOf(side),{label:"Player"})}${rm}</div>
      <div class="pick"><select class="ctype" aria-label="Card"><option value="Yellow">Yellow card</option><option value="Red">Red card</option></select>
      <select class="cinf" aria-label="Infraction">${YELLOW_OFFENCES.map(o=>`<option>${esc(o)}</option>`).join("")}</select></div>
      <textarea class="cdesc" rows="2" placeholder="Description of the event" aria-label="Description of the event"></textarea>`; $("#dc-"+side).appendChild(d); };
  ["home","away"].forEach(s=>addGK(s));
  const f = $("#reportForm");
  f.onclick = e=>{
    const rmp = e.target.closest("[data-rmphoto]"); if(rmp){ const [s,i] = rmp.dataset.rmphoto.split("|"); picks.photos[s].splice(+i,1); drawPhotos(s); return; }
    const t = e.target.closest("[data-addscorer],[data-addgk],[data-addcard],[data-rmrow]"); if(!t) return;
    if(t.dataset.addscorer) addScorer(t.dataset.addscorer);
    else if(t.dataset.addgk){ if($("#gk-"+t.dataset.addgk).children.length<3) addGK(t.dataset.addgk); }
    else if(t.dataset.addcard) addCard(t.dataset.addcard);
    else if(t.hasAttribute("data-rmrow")){ (t.closest(".crow")||t.closest(".prow")).remove(); }
  };
  f.onchange = e=>{
    if(e.target.classList.contains("ctype")){ const inf = e.target.closest(".crow").querySelector(".cinf");
      inf.innerHTML = (e.target.value==="Red"?RED_OFFENCES:YELLOW_OFFENCES).map(o=>`<option>${esc(o)}</option>`).join(""); }
    if(e.target.dataset && e.target.dataset.photo){ addPhotos(e.target.dataset.photo, [...e.target.files]); e.target.value = ""; return; }
    if(e.target.id==="fPicHome"||e.target.id==="fPicAway"){ const file = e.target.files[0]; if(!file) return;
      const which = e.target.id==="fPicHome"?"home":"away"; picks["list_"+which] = {name:file.name, type:file.type||"", url:URL.createObjectURL(file)};
      $(which==="home"?"#thPicHome":"#thPicAway").innerHTML = `<figure class="thumb"><img src="${picks["list_"+which].url}" alt=""><figcaption>${esc(file.name)}</figcaption></figure>`; }
  };
  picks = {photos:{home:[], away:[]}};
  $("#fHome").focus();
}
function readRows(side){
  const val = el=>el ? el.value.trim() : "";
  return {
    scorers: [...$("#sc-"+side).querySelectorAll(".prow")].map(r=>({name:val(r.querySelector(".cbx-in")), jersey:val(r.querySelector(".jersey-in"))})).filter(x=>x.name),
    keepers: [...$("#gk-"+side).querySelectorAll(".prow")].map(r=>({name:val(r.querySelector(".cbx-in")), minutes:val(r.querySelector(".min-in"))})).filter(x=>x.name||x.minutes),
    cards: [...$("#dc-"+side).querySelectorAll(".crow")].map(r=>({name:val(r.querySelector(".cbx-in")), card:r.querySelector(".ctype").value, infraction:r.querySelector(".cinf").value, description:val(r.querySelector(".cdesc"))})).filter(x=>x.name)
  };
}
function submitRefReport(){
  const err = $("#reportErr"), g = formGame;
  const hs = $("#fHome").value, as = $("#fAway").value;
  const H = readRows("home"), A = readRows("away");
  const q = {ball:checked("qBall"), flags:checked("qFlags"), listHome:checked("qListHome"), listAway:checked("qListAway"), cards:checked("qCards")};
  const missing = [];
  const pub = !!g.publicReport;
  const refName = pub ? state.rr.name : g.refs[0] ? ((state.user && state.user.role==="referee") ? (state.refView || state.user.name) : g.refs[0]) : ($("#fRefName") ? $("#fRefName").value.trim() : "");
  const email = pub ? state.rr.email : $("#fEmail").value.trim();
  if(!refName) missing.push("your name");
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) missing.push("a valid email address");
  if(hs===""||as==="") missing.push("the final score");
  if(!H.keepers.length || H.keepers.some(k=>!k.name||k.minutes==="")) missing.push(`the home goalkeeper and minutes played`);
  if(!A.keepers.length || A.keepers.some(k=>!k.name||k.minutes==="")) missing.push(`the away goalkeeper and minutes played`);
  if(Object.values(q).some(v=>!v)) missing.push("answers to all the game questions");
  if(pub && picks.photos && (!picks.photos.home.length || !picks.photos.away.length)) missing.push("a photo of each team’s list");
  if(pub && picks.photos && [...picks.photos.home, ...picks.photos.away].some(p=>p.busy)) missing.push("a moment for the photos to finish loading");
  if(missing.length){ err.textContent = joinMissing(missing); err.hidden=false; err.scrollIntoView({block:"nearest"}); return; }
  if(H.scorers.length > +hs || A.scorers.length > +as){ err.textContent = "There are more goal scorers listed than goals in the final score. Remove a scorer or fix the score."; err.hidden=false; return; }
  if(pub){ sendRefReport(g, {by:refName, email, public:true, when:new Date().toLocaleDateString("en-CA",{month:"short",day:"numeric"}),
    homeScore:+hs, awayScore:+as, home:H, away:A, field:$("#fField").value.trim(), notes:$("#fNotes").value.trim(), questions:q}); return; }
  setAppScore(g, as, hs, refName);   // g.hs belongs to g.h (away)
  const r = refReports[gameKey(g)] = {by:refName, email, public:!!g.publicReport, when:new Date().toLocaleDateString("en-CA",{month:"short",day:"numeric"}),
    homeScore:+hs, awayScore:+as, home:H, away:A, field:$("#fField").value.trim(), notes:$("#fNotes").value.trim(), questions:q};
  if(state.user) { renderDashboard(); }
  renderTabs(); if(state.view==="game-report") renderGameReport();
  showSendStep(g, r);
}
function submitReport(e){
  e.preventDefault();
  const k = $("#reportForm").dataset.kind;
  if(k==="team") submitTeamReport(); else if(k==="ref") submitRefReport(); else if(k==="roster") saveRoster(); else closeReport();
}

// Read-only views for admins (and referees viewing their own)
const vrow = (l,v)=>`<div class="vrow"><dt>${l}</dt><dd>${v}</dd></div>`;
const counts = o=>{ const e=Object.entries(o||{}); return e.length ? e.map(([n,c])=>esc(n)+(c>1?" ×"+c:"")).join(", ") : "None listed"; };
function viewRefReport(id){
  const g = games[id], r = refReportFor(g); if(!r) return;
  const home = HOME(g), away = AWAY(g);
  const side = (lbl, s)=> s ? `
    ${vrow(lbl+" goal scorers", s.scorers.length ? s.scorers.map(x=>`${esc(x.name)}${x.jersey?` #${esc(x.jersey)}`:""}`).join(", ") : "None")}
    ${vrow(lbl+" goalkeepers", s.keepers.length ? s.keepers.map(k=>`${esc(k.name)} (${esc(k.minutes)} min)`).join(", ") : "Not given")}
    ${vrow(lbl+" discipline", s.cards.length ? s.cards.map(c=>`<div class="disc"><span class="card ${c.card==="Red"?"rc":"yc"}">&nbsp;</span> <b>${esc(c.name)}</b>: ${esc(c.infraction)}${c.description?`<div class="muted">${esc(c.description)}</div>`:""}</div>`).join("") : "None")}` : "";
  const q = r.questions || {};
  const ph = p=> p ? `<figure class="thumb"><img src="${p.url}" alt=""><figcaption>${esc(p.name)}</figcaption></figure>` : "";
  showModal(`<h2 id="reportTitle">Referee report</h2>
    <p class="sub">${esc(fmtDay(g.date))}${g.number?" · #"+esc(g.number):""} · <b>Home:</b> ${esc(tn(home))} · <b>Away:</b> ${esc(tn(away))}</p>
    ${r.sample?`<p class="sample">Sample report for the prototype</p>`:""}
    <dl class="view">
      ${vrow("Submitted by", `${esc(r.by)} · ${esc(r.when)}${r.email?`<div class="muted">${esc(r.email)}</div>`:""}`)}
      ${vrow("Final score", (r.homeScore!=null&&r.awayScore!=null) ? `${esc(tn(home))} ${r.homeScore}–${r.awayScore} ${esc(tn(away))}` : "Not given")}
      ${side("Home", r.home)}${side("Away", r.away)}
      ${vrow("Field conditions", esc(r.field||"No issues"))}
      ${vrow("Injuries and other comments", esc(r.notes||"None"))}
      ${r.questions ? `
      ${vrow("Game ball provided by", esc(q.ball))}
      ${vrow("Corner flags provided by", esc(q.flags))}
      ${vrow(`${tn(HOME(g))} team list (2 copies)`, esc(q.listHome) + (r.listPhotos&&r.listPhotos.home?`<div class="thumbs">${ph(r.listPhotos.home)}</div>`:""))}
      ${vrow(`${tn(AWAY(g))} team list (2 copies)`, esc(q.listAway) + (r.listPhotos&&r.listPhotos.away?`<div class="thumbs">${ph(r.listPhotos.away)}</div>`:""))}
      ${vrow("Showed player cards", esc(q.cards))}` : ""}
    </dl>
    <div class="actions">${state.user && state.user.role==="admin" && r.homeScore!=null ? `<a class="btn btn-ghost" href="${esc(mailtoHref("", reportSubject(g,r), reportText(g,r)))}">Email this report</a>` : ""}<button type="button" class="btn btn-primary" id="reportCancel">Close</button></div>`, "view");
}
function viewTeamReport(id, team){
  const g = games[id], r = reportFor(g, team); if(!r) return;
  const opp = g.h===team ? g.a : g.h;
  showModal(`<h2 id="reportTitle">${esc(tn(team))} report</h2>
    <p class="sub">${esc(tn(g.h))} vs ${esc(tn(g.a))} · ${esc(fmtDay(g.date))}</p>
    ${r.sample?`<p class="sample">Sample report for the prototype</p>`:""}
    <dl class="view">
      ${vrow("Submitted by", `${esc(r.by)} · ${esc(r.when)}`)}
      ${vrow("Their score", (r.us!=null&&r.them!=null) ? `${esc(tn(team))} ${r.us}–${r.them} ${esc(tn(opp))}` : "Not given")}
      ${vrow("Goal scorers", counts(r.goals))}
      ${vrow("Assists", counts(r.assists))}
      ${vrow("Referee"+(g.refs[0]?": "+esc(g.refs[0]):""), `Control of the game <b>${r.control}/5</b> · Decision making <b>${r.decisions}/5</b> · Overall <b>${r.overall}/10</b>`)}
      ${r.ars && r.ars.length ? vrow("Assistant referees", r.ars.map(a=>`${esc(a.name)} <b>${a.rating}/5</b>`).join(" · ")) : ""}
      ${vrow("Field condition", esc(r.field||"No issues described"))}
      ${r.files && r.files.length ? vrow("Photos and videos", `<div class="thumbs">${r.files.map(f=>`<figure class="thumb">${f.type.startsWith("image/")?`<img src="${f.url}" alt="">`:`<div class="vid">▶</div>`}<figcaption>${esc(f.name)}</figcaption></figure>`).join("")}</div>`) : ""}
      ${vrow("Comments", esc(r.notes||"None"))}
    </dl>
    <div class="actions"><button type="button" class="btn btn-primary" id="reportCancel">Close</button></div>`, "view");
}

/* ---------- Match day rosters ----------
   Managers pick up to 20 players for each upcoming game and can change the list until 30 minutes before kickoff.
   At that point the roster locks and becomes official; referees can then see both teams' rosters with player cards.
   Prototype: kept in memory. Past games carry sample rosters so the locked view can be tried. */
const ROSTER_MAX = 20, LOCK_MIN = 30;
const matchRosters = {};
const mrKey = (g,team)=>`${gameKey(g)}|${team}`;
function kickoff(g){ const [hh,mm]=g.time.split(":").map(Number); const d=parseD(g.date); d.setHours(hh,mm,0,0); return d; }
const lockAt = g=>new Date(kickoff(g).getTime() - LOCK_MIN*60000);
const isLocked = g=>new Date() >= lockAt(g);
const fmtLock = g=>lockAt(g).toLocaleString("en-CA",{weekday:"short",hour:"numeric",minute:"2-digit"});
function rosterFor(g, team){
  const k = mrKey(g,team);
  if(matchRosters[k]) return matchRosters[k];
  if(!FEATURES.accounts) return null;   // sample rosters belong to the sign-in prototype
  if(isPast(g) && g.date >= "2026-10-01" && rosterOf(team).length){
    const ps = rosterOf(team).slice().sort((a,b)=>b.gp-a.gp || a.name.localeCompare(b.name)).slice(0,16).map(p=>p.name);
    return {players:ps, by:(TEAM_MANAGERS[team]||[`${tn(team)} manager`])[0], sample:true};
  }
  return null;
}
// Players to offer in report forms: the game's match day roster when one exists, otherwise the full team list.
function gamePlayers(g, team){
  const all = rosterOf(team), r = g ? rosterFor(g, team) : null;
  if(!r) return {players: all, fromRoster: false};
  const byName = {}; all.forEach(p=>byName[p.name]=p);
  return {players: r.players.map(n=>byName[n] || {name:n, number:null, pos:""}), fromRoster: true, count: r.players.length};
}
const poss = n=>/s$/i.test(n) ? n+"’" : n+"’s";
const rosterHint = (g, team)=>{ const gp = gamePlayers(g, team);
  if(!FEATURES.accounts) return `Pick from ${esc(poss(tn(team)))} player list, or type a name.`;   // match day rosters are off for now
  return gp.fromRoster ? `Showing the ${gp.count} players on ${esc(poss(tn(team)))} match day roster.` : `${esc(tn(team))} didn’t submit a match day roster, so the full team list is shown.`; };
const birthYear = b=>{ const m=String(b||"").match(/(\d{2,4})/); if(!m) return ""; let y=+m[1]; if(y<100) y += (2000+y>new Date().getFullYear()) ? 1900 : 2000; return y; };
const initialsOf = n=>n.trim().split(/\s+/).map(s=>s[0]).slice(0,2).join("").toUpperCase();

function openRosterEditor(id){
  const g = games[id], team = state.user.team, opp = g.h===team ? g.a : g.h;
  if(isLocked(g)){ toast("This roster is locked."); return; }
  const saved = rosterFor(g, team);
  const sel = new Set(saved && !saved.sample ? saved.players : []);
  const all = rosterOf(team).slice().sort((a,b)=>a.name.split(" ").slice(-1)[0].localeCompare(b.name.split(" ").slice(-1)[0]));
  showModal(`
    <h2 id="reportTitle">Match day roster</h2>
    <p class="sub">${esc(tn(team))} vs ${esc(tn(opp))} · ${esc(fmtDay(g.date))} · ${fmtTime(g.time).t} ${fmtTime(g.time).ap}</p>
    <p class="hint">Tap players to add them. Up to ${ROSTER_MAX} players. You can save and come back to change it until <b>${esc(fmtLock(g))}</b>, when it locks and becomes official.</p>
    <div class="rcount" id="rcount" aria-live="polite"></div>
    <input type="search" id="rsearch" class="linkfield" placeholder="Search players" aria-label="Search players">
    <div class="plist" id="plist" role="group" aria-label="Players"></div>
    <p class="err" id="reportErr" hidden></p>
    <div class="actions sticky-actions"><button type="button" class="btn btn-ghost" id="reportCancel">Cancel</button><button type="submit" class="btn btn-primary">Save roster</button></div>`, "roster");
  const draw = ()=>{
    const q = $("#rsearch").value.trim().toLowerCase(), full = sel.size >= ROSTER_MAX;
    $("#rcount").innerHTML = `<b>${sel.size}</b> of ${ROSTER_MAX} players selected${full?` · <span class="bad">roster is full</span>`:""}`;
    $("#plist").innerHTML = all.filter(p=>!q || p.name.toLowerCase().includes(q) || String(p.number??"")===q).map(p=>{
      const on = sel.has(p.name);
      return `<button type="button" class="pbtn" data-p="${esc(p.name)}" aria-pressed="${on}" ${!on&&full?"disabled":""}>
        <span class="tick" aria-hidden="true">${on?"✓":""}</span><span class="pn">${esc(p.name)}</span>${p.number!=null?`<span class="muted">#${p.number}</span>`:""}${p.pos==="GK"?`<span class="gk">GK</span>`:""}</button>`;
    }).join("") || `<div class="empty">No players match “${esc(q)}”.</div>`;
  };
  $("#rsearch").oninput = draw;
  $("#plist").onclick = e=>{ const b = e.target.closest("[data-p]"); if(!b) return; const n=b.dataset.p; if(sel.has(n)) sel.delete(n); else if(sel.size<ROSTER_MAX) sel.add(n); draw(); };
  formGame = g; picks = {sel};
  draw();
}
function saveRoster(){
  const g = formGame, team = state.user.team;
  if(isLocked(g)){ $("#reportErr").textContent = "This roster has locked and can’t be changed."; $("#reportErr").hidden = false; return; }
  if(!picks.sel.size){ $("#reportErr").textContent = "Add at least one player before saving."; $("#reportErr").hidden = false; return; }
  matchRosters[mrKey(g,team)] = {players:[...picks.sel], by:state.user.name, savedAt:new Date()};
  closeReport(); toast(`Roster saved: ${picks.sel.size} players. You can change it until ${fmtLock(g)}.`); renderDashboard();
}
function playerCards(team, names){
  const byName = {}; rosterOf(team).forEach(p=>byName[p.name]=p);
  return names.map(n=>{ const p = byName[n] || {name:n};
    const y = birthYear(p.born);
    return `<article class="pcard"><div class="photo" aria-label="No photo yet">${esc(initialsOf(n))}<small>No photo yet</small></div>
      <div class="pinfo"><b>${esc(n)}</b>${p.number!=null?`<span>#${p.number}</span>`:""}${p.pos==="GK"?`<span class="gk">GK</span>`:""}
      <span class="muted">Date of birth: ${y?`${y} <span class="small">(year only)</span>`:"not on file"}</span></div></article>`; }).join("");
}
const cardsNote = `<p class="hint">Photos and full dates of birth will show here once players register in the app. The website only has birth years for now.</p>`;
function viewPlayers(id, team){
  const g = games[id], r = rosterFor(g, team);
  if(!r){ toast("No roster submitted."); return; }
  showModal(`<h2 id="reportTitle">${esc(tn(team))} players</h2>
    <p class="sub">${esc(fmtDay(g.date))} · ${r.players.length} players on the ${isLocked(g)?"official":"saved"} roster</p>
    ${r.sample?`<p class="sample">Sample roster for the prototype</p>`:""}${cardsNote}
    <div class="pcards">${playerCards(team, r.players)}</div>
    <div class="actions sticky-actions"><button type="button" class="btn btn-primary" id="reportCancel">Close</button></div>`, "view");
}
function viewRoster(id, team){
  const g = games[id], r = rosterFor(g, team); if(!r) return;
  const byName = {}; rosterOf(team).forEach(p=>byName[p.name]=p);
  showModal(`<h2 id="reportTitle">${isLocked(g)?"Official roster":"Saved roster"}</h2>
    <p class="sub">${esc(tn(team))} · ${esc(fmtDay(g.date))} · ${r.players.length} players${r.by?` · submitted by ${esc(r.by)}`:""}</p>
    ${r.sample?`<p class="sample">Sample roster for the prototype</p>`:""}
    <ol class="rlist">${r.players.map(n=>`<li>${esc(n)}${byName[n]&&byName[n].number!=null?` <span class="muted">#${byName[n].number}</span>`:""}${byName[n]&&byName[n].pos==="GK"?` <span class="gk">GK</span>`:""}</li>`).join("")}</ol>
    <div class="actions"><button type="button" class="btn btn-ghost" data-viewplayers="${g.id}|${esc(team)}">View players</button><button type="button" class="btn btn-primary" id="reportCancel">Close</button></div>`, "view");
}
// Referee: both teams' official rosters as player cards, home/away toggle
function viewMatchRosters(id, side){
  const g = games[id]; side = side || "home";
  const team = side==="home" ? HOME(g) : AWAY(g), r = rosterFor(g, team);
  showModal(`<h2 id="reportTitle">Match day rosters</h2>
    <p class="sub">${esc(fmtDay(g.date))} · ${fmtTime(g.time).t} ${fmtTime(g.time).ap}${g.venue?" · "+esc(g.venue):""}</p>
    <div class="seg" role="group" aria-label="Team">
      <button type="button" data-mrside="home" aria-pressed="${side==="home"}">Home: ${esc(tn(HOME(g)))}</button>
      <button type="button" data-mrside="away" aria-pressed="${side==="away"}">Away: ${esc(tn(AWAY(g)))}</button></div>
    ${r ? `${r.sample?`<p class="sample">Sample roster for the prototype</p>`:""}<p class="sub"><b>${r.players.length}</b> players on the official roster</p>${cardsNote}<div class="pcards">${playerCards(team, r.players)}</div>`
        : `<div class="empty">${esc(tn(team))} didn’t submit a roster for this game.</div>`}
    <div class="actions sticky-actions"><button type="button" class="btn btn-primary" id="reportCancel">Close</button></div>`, "view");
  $("#reportForm").onclick = e=>{ const b = e.target.closest("[data-mrside]"); if(b) viewMatchRosters(id, b.dataset.mrside); };
}

/* ---------- Game Report tab + email to matchreport@ ----------
   For now referees don't need to sign in: they pick their game, fill in the report and send it by email
   from their own email app to matchreport@rasasoccer.ca. Admins can resend any report from their own email. */
const MATCHREPORT = "matchreport@rasasoccer.ca";
function reportSubject(g, r){
  return `REF REPORT | ${g.date} | ${g.number?"#"+g.number+" | ":""}${tn(HOME(g))} ${r.homeScore}-${r.awayScore} ${tn(AWAY(g))}`;
}
function reportText(g, r){
  const L = [];
  const side = (lbl, s)=>{
    L.push(`${lbl} goal scorers: ${s && s.scorers.length ? s.scorers.map(x=>x.name+(x.jersey?" #"+x.jersey:"")).join("; ") : "None"}`);
    L.push(`${lbl} goalkeepers: ${s && s.keepers.length ? s.keepers.map(k=>`${k.name} (${k.minutes} min)`).join("; ") : "Not given"}`);
    L.push(`${lbl} discipline: ${s && s.cards.length ? "" : "None"}`);
    (s && s.cards || []).forEach(c=>L.push(`  - ${c.card.toUpperCase()} ${c.name}: ${c.infraction}${c.description?" — "+c.description:""}`));
  };
  const q = r.questions || {};
  L.push("RASA REFEREE REPORT", "");
  L.push(`Game number: ${g.number||"—"}`, `Date: ${fmtDay(g.date)}`, `Kickoff: ${fmtTime(g.time).t} ${fmtTime(g.time).ap}`, `Field: ${g.venue||"—"}`);
  L.push(`Home: ${tn(HOME(g))}`, `Away: ${tn(AWAY(g))}`, `Final score: ${tn(HOME(g))} ${r.homeScore} - ${r.awayScore} ${tn(AWAY(g))}`, "");
  L.push(`Referee: ${r.by}`, `Referee email: ${r.email||"—"}`, `Assistant referees: ${g.refs.slice(1).join(", ")||"None"}`, "");
  side("Home", r.home); L.push(""); side("Away", r.away); L.push("");
  L.push(`Field conditions: ${r.field||"No issues"}`, `Injuries and other comments: ${r.notes||"None"}`, "");
  L.push(`Game ball provided by: ${q.ball||"—"}`, `Corner flags provided by: ${q.flags||"—"}`,
         `${tn(HOME(g))} (home) team list (2 copies): ${q.listHome||"—"}`, `${tn(AWAY(g))} (away) team list (2 copies): ${q.listAway||"—"}`, `Showed player cards: ${q.cards||"—"}`, "");
  L.push(`Submitted ${r.when} via app.rasasoccer.ca`);
  return L.join("\n");
}
const mailtoHref = (to, subject, body)=>`mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
// After a referee submits: the step that actually sends the report by email
function showSendStep(g, r){
  const subject = reportSubject(g, r), body = reportText(g, r);
  showModal(`<h2 id="reportTitle">Send your report</h2>
    <p class="sub">${esc(tn(HOME(g)))} ${r.homeScore}–${r.awayScore} ${esc(tn(AWAY(g)))} · ${esc(fmtDay(g.date))}</p>
    <div class="okbox"><b>Last step:</b> tap the button to open your email with the report filled in, attach your photos of the two team lists, then press <b>Send</b>.</div>
    <a class="btn btn-primary bigbtn" href="${esc(mailtoHref(MATCHREPORT, subject, body))}" id="sendMail">Open email to send report</a>
    <p class="hint">It goes to <b>${MATCHREPORT}</b>. If your email doesn’t open, copy the report and email it there yourself.</p>
    <button type="button" class="btn btn-ghost btn-sm" id="copyReport">Copy report</button>
    <details class="preview-mail"><summary>See the report text</summary><pre>${esc(body)}</pre></details>
    <div class="actions"><button type="button" class="btn btn-ghost" id="reportCancel">Done</button></div>`, "view");
  $("#copyReport").onclick = async ()=>{ try{ await navigator.clipboard.writeText(subject+"\n\n"+body); toast("Report copied"); }catch(e){ toast("Couldn’t copy. Open “See the report text” and copy it from there."); } };
}
/* ---------- Ref Report tab ----------
   1) Referee enters name + email  2) picks the game (their own games are highlighted)
   3) fills in the report and adds photos of both team lists  4) the app sends it to the server,
   which emails it from matchreport@rasasoccer.ca to matchreport@rasasoccer.ca (Reply-To: the referee). */
const REPORT_API = location.hostname.endsWith("azurestaticapps.net") ? "/api/report" : "https://ashy-water-0e8bef90f.3.azurestaticapps.net/api/report";
const MAX_PHOTOS_PER_TEAM = 3;
const normName = s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z\s]/g," ").split(/\s+/).filter(Boolean);
// Same person if the full names match, or first and last names match (middle names and capitals don't matter).
function refMatch(entered, listed){
  const a = normName(entered), b = normName(listed);
  if(!a.length || !b.length) return false;
  if(a.join(" ")===b.join(" ")) return true;
  if(a.length>=2 && b.length>=2 && a[0]===b[0] && a[a.length-1]===b[b.length-1]) return true;
  return false;
}
const refRole = (g, name)=> g.refs[0] && refMatch(name, g.refs[0]) ? "Referee" : g.refs.slice(1).some(r=>refMatch(name, r)) ? "Assistant referee" : "";
const loadRef = ()=>{ try{ return JSON.parse(localStorage.getItem("rasa.ref")||"{}"); }catch(e){ return {}; } };
const saveRef = v=>{ try{ localStorage.setItem("rasa.ref", JSON.stringify(v)); }catch(e){} };

function renderGameReport(){
  const v = $("#view-game-report"), rr = state.rr;
  if(rr.step==="who" || !rr.name || !rr.email){
    const saved = loadRef();
    v.innerHTML = `<div class="hello"><h1>Ref report</h1><p>For referees: send your game report and photos of both team lists.</p></div>
      <form class="auth rr-who" id="rrWho" novalidate>
        <p class="rr-step">Step 1 of 3</p>
        <div class="field"><label for="rrName">Your name</label><input id="rrName" type="text" autocomplete="name" placeholder="First and last name" value="${esc(rr.name||saved.name||"")}"></div>
        <div class="field"><label for="rrEmail">Your email</label><input id="rrEmail" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" value="${esc(rr.email||saved.email||"")}"></div>
        <input type="text" name="website" id="rrWebsite" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
        <p class="err" id="rrErr" hidden></p>
        <button class="btn btn-primary bigbtn" type="submit">Next</button>
        <p class="hint">Use the name you referee under, so your games can be found. We only use your email to reply about this report.</p>
      </form>`;
    $("#rrWho").onsubmit = e=>{ e.preventDefault();
      const name = nameCase($("#rrName").value.trim().replace(/\s+/g," ")), email = $("#rrEmail").value.trim(), err = $("#rrErr");
      const m = []; if(normName(name).length<2) m.push("your first and last name"); if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) m.push("a valid email address");
      if(m.length){ err.textContent = joinMissing(m); err.hidden = false; return; }
      Object.assign(state.rr, {step:"pick", name, email, hp:$("#rrWebsite").value}); saveRef({name, email}); renderGameReport(); window.scrollTo(0,0); };
    return;
  }
  // Step 2: the schedule. Games that have started, from the last couple of weeks, plus the rest of today.
  const now = new Date(), from = new Date(today); from.setDate(from.getDate()-rr.days);
  const endToday = new Date(today); endToday.setDate(endToday.getDate()+1);
  const list = games.filter(g=>parseD(g.date) >= from && (kickoff(g) <= now || parseD(g.date) < endToday))
    .sort((x,y)=>(y.date+y.time).localeCompare(x.date+x.time));
  const older = games.some(g=>parseD(g.date) < from);
  const mine = list.filter(g=>refRole(g, rr.name));
  const sent = id=>{ try{ return (JSON.parse(localStorage.getItem("rasa.sent")||"[]")).includes(gameKey(games[id])); }catch(e){ return false; } };
  const card = g=>{ const role = refRole(g, rr.name), later = kickoff(g) > now;
    return `<button type="button" class="gp-game${role?" mine":""}" data-pickgame="${g.id}" style="--c:var(${COMPS[g.comp].v})">
      <span class="gp-t">${fmtTime(g.time).t}<small>${fmtTime(g.time).ap}</small></span>
      <span class="gp-teams"><b>${esc(tn(HOME(g)))}</b><span><span class="muted small">vs</span> <b>${esc(tn(AWAY(g)))}</b></span><small>${g.venue?esc(g.venue)+" · ":""}${g.refs[0]?"Ref: "+esc(g.refs[0]):"No referee listed"}${later?" · kicks off later today":""}</small></span>
      ${role?`<span class="you">${role==="Referee"?"Your game":"You’re AR"}</span>`:""}${sent(g.id)?`<span class="appsc">Sent</span>`:""}
    </button>`; };
  const byDay = arr=>{ const m = new Map(); arr.forEach(g=>{ if(!m.has(g.date)) m.set(g.date,[]); m.get(g.date).push(g); }); let s=""; m.forEach((gs,d)=>{ s += `<h3 class="gp-day">${esc(fmtDay(d))}${dayTag(d)?` <span class="tag">${dayTag(d)}</span>`:""}</h3>` + gs.map(card).join(""); }); return s; };
  v.innerHTML = `<div class="hello"><h1>Ref report</h1><p>Step 2 of 3 · pick your game</p></div>
    <div class="rr-me"><span>Reporting as <b>${esc(rr.name)}</b> · ${esc(rr.email)}</span><button type="button" class="linkbtn" id="rrChange">Change</button></div>
    ${mine.length ? `<div class="tsec"><div class="tsec-h"><h2>Your games</h2><small>from the officials schedule</small></div><div class="gp-list">${mine.map(card).join("")}</div></div>`
      : `<p class="note">We didn’t find games under “${esc(rr.name)}” on the officials schedule for these dates. Pick your game from the list below.</p>`}
    <div class="tsec"><div class="tsec-h"><h2>All games</h2><small>last ${rr.days} days, newest first</small></div>
      <div class="gp-list">${byDay(list) || `<div class="empty">No games in this period.</div>`}</div>
      ${older?`<button type="button" class="btn btn-ghost more" id="gpMore">Show earlier games</button>`:""}</div>`;
  $("#rrChange").onclick = ()=>{ state.rr.step = "who"; renderGameReport(); };
  const more = $("#gpMore"); if(more) more.onclick = ()=>{ state.rr.days += 14; renderGameReport(); };
  v.onclick = e=>{ const b = e.target.closest("[data-pickgame]"); if(b) openRefReport(+b.dataset.pickgame, {public:true}); };
}

// Photos: shrink on the phone first (max 1600px, JPEG) so they upload quickly and fit in one email.
function shrinkPhoto(file){
  return new Promise((resolve, reject)=>{
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = ()=>{ const s = Math.min(1, 1600/Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth*s); c.height = Math.round(img.naturalHeight*s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      const dataURL = c.toDataURL("image/jpeg", 0.72); resolve({url:dataURL, data:dataURL.split(",")[1], type:"image/jpeg"}); };
    img.onerror = ()=>{ URL.revokeObjectURL(url); reject(new Error("unreadable")); };
    img.src = url;
  });
}
function drawPhotos(side){
  const box = $("#ph-"+side); if(!box) return;
  box.innerHTML = picks.photos[side].map((p,i)=>`<figure class="thumb">${p.busy?`<div class="vid">…</div>`:`<img src="${p.url}" alt="${side==="home"?"Home":"Away"} team list photo ${i+1}">`}<figcaption>${side==="home"?"Home":"Away"} list ${i+1}</figcaption><button type="button" class="x" data-rmphoto="${side}|${i}" aria-label="Remove photo ${i+1}">✕</button></figure>`).join("");
}
async function addPhotos(side, files){
  const err = $("#reportErr");
  for(const f of files){
    if(picks.photos[side].length >= MAX_PHOTOS_PER_TEAM){ err.textContent = `Up to ${MAX_PHOTOS_PER_TEAM} photos per team.`; err.hidden = false; break; }
    if(!/^image\//.test(f.type||"image/")) continue;
    const slot = {busy:true, name:f.name}; picks.photos[side].push(slot); drawPhotos(side);
    try{ Object.assign(slot, await shrinkPhoto(f), {busy:false}); }
    catch(e){ picks.photos[side].splice(picks.photos[side].indexOf(slot),1); err.textContent = "That photo couldn’t be opened. Try taking it again, or pick a JPEG or PNG."; err.hidden = false; }
    drawPhotos(side);
  }
}

async function sendRefReport(g, r){
  const err = $("#reportErr"), btn = $("#refSubmit");
  const photos = [];
  ["home","away"].forEach(s=>picks.photos[s].forEach((p,i)=>photos.push({name:`${s}-team-list-${i+1}.jpg`, type:p.type, data:p.data})));
  const subject = reportSubject(g, r);
  const text = reportText(g, r) + `\n\nTeam list photos attached: ${picks.photos.home.length} home, ${picks.photos.away.length} away`;
  const payload = {refName:r.by, refEmail:r.email, subject, text, website:state.rr.hp||"", photos,
    report:{...r, game:{date:g.date, time:g.time, number:g.number, venue:g.venue, home:tn(HOME(g)), away:tn(AWAY(g)), officials:g.refs}}};
  btn.disabled = true; btn.textContent = "Sending…"; err.hidden = true;
  let res, data = {};
  try{
    // text/plain keeps this a "simple" request (no preflight), which is faster on slow phone connections
    res = await fetch(REPORT_API, {method:"POST", headers:{"Content-Type":"text/plain;charset=UTF-8"}, body:JSON.stringify(payload)});
    data = await res.json().catch(()=>({}));
  }catch(e){ res = null; }
  if(res && res.ok && data.ok){
    try{ const s = JSON.parse(localStorage.getItem("rasa.sent")||"[]"); s.push(gameKey(g)); localStorage.setItem("rasa.sent", JSON.stringify(s.slice(-50))); }catch(e){}
    showModal(`<h2 id="reportTitle">Report sent</h2>
      <p class="sub">${esc(tn(HOME(g)))} ${r.homeScore}–${r.awayScore} ${esc(tn(AWAY(g)))} · ${esc(fmtDay(g.date))}</p>
      <div class="okbox">Thanks, ${esc(r.by.split(" ")[0])}. Your report and ${photos.length} photo${photos.length>1?"s":""} went to <b>${MATCHREPORT}</b>.</div>
      <div class="actions"><button type="button" class="btn btn-ghost" id="rrAnother">Report another game</button><button type="button" class="btn btn-primary" id="reportCancel">Done</button></div>`, "view");
    $("#rrAnother").onclick = ()=>{ closeReport(); renderGameReport(); };
    renderGameReport(); return;
  }
  btn.disabled = false; btn.textContent = "Try again";
  const why = data && data.error ? data.error : (res ? "The report couldn’t be sent." : "No connection. Check your signal and try again.");
  err.innerHTML = `${esc(why)} Your answers are still here.<br><a href="${esc(mailtoHref(MATCHREPORT, subject, text))}">Or email it instead</a> and attach the team list photos yourself.`;
  err.hidden = false; err.scrollIntoView({block:"nearest"});
}

/* ---------- Team Reports (managers, no sign-in) ----------
   1) Manager enters name, email and team  2) picks one of that team's games
   3) fills in the team report  4) the app sends it to the server, which emails it from
   matchreport@rasasoccer.ca to stats@ and president@rasasoccer.ca (Reply-To: the manager). */
const TEAM_REPORT_TO = ["stats@rasasoccer.ca", "president@rasasoccer.ca"];
const loadMgr = ()=>{ try{ return JSON.parse(localStorage.getItem("rasa.mgr")||"{}"); }catch(e){ return {}; } };
const saveMgr = v=>{ try{ localStorage.setItem("rasa.mgr", JSON.stringify(v)); }catch(e){} };
const sentTeam = (g, team)=>{ try{ return (JSON.parse(localStorage.getItem("rasa.sentTeam")||"[]")).includes(reportKey(g, team)); }catch(e){ return false; } };
const teamOptions = sel=>["D1","D2","MS"].map(d=>`<optgroup label="${esc(COMPS[d].n)}">${Object.entries(TEAMS).filter(([,t])=>t.d===d)
  .sort((a,b)=>a[1].n.localeCompare(b[1].n)).map(([k,t])=>`<option value="${esc(k)}"${k===sel?" selected":""}>${esc(t.n)}</option>`).join("")}</optgroup>`).join("");

function renderTeamReport(){
  const v = $("#view-team-report"), tr = state.tr;
  if(tr.step==="who" || !tr.name || !tr.email || !TEAMS[tr.team]){
    const saved = loadMgr();
    v.innerHTML = `<div class="hello"><h1>Team report</h1><p>For team managers: send your game report to the league.</p></div>
      <form class="auth rr-who" id="trWho" novalidate>
        <p class="rr-step">Step 1 of 3</p>
        <div class="field"><label for="trName">Your name</label><input id="trName" type="text" autocomplete="name" placeholder="First and last name" value="${esc(tr.name||saved.name||"")}"></div>
        <div class="field"><label for="trEmail">Your email</label><input id="trEmail" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" value="${esc(tr.email||saved.email||"")}"></div>
        <div class="field"><label for="trTeam">Your team</label><select id="trTeam"><option value="">Choose your team</option>${teamOptions(tr.team||saved.team||"")}</select></div>
        <input type="text" name="website" id="trWebsite" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
        <p class="err" id="trErr" hidden></p>
        <button class="btn btn-primary bigbtn" type="submit">Next</button>
        <p class="hint">Your report goes to the league’s stats and president. We only use your email to reply about this report.</p>
      </form>`;
    $("#trWho").onsubmit = e=>{ e.preventDefault();
      const name = nameCase($("#trName").value.trim().replace(/\s+/g," ")), email = $("#trEmail").value.trim(), team = $("#trTeam").value, err = $("#trErr");
      const m = []; if(normName(name).length<2) m.push("your first and last name"); if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) m.push("a valid email address"); if(!TEAMS[team]) m.push("your team");
      if(m.length){ err.textContent = joinMissing(m); err.hidden = false; return; }
      Object.assign(state.tr, {step:"pick", name, email, team, hp:$("#trWebsite").value}); saveMgr({name, email, team}); renderTeamReport(); window.scrollTo(0,0); };
    return;
  }
  // Step 2: this team's games that have started, from the last couple of weeks, plus the rest of today
  const team = tr.team, now = new Date(), from = new Date(today); from.setDate(from.getDate()-tr.days);
  const endToday = new Date(today); endToday.setDate(endToday.getDate()+1);
  const theirs = games.filter(g=>g.h===team || g.a===team);
  const list = theirs.filter(g=>parseD(g.date) >= from && (kickoff(g) <= now || parseD(g.date) < endToday)).sort((x,y)=>(y.date+y.time).localeCompare(x.date+x.time));
  const older = theirs.some(g=>parseD(g.date) < from);
  const card = g=>{ const opp = g.h===team ? g.a : g.h, later = kickoff(g) > now;
    const us = g.h===team ? g.hs : g.as, them = g.h===team ? g.as : g.hs, scored = hasScore(g);
    return `<button type="button" class="gp-game" data-pickteamgame="${g.id}" style="--c:var(${COMPS[g.comp].v})">
      <span class="gp-t">${fmtTime(g.time).t}<small>${fmtTime(g.time).ap}</small></span>
      <span class="gp-teams"><b>${esc(tn(team))}${scored?` ${us}–${them}`:""}</b><span><span class="muted small">vs</span> <b>${esc(tn(opp))}</b></span><small>${esc(COMPS[g.comp].n)}${g.venue?" · "+esc(g.venue):""}${later?" · kicks off later today":""}</small></span>
      ${sentTeam(g, team)?`<span class="appsc">Sent</span>`:""}
    </button>`; };
  const m = new Map(); list.forEach(g=>{ if(!m.has(g.date)) m.set(g.date,[]); m.get(g.date).push(g); });
  let days = ""; m.forEach((gs,d)=>{ days += `<h3 class="gp-day">${esc(fmtDay(d))}${dayTag(d)?` <span class="tag">${dayTag(d)}</span>`:""}</h3>` + gs.map(card).join(""); });
  v.innerHTML = `<div class="hello"><h1>Team report</h1><p>Step 2 of 3 · pick your game</p></div>
    <div class="rr-me"><span>Reporting for <b>${esc(tn(team))}</b> · ${esc(tr.name)} · ${esc(tr.email)}</span><button type="button" class="linkbtn" id="trChange">Change</button></div>
    <div class="tsec"><div class="tsec-h"><h2>${esc(tn(team))} games</h2><small>last ${tr.days} days, newest first</small></div>
      <div class="gp-list">${days || `<div class="empty">No ${esc(tn(team))} games in this period.</div>`}</div>
      ${older?`<button type="button" class="btn btn-ghost more" id="trMore">Show earlier games</button>`:""}</div>`;
  $("#trChange").onclick = ()=>{ state.tr.step = "who"; renderTeamReport(); };
  const more = $("#trMore"); if(more) more.onclick = ()=>{ state.tr.days += 14; renderTeamReport(); };
  v.onclick = e=>{ const b = e.target.closest("[data-pickteamgame]"); if(b) openReport(+b.dataset.pickteamgame, {public:true}); };
}

function teamReportSubject(g, r){ return `TEAM REPORT | ${g.date} | ${g.number?"#"+g.number+" | ":""}${r.team} ${r.us}-${r.them} ${r.opponent}`; }
function teamReportText(g, r){
  const L = [], list = o=>Object.entries(o||{}).map(([n,c])=>n+(c>1?" x"+c:"")).join("; ") || "None";
  L.push("RASA TEAM REPORT", "");
  L.push(`Team: ${r.team}`, `Opponent: ${r.opponent}`, `Final score: ${r.team} ${r.us} - ${r.them} ${r.opponent}`);
  L.push(`Game number: ${g.number||"—"}`, `Date: ${fmtDay(g.date)}`, `Kickoff: ${fmtTime(g.time).t} ${fmtTime(g.time).ap}`, `Field: ${g.venue||"—"}`, "");
  L.push(`Manager: ${r.by}`, `Manager email: ${r.email}`, "");
  L.push(`Goal scorers: ${list(r.goals)}`, `Assists: ${list(r.assists)}`, "");
  L.push(`Referee: ${r.referee||"Not listed"}`, `Control of the game: ${r.control}/5`, `Decision making: ${r.decisions}/5`, `Overall score: ${r.overall}/10`);
  r.ars.forEach(a=>L.push(`Assistant referee ${a.name}: ${a.rating}/5`)); L.push("");
  L.push(`Field condition: ${r.field||"No issues"}`, `Comments: ${r.notes||"None"}`, "", `Submitted ${r.when} via app.rasasoccer.ca`);
  return L.join("\n");
}
async function sendTeamReport(g, team, r){
  const err = $("#reportErr"), btn = $("#teamSubmit");
  const photos = picks.files.filter(p=>p.data).map((p,i)=>({name:`field-photo-${i+1}.jpg`, type:p.type, data:p.data}));
  const subject = teamReportSubject(g, r), text = teamReportText(g, r) + (photos.length ? `\n\nField photos attached: ${photos.length}` : "");
  const payload = {type:"team", name:r.by, email:r.email, team:r.team, subject, text, website:state.tr.hp||"", photos,
    report:{...r, game:{date:g.date, time:g.time, number:g.number, venue:g.venue, home:tn(HOME(g)), away:tn(AWAY(g)), comp:COMPS[g.comp].n, officials:g.refs}}};
  btn.disabled = true; btn.textContent = "Sending…"; err.hidden = true;
  let res, data = {};
  try{
    res = await fetch(REPORT_API, {method:"POST", headers:{"Content-Type":"text/plain;charset=UTF-8"}, body:JSON.stringify(payload)});
    data = await res.json().catch(()=>({}));
  }catch(e){ res = null; }
  if(res && res.ok && data.ok){
    try{ const s = JSON.parse(localStorage.getItem("rasa.sentTeam")||"[]"); s.push(reportKey(g, team)); localStorage.setItem("rasa.sentTeam", JSON.stringify(s.slice(-50))); }catch(e){}
    showModal(`<h2 id="reportTitle">Report sent</h2>
      <p class="sub">${esc(r.team)} ${r.us}–${r.them} ${esc(r.opponent)} · ${esc(fmtDay(g.date))}</p>
      <div class="okbox">Thanks, ${esc(r.by.split(" ")[0])}. Your report${photos.length?` and ${photos.length} photo${photos.length>1?"s":""}`:""} went to the league.</div>
      <div class="actions"><button type="button" class="btn btn-ghost" id="trAnother">Report another game</button><button type="button" class="btn btn-primary" id="reportCancel">Done</button></div>`, "view");
    $("#trAnother").onclick = ()=>{ closeReport(); renderTeamReport(); };
    renderTeamReport(); return;
  }
  btn.disabled = false; btn.textContent = "Try again";
  const why = data && data.error ? data.error : (res ? "The report couldn’t be sent." : "No connection. Check your signal and try again.");
  err.innerHTML = `${esc(why)} Your answers are still here.<br><a href="${esc(mailtoHref(TEAM_REPORT_TO.join(","), subject, text))}">Or email it instead</a>${photos.length?" and attach your photos":""}.`;
  err.hidden = false; err.scrollIntoView({block:"nearest"});
}
