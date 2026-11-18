/* Schedule tab: match cards, filters, Results / Upcoming. */
"use strict";

/* ---------- Match card ---------- */
function matchCard(g, opts={}){
  const c = `var(${COMPS[g.comp].v})`;
  const tm = fmtTime(g.time);
  const scored = hasScore(g);
  const hw = scored && g.hs>g.as, aw = scored && g.as>g.hs;
  const teamRow = (code,score,cls)=>`<div class="team ${cls}">${TEAMS[code]?`<button class="nm nmlink" data-teamlink="${esc(code)}" title="Open the ${esc(tn(code))} team page">${esc(tn(code))}</button>`:`<span class="nm">${esc(tn(code))}</span>`}${scored?`<span class="sc">${score}</span>`:""}</div>`;
  const status = scored ? (g.byApp && webDiffers(g) ? `<span class="appsc" title="Reported in the app by the referee">Ref-reported</span>` : "") : (isPast(g) ? `<span class="pending">To be updated</span>` : "");
  const map = mapLink(g.venue);
  const venue = g.venue ? (map ? `<a class="venue" href="${esc(map)}" target="_blank" rel="noopener" title="Open ${esc(g.venue)} in Google Maps">${PIN}${esc(g.venue)}</a>` : `<span>${esc(g.venue)}</span>`) : "";
  const ref = g.refs.length ? `<span class="ref">${JERSEY}${refText(g.refs)}</span>` : "";
  const dateBit = opts.showDate ? `<small>${esc(fmtShort(g.date))}</small>` : `<small>${tm.ap}</small>`;
  return `<article class="match" style="--c:${c}">
    <div class="m-time">${tm.t}${dateBit}</div>
    <div class="teams">${teamRow(g.h,g.hs,hw?"win":(aw?"lose":""))}${teamRow(g.a,g.as,aw?"win":(hw?"lose":""))}</div>
    ${opts.side?`<div class="side">${opts.side(g)}</div>`:""}
    <div class="meta"><span class="pill">${COMPS[g.comp].n}</span>${g.number && state.user && state.user.role==="admin"?`<span class="gno" title="Game number">#${esc(g.number)}</span>`:""}${venue}${ref}${status}</div>${opts.extra?opts.extra(g):""}
  </article>`;
}

/* ---------- Schedule view ---------- */
function renderChips(){
  dropdown($("#compDD"), {label:"Division or cup", value:state.comp,
    options:[{value:"ALL", text:"All Divisions / Cups"}].concat(Object.entries(COMPS).map(([k,v])=>({value:k, text:v.n, color:`var(${v.v})`, pill:true}))),
    onPick:v=>{ state.comp = v; renderSchedule(); }});
  const groups = {D1:[],D2:[],MS:[]};
  Object.entries(TEAMS).forEach(([k,t])=>groups[t.d].push({value:k, text:t.n, color:`var(${COMPS[t.d].v})`, group:t.d}));
  dropdown($("#teamDD"), {label:"Team", value:state.team,
    options:[{value:"ALL", text:"All teams"}].concat(...Object.values(groups).map(a=>a.sort((x,y)=>x.text.localeCompare(y.text)))),
    groupLabel:d=>({text:COMPS[d].n, color:`var(${COMPS[d].v})`}),
    onPick:v=>{ state.team = v; calPick = null; renderSchedule(); }});
  renderCalendarDD();
}
function renderSchedule(){
  renderChips();
  $("#segUp").setAttribute("aria-pressed", state.mode==="up");
  $("#segRes").setAttribute("aria-pressed", state.mode==="res");
  const cal = $("#calDD"); if(cal){ cal.hidden = state.mode!=="up"; if(cal.hidden && openDD===cal) closeDD(); }   // no calendar for games already played
  let list = games.filter(g=> state.mode==="up" ? !isPast(g) : isPast(g));
  if(state.comp!=="ALL") list = list.filter(g=>g.comp===state.comp);
  if(state.team!=="ALL") list = list.filter(g=>g.h===state.team || g.a===state.team);
  list.sort((x,y)=> (x.date+x.time).localeCompare(y.date+y.time) * (state.mode==="up"?1:-1));
  // Two-week window: Upcoming shows the next 2 weeks, Results the last 2 weeks. "See more" adds 2 weeks.
  const up = state.mode==="up";
  const weeks = up ? state.upWeeks : state.resWeeks;
  const edge = new Date(today); edge.setDate(edge.getDate() + (up ? 7*weeks : -7*weeks));
  const inWin = g => up ? parseD(g.date) < edge : parseD(g.date) >= edge;
  const shown = list.filter(inWin), hidden = list.length - shown.length;
  const edgeLabel = (up ? new Date(edge.getTime()-864e5) : edge).toLocaleDateString("en-CA",{month:"short",day:"numeric"});
  $("#count").textContent = "";
  let html = "";
  if(!shown.length){
    html = `<div class="empty">${list.length ? (up?"No games in the next ":"No results in the last ")+weeks+" weeks for these filters." : "No games match these filters. Try “All games” or another team."}</div>`;
  }
  const byDay = new Map();
  shown.forEach(g=>{ if(!byDay.has(g.date)) byDay.set(g.date,[]); byDay.get(g.date).push(g); });
  let n = 0;   // alternate card shades so neighbouring games are easy to tell apart
  byDay.forEach((gs,d)=>{
    const tag = dayTag(d);
    html += `<div class="day"><div class="day-h"><h2>${esc(fmtDay(d))}</h2>${tag?`<span class="tag">${tag}</span>`:""}</div>${gs.map(g=>matchCard(g).replace('<article class="match"', `<article class="match${(n++)%2?" shade":""}"`)).join("")}</div>`;
  });
  if(hidden){
    html += `<button class="btn btn-ghost more" id="seeMore">${up?"See next 2 weeks":"See earlier 2 weeks"}</button>`;
  }
  $("#list").innerHTML = html;
  const more = $("#seeMore");
  if(more) more.onclick = ()=>{ if(up) state.upWeeks += 2; else state.resWeeks += 2; renderSchedule(); };
}
