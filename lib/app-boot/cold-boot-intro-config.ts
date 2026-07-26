/**
 * DIBAY Cold Boot Intro — shared config contract (server + client safe).
 *
 * CONTRACT:
 * - Cold start paints bundled DEFAULT immediately (never wait for network).
 * - Last successful remote config is cached in localStorage for the *next* launch.
 * - App Ready (shellReady / auth_shell_fallback / error_boundary) is the only hide signal.
 * DO NOT: minimum display duration · block first paint on remote fetch · badge/API wait.
 */

export const COLD_BOOT_INTRO_SETTINGS_KEY = "cold_boot_intro_v1" as const;
export const COLD_BOOT_INTRO_LOCAL_STORAGE_KEY = "dibay:cold-boot-intro:v1";

export type ColdBootIntroConfig = {
  version: 1;
  enabled: boolean;
  logoUrl: string;
  wordmark: string;
  subtitle: string;
  backgroundColor: string;
  backgroundColorDark: string;
  showSpinner: boolean;
  showWordmark: boolean;
  updatedAt: string;
};

export const DEFAULT_COLD_BOOT_INTRO_CONFIG: ColdBootIntroConfig = {
  version: 1,
  enabled: true,
  logoUrl: "/images/brand/dibay-app-icon-180.png?v=20260614",
  wordmark: "DIBAY",
  subtitle: "",
  backgroundColor: "#FFFCFC",
  backgroundColorDark: "#12161d",
  showSpinner: true,
  showWordmark: true,
  updatedAt: "1970-01-01T00:00:00.000Z",
};

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

export function normalizeColdBootIntroConfig(raw: unknown): ColdBootIntroConfig {
  const base = DEFAULT_COLD_BOOT_INTRO_CONFIG;
  if (raw == null || typeof raw !== "object") return { ...base };
  const o = raw as Record<string, unknown>;
  const payload =
    o.payload != null && typeof o.payload === "object"
      ? (o.payload as Record<string, unknown>)
      : o;

  return {
    version: 1,
    enabled: asBoolean(payload.enabled, base.enabled),
    logoUrl: asTrimmedString(payload.logoUrl, base.logoUrl),
    wordmark: asTrimmedString(payload.wordmark, base.wordmark).slice(0, 48),
    subtitle: asOptionalString(payload.subtitle).slice(0, 80),
    backgroundColor: asHexColor(payload.backgroundColor, base.backgroundColor),
    backgroundColorDark: asHexColor(payload.backgroundColorDark, base.backgroundColorDark),
    showSpinner: asBoolean(payload.showSpinner, base.showSpinner),
    showWordmark: asBoolean(payload.showWordmark, base.showWordmark),
    updatedAt: asTrimmedString(payload.updatedAt, new Date().toISOString()),
  };
}

export function coldBootIntroConfigEquals(a: ColdBootIntroConfig, b: ColdBootIntroConfig): boolean {
  return (
    a.enabled === b.enabled &&
    a.logoUrl === b.logoUrl &&
    a.wordmark === b.wordmark &&
    a.subtitle === b.subtitle &&
    a.backgroundColor === b.backgroundColor &&
    a.backgroundColorDark === b.backgroundColorDark &&
    a.showSpinner === b.showSpinner &&
    a.showWordmark === b.showWordmark
  );
}
