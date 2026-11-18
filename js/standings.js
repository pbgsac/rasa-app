/* Standings tab: tables, weekly arrows, last 5, sliding tables. */
"use strict";

/* ---------- Standings view ---------- */
const DIV_COMP = n=>/masters/i.test(n)?"MS":/2/.test(n)?"D2":"D1";
// Start from the website's table, then apply referee scores the website doesn't show yet (or shows differently).
// Which games count follows the game type: division games for that division, cross-overs for both teams, League's Cup for neither.
function adjustedStandings(){
  if(!standings) return {divs:[], applied:0};
  const divs = standings.divisions.map(dv=>({...dv, rows: dv.rows.map(r=>({...r}))}));
  const rowOf = {}; divs.forEach(dv=>dv.rows.forEach(r=>{ const k=keyFor(r.team); if(k) rowOf[k]=r; }));
  let applied = 0;
  const apply = (team, gf, ga, sign)=>{
    const r = rowOf[team]; if(!r) return;
    r.gp += sign; r.gf += sign*gf; r.ga += sign*ga; r.diff = r.gf - r.ga;
    if(gf>ga){ r.w += sign; r.pts += 3*sign; } else if(gf<ga){ r.l += sign; } else { r.t += sign; r.pts += sign; }
  };
  games.filter(webDiffers).forEach(g=>{
    if(g.comp==="CUP" || !TEAMS[g.h] || !TEAMS[g.a]) return;
    if(g.webHs!==null && g.webAs!==null){ apply(g.h, g.webHs, g.webAs, -1); apply(g.a, g.webAs, g.webHs, -1); }
    apply(g.h, g.hs, g.as, 1); apply(g.a, g.as, g.hs, 1); applied++;
  });
  if(applied) divs.forEach(dv=>dv.rows.sort((x,y)=>y.pts-x.pts || y.w-x.w || y.diff-x.diff || y.gf-x.gf));
  return {divs, applied};
}
/* Weekly movement and last-5 form.
   The website only shows today's table, so earlier tables are rebuilt from game results:
   division games count for that division, cross-overs count for both teams, League's Cup for neither.
   Weeks run Monday to Sunday. Arrows compare today's table with the table before the latest week of games. */
