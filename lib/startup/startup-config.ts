/**
 * DIBAY Startup Config — Admin + Public API + Native Intro SSOT.
 *
 * CONTRACT:
 * - Bundle Default → device cache → Native Intro paint → app → background fetch → next cold.
 * - Web Intro remains 0. Native Startup Surface reads this config.
 * - Never block cold start on Admin API / remote asset download.
 */

import {
  DEFAULT_INITIAL_APP_SURFACE,
  normalizeInitialAppSurface,
  type InitialAppSurface,
} from "@/lib/startup/initial-app-surface";
import {
  STARTUP_AMBIENT_ANIMATIONS,
  STARTUP_BG_IMAGE_FITS,
  STARTUP_BG_TYPES,
  STARTUP_ENTER_ANIMATIONS,
  STARTUP_EXIT_ANIMATIONS,
  STARTUP_LOGO_VERTICAL,
  STARTUP_LOGO_WIDTH_PRESETS,
  STARTUP_SPINNER_STYLES,
  clampStartupAnimDurationMs,
  pickEnum,
  type StartupAmbientAnimation,
  type StartupBgImageFit,
  type StartupBgType,
  type StartupEnterAnimation,
  type StartupExitAnimation,
  type StartupLogoVertical,
  type StartupLogoWidthPreset,
  type StartupSpinnerStyle,
} from "@/lib/startup/startup-intro-visual";

export const STARTUP_CONFIG_SETTINGS_KEY = "startup_config_v1" as const;
export const STARTUP_CONFIG_LOCAL_STORAGE_KEY = "dibay:startup:config";

export type StartupConfig = {
  version: number;
  /** Legacy web-intro flags — kept for DB compat; Web Intro stays off. */
  enabled: boolean;
  forceDisable: boolean;
  /** Flat legacy logo URL (synced with logo.url). */
  logoUrl: string;
  darkLogoUrl: string;
  wordmark: string;
  subtitle: string;
  backgroundColor: string;
  backgroundColorDark: string;
  showSpinner: boolean;
  showWordmark: boolean;
  /** Legacy ambient shorthand — mapped from animation.ambient. */
  animation: "none" | "fade" | "pulse";
  season: string;
  priority: number;
  initialSurface: InitialAppSurface;
  logo: {
    source: "default" | "uploaded";
    url: string | null;
    widthPreset: StartupLogoWidthPreset;
    customWidthPx: number | null;
    verticalPosition: StartupLogoVertical;
  };
  background: {
    type: StartupBgType;
    color: string;
    gradientFrom: string | null;
    gradientTo: string | null;
    gradientDirection: "vertical" | "horizontal" | "diagonal";
    imageUrl: string | null;
    imageFit: StartupBgImageFit;
  };
  introAnimation: {
    enter: StartupEnterAnimation;
    exit: StartupExitAnimation;
    ambient: StartupAmbientAnimation;
    enterDurationMs: number;
    exitDurationMs: number;
  };
  caption: {
    enabled: boolean;
    ko: string;
    en: string;
    color: string;
  };
  spinner: {
    enabled: boolean;
    style: StartupSpinnerStyle;
  };
  updatedAt: string;
};

const DEFAULT_LOGO_PATH = "/images/brand/dibay-app-icon-180.png?v=20260614";

export const BUNDLED_STARTUP_CONFIG: StartupConfig = {
  version: 2,
  enabled: false,
  forceDisable: true,
  logoUrl: DEFAULT_LOGO_PATH,
  darkLogoUrl: "",
  wordmark: "DIBAY",
  subtitle: "",
  backgroundColor: "#FFFCFC",
  backgroundColorDark: "#12161d",
  showSpinner: true,
  showWordmark: true,
  animation: "none",
  season: "",
  priority: 0,
  initialSurface: DEFAULT_INITIAL_APP_SURFACE,
  logo: {
    source: "default",
    url: null,
    widthPreset: "medium",
    customWidthPx: null,
    verticalPosition: "center",
  },
  background: {
    type: "solid",
    color: "#FFFCFC",
    gradientFrom: null,
    gradientTo: null,
    gradientDirection: "vertical",
    imageUrl: null,
    imageFit: "cover",
  },
  introAnimation: {
    enter: "fade_in",
    exit: "fade_out",
    ambient: "none",
    enterDurationMs: 280,
    exitDurationMs: 220,
  },
  caption: {
    enabled: false,
    ko: "",
    en: "",
    color: "#0B421A",
  },
  spinner: {
    enabled: true,
    style: "ring",
  },
  updatedAt: "1970-01-01T00:00:00.000Z",
};

/** @deprecated alias */
export const DEFAULT_STARTUP_CONFIG = BUNDLED_STARTUP_CONFIG;

