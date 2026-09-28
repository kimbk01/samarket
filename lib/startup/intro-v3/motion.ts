/**
 * V3 motion schema. Semantic tokens only — no CSS / Tailwind strings persisted.
 * Renderer is V3-5; this cut validates and stores.
 */

export const INTRO_V3_ENTER_PRESETS = [
  "NONE",
  "FADE_IN",
  "SLIDE_UP",
  "SLIDE_DOWN",
  "SLIDE_LEFT",
  "SLIDE_RIGHT",
  "SCALE_IN",
  "FADE_SCALE",
] as const;

export type IntroV3EnterPreset = (typeof INTRO_V3_ENTER_PRESETS)[number];

export const INTRO_V3_IDLE_PRESETS = ["NONE"] as const;
export type IntroV3IdlePreset = (typeof INTRO_V3_IDLE_PRESETS)[number];

export const INTRO_V3_EXIT_PRESETS = ["NONE"] as const;
export type IntroV3ExitPreset = (typeof INTRO_V3_EXIT_PRESETS)[number];

export const INTRO_V3_EASINGS = ["LINEAR", "STANDARD", "DECELERATE", "ACCELERATE"] as const;
export type IntroV3Easing = (typeof INTRO_V3_EASINGS)[number];

export const INTRO_V3_SLIDE_DIRECTIONS = ["UP", "DOWN", "LEFT", "RIGHT"] as const;
export type IntroV3SlideDirection = (typeof INTRO_V3_SLIDE_DIRECTIONS)[number];

export const INTRO_V3_SCENE_TRANSITION_PRESETS = ["CUT", "FADE", "SLIDE", "CROSSFADE"] as const;
export type IntroV3SceneTransitionPreset = (typeof INTRO_V3_SCENE_TRANSITION_PRESETS)[number];

export type IntroV3MotionClip = {
  preset: IntroV3EnterPreset | IntroV3IdlePreset | IntroV3ExitPreset;
  delayMs: number;
  durationMs: number;
  easing: IntroV3Easing;
  direction?: IntroV3SlideDirection;
  distancePct?: number;
  fromScale?: number;
};

export type IntroV3LayerMotion = {
  enter: IntroV3MotionClip;
  idle: IntroV3MotionClip;
  exit: IntroV3MotionClip;
};

export type IntroV3SceneTransition = {
  preset: IntroV3SceneTransitionPreset;
  durationMs: number;
  easing: IntroV3Easing;
  direction?: IntroV3SlideDirection;
};

const CSS_MOTION_RE =
  /cubic-bezier|ease-in|ease-out|ease-in-out|linear\(|var\(--|tailwind|translate[XY]?|@keyframes|ms\b|px\b/i;

function isToken<T extends string>(raw: unknown, allowed: readonly T[]): raw is T {
  return typeof raw === "string" && (allowed as readonly string[]).includes(raw);
}

function finiteMs(raw: unknown, fallback: number): number | null {
  if (raw == null) return fallback;
  if (typeof raw === "string") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 60_000) return null;
  return Math.round(n);
}

export function defaultIntroV3EnterNone(): IntroV3MotionClip {
  return { preset: "NONE", delayMs: 0, durationMs: 0, easing: "STANDARD" };
}

export function defaultIntroV3IdleNone(): IntroV3MotionClip {
  return { preset: "NONE", delayMs: 0, durationMs: 0, easing: "STANDARD" };
}

export function defaultIntroV3ExitNone(): IntroV3MotionClip {
  return { preset: "NONE", delayMs: 0, durationMs: 0, easing: "STANDARD" };
}

export function defaultIntroV3LayerMotion(): IntroV3LayerMotion {
  return {
    enter: defaultIntroV3EnterNone(),
    idle: defaultIntroV3IdleNone(),
    exit: defaultIntroV3ExitNone(),
  };
}

export function defaultIntroV3SceneTransition(): IntroV3SceneTransition {
  return { preset: "FADE", durationMs: 300, easing: "STANDARD" };
}

export function motionLooksLikeCss(raw: unknown): boolean {
  if (typeof raw === "string") return CSS_MOTION_RE.test(raw);
  if (!raw || typeof raw !== "object") return false;
  return Object.values(raw as Record<string, unknown>).some((v) => motionLooksLikeCss(v));
}

export function parseIntroV3MotionClip(
  raw: unknown,
  allowedPresets: readonly string[]
): IntroV3MotionClip | null {
  if (motionLooksLikeCss(raw)) return null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  if (!isToken(rec.preset, allowedPresets)) return null;
  if (!isToken(rec.easing, INTRO_V3_EASINGS)) return null;
  const delayMs = finiteMs(rec.delayMs, 0);
  const durationMs = finiteMs(rec.durationMs, rec.preset === "NONE" ? 0 : 400);
  if (delayMs == null || durationMs == null) return null;
  const clip: IntroV3MotionClip = {
    preset: rec.preset as IntroV3MotionClip["preset"],
    delayMs,
    durationMs,
    easing: rec.easing,
  };
  if (rec.direction != null) {
    if (!isToken(rec.direction, INTRO_V3_SLIDE_DIRECTIONS)) return null;
    clip.direction = rec.direction;
  }
  if (rec.distancePct != null) {
    const n = Number(rec.distancePct);
    if (!Number.isFinite(n) || n < 0 || n > 100) return null;
    clip.distancePct = n;
  }
  if (rec.fromScale != null) {
    const n = Number(rec.fromScale);
    if (!Number.isFinite(n) || n < 0 || n > 4) return null;
    clip.fromScale = n;
  }
  return clip;
}

export function parseIntroV3LayerMotion(raw: unknown): IntroV3LayerMotion | null {
  if (raw == null) return defaultIntroV3LayerMotion();
  if (motionLooksLikeCss(raw)) return null;
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const enter = parseIntroV3MotionClip(rec.enter ?? defaultIntroV3EnterNone(), INTRO_V3_ENTER_PRESETS);
  const idle = parseIntroV3MotionClip(rec.idle ?? defaultIntroV3IdleNone(), INTRO_V3_IDLE_PRESETS);
  const exit = parseIntroV3MotionClip(rec.exit ?? defaultIntroV3ExitNone(), INTRO_V3_EXIT_PRESETS);
  if (!enter || !idle || !exit) return null;
  return { enter, idle, exit };
}

export function parseIntroV3SceneTransition(raw: unknown): IntroV3SceneTransition | null {
  if (raw == null) return defaultIntroV3SceneTransition();
  if (motionLooksLikeCss(raw)) return null;
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (!isToken(rec.preset, INTRO_V3_SCENE_TRANSITION_PRESETS)) return null;
  if (!isToken(rec.easing, INTRO_V3_EASINGS)) return null;
  const durationMs = finiteMs(rec.durationMs, rec.preset === "CUT" ? 0 : 300);
  if (durationMs == null) return null;
  const next: IntroV3SceneTransition = { preset: rec.preset, durationMs, easing: rec.easing };
  if (rec.direction != null) {
    if (!isToken(rec.direction, INTRO_V3_SLIDE_DIRECTIONS)) return null;
    next.direction = rec.direction;
  }
  return next;
}
