/* Team pages: upcoming games, results, roster and staff. */
"use strict";

/* ---------- Player list ---------- */
function rosterHTML(team){
  const r = rosters && rosters.teams && rosters.teams[team];
  if(!r || !r.players || !r.players.length) return `<div class="empty">The player list couldn’t be loaded. Check your connection and reload the page.</div>`;
  // Age from birth year only (the website gives '93 style years), so it can be a year high before a player's birthday.
  const yr = new Date().getFullYear();
  const age = b=>{ const m=String(b||"").match(/(\d{2,4})/); if(!m) return "–"; let y=+m[1]; if(y<100){ y += (2000+y>yr) ? 1900 : 2000; } return yr-y; };
  const last = n=>n.trim().split(/\s+/).slice(-1)[0];
  const ps = r.players.slice().sort((a,b)=>last(a.name).localeCompare(last(b.name)) || a.name.localeCompare(b.name));
  const rows = ps.map(p=>`<tr><td class="tm">${esc(p.name)}</td><td>${p.gp}</td><td>${p.g}</td><td>${p.a}</td><td>${p.yc?`<span class="card yc">${p.yc}</span>`:"0"}</td><td>${p.rc?`<span class="card rc">${p.rc}</span>`:"0"}</td><td>${age(p.born)}</td><td class="fill"></td></tr>`).join("");
  let when=""; if(rosters.updatedAt){const d=new Date(rosters.updatedAt); if(!isNaN(d)) when=` · last checked ${d.toLocaleString("en-CA",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}`;}
  return `<div class="std roster" style="--c:var(--pitch)"><div class="std-h"><h2>${ps.length} players</h2><span class="swipe" hidden aria-hidden="true"><span class="swipe-txt">Slide for more</span><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span></div><div class="std-wrap"><table>
    <thead><tr><th scope="col" class="tm">Player</th><th scope="col" title="Games played">GP</th><th scope="col" title="Goals">G</th><th scope="col" title="Assists">A</th><th scope="col" title="Yellow cards">YC</th><th scope="col" title="Red cards">RC</th><th scope="col" title="Age this year, from birth year">Age</th><th class="fill" aria-hidden="true"></th></tr></thead>
    <tbody>${rows}</tbody></table></div></div><p class="note">From your team page on rasasoccer.ca${when}.</p>`;
}

/* ---------- Team page ----------
   Opened from a team name in Standings. Shows the team's record, upcoming games, results and full roster.
   Staff (manager, coach...) are listed first when the data has them (rosters.json teams[KEY].staff). */