function asTrimmedString(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const t = value.trim();
  return t.length > 0 ? t : fallback;
}

function asOptionalString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function asHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const t = value.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(t) || /^#[0-9A-Fa-f]{8}$/.test(t)) return t;
  return fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function asPriority(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return fallback;
}

function asNullableUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  if (t.startsWith("/") || t.startsWith("https://") || t.startsWith("http://") || t.startsWith("data:")) {
    return t;
  }
  return null;
}

function legacyAmbient(anim: StartupAmbientAnimation): StartupConfig["animation"] {
  if (anim === "soft_pulse" || anim === "breathing") return "pulse";
  if (anim === "spinner") return "fade";
  return "none";
}

export function normalizeStartupConfig(raw: unknown): StartupConfig {
  const base = BUNDLED_STARTUP_CONFIG;
  if (raw == null || typeof raw !== "object") {
    return JSON.parse(JSON.stringify(base)) as StartupConfig;
  }
  const o = raw as Record<string, unknown>;
  const payload =
    o.payload != null && typeof o.payload === "object"
      ? (o.payload as Record<string, unknown>)
      : o;

  const logoObj =
    payload.logo != null && typeof payload.logo === "object"
      ? (payload.logo as Record<string, unknown>)
      : null;
  const bgObj =
    payload.background != null && typeof payload.background === "object"
      ? (payload.background as Record<string, unknown>)
      : null;
  const animObj =
    payload.introAnimation != null && typeof payload.introAnimation === "object"
      ? (payload.introAnimation as Record<string, unknown>)
      : payload.animation != null && typeof payload.animation === "object"
        ? (payload.animation as Record<string, unknown>)
        : null;
  const captionObj =
    payload.caption != null && typeof payload.caption === "object"
      ? (payload.caption as Record<string, unknown>)
      : null;
  const spinnerObj =
    payload.spinner != null && typeof payload.spinner === "object"
      ? (payload.spinner as Record<string, unknown>)
      : null;

  const flatLogoUrl = asTrimmedString(payload.logoUrl, base.logoUrl);
  const logoUrlFromNested = asNullableUrl(logoObj?.url);
  const logoSource =
    logoObj?.source === "uploaded" || (logoUrlFromNested && !logoUrlFromNested.includes("dibay-app-icon"))
      ? "uploaded"
      : pickEnum(logoObj?.source, ["default", "uploaded"] as const, "default");

  const resolvedLogoUrl =
    logoSource === "uploaded" && logoUrlFromNested
      ? logoUrlFromNested
      : logoUrlFromNested ?? (flatLogoUrl.startsWith("/") || flatLogoUrl.startsWith("http") ? flatLogoUrl : base.logoUrl);

  const backgroundColor = asHexColor(
    bgObj?.color ?? payload.backgroundColor,
    base.backgroundColor
  );

  const ambient = pickEnum(
    animObj?.ambient ??
      (payload.animation === "pulse"
        ? "soft_pulse"
        : payload.animation === "fade"
          ? "spinner"
          : "none"),
    STARTUP_AMBIENT_ANIMATIONS,
    base.introAnimation.ambient
  );

  const enter = pickEnum(animObj?.enter, STARTUP_ENTER_ANIMATIONS, base.introAnimation.enter);
  const exit = pickEnum(animObj?.exit, STARTUP_EXIT_ANIMATIONS, base.introAnimation.exit);

  const captionKo = asOptionalString(captionObj?.ko ?? payload.subtitle).slice(0, 80);
  const captionEn = asOptionalString(captionObj?.en).slice(0, 80);
  const captionEnabled = asBoolean(
    captionObj?.enabled,
    Boolean(captionKo || captionEn || asOptionalString(payload.subtitle))
  );

  const showSpinner = asBoolean(spinnerObj?.enabled ?? payload.showSpinner, base.showSpinner);

  const config: StartupConfig = {
    version:
      typeof payload.version === "number" && Number.isFinite(payload.version)
        ? Math.max(2, Math.trunc(payload.version))
        : base.version,
    enabled: asBoolean(payload.enabled, base.enabled),
    forceDisable: asBoolean(payload.forceDisable, base.forceDisable),
    logoUrl: resolvedLogoUrl || DEFAULT_LOGO_PATH,
    darkLogoUrl: asOptionalString(payload.darkLogoUrl),
    wordmark: asTrimmedString(payload.wordmark, base.wordmark).slice(0, 48),
    subtitle: captionKo,
    backgroundColor,
    backgroundColorDark: asHexColor(payload.backgroundColorDark, base.backgroundColorDark),
    showSpinner,
    showWordmark: asBoolean(payload.showWordmark, base.showWordmark),
    animation: legacyAmbient(ambient),
    season: asOptionalString(payload.season).slice(0, 40),
    priority: asPriority(payload.priority, base.priority),
    initialSurface: normalizeInitialAppSurface(
      payload.initialSurface ?? payload.initial_surface
    ),
    logo: {
      source: logoSource === "uploaded" && logoUrlFromNested ? "uploaded" : "default",
      url: logoSource === "uploaded" ? logoUrlFromNested : null,
      widthPreset: pickEnum(logoObj?.widthPreset, STARTUP_LOGO_WIDTH_PRESETS, "medium"),
      customWidthPx:
        typeof logoObj?.customWidthPx === "number" && Number.isFinite(logoObj.customWidthPx)
          ? Math.trunc(logoObj.customWidthPx)
          : null,
      verticalPosition: pickEnum(logoObj?.verticalPosition, STARTUP_LOGO_VERTICAL, "center"),
    },
    background: {
      type: pickEnum(bgObj?.type, STARTUP_BG_TYPES, "solid"),
      color: backgroundColor,
      gradientFrom: null,
      gradientTo: null,
      gradientDirection: pickEnum(
        bgObj?.gradientDirection,
        ["vertical", "horizontal", "diagonal"] as const,
        "vertical"
      ),
      imageUrl: asNullableUrl(bgObj?.imageUrl),
      imageFit: pickEnum(bgObj?.imageFit, STARTUP_BG_IMAGE_FITS, "cover"),
    },
    introAnimation: {
      enter,
      exit,
      ambient,
      enterDurationMs: clampStartupAnimDurationMs(
        animObj?.enterDurationMs,
        base.introAnimation.enterDurationMs
      ),
      exitDurationMs: clampStartupAnimDurationMs(
        animObj?.exitDurationMs,
        base.introAnimation.exitDurationMs
      ),
    },
    caption: {
      enabled: captionEnabled,
      ko: captionKo,
      en: captionEn,
      color: asHexColor(captionObj?.color, base.caption.color),
    },
    spinner: {
      enabled: showSpinner,
      style: pickEnum(spinnerObj?.style, STARTUP_SPINNER_STYLES, "ring"),
    },
    updatedAt: asTrimmedString(payload.updatedAt, new Date().toISOString()),
  };

  // Fix gradient hex (asNullableUrl rejects #hex)
  if (bgObj?.gradientFrom && typeof bgObj.gradientFrom === "string") {
    const g = asHexColor(bgObj.gradientFrom, "");
    config.background.gradientFrom = g || null;
  }
  if (bgObj?.gradientTo && typeof bgObj.gradientTo === "string") {
    const g = asHexColor(bgObj.gradientTo, "");
    config.background.gradientTo = g || null;
  }

  if (config.logo.source === "default") {
    config.logo.url = null;
    config.logoUrl = DEFAULT_LOGO_PATH;
  } else if (config.logo.url) {
    config.logoUrl = config.logo.url;
  }

  return config;
}

