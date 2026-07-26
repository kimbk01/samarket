/**
 * Startup Intro visual enums — Admin preview + Android/iOS Native share the same IDs.
 * DO NOT: expose platform-only animations in Admin.
 */

export const STARTUP_LOGO_WIDTH_PRESETS = ["small", "medium", "large", "custom"] as const;
export type StartupLogoWidthPreset = (typeof STARTUP_LOGO_WIDTH_PRESETS)[number];

export const STARTUP_LOGO_VERTICAL = ["upper", "center", "lower"] as const;
export type StartupLogoVertical = (typeof STARTUP_LOGO_VERTICAL)[number];

export const STARTUP_BG_TYPES = ["solid", "gradient", "image"] as const;
export type StartupBgType = (typeof STARTUP_BG_TYPES)[number];

export const STARTUP_BG_IMAGE_FITS = ["cover", "contain", "center"] as const;
export type StartupBgImageFit = (typeof STARTUP_BG_IMAGE_FITS)[number];

export const STARTUP_ENTER_ANIMATIONS = [
  "none",
  "fade_in",
  "scale_in",
  "fade_scale_in",
  "slide_up",
  "slide_down",
] as const;
export type StartupEnterAnimation = (typeof STARTUP_ENTER_ANIMATIONS)[number];

export const STARTUP_EXIT_ANIMATIONS = [
  "none",
  "fade_out",
  "scale_out",
  "fade_scale_out",
  "slide_up",
] as const;
export type StartupExitAnimation = (typeof STARTUP_EXIT_ANIMATIONS)[number];

export const STARTUP_AMBIENT_ANIMATIONS = ["none", "soft_pulse", "breathing", "spinner"] as const;
export type StartupAmbientAnimation = (typeof STARTUP_AMBIENT_ANIMATIONS)[number];

export const STARTUP_SPINNER_STYLES = ["ring", "dots", "bar"] as const;
export type StartupSpinnerStyle = (typeof STARTUP_SPINNER_STYLES)[number];

export const STARTUP_ANIM_DURATION_MS_MIN = 150;
export const STARTUP_ANIM_DURATION_MS_MAX = 1200;

export function clampStartupAnimDurationMs(value: unknown, fallback: number): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(
    STARTUP_ANIM_DURATION_MS_MAX,
    Math.max(STARTUP_ANIM_DURATION_MS_MIN, Math.trunc(n))
  );
}

export function pickEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  return fallback;
}

/** CSS keyframes name hints for Admin preview (same enum → same motion). */
export function cssClassForEnter(anim: StartupEnterAnimation): string {
  switch (anim) {
    case "fade_in":
      return "dibay-su-enter-fade";
    case "scale_in":
      return "dibay-su-enter-scale";
    case "fade_scale_in":
      return "dibay-su-enter-fade-scale";
    case "slide_up":
      return "dibay-su-enter-slide-up";
    case "slide_down":
      return "dibay-su-enter-slide-down";
    default:
      return "";
  }
}

export function cssClassForExit(anim: StartupExitAnimation): string {
  switch (anim) {
    case "fade_out":
      return "dibay-su-exit-fade";
    case "scale_out":
      return "dibay-su-exit-scale";
    case "fade_scale_out":
      return "dibay-su-exit-fade-scale";
    case "slide_up":
      return "dibay-su-exit-slide-up";
    default:
      return "";
  }
}

export function cssClassForAmbient(anim: StartupAmbientAnimation): string {
  switch (anim) {
    case "soft_pulse":
      return "dibay-su-ambient-pulse";
    case "breathing":
      return "dibay-su-ambient-breathe";
    case "spinner":
      return "dibay-su-ambient-spin";
    default:
      return "";
  }
}

export function logoWidthDp(preset: StartupLogoWidthPreset, customPx: number | null): number {
  switch (preset) {
    case "small":
      return 56;
    case "large":
      return 96;
    case "custom":
      return customPx && customPx > 0 ? Math.min(160, Math.max(40, customPx)) : 72;
    default:
      return 72;
  }
}
