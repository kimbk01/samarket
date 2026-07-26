/** Startup Boot Layer — shared constants (server layout + client + build safe). */

export const STARTUP_SESSION_KEY = "dibay:cold-boot:session-marked";

/** Single intro / shell surface DOM id. */
export const DIBAY_STARTUP_INTRO_DOM_ID = "dibay-startup-intro";

/** Local Boot document path under remote origin (Android intercept / iOS baseURL). */
export const STARTUP_BOOT_PATH = "/__dibay-startup";

/** sessionStorage: local shell handed off to remote React once. */
export const STARTUP_HANDOFF_SESSION_KEY = "dibay:startup:handoff";

/** Option A Local Runtime entry (bundled asset path under webDir / native assets). */
export const LOCAL_RUNTIME_ENTRY_PATH = "local-runtime/index.html";

/** Native + Cap shared runtime mode file (local XOR legacy). */
export const DIBAY_RUNTIME_MODE_ASSET = "dibay-runtime-mode.json";

export const STARTUP_CACHE_KEYS = {
  config: "dibay:startup:config",
  theme: "dibay:startup:theme",
  lang: "dibay:startup:lang",
  user: "dibay:startup:user",
  nav: "dibay:startup:nav",
  route: "dibay:startup:route",
} as const;
