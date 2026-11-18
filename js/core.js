/* Shared code: team list, data loading, helpers, app state, field map pins, drop-down menus. */
"use strict";

/* ---------- Teams (keyed by the name rasasoccer.ca shows) ---------- */
const TEAMS = {
  "RICHMOND ALL B.":{n:"Richmond All Blacks",d:"D1"}, "RFC HIBS":{n:"RFC Hibs",d:"D1"}, "AC RICHMOND":{n:"AC Richmond",d:"D1"},
  "UNICORN FC":{n:"Unicorn FC",d:"D1"}, "UNITED FC":{n:"United FC",d:"D1"}, "RANGERS FC":{n:"Rangers FC",d:"D1"},
  "FREEBIRD FC":{n:"Freebird FC",d:"D1"}, "HEATHERBRAE":{n:"Heatherbrae",d:"D1"},
  "RICHLADS FC":{n:"Richlads FC",d:"D2"}, "LION ROCK":{n:"Lion Rock",d:"D2"}, "HAMMERS FC":{n:"Hammers FC",d:"D2"},
  "EPFC LIONS":{n:"EPFC Lions",d:"D2"}, "RUFC GRADUATES":{n:"RUFC Graduates",d:"D2"}, "CLUB IRELAND R.":{n:"Club Ireland Rovers",d:"D2"},
  "MAINLAND UNITE.":{n:"Mainland United",d:"D2"}, "WEST COAST CUR.":{n:"West Coast Current",d:"D2"},
  "RICHMOND ATHLE.":{n:"Richmond Athletics FC",d:"MS"}, "RICHMOND OLD B.":{n:"Richmond Old Blacks",d:"MS"},
  "RAIN CITY GUNN.":{n:"Rain City Gunners",d:"MS"}, "GLORY FC":{n:"Glory FC",d:"MS"}
};
const COMPS = {
  D1:{n:"Division 1",v:"--d1"}, D2:{n:"Division 2",v:"--d2"}, MS:{n:"Masters",v:"--ms"}, XO:{n:"Cross-over",v:"--xo"}, CUP:{n:"League's Cup",v:"--cup"}
};
// Officials' names as written on rasasoccer.ca, with a capital first letter for display ("billy Cheng" -> "Billy Cheng").
const nameCase = s=>String(s).trim().replace(/(^|[\s-])([a-z])/g,(m,p,c)=>p+c.toUpperCase());
let OFFICIALS = [];

// Game type. The website's game number decides it when we have one: d1-/d2-/m- are division games,
// "LC…" is League's Cup, and a double number like "m-9-22 / 2-8-C9" is a cross-over that counts for both divisions.
// Without a number: Masters vs Division 2 is a cross-over; any other mix of divisions is League's Cup.
function compOf(num, dh, da){
  if(num){
    if(/^LC/i.test(num)) return "CUP";
    if(num.includes("/")) return "XO";
    if(/^d1-/i.test(num)) return "D1";
    if(/^d2-/i.test(num)) return "D2";
    if(/^m-/i.test(num)) return "MS";
  }
  if(!dh || !da) return "CUP";
  if(dh===da) return dh;
  const pair = [dh,da].sort().join("+");
  return pair==="D2+MS" ? "XO" : "CUP";
}
/* Scores reported in the app by referees (or entered by admins). Kept apart from the website copy,
   so the daily refresh from rasasoccer.ca never overwrites them. In the app, these always win.
   Prototype: kept in memory. With the back end they live in the database. */
const appScores = {};
const scoreKey = g=>g.number || `${g.date}|${[g.h,g.a].sort().join("|")}`;
function setAppScore(g, hs, as, by){
  appScores[scoreKey(g)] = {hs:+hs, as:+as, by, at:new Date()};
  g.hs = +hs; g.as = +as; g.byApp = true;
}
const webDiffers = g=> g.byApp && (g.webHs===null || g.webAs===null || g.webHs!==g.hs || g.webAs!==g.as);
let games = [];
let dataInfo = {updatedAt:null};
let standings = null;
let rosters = null;
const FULL2KEY = {}; Object.entries(TEAMS).forEach(([k,t])=>FULL2KEY[t.n.toLowerCase()]=k);
const keyFor = name=>FULL2KEY[String(name).toLowerCase()] || (TEAMS[String(name).toUpperCase()] ? String(name).toUpperCase() : null);
function loadGames(data){
  dataInfo.updatedAt = data.updatedAt || null;
  games = (data.games||[]).map((g,i)=>{
    const h=String(g.home||"").toUpperCase().trim(), a=String(g.away||"").toUpperCase().trim();
    const dh = TEAMS[h] && TEAMS[h].d, da = TEAMS[a] && TEAMS[a].d;
    const refs = Array.isArray(g.officials) ? g.officials.map(nameCase).filter(Boolean) : [];
    return {id:i, date:g.date, time:g.time||"00:00", h, a, venue:g.venue||"",
            hs: (g.homeScore===null||g.homeScore===undefined)?null:+g.homeScore,
            as: (g.awayScore===null||g.awayScore===undefined)?null:+g.awayScore,
            number: String(g.number||"").trim(), comp: compOf(String(g.number||"").trim(), dh, da), refs};
  });
  games.forEach(g=>{ g.webHs = g.hs; g.webAs = g.as; const s = appScores[scoreKey(g)]; if(s){ g.hs = s.hs; g.as = s.as; g.byApp = true; } });
  OFFICIALS = [...new Set(games.flatMap(g=>g.refs))].sort((x,y)=>x.localeCompare(y));
}