const BASE_TITLE = document.title;
function openTeam(key){
  if(!TEAMS[key]) return;
  if(state.view==="team" && state.teamKey===key) return;
  state.teamKey = key; state.teamTab = "up";
  go("team");
}
// Staff from the team's personnel page: drop exact repeats, managers first, then coaches, then everyone else.
function teamStaff(key){
  const r = rosters && rosters.teams && rosters.teams[key];
  const RANK = role=>/^manager$/i.test(role)?0:/^coach$|head coach/i.test(role)?1:/coach/i.test(role)?2:3;
  const seen = new Set();
  return ((r && r.staff) || []).filter(s=>{ const k=(s.name+"|"+s.role).toLowerCase(); if(seen.has(k)) return false; seen.add(k); return true; })
    .map((s,i)=>({...s,i})).sort((a,b)=>RANK(a.role)-RANK(b.role) || a.i-b.i);
}
const faceHTML = p=>`<span class="mini-photo" aria-hidden="true">${esc(initialsOf(p.name))}${p.photo?`<img src="${esc(p.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`:""}</span>`;
function teamStaffHTML(key){
  const staff = teamStaff(key);
  if(!staff.length) return `<div class="empty">${rosters ? "No staff listed on rasasoccer.ca for this team." : "Staff couldn’t be loaded. Check your connection and reload the page."}</div>`;
  return `<div class="std staff-list" style="--c:var(${COMPS[TEAMS[key].d].v})"><div class="std-h"><h2>${staff.length} staff</h2></div>
    <ul>${staff.map(s=>`<li>${faceHTML(s)}<b>${esc(nameCase(s.name))}</b><span class="role">${esc(s.role||"Staff")}</span></li>`).join("")}</ul></div>`;
}
// Roster: Points (goals + assists) first and in bold. Sorted by points, then goals, then last name.
function teamRosterHTML(key){
  const r = rosters && rosters.teams && rosters.teams[key];
  const players = (r && r.players) || [];
  if(!players.length) return `<div class="empty">${rosters ? "No roster on rasasoccer.ca for this team yet." : "The roster couldn’t be loaded. Check your connection and reload the page."}</div>`;
  const last = n=>n.trim().split(/\s+/).slice(-1)[0].toLowerCase();
  const ps = players.map(p=>({...p, pts:(p.g||0)+(p.a||0)}))
    .sort((a,b)=>b.pts-a.pts || (b.g||0)-(a.g||0) || last(a.name).localeCompare(last(b.name)) || a.name.localeCompare(b.name));
  const rows = ps.map(p=>`<tr><td class="num">${p.number!=null?esc(p.number):""}</td><td class="tm"><span class="pl">${faceHTML(p)}<span title="${esc(nameCase(p.name))}">${esc(nameCase(p.name))}</span></span></td><td class="pts">${p.pts}</td><td>${p.g}</td><td>${p.a}</td><td>${p.gp}</td><td>${p.pos&&p.pos!=="-"?esc(p.pos):""}</td><td>${p.yc?`<span class="card yc">${p.yc}</span>`:"0"}</td><td>${p.rc?`<span class="card rc">${p.rc}</span>`:"0"}</td><td class="fill"></td></tr>`).join("");
  return `<div class="std roster team-roster" style="--c:var(${COMPS[TEAMS[key].d].v})"><div class="std-h"><h2>${ps.length} players</h2><span class="swipe" hidden aria-hidden="true"><span class="swipe-txt">Slide for more</span><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span></div><div class="std-wrap"><table>
    <thead><tr><th scope="col" title="Jersey number">#</th><th scope="col" class="tm">Name</th><th scope="col" title="Points: 1 per goal, 1 per assist">Pts</th><th scope="col" title="Goals">G</th><th scope="col" title="Assists">A</th><th scope="col" title="Games played">GP</th><th scope="col" title="Position">Pos</th><th scope="col" title="Yellow cards">YC</th><th scope="col" title="Red cards">RC</th><th class="fill" aria-hidden="true"></th></tr></thead>
    <tbody>${rows}</tbody></table></div></div><p class="note">Points: 1 for each goal and 1 for each assist.</p>`;
}
function renderTeam(){
  const key = state.teamKey, t = TEAMS[key], comp = t.d;
  const mine = games.filter(g=>g.h===key || g.a===key);
  const upcoming = mine.filter(g=>!isPast(g)).sort((x,y)=>(x.date+x.time).localeCompare(y.date+y.time));
  const past = mine.filter(g=>isPast(g)).sort((x,y)=>(y.date+y.time).localeCompare(x.date+x.time));
  const pos = positionOf(key);
  let n = 0;
  const cards = list=>list.map(g=>matchCard(g,{showDate:true}).replace('<article class="match"', `<article class="match${(n++)%2?" shade":""}"`)).join("");
  const tabs = [["up","Upcoming",upcoming.length],["res","Results",past.length],["roster","Roster",null],["staff","Staff",null]];
  const tab = state.teamTab;
  let body;
  if(tab==="roster") body = teamRosterHTML(key);
  else if(tab==="staff") body = teamStaffHTML(key);
  else { const list = tab==="up" ? upcoming : past;
    body = list.length ? `<div class="day">${cards(list)}</div>` : `<div class="empty">${tab==="up"?"No more games scheduled.":"No games played yet."}</div>`; }
  const rec = pos && pos.row;
  const stats = rec ? `<div class="team-stats">
      <div><b>${rec.pts}</b><span>Points</span></div>
      <div><b>${rec.w}-${rec.t}-${rec.l}</b><span>W-T-L</span></div>
      <div title="${rec.gf} scored, ${rec.ga} conceded"><b>${rec.diff>0?"+":""}${rec.diff}</b><span>+/-</span></div>
    </div>` : "";
  $("#view-team").innerHTML = `
    <button class="backlink" data-teamback>← Back</button>
    <div class="team-h" style="--c:var(${COMPS[comp].v})"><h1>${esc(t.n)}</h1>
      <div class="sub"><span class="pill" style="--c:var(${COMPS[comp].v})">${COMPS[comp].n}</span>${pos?`<span>${ord(pos.pos)} place</span>`:""}</div></div>
    ${stats}
    <div class="seg team-tabs" role="group" aria-label="Team sections">${tabs.map(([k,l,c])=>`<button data-teamtab="${k}" aria-pressed="${tab===k}">${l}${c!=null?` <span class="cnt">${c}</span>`:""}</button>`).join("")}</div>
    ${body}`;
  wireScrollArrows($("#view-team"));
  document.title = `${t.n} – RASA`;
}