const countsFor = (g, team)=> TEAMS[team] && (g.comp===TEAMS[team].d || g.comp==="XO");
function weekStart(d){ const x = new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate() - ((x.getDay()+6)%7)); return x; }
function tableAt(div, before){   // positions (1-based) in a division using games played before `before` (Date) or all games
  const keys = Object.keys(TEAMS).filter(k=>TEAMS[k].d===div);
  const r = {}; keys.forEach(k=>r[k]={k, gp:0, w:0, t:0, l:0, gf:0, ga:0, pts:0});
  const played = games.filter(g=>hasScore(g) && (!before || parseD(g.date) < before));
  played.forEach(g=>[[g.h,g.hs,g.as],[g.a,g.as,g.hs]].forEach(([k,f,a])=>{
    if(!r[k] || !countsFor(g,k)) return; const x=r[k]; x.gp++; x.gf+=f; x.ga+=a;
    if(f>a){ x.w++; x.pts+=3; } else if(f<a) x.l++; else { x.t++; x.pts++; } }));
  // head-to-head points between two teams, for breaking ties
  const h2h = (a,b)=>{ let pa=0,pb=0; played.forEach(g=>{ if(!((g.h===a&&g.a===b)||(g.h===b&&g.a===a))) return;
    const fa = g.h===a ? g.hs : g.as, fb = g.h===a ? g.as : g.hs; if(fa>fb) pa+=3; else if(fb>fa) pb+=3; else { pa++; pb++; } }); return pb-pa; };
  const rows = Object.values(r).sort((x,y)=>y.pts-x.pts || y.w-x.w || h2h(x.k,y.k) || (y.gf-y.ga)-(x.gf-x.ga) || y.gf-x.gf || tn(x.k).localeCompare(tn(y.k)));
  const pos = {}; rows.forEach((x,i)=>pos[x.k] = x.gp ? i+1 : null); return pos;
}
function weeklyMoves(div){
  const played = games.filter(g=>hasScore(g) && (g.comp===div || (g.comp==="XO" && (TEAMS[g.h]&&TEAMS[g.h].d===div || TEAMS[g.a]&&TEAMS[g.a].d===div))));
  if(!played.length) return {};
  const latest = played.reduce((m,g)=> g.date>m ? g.date : m, "");
  const start = weekStart(parseD(latest));
  const before = tableAt(div, start), now = tableAt(div, null), out = {};
  Object.keys(now).forEach(k=>{ out[k] = (before[k]==null || now[k]==null) ? 0 : before[k]-now[k]; });
  out._week = start; return out;
}
function lastFive(team){
  return games.filter(g=>(g.h===team||g.a===team) && hasScore(g) && countsFor(g,team))
    .sort((x,y)=>(x.date+x.time).localeCompare(y.date+y.time)).slice(-5)
    .map(g=>{ const home = g.h===team, f = home?g.hs:g.as, a = home?g.as:g.hs, opp = home?g.a:g.h;
      return {res: f>a?"W":f<a?"L":"T", f, a, opp, date:g.date}; });
}
const ICON = {
  W:`<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="8" fill="currentColor"/><path d="M4.6 8.3l2.2 2.2 4.6-4.8" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  L:`<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="8" fill="currentColor"/><path d="M5.3 5.3l5.4 5.4M10.7 5.3l-5.4 5.4" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>`,
  T:`<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="8" fill="currentColor"/><path d="M5 8h6" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>`
};
function formHTML(team){
  const f = lastFive(team); if(!f.length) return `<span class="muted">–</span>`;
  const word = {W:"Win",L:"Loss",T:"Tie"};
  return `<span class="last5" role="img" aria-label="Last ${f.length}, oldest first: ${f.map(x=>word[x.res]).join(", ")}">${f.map(x=>`<span class="r5 ${x.res}" title="${word[x.res]} ${x.f}–${x.a} vs ${esc(tn(x.opp))}, ${esc(fmtShort(x.date))}">${ICON[x.res]}</span>`).join("")}</span>`;
}
function moveHTML(n){
  if(n>0) return `<span class="mv up" title="Up ${n} place${n>1?"s":""} this week" aria-label="up ${n}">▲${n>1?`<small>${n}</small>`:""}</span>`;
  if(n<0) return `<span class="mv down" title="Down ${-n} place${n<-1?"s":""} this week" aria-label="down ${-n}">▼${n<-1?`<small>${-n}</small>`:""}</span>`;
  return `<span class="mv same" title="Same place as last week" aria-label="no change">–</span>`;
}

// "Last updated Wed, Nov 11" (plus the time on the same day the data was checked)
function lastUpdated(iso){
  const d = new Date(iso); if(!iso || isNaN(d)) return "";
  const date = d.toLocaleDateString("en-CA",{weekday:"short", month:"short", day:"numeric"});
  return `Last updated ${date}, ${d.toLocaleTimeString("en-CA",{hour:"numeric", minute:"2-digit"})}`;
}
function renderStandings(){
  const body = $("#stdBody");
  if(!standings){ body.innerHTML = `<div class="empty">The standings couldn’t be loaded. Check your connection and reload the page.</div>`; return; }
  const mine = state.user && state.user.role==="manager" ? state.user.team : null;
  const order = ["D1","D2","MS"];
  const adj = adjustedStandings();
  const divs = adj.divs.slice().sort((a,b)=>order.indexOf(DIV_COMP(a.name))-order.indexOf(DIV_COMP(b.name)));
  if(!divs.some(dv=>DIV_COMP(dv.name)===state.stdTab) && divs.length) state.stdTab = DIV_COMP(divs[0].name);
  const tabs = `<div class="std-subtabs" role="tablist" aria-label="Divisions">${divs.map(dv=>{ const c = DIV_COMP(dv.name);
    return `<button role="tab" data-stdtab="${c}" aria-pressed="${state.stdTab===c}" aria-selected="${state.stdTab===c}">${esc(COMPS[c].n)}</button>`; }).join("")}</div>`;
  body.innerHTML = tabs + divs.filter(dv=>DIV_COMP(dv.name)===state.stdTab).map(dv=>{
    const comp = DIV_COMP(dv.name);
    const showD = dv.rows.some(r=>r.d);
    const moves = weeklyMoves(comp);
    const rows = dv.rows.map((r,i)=>{
      const k = keyFor(r.team);
      const nm = k ? `<button class="tlink" data-teamlink="${esc(k)}" title="Open the ${esc(TEAMS[k].n)} team page">${esc(TEAMS[k].n)}</button>` : esc(r.team);
      const st = String(r.streak||""); const sk = st.charAt(0);
      const diff = r.diff>0 ? "+"+r.diff : String(r.diff);
      return `<tr class="${k&&k===mine?"mine":""}"><td class="rkc"><span class="rk">${i+1}</span>${k?moveHTML(moves[k]||0):""}</td><td class="tm">${nm}</td><td class="pts">${r.pts}</td><td>${r.gp}</td><td>${r.w}</td><td>${r.t}</td><td>${r.l}</td>${showD?`<td>${r.d}</td>`:""}<td class="opt">${r.gf}</td><td class="opt">${r.ga}</td><td>${diff}</td><td class="l5c">${k?formHTML(k):""}</td><td class="fill"></td></tr>`;
    }).join("");
    return `<div class="std" style="--c:var(${COMPS[comp].v})"><div class="std-h std-h-slim"><h2 class="sr-only">${esc(COMPS[comp].n)}</h2><span class="swipe" hidden aria-hidden="true"><span class="swipe-txt">Slide for more</span><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span></div><div class="std-wrap"><table>
      <thead><tr><th scope="col">#</th><th scope="col" class="tm">Team</th><th scope="col" title="Points">Pts</th><th scope="col" title="Games played">GP</th><th scope="col" title="Wins">W</th><th scope="col" title="Ties">T</th><th scope="col" title="Losses">L</th>${showD?'<th scope="col" title="Defaults">D</th>':""}<th scope="col" class="opt" title="Goals for">GF</th><th scope="col" class="opt" title="Goals against">GA</th><th scope="col" title="Goal difference">+/-</th><th scope="col" class="l5c" title="Last 5 games, oldest to newest">Last 5</th><th class="fill" aria-hidden="true"></th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`;
  }).join("");   // only "Last updated" sits under the table
  let when = "";
  $("#stdSub").textContent = lastUpdated(standings.updatedAt);
  wireScrollArrows(document);
}
// Show the arrow only on tables that are wider than the screen; hide it once scrolled to the end.
function wireScrollArrows(root){
  root.querySelectorAll(".std").forEach(card=>{
    const wrap = card.querySelector(".std-wrap"), arrow = card.querySelector(".swipe");
    if(!wrap || !arrow) return;
    // The hint row stays while the table can slide. The hint fades out once the end is reached and
    // only comes back when the table is slid all the way back to the start.
    const upd = ()=>{ const room = wrap.scrollWidth - wrap.clientWidth;
      arrow.hidden = room < 4;
      if(room - wrap.scrollLeft < 4) arrow.classList.add("done");
      else if(wrap.scrollLeft < 4) arrow.classList.remove("done"); };
    wrap.addEventListener("scroll", upd, {passive:true}); upd();
    // Sliding a finger along the title bar (e.g. "Division 1") scrolls the table under it too.
    const bar = card.querySelector(".std-h");
    if(bar && !bar.dataset.drag && wrap.scrollWidth > wrap.clientWidth){
      bar.dataset.drag = "1"; bar.classList.add("drag");
      let x0 = null, s0 = 0, lastX = 0, lastT = 0, v = 0;
      bar.addEventListener("pointerdown", e=>{ if(e.target.closest("button,a")) return; x0 = e.clientX; s0 = wrap.scrollLeft; lastX = e.clientX; lastT = e.timeStamp; v = 0; });
      bar.addEventListener("pointermove", e=>{ if(x0===null) return; wrap.scrollLeft = s0 - (e.clientX - x0);
        const dt = e.timeStamp - lastT; if(dt>0){ v = (e.clientX - lastX)/dt; lastX = e.clientX; lastT = e.timeStamp; } });
      const end = ()=>{ if(x0===null) return; x0 = null;
        let vel = -v*16; const glide = ()=>{ if(Math.abs(vel) < .5) return; wrap.scrollLeft += vel; vel *= .92; requestAnimationFrame(glide); }; glide(); };
      bar.addEventListener("pointerup", end); bar.addEventListener("pointercancel", end); bar.addEventListener("pointerleave", end);
    }
  });
}
function positionOf(key){
  if(!standings) return null;
  for(const dv of adjustedStandings().divs){ const i = dv.rows.findIndex(r=>keyFor(r.team)===key); if(i>=0) return {pos:i+1, of:dv.rows.length, row:dv.rows[i]}; }
  return null;
}
const ord = n=>n+(["th","st","nd","rd"][(n%100-20)%10]||["th","st","nd","rd"][n%100]||"th");