/* ---------- Users (prototype only) ---------- */
const USERS = {
  "manager@hammers.demo":{role:"manager", name:"Alex Morgan", team:"HAMMERS FC"},
  "ref@rasa.demo":{role:"referee", name:"Demo Referee", resetRequested:"Nov 5"},
  "admin@rasa.demo":{role:"admin", name:"League Admin"},
  // League president. Only a SHA-256 hash of the password is stored here, never the password itself.
  "president@rasasoccer.ca":{role:"admin", name:"D. Pascual", title:"President", pwHash:"924c22b7c99d6d27aa74ac0997ace8b45d3b90f4e07b4864c974a328b641471e"}
};
const ROLE_LABEL = {manager:"Manager", referee:"Referee", admin:"Administrator", player:"Player"};
Object.values(USERS).forEach(u=>u.confirmed=true);
const DEMO_PW = {}; // passwords for accounts created in this preview (memory only)
let pendingEmail = null;
const titleOf = u=>u.title ? `${ROLE_LABEL[u.role]}, ${u.title}` : (u.role==="manager" && u.team ? `Manager, ${tn(u.team)}` : (u.role==="referee" && u.official ? `Referee, ${u.official}` : ROLE_LABEL[u.role]));
async function sha256(s){ const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join(""); }
async function passwordOK(email, pw){
  const u = USERS[email]; if(!u) return false;
  if(u.pwHash){ try{ return (await sha256(pw)) === u.pwHash; }catch(e){ return false; } }
  if(DEMO_PW[email]) return pw === DEMO_PW[email];
  return pw === "rasa2026";
}

/* ---------- Helpers ---------- */
const $ = s=>document.querySelector(s);
const esc = s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
// Referee jersey icon (black and white stripes). The first official listed is the referee, the next two are assistants.
const JERSEY = `<svg class="jersey" viewBox="0 0 20 18" width="16" height="15" aria-hidden="true"><use href="#jersey"/></svg>`;
const refText = r=>`<span>Ref: ${esc(r[0])}</span>${r.length>1?`<span class="ars">AR: ${r.slice(1).map(esc).join(", ")}</span>`:""}`;
const tn = c=>TEAMS[c] ? TEAMS[c].n : c.toLowerCase().replace(/\b([a-z])/g,m=>m.toUpperCase()).replace(/\bLc(\d)/,"LC$1");
const today = new Date(); today.setHours(0,0,0,0);
const parseD = s=>{const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d);};
const isPast = g=>{const [hh,mm]=g.time.split(":").map(Number); const d=parseD(g.date); d.setHours(hh,mm+90); return d < new Date();};
const hasScore = g=>g.hs!==null && g.as!==null;
const fmtTime = t=>{let [h,m]=t.split(":").map(Number); const ap=h>=12?"PM":"AM"; h=h%12||12; return {t:h+":"+String(m).padStart(2,"0"), ap};};
const fmtDay = s=>parseD(s).toLocaleDateString("en-CA",{weekday:"long",month:"short",day:"numeric"});
const fmtShort = s=>parseD(s).toLocaleDateString("en-CA",{weekday:"short",month:"short",day:"numeric"});
function dayTag(s){
  const diff = Math.round((parseD(s)-today)/864e5);
  if(diff===0) return "Today"; return "";
}
function toast(msg){const t=$("#toast"); t.textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true,2600);}

