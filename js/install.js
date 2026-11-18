/* Install the app / Open in app prompts. */
"use strict";

/* ---------- Install the app ----------
   Header button. Android / Chrome / Edge: shows the browser's own install prompt.
   iPhone / iPad (no install prompt exists): shows how to use Share > Add to Home Screen.
   Hidden when the app is already running from the home screen. */
const isInstalled = ()=> (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
const isIOS = ()=> /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints > 1);
const isMobile = ()=> isIOS() || /android|mobile/i.test(navigator.userAgent);
// "Installed on this device" memory. Android and computers share storage between the browser and the
// installed app, so the app marks itself when it runs from the home screen. (iPhones keep them separate.)
const INSTALLED_KEY = "rasa.installed";
const markInstalled = on=>{ try{ on ? localStorage.setItem(INSTALLED_KEY,"1") : localStorage.removeItem(INSTALLED_KEY); }catch(e){} };
const knownInstalled = ()=>{ try{ return localStorage.getItem(INSTALLED_KEY)==="1"; }catch(e){ return false; } };
if(isInstalled()) markInstalled(true);
if(window.__installPrompt) markInstalled(false);
// Chrome on Android can confirm it directly. Only a "yes" is trusted; removal is detected by the browser offering install again.
if(!isInstalled() && navigator.getInstalledRelatedApps){
  navigator.getInstalledRelatedApps().then(list=>{ if(list.length){ markInstalled(true); renderInstall(); } }).catch(()=>{});
}
const DL_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M11 3h2v9.6l3.3-3.3 1.4 1.4L12 16.4l-5.7-5.7 1.4-1.4 3.3 3.3V3Zm-6 15h14v2H5v-2Z"/></svg>`;
const OPEN_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14V3ZM5 5h6v2H6v11h11v-5h2v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/></svg>`;
function renderInstall(){
  const a = $("#installArea"); if(!a) return;
  if(isInstalled()){ a.innerHTML = ""; return; }                       // already inside the app
  const installed = window.__appInstalled || knownInstalled();
  if(installed){
    a.innerHTML = `<button type="button" class="install-btn" id="installBtn">${OPEN_ICON}<span class="il">Open<span class="il-long"> app</span></span></button>`;
    $("#installBtn").onclick = openInApp; return;
  }
  const show = window.__installPrompt || isMobile();
  a.innerHTML = show ? `<button type="button" class="install-btn" id="installBtn">${DL_ICON}<span class="il">Install<span class="il-long"> app</span></span></button>` : "";
  const b = $("#installBtn"); if(b) b.onclick = installApp;
}
// Web pages aren't allowed to launch an installed app, so show the quickest way in for this device.
function openInApp(){
  const android = /android/i.test(navigator.userAgent);
  showModal(`<h2 id="reportTitle">Open the RASA app</h2>
    <p class="sub">RASA is installed on this device. The app opens full screen with the latest schedule each time.</p>
    <ol class="install-steps">${android
      ? `<li>Tap the <b>⋮</b> menu at the top right of Chrome.</li>
         <li>Tap <b>Open in RASA</b> (or <b>Open in app</b>).</li>
         <li>Next time, just tap the <b>RASA</b> icon on your home screen.</li>`
      : isMobile()
      ? `<li>Go to your home screen.</li><li>Tap the <b>RASA</b> icon.</li>`
      : `<li>Click the <b>Open in app</b> icon at the right end of the address bar, or</li>
         <li>Open <b>RASA</b> from your Start menu, Dock or Applications.</li>`}</ol>
    <div class="actions"><button type="button" class="btn btn-ghost" id="notInstalled">I don’t have it</button><button type="button" class="btn btn-primary" id="reportCancel">Got it</button></div>`, "view");
  $("#notInstalled").onclick = ()=>{ markInstalled(false); window.__appInstalled = false; closeReport(); renderInstall(); };
}
async function installApp(){
  const ev = window.__installPrompt;
  if(ev){
    ev.prompt();
    try{ const c = await ev.userChoice; if(c && c.outcome==="accepted"){ window.__installPrompt = null; window.__appInstalled = true; markInstalled(true); renderInstall(); } }catch(e){}
    return;
  }
  const share = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" style="vertical-align:-3px"><path fill="currentColor" d="M12 2 7.5 6.5l1.4 1.4L11 5.8V15h2V5.8l2.1 2.1 1.4-1.4L12 2ZM5 10v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10h-3v2h1v8H7v-8h1v-2H5Z"/></svg>`;
  const ios = isIOS();
  showModal(`<h2 id="reportTitle">Install the RASA app</h2>
    <p class="sub">Adds RASA to your home screen so it opens like an app, full screen, with the latest schedule each time.</p>
    <ol class="install-steps">${ios
      ? `<li>Open <b>app.rasasoccer.ca</b> in <b>Safari</b> (or Chrome on newer iPhones).</li>
         <li>Tap the <b>Share</b> button ${share} at the bottom of the screen (top right on iPad).</li>
         <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>`
      : `<li>Open <b>app.rasasoccer.ca</b> in <b>Chrome</b>.</li>
         <li>Tap the <b>⋮</b> menu at the top right.</li>
         <li>Tap <b>Install app</b> or <b>Add to Home screen</b>, then <b>Install</b>.</li>`}</ol>
    <div class="actions"><button type="button" class="btn btn-primary" id="reportCancel">Got it</button></div>`, "view");
}
document.addEventListener("installable", ()=>{ markInstalled(false); window.__appInstalled = false; renderInstall(); });
window.addEventListener("appinstalled", ()=>{ window.__installPrompt = null; window.__appInstalled = true; markInstalled(true); renderInstall(); });
renderInstall();
