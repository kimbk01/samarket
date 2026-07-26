/**
 * Option A Local Runtime — self-contained document (no location.replace).
 * Built into capacitor-www/local-runtime/ and optionally capacitor-www/index.html.
 *
 * @see docs/dibay-local-runtime-startup-rearchitecture.md
 *
 * CONTRACT:
 * - Single Intro owner (this document).
 * - Single AppShell + BottomNav silhouette until full router lands.
 * - Remote = API origin fetch only — never main-frame navigation to remote HTML.
 * - DO NOT: location.replace · window.location = remote · iframe app body · Cover normal flow.
 */

import { BUNDLED_STARTUP_NAV, type StartupNavTabCache } from "@/lib/startup/startup-cache";
import {
  BUNDLED_STARTUP_CONFIG,
  isStartupIntroActive,
  type StartupConfig,
} from "@/lib/startup/startup-config";
import { DIBAY_STARTUP_INTRO_DOM_ID } from "@/lib/startup/startup-constants";
import { buildStartupShellCss } from "@/lib/startup/startup-shell-markup";

export type LocalRuntimeBuildOptions = {
  config?: StartupConfig;
  logoSrc?: string;
  darkLogoSrc?: string;
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

function buildIntroHtml(config: StartupConfig, logoSrc: string): string {
  if (!isStartupIntroActive(config)) {
    return `<div id="${DIBAY_STARTUP_INTRO_DOM_ID}" data-dibay-startup-intro="1" data-local-runtime-intro="1" hidden aria-hidden="true"></div>`;
  }
  const wordmark = escapeHtml(config.wordmark || "DIBAY");
  const subtitle = config.subtitle ? `<p class="dibay-startup-subtitle">${escapeHtml(config.subtitle)}</p>` : "";
  const spinner = config.showSpinner ? `<div class="dibay-startup-spinner" aria-hidden="true"></div>` : "";
  const wordmarkEl = config.showWordmark ? `<p class="dibay-startup-wordmark">${wordmark}</p>` : "";
  return `<div id="${DIBAY_STARTUP_INTRO_DOM_ID}" data-dibay-startup-intro="1" data-local-runtime-intro="1" aria-hidden="false">
  <img class="dibay-startup-logo" src="${escapeHtml(logoSrc)}" width="72" height="72" alt=""/>
  ${wordmarkEl}
  ${subtitle}
  ${spinner}
</div>`;
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

/** Inline runtime script — state machine + no remote document navigation. */
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
  var STATES = ["NATIVE_LAUNCH","LOCAL_RUNTIME_LOADING","LOCAL_RUNTIME_PAINTED","INTRO_VISIBLE","LOCAL_SHELL_READY","REMOTE_DATA_CONNECTING","APP_READY","INTRO_REMOVED"];
  var FORBIDDEN = {REMOTE_DOCUMENT_LOADING:1,SECOND_INTRO:1,HANDOFF_COVER_AS_NORMAL_FLOW:1,BLANK:1,BLACK:1};
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
  function hideIntro(){
    var el = document.getElementById(${JSON.stringify(DIBAY_STARTUP_INTRO_DOM_ID)});
    if (!el) return;
    el.setAttribute("hidden","");
    el.setAttribute("aria-hidden","true");
    el.setAttribute("data-ready","1");
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
      // Connectivity probe only — must never navigate the main frame.
      fetch(origin + "/api/app/startup-config", { method: "GET", credentials: "omit", cache: "no-store" })
        .then(function(){})
        .catch(function(){});
    }catch(e){}
  }
  // Hard ban: no remote document replace / assign on this runtime.
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
  transition("INTRO_VISIBLE");
  transition("LOCAL_SHELL_READY");
  transition("REMOTE_DATA_CONNECTING");
  beginRemoteData();
  // App Ready: local root + shell painted + no fatal error (do not wait for probe).
  transition("APP_READY");
  hideIntro();
  transition("INTRO_REMOVED");

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
 * Full Local Runtime HTML document — no location.replace, no Cover handoff.
 */
export function buildLocalRuntimeDocumentHtml(opts: LocalRuntimeBuildOptions = {}): string {
  const config = opts.config ?? BUNDLED_STARTUP_CONFIG;
  const lang = opts.lang ?? "ko";
  const tabs = opts.navTabs ?? BUNDLED_STARTUP_NAV;
  const logoSrc = opts.logoSrc ?? config.logoUrl;
  const remoteApiOrigin = (opts.remoteApiOrigin ?? "").replace(/\/$/, "");
  const defaultRoute = opts.defaultRoute ?? "/";
  const bg = escapeHtml(config.backgroundColor || "#FFFCFC");

  const css = buildStartupShellCss();
  const intro = buildIntroHtml(config, logoSrc);
  const nav = buildNavHtml(tabs, lang);
  const firstLabel = escapeHtml(tabLabel(tabs[0] ?? { id: "community", href: "/philife", label: "Community", labelKo: "커뮤니티" }, lang));
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
${intro}
<script>${script}</script>
</body>
</html>`;
}
