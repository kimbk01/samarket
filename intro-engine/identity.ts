/**
 * DIBAY Intro — 9th rebuild. Locked names. Do not rename after first slice.
 */

export const INTRO_ENGINE_ID = "intro-engine" as const;
export const INTRO_ENGINE_VERSION = "9.0.0-first-slice" as const;
export const INTRO_SHOW_DOCUMENT_VERSION = 1 as const;

/** Product brand green — Scene 1 background. Not OS cream. */
export const DIBAY_GREEN = "#0B421A" as const;

/** First-slice scene hold. Motion is NONE. */
export const INTRO_SHOW_DEFAULT_DURATION_MS = 2400 as const;

/**
 * Timeline fail-open bound after last authored frame.
 * Clock authority lives in Timeline — not a visual masking delay.
 */
export const INTRO_HANDOFF_FAIL_OPEN_MS = 8000 as const;

export const INTRO_SHOW_NAMESPACE = {
  engineId: INTRO_ENGINE_ID,
  engineDir: "intro-engine/",
  product: "intro-show",
  tables: [
    "intro_show_campaigns",
    "intro_show_drafts",
    "intro_show_revisions",
    "intro_show_media",
    "intro_show_media_assets",
    "intro_show_live",
  ],
  storageBucket: "intro-show",
  adminApi: "/api/admin/intro-shows",
  runtimeApi: "/api/app/intro-runtime",
  adminUi: "/admin/intro",
  nativePlugin: "IntroShowHost",
} as const;
