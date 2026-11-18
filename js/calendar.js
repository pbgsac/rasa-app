/* Add to Calendar: team search menu and the Google / Apple / Outlook / Download instructions. */
"use strict";

/* ---------- Add to Calendar ----------
   Subscribes the phone's calendar to a live feed of games (all games, or one team), published by the data sync
   at app.rasasoccer.ca/calendar/<team>.ics. Rescheduled games update in people's calendars on their own.
   iPhone/iPad: Apple Calendar subscribe prompt (webcal). Android: Google Calendar's "add by URL".
   Computers: a short chooser (Apple/Outlook, Google, or download the file). */
const CAL_HOST = "app.rasasoccer.ca";
const calSlug = name=>String(name).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
let calPick = null, calQuery = "";
const CAL_TICK = `<svg class="tick" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const calNorm = s=>String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
function calMatches(q){                         // teams whose name has a word starting with what was typed (or contains it)
  const n = calNorm(q); if(!n) return [];
  const all = Object.entries(TEAMS).map(([k,t])=>({k, t, name:calNorm(t.n)}));
  const starts = all.filter(x=>(" "+x.name).includes(" "+n)), rest = all.filter(x=>!starts.includes(x) && x.name.replace(/ /g,"").includes(n.replace(/ /g,"")));
  return [...starts, ...rest].map(x=>x.k);
}
function calListHtml(){
  const opt = (value, text, icon)=>{ const on = value===calPick;
    return `<li role="option" tabindex="-1" class="dd-opt${on?" sel":""}" data-calval="${esc(value)}" aria-selected="${on}">${icon}<span>${esc(text)}</span>${on?CAL_TICK:""}</li>`; };
  const dot = k=>`<span class="dot" style="background:var(${COMPS[TEAMS[k].d].v})"></span>`;
  const q = calQuery.trim();
  let html = "";
  if(!q){
    if(TEAMS[calPick]) html += opt(calPick, TEAMS[calPick].n, dot(calPick));
  } else {
    const ks = calMatches(q);
    html = ks.length ? ks.map(k=>opt(k, TEAMS[k].n, dot(k))).join("") : `<li class="cal-empty" role="presentation">No team matches “${esc(q)}”</li>`;
  }
  return html;
}
// Phones: when the keyboard opens, scroll the page so the search box sits just under the sticky header,
// and size the results to the space left above the keyboard.
function calLiftForKeyboard(input){
  if(!matchMedia("(pointer:coarse)").matches) return;
  const fit = ()=>{
    const top = ($(".topbar") ? $(".topbar").getBoundingClientRect().bottom : 0) + 8;
    const r = input.getBoundingClientRect();
    if(Math.abs(r.top - top) > 4) window.scrollBy({top: r.top - top, behavior:"smooth"});
    const vv = window.visualViewport, visible = vv ? vv.height : innerHeight;
    const list = $("#calDD .cal-list"); if(list) list.style.maxHeight = Math.max(140, visible - top - r.height - 20) + "px";
  };
  setTimeout(fit, 60); setTimeout(fit, 350);                    // once now, once after the keyboard has finished opening
  if(window.visualViewport && !calLiftForKeyboard.on){ calLiftForKeyboard.on = true;
    visualViewport.addEventListener("resize", ()=>{ const i = $("#calSearch"); if(i && document.activeElement===i) fit(); }); }
}
function calRefresh(){                          // update the list and the Add button without rebuilding the search box
  const el = $("#calDD"); if(!el) return;
  el.querySelector(".cal-list").innerHTML = calListHtml();
  const add = el.querySelector("#calAdd"); add.disabled = !TEAMS[calPick];
  add.textContent = TEAMS[calPick] ? "Add " + TEAMS[calPick].n : "Type your team above";
  el.querySelector(".cal-clear").hidden = !calQuery;
  el.classList.toggle("has-q", !!calQuery.trim());
}
function renderCalendarDD(){
  const el = $("#calDD"); if(!el) return;
  if(calPick===null) calPick = state.team==="ALL" ? "" : state.team;   // "" = no team picked yet (all-games feed is kept for a future admin screen)
  const wasOpen = el.classList.contains("open");
  el.innerHTML = `<button type="button" class="dd-btn cal-btn" aria-haspopup="dialog" aria-expanded="${wasOpen}" aria-controls="calMenu">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M7 2h2v2h6V2h2v2h3a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3V2Zm12 8H5v9h14v-9ZM11 11h2v2.5h2.5v2H13V18h-2v-2.5H8.5v-2H11V11Z"/></svg>
      <span class="dd-txt">Add to Calendar</span>
      <svg class="chev" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    <div class="dd-menu cal-menu" id="calMenu" role="dialog" aria-label="Add games to your calendar">
      <p class="cal-help">Type your team to add its games. Your calendar keeps them up to date if a game moves.</p>
      <div class="cal-search"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M10 3a7 7 0 0 1 5.6 11.2l4.6 4.6-1.4 1.4-4.6-4.6A7 7 0 1 1 10 3Zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z"/></svg>
        <input type="text" id="calSearch" placeholder="Type your team" aria-label="Type your team" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" value="${esc(calQuery)}">
        <button type="button" class="cal-clear" aria-label="Clear" ${calQuery?"":"hidden"}>×</button></div>
      <ul class="cal-list" role="listbox" aria-label="Games to add">${calListHtml()}</ul>
      <div class="cal-foot"><button type="button" class="btn btn-primary cal-add" id="calAdd"></button></div>
    </div>`;
  const btn = el.querySelector(".dd-btn"), menu = el.querySelector(".cal-menu"), input = el.querySelector("#calSearch");
  calRefresh();
  btn.onclick = e=>{ e.stopPropagation(); if(openDD===el){ closeDD(); return; } closeDD(); openDD = el; el.classList.add("open"); btn.setAttribute("aria-expanded","true");
    calQuery = ""; input.value = ""; calRefresh(); if(!matchMedia("(pointer:coarse)").matches) input.focus({preventScroll:true}); };   // phones: keyboard only when the box is tapped
  input.oninput = ()=>{ calQuery = input.value; calRefresh(); };
  input.onfocus = ()=>{ if(matchMedia("(pointer:coarse)").matches) el.classList.add("typing"); calLiftForKeyboard(input); };
  input.onblur = ()=>{ setTimeout(()=>{ if(document.activeElement!==input) el.classList.remove("typing"); }, 150); };
  menu.onclick = e=>{ e.stopPropagation();
    if(e.target.closest(".cal-clear")){ calQuery = ""; input.value = ""; calRefresh(); input.focus(); return; }
    const o = e.target.closest("[data-calval]");
    if(o){ calPick = o.dataset.calval; calQuery = ""; input.value = ""; calRefresh(); input.blur(); return; }   // picked: show the choice and the Add button
    if(e.target.closest("#calAdd")){ if(TEAMS[calPick]) addToCalendar(calPick); return; } };
  menu.onkeydown = e=>{ const list=[...menu.querySelectorAll(".dd-opt")], i=list.indexOf(document.activeElement);
    if(e.key==="ArrowDown"){ e.preventDefault(); (list[i+1]||list[i]||list[0]).focus(); }
    else if(e.key==="ArrowUp"){ e.preventDefault(); if(i<=0) input.focus(); else list[i-1].focus(); }
    else if(e.key==="Enter" && document.activeElement===input){ e.preventDefault(); if(list.length===1 || (calQuery && list.length)){ list[0].click(); } }
    else if((e.key==="Enter"||e.key===" ") && i>=0){ e.preventDefault(); list[i].click(); menu.querySelector("#calAdd").focus(); }
    else if(e.key==="Escape"){ e.preventDefault(); closeDD(true); } };
}
let calTab = null;
function addToCalendar(pick){
  const name = pick==="ALL" ? "all games" : (TEAMS[pick] ? TEAMS[pick].n : "");
  const file = pick==="ALL" ? "all.ics" : calSlug(TEAMS[pick].n) + ".ics";
  const link = {name, https:`https://${CAL_HOST}/calendar/${file}`, webcal:`webcal://${CAL_HOST}/calendar/${file}`};
  if(!calTab) calTab = isIOS() || /mac/i.test(navigator.platform) ? "apple" : "google";
  closeDD();
  const tab = (k, label)=>`<button type="button" role="tab" class="cal-tab${k==="dl"?" cal-tab-dl":""}" data-caltab="${k}" aria-selected="${calTab===k}">${label}</button>`;
  showModal(`<div class="cal-head"><h2 id="reportTitle" class="cal-title">Add ${esc(name)} to calendar</h2>
      <button type="button" class="cal-x" id="reportCancel" aria-label="Close"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></button></div>
    <div class="cal-tabs" role="tablist" aria-label="Calendar app">${tab("google","Google")}${tab("apple","Apple")}${tab("outlook","Outlook")}${tab("dl","Download file")}</div>
    <div class="cal-pane" id="calPane" role="tabpanel"></div>`, "view");
  const pane = $("#calPane");
  const show = k=>{ calTab = k;
    document.querySelectorAll(".cal-tab").forEach(b=>b.setAttribute("aria-selected", b.dataset.caltab===k));
    pane.innerHTML = calInstructions(k, link); wireCalPane(pane, link); };
  document.querySelectorAll(".cal-tab").forEach(b=>b.onclick = ()=>show(b.dataset.caltab));
  show(calTab);
}
function calInstructions(k, l){
  const phone = isMobile(), ios = isIOS();
  const copy = `<div class="cal-link"><input type="text" readonly value="${esc(l.https)}" aria-label="Calendar link" class="cal-link-in">
      <button type="button" class="btn btn-primary cal-copy">Copy</button></div>${navigator.share?`<button type="button" class="linkbtn cal-share">Share link…</button>`:""}`;
  const live = `<p class="cal-wait"><b>Give it time:</b> the games can take a few hours (sometimes up to a day) to first show up on your phone. After that, your calendar stays up to date on its own. If a game moves, it changes there too, usually within a few hours.</p>`;
  if(k==="google") return (phone ? `
    <p class="cal-lead">Google only lets you subscribe from a computer. Do it once and the games appear on your phone too.</p>
    <ol class="cal-steps">
      <li><b>Copy the link</b>${navigator.share?" (or share it to yourself)":""}:${copy}</li>
      <li>On a computer, go to <b>calendar.google.com</b>. Click <b>+</b> next to <b>Other calendars</b>, then <b>From URL</b>. Paste the link and click <b>Add calendar</b>.</li>
      <li>It then shows in the Google Calendar app on your phone. If not, open the app’s <b>Settings</b>, tap the RASA calendar and turn on <b>Sync</b>.</li>
    </ol>` : `
    <a class="btn btn-primary cal-go" href="https://calendar.google.com/calendar/render?cid=${encodeURIComponent(l.webcal)}" target="_blank" rel="noopener">Open in Google Calendar</a>
    <p class="cal-lead">Then click <b>Add</b>. If that doesn’t work:</p>
    <ol class="cal-steps">
      <li>Copy the link:${copy}</li>
      <li>In <b>calendar.google.com</b>, click <b>+</b> next to <b>Other calendars</b>, then <b>From URL</b>. Paste the link and click <b>Add calendar</b>.</li>
    </ol>`) + live;
  if(k==="apple") return (ios || !phone ? `
    <a class="btn btn-primary cal-go" href="${esc(l.webcal)}">Subscribe in Apple Calendar</a>
    <p class="cal-lead">${ios?"Tap <b>Subscribe</b>, then <b>Add</b>.":"Calendar opens on your Mac. Click <b>Subscribe</b>, then <b>OK</b>."} If nothing happens:</p>
    <ol class="cal-steps">
      <li>Copy the link:${copy}</li>
      ${ios?`<li>Open <b>Settings → Apps → Calendar → Calendar Accounts → Add Account → Other → Add Subscribed Calendar</b>. Paste the link, tap <b>Next</b>, then <b>Save</b>.</li>`
           :`<li>In Calendar on your Mac, choose <b>File → New Calendar Subscription</b>. Paste the link and click <b>Subscribe</b>.</li>`}
    </ol>` : `
    <p class="cal-lead">Apple Calendar is on iPhone, iPad and Mac. Open <b>app.rasasoccer.ca</b> on one of those and choose Apple, or:</p>
    <ol class="cal-steps">
      <li>Copy the link:${copy}</li>
      <li>On an iPhone, open <b>Settings → Apps → Calendar → Calendar Accounts → Add Account → Other → Add Subscribed Calendar</b> and paste it.</li>
    </ol>`) + live;
  if(k==="outlook") return `
    ${phone?`<p class="cal-lead">The Outlook phone app can’t subscribe by itself. Add it once on the web or a computer and it shows in the app.</p>`:""}
    <ol class="cal-steps">
      <li>Copy the link:${copy}</li>
      <li><b>Outlook on the web or the new Outlook:</b> open <b>Calendar</b>, click <b>Add calendar</b>, then <b>Subscribe from web</b>. Paste the link, name it “RASA” and click <b>Import</b>.</li>
      <li><b>Classic Outlook for Windows:</b> in Calendar, choose <b>Home → Add Calendar → From Internet</b>, paste the link and click <b>OK</b>, then <b>Yes</b>.</li>
    </ol>` + live;
  return `
    <a class="btn btn-primary cal-go" href="${esc(l.https)}" download="RASA ${esc(l.name)}.ics">Download file (.ics)</a>
    <p class="cal-lead">${ios?"Tap the downloaded file, then <b>Add All</b>.":phone?"Open the downloaded file and choose your calendar app to add the games.":"Open the file to add the games to your calendar app. For Google, use <b>Settings → Import & export → Import</b>."}</p>
    <p class="cal-note cal-warn">This adds the games once. They <b>won’t update</b> if a game moves. To stay up to date, use Google, Apple or Outlook above.</p>`;
}
function wireCalPane(pane, l){
  const inp = pane.querySelector(".cal-link-in"), copy = pane.querySelector(".cal-copy"), sh = pane.querySelector(".cal-share");
  if(inp) inp.onfocus = ()=>inp.select();
  if(copy) copy.onclick = async ()=>{ let ok = false;
    try{ await navigator.clipboard.writeText(l.https); ok = true; }catch(e){ inp.focus(); inp.select(); try{ ok = document.execCommand("copy"); }catch(_){} }
    copy.textContent = ok ? "Copied ✓" : "Select & copy"; setTimeout(()=>{ copy.textContent = "Copy"; }, 2500); };
  if(sh) sh.onclick = ()=>navigator.share({title:`RASA – ${l.name} calendar`, text:"RASA calendar link: add it as a subscribed calendar", url:l.https}).catch(()=>{});
}
