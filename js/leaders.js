/* Leaders tab: Goals, Assists and Clean Sheets. */
"use strict";

/* ---------- Leaders ----------
   Goals and assists come from each team's player list on rasasoccer.ca (same numbers as the site's Scoring Leaders page).
   Keepers: the website has no keeper stats, so until referee reports exist we rank team defences (goals against per game).
   Once referees submit reports (keeper + minutes), keepers are ranked by goals against per 90 minutes. */
const LD_TOP = 10;
function rankRows(rows, key, tie){
  rows.sort((a,b)=> b[key]-a[key] || (tie?tie(a,b):0) || a.name.localeCompare(b.name));
  let rank = 0;
  return rows.map((r,i)=>{ const p = rows[i-1]; if(!p || r[key]!==p[key] || (tie && tie(p,r)!==0)) rank = i+1; return {...r, rank}; });
}
function keeperStats(div){
  const ks = {};
  games.forEach(g=>{
    const r = refReports[gameKey(g)]; if(!r || r.sample) return;
    [["home",HOME(g),r.awayScore],["away",AWAY(g),r.homeScore]].forEach(([side,team,conceded])=>{
      const list = (r[side] && r[side].keepers || []).filter(k=>k.name);
      const totalMin = list.reduce((s,k)=>s+(+k.minutes||0),0) || 1;
      list.forEach(k=>{
        const key = team+"|"+k.name, m = +k.minutes||0;
        ks[key] = ks[key] || {name:k.name, team, minutes:0, ga:0, gp:0};
        ks[key].minutes += m; ks[key].ga += conceded * (m/totalMin); ks[key].gp += 1;
      });
    });
  });
  return Object.values(ks).filter(k=>(div==="ALL"||(div==="TEAM"?(state.user&&k.team===state.user.team):TEAMS[k.team]&&TEAMS[k.team].d===div)) && k.minutes>0)
    .map(k=>({...k, gaa: k.ga*90/k.minutes}));
}
function renderLeaders(){
  const myTeam = state.user && state.user.role==="manager" ? state.user.team : null;
  const F = state.ldF;  // one filter per category: g (goals), a (assists), k (keepers)
  ["g","a","k"].forEach(c=>{ if(F[c]==="TEAM" && !myTeam) F[c]="ALL"; });
  $("#ldChips").innerHTML = "";
  const body = $("#ldBody");
  if(!rosters || !rosters.teams){ body.innerHTML = `<div class="empty">Player stats couldn’t be loaded. Check your connection and reload the page.</div>`; return; }
  const inScope = (div, team)=> div==="ALL" || (div==="TEAM" ? team===myTeam : (TEAMS[team] && TEAMS[team].d===div));
  const playersIn = div=>{ const out=[]; Object.entries(rosters.teams).forEach(([team,t])=>{ if(!inScope(div,team)) return;
    (t.players||[]).forEach(p=>out.push({name:p.name, team, gp:p.gp||0, g:p.g||0, a:p.a||0, photo:p.photo||""})); }); return out; };
  const chips = cat=>`<div class="ld-chips" role="group" aria-label="Filter ${cat==="g"?"goals":cat==="a"?"assists":"goalkeepers"}">${
    [["ALL","All"],["D1","Div 1"],["D2","Div 2"],["MS","Masters"]].map(([k,n])=>`<button class="chip sm" data-ldcat="${cat}" data-lddiv="${k}" aria-pressed="${F[cat]===k}">${k!=="ALL"?`<span class="dot" style="background:var(${COMPS[k].v})"></span>`:""}${n}</button>`).join("")
    }${myTeam?`<button class="chip sm mine-chip" data-ldcat="${cat}" data-lddiv="TEAM" aria-pressed="${F[cat]==="TEAM"}">★ My team</button>`:""}</div>`;
  const scopeText = div=> div==="TEAM" ? " for your team" : div!=="ALL" ? " in this division" : "";
  const teamCell = team=>`<span class="ld-team"><span class="dot" style="background:var(${COMPS[TEAMS[team]?TEAMS[team].d:"CUP"].v})"></span>${esc(tn(team))}</span>`;
  const head = ()=>"";   // the tab names the list; filters sit under the tabs
  // Ties: goals are separated by assists, assists by goals (as on rasasoccer.ca), then fewer games played.
  const goals = rankRows(playersIn(F.g).filter(p=>p.g>0), "g", (a,b)=>b.a-a.a || a.gp-b.gp).slice(0,LD_TOP);
  const assists = rankRows(playersIn(F.a).filter(p=>p.a>0), "a", (a,b)=>b.g-a.g || a.gp-b.gp).slice(0,LD_TOP);
  // Simple list (rank, photo, name and team, number), like a sports app; #1 and #2 a little bigger.
  // Photos come from the player's rasasoccer.ca roster card, initials if there's none.
  const board = (title, cat, unit, rows, val)=>`
    <div class="std ld ldl" id="ld-${cat}">${head(title, cat)}
      ${rows.length ? `<div class="ldl-head" aria-hidden="true"><span>Player</span><span>${unit==="G"?"Goals":"Assists"}</span></div>
      <ol class="ldl-list">${rows.map(r=>`<li class="ldl-row${r.rank<=2?" r"+r.rank:""}">
        <span class="ldl-rank">${r.rank}</span>
        <span class="ldl-photo" aria-hidden="true">${esc(initialsOf(r.name))}${r.photo?`<img src="${esc(r.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`:""}</span>
        <span class="ldl-who"><b>${esc(r.name)}</b>${teamCell(r.team)}</span>
        <span class="ldl-val" aria-label="${val(r)} ${unit==="G"?"goals":"assists"}">${val(r)}</span></li>`).join("")}</ol>` : `<div class="empty">No ${unit==="G"?"goals":"assists"} recorded yet${scopeText(F[cat])}.</div>`}</div>`;
  // Keepers: real keeper stats from referee reports when there are any, else team defence from the standings
  let keeperHTML;
  const ks = rankRows(keeperStats(F.k).map(k=>({...k, neg:-k.gaa})), "neg", (a,b)=>b.minutes-a.minutes).slice(0,LD_TOP);
  if(ks.length){
    keeperHTML = `<div class="std ld" id="ld-k">${head("Goalkeepers","k")}
      <table><thead><tr><th scope="col">#</th><th scope="col" class="tm">Keeper</th><th scope="col">Min</th><th scope="col" title="Goals against">GA</th><th scope="col" title="Goals against per 90 minutes">GAA</th></tr></thead><tbody>
      ${ks.map(k=>`<tr class="${k.rank===1?"top":""}"><td>${k.rank}</td><td class="tm"><b>${esc(k.name)}</b>${teamCell(k.team)}</td><td>${k.minutes}</td><td>${Math.round(k.ga*10)/10}</td><td class="pts">${k.gaa.toFixed(2)}</td></tr>`).join("")}
      </tbody></table><p class="note ld-note">From referee reports submitted in the app. GAA is goals against per 90 minutes; lower is better.</p></div>`;
  } else {
    // Clean sheets: every played game in our records (league, cross-over and cup) where the team conceded no goals.
    const tally = {};
    games.forEach(g=>{ if(!hasScore(g)) return;
      [[g.h, g.as], [g.a, g.hs]].forEach(([k, against])=>{ if(!TEAMS[k] || !inScope(F.k,k)) return;
        const t = tally[k] = tally[k] || {name:TEAMS[k].n, team:k, gp:0, ga:0, cs:0};
        t.gp++; t.ga += +against||0; if(+against===0) t.cs++; }); });
    const teams = Object.values(tally).filter(t=>t.gp).map(t=>({...t, gaa:t.ga/t.gp}));
    // Most clean sheets; ties go to fewer goals against per game, then more games played
    const rows = rankRows(teams.filter(t=>t.cs>0).map(t=>({...t, key:t.cs*1000 - Math.round(t.gaa*100)})), "key", (a,b)=>b.gp-a.gp).slice(0,LD_TOP);
    keeperHTML = `<div class="std ld" id="ld-k">
      ${rows.length ? `${`<table><thead><tr><th scope="col">#</th><th scope="col" class="tm">Team</th><th scope="col">GP</th><th scope="col" title="Goals against per game">GA/G</th><th scope="col" title="Clean sheets: games with no goals against">CS</th></tr></thead><tbody>
      ${rows.map((t,i)=>`<tr class="${i<3?"cs-r"+(i+1):""}"><td>${t.rank}</td><td class="tm">${teamCell(t.team)}</td><td>${t.gp}</td><td>${t.gaa.toFixed(2)}</td><td class="pts">${t.cs}</td></tr>`).join("")}
      </tbody></table>`}` : `<div class="empty">No clean sheets yet${scopeText(F.k)}.</div>`}</div>`;
  }
  const tab = state.ldTab;
  const tabs = [["g","Goals"],["a","Assists"],["k","Clean Sheets"]];
  body.innerHTML = `<div class="ld-pin"><div class="ld-tabs ld-subtabs" role="tablist" aria-label="Leaders">${tabs.map(([k,n])=>`<button role="tab" data-ldtab="${k}" aria-pressed="${tab===k}" aria-selected="${tab===k}">${n}</button>`).join("")}</div>
    ${chips(tab).replace('class="ld-chips"','class="ld-chips ld-filter"')}</div>
    ${tab==="g" ? board("Goals","g","G",goals,r=>r.g) : tab==="a" ? board("Assists","a","A",assists,r=>r.a) : keeperHTML}`;
  $("#ldSub").textContent = lastUpdated(rosters.updatedAt);
}
