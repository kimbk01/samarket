/**
 * Single source for Startup Intro + Local AppShell (header + BottomNav) markup/CSS.
 * Used by:
 * - scripts/build-startup-shell.mjs → self-contained APK/iOS boot HTML
 * - app/layout.tsx → remote web first-HTML intro (intro-only fragment)
 *
 * DO NOT: fetch remote assets inside boot HTML · duplicate intro markup elsewhere.
 */

import { BUNDLED_STARTUP_NAV, type StartupNavTabCache } from "@/lib/startup/startup-cache";
import {
  BUNDLED_STARTUP_CONFIG,
  isStartupIntroActive,
  type StartupConfig,
} from "@/lib/startup/startup-config";
import { DIBAY_STARTUP_INTRO_DOM_ID } from "@/lib/startup/startup-constants";

export type StartupShellBuildOptions = {
  config?: StartupConfig;
  logoSrc?: string;
  darkLogoSrc?: string;
  navTabs?: readonly StartupNavTabCache[];
  /** Absolute origin for handoff (e.g. https://samarket.vercel.app) — empty = location.origin */
  remoteOrigin?: string;
  defaultRoute?: string;
  lang?: "ko" | "en";
};

const NAV_ICON_SVG: Record<string, string> = {
  community:
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  trade:
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>',
  stores:
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/><path d="M2 4h20"/></svg>',
  chat:
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>',
  my:
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function iconForTab(id: string): string {
  if (id === "home") return NAV_ICON_SVG.trade;
  return NAV_ICON_SVG[id] ?? NAV_ICON_SVG.my;
}

function tabLabel(tab: StartupNavTabCache, lang: "ko" | "en"): string {
  if (lang === "ko" && tab.labelKo) return tab.labelKo;
  if (lang === "en" && tab.labelEn) return tab.labelEn;
  return tab.label;
}

/** Shared CSS for intro + shell (inline only). */
export function buildStartupShellCss(): string {
  return `
:root{--sam-bg-app:#FFFCFC;--sam-fg:#0B421A;--sam-muted:#5C6B63;--sam-border:#E6EBE8;--sam-surface:#FFFFFF;--sam-primary:#0B421A;--safe-bottom:env(safe-area-inset-bottom,0px);--safe-top:env(safe-area-inset-top,0px)}
html,body{margin:0;padding:0;height:100%;background:var(--sam-bg-app);color:var(--sam-fg);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans KR",sans-serif;-webkit-tap-highlight-color:transparent}
*{box-sizing:border-box}
#dibay-startup-root{min-height:100%;display:flex;flex-direction:column;background:var(--sam-bg-app)}
#dibay-startup-header{flex:0 0 auto;padding:calc(12px + var(--safe-top)) 16px 12px;border-bottom:1px solid var(--sam-border);background:var(--sam-surface);display:flex;align-items:center;gap:10px;min-height:52px}
#dibay-startup-header .title{font-size:17px;font-weight:700;letter-spacing:-0.01em}
#dibay-startup-header .user{margin-left:auto;font-size:13px;color:var(--sam-muted);max-width:40vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#dibay-startup-body{flex:1 1 auto;position:relative;min-height:0;background:var(--sam-bg-app)}
#dibay-startup-body .placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--sam-muted);font-size:14px;padding:24px;text-align:center}
#dibay-startup-nav{flex:0 0 auto;display:flex;align-items:stretch;justify-content:space-around;gap:2px;padding:6px 4px calc(6px + var(--safe-bottom));border-top:1px solid var(--sam-border);background:var(--sam-surface);min-height:calc(56px + var(--safe-bottom))}
#dibay-startup-nav button{appearance:none;border:0;background:transparent;color:var(--sam-muted);flex:1 1 0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:4px 2px;font-size:10px;font-weight:600;cursor:pointer}
#dibay-startup-nav button[aria-current="page"]{color:var(--sam-primary)}
#dibay-startup-nav button svg{display:block}
#${DIBAY_STARTUP_INTRO_DOM_ID}{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;background:#FFFCFC;pointer-events:none}
#${DIBAY_STARTUP_INTRO_DOM_ID}[hidden]{display:none!important}
.dibay-startup-logo{width:72px;height:72px;object-fit:contain}
.dibay-startup-wordmark{margin:0;font-size:15px;font-weight:700;letter-spacing:0.08em;color:#0B421A}
.dibay-startup-subtitle{display:none;margin:0;font-size:13px;font-weight:500;letter-spacing:0.02em;color:#0B421A;opacity:0.72;max-width:80vw;text-align:center}
.dibay-startup-spinner{width:22px;height:22px;border-radius:9999px;border:2px solid rgba(11,66,26,0.22);border-top-color:#0B421A;animation:dibay-spin 0.8s linear infinite}
@keyframes dibay-spin{to{transform:rotate(360deg)}}
@media (prefers-color-scheme: dark){
  :root{--sam-bg-app:#12161d;--sam-fg:#F2F5F3;--sam-muted:#A7B2AB;--sam-border:#2A323C;--sam-surface:#1A2028;--sam-primary:#8FCB9B}
  .dibay-startup-wordmark,.dibay-startup-subtitle{color:#8FCB9B}
  .dibay-startup-spinner{border-color:rgba(143,203,155,0.28);border-top-color:#8FCB9B}
}
`.trim();
}

/** Intro-only fragment for remote root layout (same visual contract as boot shell intro). */
export function buildStartupIntroMarkup(opts: StartupShellBuildOptions = {}): string {
  const config = opts.config ?? BUNDLED_STARTUP_CONFIG;
  const logoSrc = opts.logoSrc ?? config.logoUrl;
  const active = isStartupIntroActive(config);
  if (!active) {
    return `<div id="${DIBAY_STARTUP_INTRO_DOM_ID}" data-dibay-startup-intro="1" hidden aria-hidden="true"></div>`;
  }
  return `<div id="${DIBAY_STARTUP_INTRO_DOM_ID}" data-dibay-startup-intro="1" aria-hidden="true" style="position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;background:${escapeHtml(config.backgroundColor)};pointer-events:none">
<img class="dibay-startup-logo" src="${escapeHtml(logoSrc)}" alt="" width="72" height="72" decoding="async" fetchpriority="high" style="width:72px;height:72px;object-fit:contain"/>
<p class="dibay-startup-wordmark" style="margin:0;font-size:15px;font-weight:700;letter-spacing:0.08em;color:#0B421A">${escapeHtml(config.wordmark)}</p>
<p class="dibay-startup-subtitle" style="display:none;margin:0;font-size:13px;font-weight:500;letter-spacing:0.02em;color:#0B421A;opacity:0.72;max-width:80vw;text-align:center"></p>
<div class="dibay-startup-spinner" style="width:22px;height:22px;border-radius:9999px;border:2px solid rgba(11,66,26,0.22);border-top-color:#0B421A"></div>
</div>`;
}

function buildNavButtonsHtml(tabs: readonly StartupNavTabCache[], lang: "ko" | "en", activeTabId: string): string {
  return tabs
    .map((tab) => {
      const current = tab.id === activeTabId ? ' aria-current="page"' : "";
      const label = escapeHtml(tabLabel(tab, lang));
      return `<button type="button" data-tab-id="${escapeHtml(tab.id)}" data-href="${escapeHtml(tab.href)}"${current}>${iconForTab(tab.id)}<span>${label}</span></button>`;
    })
    .join("");
}

/**
 * Full self-contained Local Boot HTML document.
 * External CSS/JS/image requests must be 0 (logo provided as data URI by build script).
 */
export function buildStartupBootDocumentHtml(opts: StartupShellBuildOptions = {}): string {
  const config = opts.config ?? BUNDLED_STARTUP_CONFIG;
  const logoSrc = opts.logoSrc ?? config.logoUrl;
  const darkLogoSrc = opts.darkLogoSrc || config.darkLogoUrl || logoSrc;
  const tabs = opts.navTabs?.length ? opts.navTabs : BUNDLED_STARTUP_NAV;
  const lang = opts.lang ?? "ko";
  const remoteOrigin = (opts.remoteOrigin ?? "").replace(/\/$/, "");
  const defaultRoute = opts.defaultRoute ?? "/";
  const css = buildStartupShellCss();
  const navHtml = buildNavButtonsHtml(tabs, lang, "community");
  const introActive = isStartupIntroActive(config);
  const introHtml = introActive
    ? `<div id="${DIBAY_STARTUP_INTRO_DOM_ID}" data-dibay-startup-intro="1" aria-hidden="true">
<img class="dibay-startup-logo" src="${escapeHtml(logoSrc)}" alt="" width="72" height="72" decoding="async"/>
<p class="dibay-startup-wordmark">${escapeHtml(config.wordmark)}</p>
<p class="dibay-startup-subtitle"${config.subtitle ? "" : ' style="display:none"'}>${escapeHtml(config.subtitle)}</p>
${config.showSpinner ? '<div class="dibay-startup-spinner"></div>' : ""}
</div>`
    : "";

  const script = `
(function(){
  var CONFIG_KEY="dibay:startup:config";
  var THEME_KEY="dibay:startup:theme";
  var LANG_KEY="dibay:startup:lang";
  var USER_KEY="dibay:startup:user";
  var NAV_KEY="dibay:startup:nav";
  var ROUTE_KEY="dibay:startup:route";
  var HANDOFF_KEY="dibay:startup:handoff";
  var REMOTE_ORIGIN=${JSON.stringify(remoteOrigin)};
  var DEFAULT_ROUTE=${JSON.stringify(defaultRoute)};
  var LOGO_LIGHT=${JSON.stringify(logoSrc)};
  var LOGO_DARK=${JSON.stringify(darkLogoSrc)};
  var BUNDLED=${JSON.stringify({
    enabled: config.enabled,
    forceDisable: config.forceDisable,
    wordmark: config.wordmark,
    subtitle: config.subtitle,
    backgroundColor: config.backgroundColor,
    backgroundColorDark: config.backgroundColorDark,
    showSpinner: config.showSpinner,
    showWordmark: config.showWordmark,
  })};
  var targetRoute=DEFAULT_ROUTE;
  var handedOff=false;

  function readJson(key){
    try{var raw=localStorage.getItem(key);return raw?JSON.parse(raw):null;}catch(e){return null;}
  }
  function applyTheme(theme){
    var dark=false;
    if(theme==="dark") dark=true;
    else if(theme==="light") dark=false;
    else dark=!!(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.style.colorScheme=dark?"dark":"light";
    if(dark){
      document.documentElement.style.setProperty("--sam-bg-app","#12161d");
      document.documentElement.style.setProperty("--sam-fg","#F2F5F3");
      document.documentElement.style.setProperty("--sam-muted","#A7B2AB");
      document.documentElement.style.setProperty("--sam-border","#2A323C");
      document.documentElement.style.setProperty("--sam-surface","#1A2028");
      document.documentElement.style.setProperty("--sam-primary","#8FCB9B");
    }
    return dark;
  }
  function applyConfig(cfg, dark){
    var intro=document.getElementById(${JSON.stringify(DIBAY_STARTUP_INTRO_DOM_ID)});
    if(!intro) return;
    if(cfg.forceDisable||cfg.enabled===false){
      intro.setAttribute("hidden","");
      return;
    }
    intro.style.background=dark?(cfg.backgroundColorDark||"#12161d"):(cfg.backgroundColor||"#FFFCFC");
    var logo=intro.querySelector(".dibay-startup-logo");
    if(logo){
      var src=dark&&(cfg.darkLogoUrl||LOGO_DARK)?(cfg.darkLogoUrl||LOGO_DARK):(cfg.logoUrl||LOGO_LIGHT);
      if(src) logo.setAttribute("src",String(src));
    }
    var wm=intro.querySelector(".dibay-startup-wordmark");
    if(wm){
      if(cfg.wordmark) wm.textContent=String(cfg.wordmark);
      wm.style.display=cfg.showWordmark===false?"none":"";
    }
    var sub=intro.querySelector(".dibay-startup-subtitle");
    if(sub){
      var t=(cfg.subtitle&&String(cfg.subtitle).trim())||"";
      sub.textContent=t;
      sub.style.display=t?"":"none";
    }
    var sp=intro.querySelector(".dibay-startup-spinner");
    if(sp) sp.style.display=cfg.showSpinner===false?"none":"";
  }
  function applyUser(user){
    var el=document.querySelector("#dibay-startup-header .user");
    if(!el) return;
    if(user&&user.displayName){el.textContent=String(user.displayName);}
    else{el.textContent="";}
  }
  function applyRoute(route){
    if(route&&typeof route.path==="string"&&route.path.trim()){
      targetRoute=route.path.trim();
    }
    var tabId=route&&route.tabId?String(route.tabId):"";
    var buttons=document.querySelectorAll("#dibay-startup-nav button");
    for(var i=0;i<buttons.length;i++){
      var b=buttons[i];
      var id=b.getAttribute("data-tab-id")||"";
      if(tabId&&id===tabId) b.setAttribute("aria-current","page");
      else if(tabId) b.removeAttribute("aria-current");
    }
    var title=document.querySelector("#dibay-startup-header .title");
    if(title){
      var active=document.querySelector("#dibay-startup-nav button[aria-current='page'] span");
      if(active&&active.textContent) title.textContent=active.textContent;
    }
  }
  function applyNav(nav){
    if(!Array.isArray(nav)||!nav.length) return;
    /* Keep bundled DOM order; only update labels/href when ids match. */
    var buttons=document.querySelectorAll("#dibay-startup-nav button");
    for(var i=0;i<buttons.length;i++){
      var b=buttons[i];
      var id=b.getAttribute("data-tab-id");
      for(var j=0;j<nav.length;j++){
        if(nav[j]&&nav[j].id===id){
          if(nav[j].href) b.setAttribute("data-href",String(nav[j].href));
          var span=b.querySelector("span");
          var lang=(function(){try{return localStorage.getItem(LANG_KEY)||"ko";}catch(e){return "ko";}})();
          var label=lang==="en"?(nav[j].labelEn||nav[j].label):(nav[j].labelKo||nav[j].label);
          if(span&&label) span.textContent=String(label);
          break;
        }
      }
    }
  }
  function resolveOrigin(){
    if(REMOTE_ORIGIN) return REMOTE_ORIGIN;
    try{return location.origin;}catch(e){return "";}
  }
  function pendingFromBridge(){
    try{
      var bridge=window.DibayBootBridge;
      if(bridge&&typeof bridge.getPendingRoute==="function"){
        var p=bridge.getPendingRoute();
        if(p&&typeof p==="string"&&p.charAt(0)==="/") return p;
      }
    }catch(e){}
    return null;
  }
  function handoff(){
    if(handedOff) return;
    handedOff=true;
    try{sessionStorage.setItem(HANDOFF_KEY,"1");}catch(e){}
    var origin=resolveOrigin();
    var path=targetRoute||DEFAULT_ROUTE;
    if(path.charAt(0)!=="/") path="/"+path;
    var url=origin? (origin+path) : path;
    try{
      if(window.__dibayStartupMetrics){window.__dibayStartupMetrics.handoffStart=performance.now();}
    }catch(e){}
    // Cover BEFORE replace — bridge begin blocks until native overlay is VISIBLE.
    try{
      if(window.DibayBootBridge&&typeof window.DibayBootBridge.beginHandoffCover==="function"){
        window.DibayBootBridge.beginHandoffCover(url);
      }else if(window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.DibayBootBridge){
        window.webkit.messageHandlers.DibayBootBridge.postMessage({action:"beginHandoffCover",url:url});
      }
    }catch(e){}
    // One paint after cover attach, then single replace (never navigate uncovered).
    function doReplace(){ try{ location.replace(url); }catch(e2){ location.href=url; } }
    try{ requestAnimationFrame(function(){ doReplace(); }); }
    catch(e3){ doReplace(); }
  }
  function dismissSplash(){
    try{
      if(window.DibayBootBridge&&typeof window.DibayBootBridge.dismissSplash==="function"){
        window.DibayBootBridge.dismissSplash();
      }else if(window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.DibayBootBridge){
        window.webkit.messageHandlers.DibayBootBridge.postMessage({action:"dismissSplash"});
      }
    }catch(e){}
  }
  function hideIntroShowShell(){
    var intro=document.getElementById(${JSON.stringify(DIBAY_STARTUP_INTRO_DOM_ID)});
    if(intro){
      intro.setAttribute("data-ready","1");
      intro.setAttribute("hidden","");
      intro.setAttribute("aria-hidden","true");
    }
    try{
      window.__dibayStartupMetrics=window.__dibayStartupMetrics||{};
      window.__dibayStartupMetrics.localShellVisible=performance.now();
    }catch(e){}
  }
  function paint(){
    var theme=null; try{theme=localStorage.getItem(THEME_KEY);}catch(e){}
    var dark=applyTheme(theme||"system");
    var cfg=readJson(CONFIG_KEY)||BUNDLED;
    applyConfig(cfg, dark);
    applyUser(readJson(USER_KEY));
    applyNav(readJson(NAV_KEY));
    var route=readJson(ROUTE_KEY);
    applyRoute(route);
    var pending=pendingFromBridge();
    if(pending) targetRoute=pending;
    try{
      window.__dibayStartupMetrics=window.__dibayStartupMetrics||{};
      window.__dibayStartupMetrics.shellPaint=performance.now();
    }catch(e){}
    dismissSplash();
  }
  document.addEventListener("click",function(ev){
    var t=ev.target;
    while(t&&t!==document&&!(t.tagName==="BUTTON"&&t.getAttribute("data-href"))){
      t=t.parentNode;
    }
    if(!t||t===document) return;
    var href=t.getAttribute("data-href");
    if(!href) return;
    ev.preventDefault();
    targetRoute=href;
    var buttons=document.querySelectorAll("#dibay-startup-nav button");
    for(var i=0;i<buttons.length;i++) buttons[i].removeAttribute("aria-current");
    t.setAttribute("aria-current","page");
    var title=document.querySelector("#dibay-startup-header .title");
    var span=t.querySelector("span");
    if(title&&span) title.textContent=span.textContent||title.textContent;
  },true);

  /*
   * Order (no setTimeout delay):
   * 1) paint Intro+Shell under splash
   * 2) dismiss native splash
   * 3) hide Intro → Local Header/BottomNav visible
   * 4) rAF×2 paint confirmation
   * 5) beginHandoffCover + single remote navigation replace
   */
  paint();
  var handed=false;
  function afterShellPainted(){
    if(handed) return;
    handed=true;
    handoff();
  }
  function confirmLocalShellThenHandoff(){
    hideIntroShowShell();
    var frames=0;
    function onFrame(){
      frames+=1;
      if(frames>=2){
        afterShellPainted();
        return;
      }
      try{ requestAnimationFrame(onFrame); }catch(e){ afterShellPainted(); }
    }
    try{ requestAnimationFrame(onFrame); }
    catch(e){ afterShellPainted(); }
  }
  // First rAF after paint: intro still up; then hide intro and confirm shell paint.
  try{
    requestAnimationFrame(function(){ confirmLocalShellThenHandoff(); });
  }catch(e){
    confirmLocalShellThenHandoff();
  }
})();
`.trim();

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<meta name="color-scheme" content="light dark"/>
<title>DIBAY</title>
<style>${css}</style>
</head>
<body>
<div id="dibay-startup-root">
  <header id="dibay-startup-header">
    <div class="title">${escapeHtml(tabLabel(tabs[0] ?? { id: "community", href: "/philife", label: "Community", labelKo: "커뮤니티" }, lang))}</div>
    <div class="user"></div>
  </header>
  <main id="dibay-startup-body">
    <div class="placeholder" aria-hidden="true"></div>
  </main>
  <nav id="dibay-startup-nav" aria-label="Main">${navHtml}</nav>
</div>
${introHtml}
<script>${script}</script>
</body>
</html>`;
}
