/**
 * Admin Product Intro SSOT — separate from Technical Boot (`startup_config_v1`).
 * CONTRACT: single-active; cache-first; never blocks shellReady / app entry.
 */

import { pathForInitialAppSurface, type InitialAppSurface } from "@/lib/startup/initial-app-surface";
import { pickEnum } from "@/lib/startup/startup-intro-visual";

export const STARTUP_PRODUCT_INTRO_SETTINGS_KEY = "startup_product_intro_v1" as const;
export const STARTUP_PRODUCT_INTRO_LOCAL_STORAGE_KEY = "dibay:startup:product-intro" as const;
export const STARTUP_PRODUCT_INTRO_MEDIA_CACHE_KEY = "dibay:startup:product-intro-media" as const;

export const PRODUCT_INTRO_STATUSES = ["draft", "active", "inactive"] as const;
export type ProductIntroStatus = (typeof PRODUCT_INTRO_STATUSES)[number];

export const PRODUCT_INTRO_DISPLAY_MODES = ["fullscreen", "card"] as const;
export type ProductIntroDisplayMode = (typeof PRODUCT_INTRO_DISPLAY_MODES)[number];

export const PRODUCT_INTRO_OBJECT_FITS = ["contain", "cover"] as const;
export type ProductIntroObjectFit = (typeof PRODUCT_INTRO_OBJECT_FITS)[number];

export const PRODUCT_INTRO_SIZE_PRESETS = ["small", "medium", "large", "full"] as const;
export type ProductIntroSizePreset = (typeof PRODUCT_INTRO_SIZE_PRESETS)[number];

export const PRODUCT_INTRO_ANIM_IN = ["none", "fade", "fade_scale", "scale", "slide_up"] as const;
export type ProductIntroAnimIn = (typeof PRODUCT_INTRO_ANIM_IN)[number];

export const PRODUCT_INTRO_ANIM_OUT = ["none", "fade", "fade_scale"] as const;
export type ProductIntroAnimOut = (typeof PRODUCT_INTRO_ANIM_OUT)[number];

export const PRODUCT_INTRO_ACTION_TYPES = [
  "none",
  "internal_surface",
  "store",
  "product",
  "delivery_category",
  "market_listing",
  "community_board",
  "community_post",
  "chat_room",
] as const;
export type ProductIntroActionType = (typeof PRODUCT_INTRO_ACTION_TYPES)[number];

export const PRODUCT_INTRO_ANIM_MS_MIN = 150;
export const PRODUCT_INTRO_ANIM_MS_MAX = 1200;
/** 0 = no intentional hold after app ready (cover-only during boot). */
export const PRODUCT_INTRO_DISPLAY_MS_MIN = 0;
export const PRODUCT_INTRO_DISPLAY_MS_MAX = 8000;
export const PRODUCT_INTRO_RADIUS_MIN = 0;
export const PRODUCT_INTRO_RADIUS_MAX = 48;
export const PRODUCT_INTRO_CUSTOM_SIZE_MIN = 40;
export const PRODUCT_INTRO_CUSTOM_SIZE_MAX = 100;

export type ProductIntroAction = {
  type: ProductIntroActionType;
  /** Surface enum / store slug / ids / browse slug — typed by `type`. */
  target: string;
};

export type ProductIntroConfig = {
  version: number;
  status: ProductIntroStatus;
  name: string;
  media: {
    mobileUrl: string | null;
    tabletUrl: string | null;
  };
  displayMode: ProductIntroDisplayMode;
  objectFit: ProductIntroObjectFit;
  sizePreset: ProductIntroSizePreset;
  /** Percent of viewport width when sizePreset=full is not used with custom; optional 40–100. */
  customSizePercent: number | null;
  cornerRadiusPx: number;
  backgroundColor: string;
  animationIn: ProductIntroAnimIn;
  animationOut: ProductIntroAnimOut;
  enterDurationMs: number;
  displayDurationMs: number;
  exitDurationMs: number;
  action: ProductIntroAction;
  startsAt: string | null;
  endsAt: string | null;
  updatedAt: string;
};