/* ---------- State ---------- */
// Lookup-only mode for now: Schedule, Standings and Leaders. Sign-in and Game Report are switched off
// (their code stays, ready to turn back on with the back end).
// Note: the website lists the AWAY team first, so in our data g.h is the away team and g.a the home team.
const HOME = g=>g.a, AWAY = g=>g.h;
const FEATURES = {accounts:false, gameReport:true};   // gameReport: the "Game Reports" menu (Ref Reports + Team Reports), no sign-in needed
const state = { view:"schedule", mode:"up", comp:"ALL", team:"ALL", user:null, upWeeks:2, resWeeks:2, refView:"Kanwal Sangha", teamMode:"up", adminWeeks:2, refMode:"up", adminFilter:null, adminMode:"games", ldF:{g:"ALL",a:"ALL",k:"ALL"}, ldTab:"g", stdTab:"D1", teamKey:null, teamTab:"up", rr:{step:"who", name:"", email:"", days:14}, tr:{step:"who", name:"", email:"", team:"", days:14} };

/* ---------- Field locations ----------
   Addresses from the Location Maps page on rasasoccer.ca. Each schedule venue name maps to its park or school;
   names not listed here fall back to a Google Maps search for "<name>, Richmond, BC". */
const FIELDS = [
  [/hugh\s*boyd/i,      "Hugh Boyd Park, 4040 Francis Rd, Richmond, BC"],
  [/king\s*george/i,    "King George Park, 4100 No. 5 Road, Richmond, BC"],
  [/macneil/i,          "A.R. MacNeill Secondary School, 6611 No. 4 Rd, Richmond, BC"],
  [/mcnair/i,           "Matthew McNair Secondary, 9500 No. 4 Rd, Richmond, BC"],
  [/minoru/i,           "Minoru Park, 7191 Granville Ave, Richmond, BC"],
  [/richmond\s*high/i,  "Richmond Secondary School, 7171 Minoru Blvd, Richmond, BC"],
  [/mcmath/i,           "R.A. McMath Secondary, 4251 Garry St, Richmond, BC"],
  [/london/i,           "London Secondary School, 6600 Williams Rd, Richmond, BC"],
  [/manoah|steves/i,    "Manoah Steves Elementary, 10111 Fourth Ave, Richmond, BC"],
  [/south\s*arm/i,      "South Arm Park, Richmond, BC"]
];
// Exact pins for each field, supplied by the league. Checked first; the park addresses above are the fallback.
const FIELD_PINS = [
  [/hugh\s*boyd\W*red/i,   "https://maps.app.goo.gl/pQwqAB7nWvmvmJ8J6"],
  [/hugh\s*boyd\W*blue/i,  "https://maps.app.goo.gl/3NZuufu9SCaf1Zgv8"],
  [/hugh\s*boyd\W*oval/i,  "https://maps.app.goo.gl/Pf5Mj5nR49rKxTTt6"],
  [/hugh\s*boyd\W*south/i, "https://maps.app.goo.gl/tn9ng9k9PbFDX9CMA"],
  [/mac\s*neill?\W*north/i, "https://maps.app.goo.gl/RvmxWJL3US9WB8g48"],
  [/mac\s*neill?\W*south/i, "https://maps.app.goo.gl/2N3RKwXpdRDfBCdH7"],
  [/richmond\s*high/i,      "https://maps.app.goo.gl/fFhccXAw6F6FH1oh6"],
  [/king\s*george/i,        "https://maps.app.goo.gl/CnUgCLmYB2RJU2s38"],
  [/minoru\W*oval/i,        "https://maps.app.goo.gl/ppvnEuEzwm6VSPF68"],
  [/minoru\W*3\b/i,         "https://maps.app.goo.gl/zR7aZngbKNHGUutK6"],
  [/minoru\W*2\b/i,         "https://maps.app.goo.gl/kUjuC5abEZHNn3S2A"],
  [/south\s*arm\W*1\b/i,    "https://maps.app.goo.gl/3fSPq96UiDNkoXKe8"],
  [/south\s*arm\W*3\b/i,    "https://maps.app.goo.gl/Q5r14j1fHB6PsRjh9"],
  [/south\s*arm\W*4\b/i,    "https://maps.app.goo.gl/eZMJphywxoAjzwsx5"],
  [/london/i,               "https://maps.app.goo.gl/tpyB6q6h3DgQhHNW6"],
  [/mcnair/i,               "https://maps.app.goo.gl/QzLTyeNfBYdbUtAY9"]
];
function mapLink(venue){
  const v = String(venue||"").trim();
  if(!v || /^(tba|tbd)$/i.test(v)) return "";
  const pin = FIELD_PINS.find(([re])=>re.test(v)); if(pin) return pin[1];
  const hit = FIELDS.find(([re])=>re.test(v));
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(hit ? hit[1] : v + ", Richmond, BC");
}
const PIN = `<svg class="pin" viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/></svg>`;