export function startupConfigEquals(a: StartupConfig, b: StartupConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Web Intro must stay off — Native owns the surface. */
export function isStartupIntroActive(_config: StartupConfig): boolean {
  return false;
}

/** Compact JSON for Native SharedPreferences / UserDefaults (no nested deep copies). */
export function toNativeStartupConfigPayload(config: StartupConfig): Record<string, unknown> {
  const c = normalizeStartupConfig(config);
  const logoUrl =
    c.logo.source === "uploaded" && c.logo.url
      ? c.logo.url
      : c.logoUrl.startsWith("http")
        ? c.logoUrl
        : null;
  return {
    version: c.version,
    initialSurface: c.initialSurface,
    backgroundType: c.background.type,
    backgroundColor: c.background.color,
    backgroundColorDark: c.backgroundColorDark,
    gradientFrom: c.background.gradientFrom,
    gradientTo: c.background.gradientTo,
    gradientDirection: c.background.gradientDirection,
    backgroundImageUrl: c.background.imageUrl,
    backgroundImageFit: c.background.imageFit,
    logoUrl,
    logoSource: c.logo.source,
    logoWidthPreset: c.logo.widthPreset,
    logoCustomWidthPx: c.logo.customWidthPx,
    logoVertical: c.logo.verticalPosition,
    wordmark: c.wordmark,
    showWordmark: c.showWordmark,
    captionEnabled: c.caption.enabled,
    captionKo: c.caption.ko,
    captionEn: c.caption.en,
    captionColor: c.caption.color,
    showSpinner: c.spinner.enabled,
    spinnerStyle: c.spinner.style,
    enterAnimation: c.introAnimation.enter,
    exitAnimation: c.introAnimation.exit,
    ambientAnimation: c.introAnimation.ambient,
    enterDurationMs: c.introAnimation.enterDurationMs,
    exitDurationMs: c.introAnimation.exitDurationMs,
    updatedAt: c.updatedAt,
  };
}