export const BUNDLED_PRODUCT_INTRO_CONFIG: ProductIntroConfig = {
  version: 1,
  status: "inactive",
  name: "",
  media: { mobileUrl: null, tabletUrl: null },
  displayMode: "fullscreen",
  objectFit: "cover",
  sizePreset: "full",
  customSizePercent: null,
  cornerRadiusPx: 0,
  backgroundColor: "#FFFCFC",
  animationIn: "none",
  animationOut: "none",
  enterDurationMs: 150,
  displayDurationMs: 0,
  exitDurationMs: 220,
  action: { type: "none", target: "" },
  startsAt: null,
  endsAt: null,
  updatedAt: "1970-01-01T00:00:00.000Z",
};

function asTrimmed(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

function asHexColor(value: unknown, fallback: string): string {
  const t = asTrimmed(value);
  if (/^#[0-9A-Fa-f]{6}$/.test(t) || /^#[0-9A-Fa-f]{8}$/.test(t)) return t;
  return fallback;
}

function asNullableHttpOrPathUrl(value: unknown): string | null {
  const t = asTrimmed(value);
  if (!t) return null;
  if (t.startsWith("/") || t.startsWith("https://") || t.startsWith("http://")) return t;
  return null;
}

function asNullableIso(value: unknown): string | null {
  const t = asTrimmed(value);
  if (!t) return null;
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function unwrapPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const o = raw as Record<string, unknown>;
  if ("payload" in o) return o.payload;
  if ("config" in o) return o.config;
  return raw;
}

export function normalizeProductIntroConfig(raw: unknown): ProductIntroConfig {
  const base = BUNDLED_PRODUCT_INTRO_CONFIG;
  const src = unwrapPayload(raw);
  if (!src || typeof src !== "object") {
    return { ...base, media: { ...base.media }, action: { ...base.action } };
  }
  const o = src as Record<string, unknown>;
  const mediaRaw =
    o.media && typeof o.media === "object" ? (o.media as Record<string, unknown>) : {};
  const actionRaw =
    o.action && typeof o.action === "object" ? (o.action as Record<string, unknown>) : {};

  const actionType = pickEnum(actionRaw.type ?? o.actionType, PRODUCT_INTRO_ACTION_TYPES, "none");
  const actionTarget = asTrimmed(actionRaw.target ?? o.actionTarget);

  return {
    version: clampInt(o.version, 1, 1_000_000, base.version),
    status: pickEnum(o.status, PRODUCT_INTRO_STATUSES, "inactive"),
    name: asTrimmed(o.name).slice(0, 120),
    media: {
      mobileUrl: asNullableHttpOrPathUrl(mediaRaw.mobileUrl ?? o.mobileUrl ?? o.mediaUrl),
      tabletUrl: asNullableHttpOrPathUrl(mediaRaw.tabletUrl ?? o.tabletUrl),
    },
    displayMode: "fullscreen",
    objectFit: pickEnum(o.objectFit, PRODUCT_INTRO_OBJECT_FITS, "cover"),
    sizePreset: "full",
    customSizePercent: null,
    cornerRadiusPx: 0,
    backgroundColor: asHexColor(o.backgroundColor, base.backgroundColor),
    animationIn: "none",
    animationOut: "none",
    enterDurationMs: PRODUCT_INTRO_ANIM_MS_MIN,
    displayDurationMs: clampInt(
      o.displayDurationMs,
      PRODUCT_INTRO_DISPLAY_MS_MIN,
      PRODUCT_INTRO_DISPLAY_MS_MAX,
      0
    ),
    exitDurationMs: PRODUCT_INTRO_ANIM_MS_MIN,
    action: { type: actionType, target: actionType === "none" ? "" : actionTarget.slice(0, 256) },
    startsAt: asNullableIso(o.startsAt),
    endsAt: asNullableIso(o.endsAt),
    updatedAt: asNullableIso(o.updatedAt) ?? base.updatedAt,
  };
}

export function productIntroConfigEquals(a: ProductIntroConfig, b: ProductIntroConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Schedule + status + required media — no network. */
export function isProductIntroDisplayEligible(
  config: ProductIntroConfig,
  nowMs: number = Date.now()
): boolean {
  if (config.status !== "active") return false;
  if (!config.media.mobileUrl) return false;
  if (config.startsAt) {
    const start = Date.parse(config.startsAt);
    if (Number.isFinite(start) && nowMs < start) return false;
  }
  if (config.endsAt) {
    const end = Date.parse(config.endsAt);
    if (Number.isFinite(end) && nowMs >= end) return false;
  }
  if (config.startsAt && config.endsAt) {
    const start = Date.parse(config.startsAt);
    const end = Date.parse(config.endsAt);
    if (Number.isFinite(start) && Number.isFinite(end) && end <= start) return false;
  }
  return true;
}

export type ProductIntroResolvedAction =
  | { ok: true; href: string; replace: true }
  | { ok: false; error: string };

const BLOCKED = /^(javascript|data|file|vbscript):/i;

/**
 * Typed destination resolver — fail-closed navigation, fail-open app entry.
 * Does not invent free-form URLs as primary Admin input.
 */
export function resolveProductIntroAction(action: ProductIntroAction): ProductIntroResolvedAction {
  const type = pickEnum(action.type, PRODUCT_INTRO_ACTION_TYPES, "none");
  const target = asTrimmed(action.target);

  if (type === "none") return { ok: false, error: "none" };

  if (BLOCKED.test(target) || BLOCKED.test(target.split("/")[0] ?? "")) {
    return { ok: false, error: "invalid_scheme" };
  }

  if (type === "internal_surface") {
    const surface = target as InitialAppSurface;
    if (!["community", "trade", "food", "chat", "my"].includes(surface)) {
      return { ok: false, error: "invalid_surface" };
    }
    return { ok: true, href: pathForInitialAppSurface(surface), replace: true };
  }

  if (type === "store") {
    if (!target || target.includes("/") || target.includes("..")) {
      return { ok: false, error: "invalid_store" };
    }
    return { ok: true, href: `/stores/${encodeURIComponent(target)}`, replace: true };
  }

  if (type === "product") {
    // Canonical: storeSlug/productId or bare product path segment pair "slug/id"
    const parts = target.split("/").filter(Boolean);
    if (parts.length < 2) return { ok: false, error: "invalid_product" };
    const [slug, productId] = parts;
    if (!slug || !productId || parts.length > 2) return { ok: false, error: "invalid_product" };
    return {
      ok: true,
      href: `/stores/${encodeURIComponent(slug)}/p/${encodeURIComponent(productId)}`,
      replace: true,
    };
  }

  if (type === "delivery_category") {
    if (!target || target.includes("..") || target.startsWith("/")) {
      return { ok: false, error: "invalid_category" };
    }
    return { ok: true, href: `/stores/browse/${encodeURIComponent(target)}`, replace: true };
  }

  if (type === "market_listing") {
    if (!target || target.includes("/")) return { ok: false, error: "invalid_listing" };
    return { ok: true, href: `/post/${encodeURIComponent(target)}`, replace: true };
  }

  if (type === "community_board") {
    if (!target || target.includes("..") || target.includes("/")) {
      return { ok: false, error: "invalid_board" };
    }
    // Philife feed topic filter — canonical list surface under /philife
    return {
      ok: true,
      href: `/philife?topic=${encodeURIComponent(target)}`,
      replace: true,
    };
  }

  if (type === "community_post") {
    if (!target || target.includes("/")) return { ok: false, error: "invalid_post" };
    return { ok: true, href: `/philife/post/${encodeURIComponent(target)}`, replace: true };
  }

  if (type === "chat_room") {
    if (!target || target.includes("/")) return { ok: false, error: "invalid_room" };
    return {
      ok: true,
      href: `/community-messenger/rooms/${encodeURIComponent(target)}`,
      replace: true,
    };
  }

  if (BLOCKED.test(target)) return { ok: false, error: "invalid_scheme" };
  return { ok: false, error: "invalid_action" };
}

export function productIntroImageWidthPercent(config: ProductIntroConfig): number {
  if (config.displayMode === "fullscreen" && config.sizePreset === "full") return 100;
  if (config.customSizePercent != null) return config.customSizePercent;
  switch (config.sizePreset) {
    case "small":
      return 56;
    case "large":
      return 88;
    case "full":
      return 100;
    default:
      return 72;
  }
}

export function cssClassForProductIntroEnter(anim: ProductIntroAnimIn): string {
  switch (anim) {
    case "fade":
      return "dibay-pi-enter-fade";
    case "fade_scale":
      return "dibay-pi-enter-fade-scale";
    case "scale":
      return "dibay-pi-enter-scale";
    case "slide_up":
      return "dibay-pi-enter-slide-up";
    default:
      return "";
  }
}

export function cssClassForProductIntroExit(anim: ProductIntroAnimOut): string {
  switch (anim) {
    case "fade":
      return "dibay-pi-exit-fade";
    case "fade_scale":
      return "dibay-pi-exit-fade-scale";
    default:
      return "";
  }
}