/* ---------- Themed drop-down ----------
   A button that opens a menu under it (replaces the phone's own select menus).
   Options can carry a division colour (shown as a pill or a dot) and a group (division headings). */
let openDD = null;
function closeDD(focusBtn){ if(!openDD) return; const d = openDD; openDD = null; d.classList.remove("open"); const b = d.querySelector(".dd-btn"); b.setAttribute("aria-expanded","false"); if(focusBtn) b.focus(); }
function dropdown(el, cfg){
  const cur = cfg.options.find(o=>o.value===cfg.value) || cfg.options[0];
  const id = el.id + "-menu";
  const item = o=>`<li role="option" id="${id}-${esc(o.value).replace(/[^\w-]/g,"_")}" data-ddval="${esc(o.value)}" aria-selected="${o.value===cur.value}" tabindex="-1" class="dd-opt${o.value===cur.value?" sel":""}">
      ${o.pill ? `<span class="pill" style="--c:${o.color}">${esc(o.text)}</span>` : `${o.color?`<span class="dot" style="background:${o.color}"></span>`:""}<span>${esc(o.text)}</span>`}
      ${o.value===cur.value?`<svg class="tick" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`:""}</li>`;
  let list = "", lastGroup = null;
  cfg.options.forEach(o=>{ if(o.group && o.group!==lastGroup && cfg.groupLabel){ const g = cfg.groupLabel(o.group); list += `<li class="dd-group" role="presentation" style="--c:${g.color}">${esc(g.text)}</li>`; lastGroup = o.group; } list += item(o); });
  el.innerHTML = `<button type="button" class="dd-btn${cur.value!=="ALL"?" set":""}" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}" aria-label="${esc(cfg.label)}: ${esc(cur.text)}"${cur.color?` style="--c:${cur.color}"`:""}>
      ${cur.color?`<span class="dot" style="background:${cur.color}"></span>`:""}<span class="dd-txt">${esc(cur.text)}</span>
      <svg class="chev" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    <ul class="dd-menu" role="listbox" id="${id}" aria-label="${esc(cfg.label)}">${list}</ul>`;
  const btn = el.querySelector(".dd-btn"), menu = el.querySelector(".dd-menu");
  const opts = ()=>[...menu.querySelectorAll(".dd-opt")];
  const open = ()=>{ closeDD(); openDD = el; el.classList.add("open"); btn.setAttribute("aria-expanded","true");
    const s = menu.querySelector(".dd-opt.sel") || opts()[0]; s.focus({preventScroll:true}); s.scrollIntoView({block:"nearest"}); };
  const pick = v=>{ closeDD(true); if(v!==cfg.value) cfg.onPick(v); };
  btn.onclick = e=>{ e.stopPropagation(); openDD===el ? closeDD() : open(); };
  btn.onkeydown = e=>{ if(e.key==="ArrowDown"||e.key==="ArrowUp"){ e.preventDefault(); open(); } };
  menu.onclick = e=>{ const o = e.target.closest(".dd-opt"); if(o){ e.stopPropagation(); pick(o.dataset.ddval); } };
  menu.onkeydown = e=>{
    const list = opts(), i = list.indexOf(document.activeElement);
    if(e.key==="ArrowDown"){ e.preventDefault(); (list[i+1]||list[i]).focus(); }
    else if(e.key==="ArrowUp"){ e.preventDefault(); (list[i-1]||list[i]).focus(); }
    else if(e.key==="Home"){ e.preventDefault(); list[0].focus(); }
    else if(e.key==="End"){ e.preventDefault(); list[list.length-1].focus(); }
    else if(e.key==="Enter"||e.key===" "){ e.preventDefault(); if(i>=0) pick(list[i].dataset.ddval); }
    else if(e.key==="Escape"){ e.preventDefault(); closeDD(true); }
    else if(e.key==="Tab"){ closeDD(); }
  };
}
document.addEventListener("click", e=>{ if(openDD && !openDD.contains(e.target)) closeDD(); });

(function(){ const tb = document.querySelector(".topbar"); if(!tb) return;
  const set = ()=>document.documentElement.style.setProperty("--topbar-h", tb.offsetHeight + "px"); set();
  if(window.ResizeObserver) new ResizeObserver(set).observe(tb); else addEventListener("resize", set); })();
