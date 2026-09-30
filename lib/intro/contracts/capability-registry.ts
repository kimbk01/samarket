/**
 * DIBAY INTRO — ONE capability registry (Admin / Validator / Preview / Package / Native).
 * Transition tokens NEVER share the Element Motion namespace.
 */

export const TRANSITION_TYPES_V1 = [
  "CUT",
  "FADE",
  "SLIDE_LEFT",
  "SLIDE_RIGHT",
  "SLIDE_UP",
  "SLIDE_DOWN",
] as const;
export type TransitionTypeV1 = (typeof TRANSITION_TYPES_V1)[number];

export type TransitionV1 = {
  readonly type: TransitionTypeV1;
  /** CUT must be 0. Others >= 0. */
  readonly durationMs: number;
};

export const TRANSITION_OPERATOR_LABELS: Record<TransitionTypeV1, string> = {
  CUT: "즉시 전환",
  FADE: "페이드",
  SLIDE_LEFT: "왼쪽으로",
  SLIDE_RIGHT: "오른쪽으로",
  SLIDE_UP: "위로",
  SLIDE_DOWN: "아래로",
};

export const MOTION_TYPES_V1 = [
  "NONE",
  "FADE_IN",
  "ENTER_LEFT",
  "ENTER_RIGHT",
  "ENTER_UP",
  "ENTER_DOWN",
  "SCALE_IN",
] as const;
export type MotionTypeV1 = (typeof MOTION_TYPES_V1)[number];

export const MOTION_OPERATOR_LABELS: Record<MotionTypeV1, string> = {
  NONE: "없음",
  FADE_IN: "페이드",
  ENTER_LEFT: "왼쪽에서",
  ENTER_RIGHT: "오른쪽에서",
  ENTER_UP: "위에서",
  ENTER_DOWN: "아래에서",
  SCALE_IN: "확대",
};

export type MotionV1 = {
  readonly type: MotionTypeV1;
  readonly startMs: number;
  readonly durationMs: number;
};

export const DEFAULT_MOTION: MotionV1 = {
  type: "NONE",
  startMs: 0,
  durationMs: 0,
};

export const DEFAULT_TRANSITION_CUT: TransitionV1 = {
  type: "CUT",
  durationMs: 0,
};

export const DEFAULT_TRANSITION_FADE: TransitionV1 = {
  type: "FADE",
  durationMs: 400,
};

const TRANSITION_SET = new Set<string>(TRANSITION_TYPES_V1);
const MOTION_SET = new Set<string>(MOTION_TYPES_V1);

export function isTransitionTypeV1(raw: unknown): raw is TransitionTypeV1 {
  return typeof raw === "string" && TRANSITION_SET.has(raw);
}

export function isMotionTypeV1(raw: unknown): raw is MotionTypeV1 {
  return typeof raw === "string" && MOTION_SET.has(raw);
}

/**
 * Normalize legacy shapes into flat TransitionV1.
 * - { type:"SLIDE", direction:"LEFT" } → SLIDE_LEFT
 * - CUT duration forced to 0
 */
export function normalizeTransitionV1(raw: unknown): TransitionV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const durationMs = Number(o.durationMs);
  if (o.type === "SLIDE" && typeof o.direction === "string") {
    const map: Record<string, TransitionTypeV1> = {
      LEFT: "SLIDE_LEFT",
      RIGHT: "SLIDE_RIGHT",
      UP: "SLIDE_UP",
      DOWN: "SLIDE_DOWN",
    };
    const t = map[o.direction];
    if (!t || !Number.isFinite(durationMs) || durationMs < 0) return null;
    return { type: t, durationMs };
  }
  if (!isTransitionTypeV1(o.type)) return null;
  if (o.type === "CUT") return { type: "CUT", durationMs: 0 };
  if (!Number.isFinite(durationMs) || durationMs < 0) return null;
  return { type: o.type, durationMs };
}

/**
 * Normalize illegal / legacy motion tokens. Never invent Transition tokens as Motion.
 * Mapping recorded for migration audit.
 */
export const MOTION_NORMALIZATION_MAP: Readonly<Record<string, MotionTypeV1>> = {
  ENTER_TOP: "ENTER_UP",
  ENTER_BOTTOM: "ENTER_DOWN",
  SLIDE_LEFT: "ENTER_LEFT",
  SLIDE_RIGHT: "ENTER_RIGHT",
  SLIDE_UP: "ENTER_UP",
  SLIDE_DOWN: "ENTER_DOWN",
  SLIDE_IN_LEFT: "ENTER_LEFT",
  SLIDE_IN_RIGHT: "ENTER_RIGHT",
  SLIDE_IN_UP: "ENTER_UP",
  SLIDE_IN_DOWN: "ENTER_DOWN",
};

export function normalizeMotionV1(raw: unknown): MotionV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  let type = o.type;
  if (typeof type === "string" && MOTION_NORMALIZATION_MAP[type]) {
    type = MOTION_NORMALIZATION_MAP[type];
  }
  if (!isMotionTypeV1(type)) return null;
  const startMs = Number(o.startMs ?? 0);
  const durationMs = Number(o.durationMs ?? (type === "NONE" ? 0 : 500));
  if (!Number.isFinite(startMs) || startMs < 0) return null;
  if (!Number.isFinite(durationMs) || durationMs < 0) return null;
  if (type === "NONE") return { type: "NONE", startMs: 0, durationMs: 0 };
  return { type, startMs, durationMs };
}

/** Native adapter: flat transition → slide axis. */
export function transitionSlideAxis(
  type: TransitionTypeV1,
): "LEFT" | "RIGHT" | "UP" | "DOWN" | null {
  switch (type) {
    case "SLIDE_LEFT":
      return "LEFT";
    case "SLIDE_RIGHT":
      return "RIGHT";
    case "SLIDE_UP":
      return "UP";
    case "SLIDE_DOWN":
      return "DOWN";
    default:
      return null;
  }
}
