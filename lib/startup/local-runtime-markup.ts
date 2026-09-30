/**
 * Option A Local Runtime — self-contained document (no location.replace).
 * Built into capacitor-www/local-runtime/ and optionally capacitor-www/index.html.
 *
 * CONTRACT (R15 ZERO):
 * - Authored Intro / System Start overlay = NONE.
 * - Single AppShell + BottomNav silhouette until full router lands.
 * - Remote = API origin fetch only — never main-frame navigation to remote HTML.
 */

import { BUNDLED_STARTUP_NAV, type StartupNavTabCache } from "@/lib/startup/startup-cache";
import { BUNDLED_STARTUP_CONFIG, type StartupConfig } from "@/lib/startup/startup-config";

export type LocalRuntimeBuildOptions = {
  /** Boot authority only (initialSurface). Presentation fields ignored. */
  config?: StartupConfig;
  navTabs?: readonly StartupNavTabCache[];
  /** API origin only (fetch/sync) — NOT a document navigation target. */
  remoteApiOrigin?: string;
  defaultRoute?: string;
  lang?: "ko" | "en";
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

function iconForTab(id: string): string {
  if (id === "home") return NAV_ICON_SVG.trade;
  return NAV_ICON_SVG[id] ?? NAV_ICON_SVG.my;
}

function tabLabel(tab: StartupNavTabCache, lang: "ko" | "en"): string {
  if (lang === "ko" && tab.labelKo) return tab.labelKo;
  if (lang === "en" && tab.labelEn) return tab.labelEn;
  return tab.label;
}

function buildShellCss(): string {
  return `
:root{--sam-bg-app:#FFFCFC;--sam-fg:#0B421A;--sam-muted:#5C6B63;--sam-border:#E6EBE8;--sam-surface:#FFFFFF;--sam-primary:#0B421A;--safe-bottom:env(safe-area-inset-bottom,0px);--safe-top:env(safe-area-inset-top,0px)}
html,body{margin:0;padding:0;height:100%;background:var(--sam-bg-app);color:var(--sam-fg);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans KR",sans-serif;-webkit-tap-highlight-color:transparent}
*{box-sizing:border-box}
#dibay-startup-header{flex:0 0 auto;padding:calc(12px + var(--safe-top)) 16px 12px;border-bottom:1px solid var(--sam-border);background:var(--sam-surface);display:flex;align-items:center;gap:10px;min-height:52px}
#dibay-startup-header .title{font-size:17px;font-weight:700;letter-spacing:-0.01em}
#dibay-startup-header .user{margin-left:auto;font-size:13px;color:var(--sam-muted);max-width:40vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#dibay-startup-body{flex:1 1 auto;position:relative;min-height:0;background:var(--sam-bg-app)}
#dibay-startup-body .placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--sam-muted);font-size:14px;padding:24px;text-align:center}
#dibay-startup-nav{flex:0 0 auto;display:flex;align-items:stretch;justify-content:space-around;gap:2px;padding:6px 4px calc(6px + var(--safe-bottom));border-top:1px solid var(--sam-border);background:var(--sam-surface);min-height:calc(56px + var(--safe-bottom))}
#dibay-startup-nav button{appearance:none;border:0;background:transparent;color:var(--sam-muted);flex:1 1 0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:4px 2px;font-size:10px;font-weight:600;cursor:pointer}
#dibay-startup-nav button[aria-current="page"]{color:var(--sam-primary)}
#dibay-startup-nav button svg{display:block}
@media (prefers-color-scheme: dark){
  :root{--sam-bg-app:#12161d;--sam-fg:#E8EFE9;--sam-muted:#9AA89F;--sam-border:#2A3230;--sam-surface:#1A1F24;--sam-primary:#8FCB9B}
}
`.trim();
}

function buildNavHtml(tabs: readonly StartupNavTabCache[], lang: "ko" | "en"): string {
  return tabs
    .map((tab, i) => {
      const label = escapeHtml(tabLabel(tab, lang));
      const href = escapeHtml(tab.href || "/");
      const current = i === 0 ? ' aria-current="page"' : "";
      return `<button type="button" data-href="${href}"${current}>${iconForTab(tab.id)}<span>${label}</span></button>`;
    })
    .join("");
}

/** Inline runtime script — no Intro/System Start product surface. */
function buildLocalRuntimeScript(opts: {
  remoteApiOrigin: string;
  defaultRoute: string;
}): string {
  const apiOrigin = JSON.stringify(opts.remoteApiOrigin);
  const defaultRoute = JSON.stringify(opts.defaultRoute);
  return `
(function(){
  "use strict";
  window.__DIBAY_LOCAL_RUNTIME__ = true;
  window.__DIBAY_REMOTE_API_ORIGIN__ = ${apiOrigin};
  var STATES = ["NATIVE_LAUNCH","LOCAL_RUNTIME_LOADING","LOCAL_RUNTIME_PAINTED","LOCAL_SHELL_READY","REMOTE_DATA_CONNECTING","APP_READY"];
  var FORBIDDEN = {REMOTE_DOCUMENT_LOADING:1,SECOND_INTRO:1,HANDOFF_COVER_AS_NORMAL_FLOW:1,BLANK:1,BLACK:1,INTRO_VISIBLE:1};
  var idx = {};
  for (var i=0;i<STATES.length;i++) idx[STATES[i]] = i;
  var state = "NATIVE_LAUNCH";
  function emit(s){
    try{
      window.dispatchEvent(new CustomEvent("dibay:local-runtime-state",{detail:{state:s}}));
      console.info("[dibay-local-runtime] state="+s);
    }catch(e){}
  }
  function transition(next){
    if (FORBIDDEN[next]) { console.error("[dibay-local-runtime] forbidden state "+next); return false; }
    if (next === state) return true;
    if (idx[next] == null || idx[next] < idx[state] || idx[next] > idx[state] + 1) {
      console.error("[dibay-local-runtime] invalid transition "+state+" -> "+next);
      return false;
    }
    state = next;
    emit(state);
    return true;
  }
  function dismissNativeSplash(){
    try{
      if (window.DibayBootBridge && typeof window.DibayBootBridge.dismissSplash === "function") {
        window.DibayBootBridge.dismissSplash();
      }
    }catch(e){}
  }
  function paintShell(){
    var root = document.getElementById("dibay-local-runtime-root");
    if (root) root.setAttribute("data-shell-painted","1");
    dismissNativeSplash();
  }
  function beginRemoteData(){
    var origin = window.__DIBAY_REMOTE_API_ORIGIN__ || "";
    if (!origin) return;
    try{
      fetch(origin + "/api/app/startup-config", { method: "GET", credentials: "omit", cache: "no-store" })
        .then(function(){})
        .catch(function(){});
    }catch(e){}
  }
  try{
    if (typeof location !== "undefined" && location.replace) {
      var _replace = location.replace.bind(location);
      location.replace = function(url){
        var s = String(url || "");
        if (/^https?:\\/\\//i.test(s) && window.__DIBAY_REMOTE_API_ORIGIN__ && s.indexOf(window.__DIBAY_REMOTE_API_ORIGIN__) === 0) {
          console.error("[dibay-local-runtime] blocked location.replace to remote document: "+s);
          return;
        }
        return _replace(url);
      };
    }
  }catch(e){}

  transition("LOCAL_RUNTIME_LOADING");
  paintShell();
  transition("LOCAL_RUNTIME_PAINTED");
  transition("LOCAL_SHELL_READY");
  transition("REMOTE_DATA_CONNECTING");
  beginRemoteData();
  transition("APP_READY");

  document.addEventListener("click", function(ev){
    var t = ev.target;
    while (t && t !== document && !(t.tagName === "BUTTON" && t.getAttribute("data-href"))) {
      t = t.parentNode;
    }
    if (!t || t === document) return;
    var href = t.getAttribute("data-href") || ${defaultRoute};
    ev.preventDefault();
    var buttons = document.querySelectorAll("#dibay-startup-nav button");
    for (var j=0;j<buttons.length;j++) buttons[j].removeAttribute("aria-current");
    t.setAttribute("aria-current","page");
    var title = document.querySelector("#dibay-startup-header .title");
    var span = t.querySelector("span");
    if (title && span) title.textContent = span.textContent || title.textContent;
    try{
      window.dispatchEvent(new CustomEvent("dibay:local-runtime-route",{detail:{path:href}}));
    }catch(e2){}
  }, true);
})();
`.trim();
}

/**
 * Full Local Runtime HTML document — no Intro/System Start product surface.
 */
export function buildLocalRuntimeDocumentHtml(opts: LocalRuntimeBuildOptions = {}): string {
  // config kept for call-site compat; only used as boot metadata (no presentation).
  void (opts.config ?? BUNDLED_STARTUP_CONFIG);
  const lang = opts.lang ?? "ko";
  const tabs = opts.navTabs ?? BUNDLED_STARTUP_NAV;
  const remoteApiOrigin = (opts.remoteApiOrigin ?? "").replace(/\/$/, "");
  const defaultRoute = opts.defaultRoute ?? "/";
  const bg = "#FFFCFC";

  const css = buildShellCss();
  const nav = buildNavHtml(tabs, lang);
  const firstLabel = escapeHtml(
    tabLabel(
      tabs[0] ?? {
        id: "community",
        href: "/philife",
        label: "Community",
        labelKo: "커뮤니티",
      },
      lang
    )
  );
  const script = buildLocalRuntimeScript({ remoteApiOrigin, defaultRoute });

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<meta name="color-scheme" content="light dark"/>
<meta name="theme-color" content="${bg}"/>
<title>DIBAY</title>
<style>${css}
#dibay-local-runtime-root{min-height:100%;display:flex;flex-direction:column;background:var(--sam-bg-app)}
html,body{background:${bg}}
</style>
</head>
<body style="background:${bg}">
<div id="dibay-local-runtime-root" data-local-runtime="1" data-cm-room="" class="cm-room-shell">
  <header id="dibay-startup-header">
    <div class="title">${firstLabel}</div>
    <div class="user"></div>
  </header>
  <main id="dibay-startup-body">
    <div class="placeholder" data-local-runtime-body="1">DIBAY</div>
  </main>
  <nav id="dibay-startup-nav" aria-label="Main">${nav}</nav>
</div>
<script>${script}</script>
</body>
</html>`;
}
