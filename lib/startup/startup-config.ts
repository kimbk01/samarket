/**
 * DIBAY Startup Config — shared contract (server + client + boot HTML build).
 *
 * CONTRACT:
 * - Bundle Default → Local Cache → immediate Startup → React → background fetch → next launch.
 * - Never wait for Admin API / network on cold start.
 * - App Ready (shellReady / auth_shell_fallback / error_boundary) is the only hide signal.
 * DO NOT: minimum display duration · block first paint on remote fetch · badge/API wait.
 */

import {
  DEFAULT_INITIAL_APP_SURFACE,
  normalizeInitialAppSurface,
  type InitialAppSurface,
} from "@/lib/startup/initial-app-surface";

export const STARTUP_CONFIG_SETTINGS_KEY = "startup_config_v1" as const;
export const STARTUP_CONFIG_LOCAL_STORAGE_KEY = "dibay:startup:config";

export type StartupConfig = {
  version: 1;
  enabled: boolean;
  forceDisable: boolean;
  logoUrl: string;
  darkLogoUrl: string;
  wordmark: string;
  subtitle: string;
  backgroundColor: string;
  backgroundColorDark: string;
  showSpinner: boolean;
  showWordmark: boolean;
  animation: "none" | "fade" | "pulse";
  season: string;
  priority: number;
  /** Cold-start main tab — Admin enum only (see `initial-app-surface.ts`). */
  initialSurface: InitialAppSurface;
  updatedAt: string;
};

export const BUNDLED_STARTUP_CONFIG: StartupConfig = {
  version: 1,
  /** Web Startup Intro disabled — Native splash is the only cold intro surface. */
  enabled: false,
  forceDisable: true,
  logoUrl: "/images/brand/dibay-app-icon-180.png?v=20260614",
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
  updatedAt: "1970-01-01T00:00:00.000Z",
};

/** @deprecated alias — prefer BUNDLED_STARTUP_CONFIG */
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

function asAnimation(value: unknown): StartupConfig["animation"] {
  if (value === "fade" || value === "pulse" || value === "none") return value;
  return "none";
}

function asPriority(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return fallback;
}

export function normalizeStartupConfig(raw: unknown): StartupConfig {
  const base = BUNDLED_STARTUP_CONFIG;
  if (raw == null || typeof raw !== "object") return { ...base };
  const o = raw as Record<string, unknown>;
  const payload =
    o.payload != null && typeof o.payload === "object"
      ? (o.payload as Record<string, unknown>)
      : o;

  return {
    version: 1,
    enabled: asBoolean(payload.enabled, base.enabled),
    forceDisable: asBoolean(payload.forceDisable, base.forceDisable),
    logoUrl: asTrimmedString(payload.logoUrl, base.logoUrl),
    darkLogoUrl: asOptionalString(payload.darkLogoUrl),
    wordmark: asTrimmedString(payload.wordmark, base.wordmark).slice(0, 48),
    subtitle: asOptionalString(payload.subtitle).slice(0, 80),
    backgroundColor: asHexColor(payload.backgroundColor, base.backgroundColor),
    backgroundColorDark: asHexColor(payload.backgroundColorDark, base.backgroundColorDark),
    showSpinner: asBoolean(payload.showSpinner, base.showSpinner),
    showWordmark: asBoolean(payload.showWordmark, base.showWordmark),
    animation: asAnimation(payload.animation),
    season: asOptionalString(payload.season).slice(0, 40),
    priority: asPriority(payload.priority, base.priority),
    initialSurface: normalizeInitialAppSurface(
      payload.initialSurface ?? payload.initial_surface
    ),
    updatedAt: asTrimmedString(payload.updatedAt, new Date().toISOString()),
  };
}

export function startupConfigEquals(a: StartupConfig, b: StartupConfig): boolean {
  return (
    a.enabled === b.enabled &&
    a.forceDisable === b.forceDisable &&
    a.logoUrl === b.logoUrl &&
    a.darkLogoUrl === b.darkLogoUrl &&
    a.wordmark === b.wordmark &&
    a.subtitle === b.subtitle &&
    a.backgroundColor === b.backgroundColor &&
    a.backgroundColorDark === b.backgroundColorDark &&
    a.showSpinner === b.showSpinner &&
    a.showWordmark === b.showWordmark &&
    a.animation === b.animation &&
    a.season === b.season &&
    a.priority === b.priority &&
    a.initialSurface === b.initialSurface
  );
}

export function isStartupIntroActive(config: StartupConfig): boolean {
  if (config.forceDisable) return false;
  return config.enabled;
}
