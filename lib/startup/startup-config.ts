/**
 * DIBAY Startup Config — general app boot authority only.
 *
 * CONTRACT (R15 ABSOLUTE ZERO):
 * - KEEP: initialSurface (default bottom tab) + version/updatedAt metadata.
 * - FORBIDDEN: Intro / System Start presentation authority
 *   (logo, background, media, duration, hold, scene, transition, generation,
 *    package, live pointer, targeting, frequency, intro enabled, caption, spinner).
 * - OS Splash / LaunchScreen → AppShell / Home. No product Intro paint.
 */

import {
  DEFAULT_INITIAL_APP_SURFACE,
  normalizeInitialAppSurface,
  type InitialAppSurface,
} from "@/lib/startup/initial-app-surface";

export const STARTUP_CONFIG_SETTINGS_KEY = "startup_config_v1" as const;
export const STARTUP_CONFIG_LOCAL_STORAGE_KEY = "dibay:startup:config";

/** General app boot authority — no Intro/System Start presentation fields. */
export type StartupConfig = {
  version: number;
  initialSurface: InitialAppSurface;
  updatedAt: string;
};

export const BUNDLED_STARTUP_CONFIG: StartupConfig = {
  version: 2,
  initialSurface: DEFAULT_INITIAL_APP_SURFACE,
  updatedAt: "1970-01-01T00:00:00.000Z",
};

/** @deprecated alias */
export const DEFAULT_STARTUP_CONFIG = BUNDLED_STARTUP_CONFIG;

function asTrimmedString(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const t = value.trim();
  return t.length > 0 ? t : fallback;
}

/**
 * Normalize any stored / remote payload to boot-only authority.
 * Intro-shaped fields are ignored (stripped), never rehydrated.
 */
export function normalizeStartupConfig(raw: unknown): StartupConfig {
  const base = BUNDLED_STARTUP_CONFIG;
  if (raw == null || typeof raw !== "object") {
    return { ...base };
  }
  const o = raw as Record<string, unknown>;
  const payload =
    o.payload != null && typeof o.payload === "object"
      ? (o.payload as Record<string, unknown>)
      : o;

  return {
    version:
      typeof payload.version === "number" && Number.isFinite(payload.version)
        ? Math.max(2, Math.trunc(payload.version))
        : base.version,
    initialSurface: normalizeInitialAppSurface(
      payload.initialSurface ?? payload.initial_surface
    ),
    updatedAt: asTrimmedString(payload.updatedAt, new Date().toISOString()),
  };
}

export function startupConfigEquals(a: StartupConfig, b: StartupConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Authored Intro overlay is removed. Always false. */
export function isStartupIntroActive(_config: StartupConfig): boolean {
  return false;
}

/** Native bridge payload — boot surface only (no Intro presentation). */
export function toNativeStartupConfigPayload(config: StartupConfig): Record<string, unknown> {
  const c = normalizeStartupConfig(config);
  return {
    version: c.version,
    initialSurface: c.initialSurface,
    updatedAt: c.updatedAt,
  };
}
