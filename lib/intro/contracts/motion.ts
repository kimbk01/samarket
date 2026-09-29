/**
 * DIBAY INTRO — Vertical B
 * Semantic element motion authority (not CSS class names).
 *
 * Backward compatibility:
 * - Missing / null motion on legacy layers / packs → NONE.
 * - No silent reinterpretation of old content.
 *
 * Shared native geometry constants (Android = iOS):
 * - translationDistanceNorm = 0.08 of composition axis (TOP/BOTTOM → height, LEFT/RIGHT → width)
 * - scaleStartFactor = 0.85 (SCALE_IN, centered)
 * - easing = cubic ease-out (0.0, 0.0, 0.2, 1.0)
 */

export const LAYER_MOTION_TYPES = [
  "NONE",
  "FADE_IN",
  "TOP_IN",
  "BOTTOM_IN",
  "LEFT_IN",
  "RIGHT_IN",
  "SCALE_IN",
] as const;

export type LayerMotionTypeV1 = (typeof LAYER_MOTION_TYPES)[number];

export type LayerMotionV1 = {
  readonly type: LayerMotionTypeV1;
  readonly startMs: number;
  readonly durationMs: number;
};

export const DEFAULT_LAYER_MOTION: LayerMotionV1 = {
  type: "NONE",
  startMs: 0,
  durationMs: 0,
};

/** Composition-relative translation distance (normalized 0..1 of relevant axis). */
export const MOTION_TRANSLATION_DISTANCE_NORM = 0.08 as const;

/** SCALE_IN start scale relative to authored geometry (centered). */
export const MOTION_SCALE_START_FACTOR = 0.85 as const;

/** Shared cubic-bezier ease-out (CSS-compatible token; natives map to equivalent). */
export const MOTION_EASING = {
  name: "easeOutCubic" as const,
  css: "cubic-bezier(0, 0, 0.2, 1)" as const,
};

export function isLayerMotionType(value: unknown): value is LayerMotionTypeV1 {
  return (
    typeof value === "string" &&
    (LAYER_MOTION_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Resolve authored/legacy motion.
 * Missing field → NONE (legacy packs / revisions).
 */
export function resolveLayerMotion(
  motion: LayerMotionV1 | null | undefined,
): LayerMotionV1 {
  if (motion == null || typeof motion !== "object") {
    return { ...DEFAULT_LAYER_MOTION };
  }
  const type = isLayerMotionType(motion.type) ? motion.type : "NONE";
  const startMs =
    typeof motion.startMs === "number" &&
    Number.isFinite(motion.startMs) &&
    motion.startMs >= 0
      ? Math.round(motion.startMs)
      : 0;
  const durationMs =
    typeof motion.durationMs === "number" &&
    Number.isFinite(motion.durationMs) &&
    motion.durationMs >= 0
      ? Math.round(motion.durationMs)
      : 0;
  if (type === "NONE") {
    return { type: "NONE", startMs: 0, durationMs: 0 };
  }
  return { type, startMs, durationMs };
}

export type MotionTimingValidation = {
  readonly ok: boolean;
  readonly code?:
    | "INVALID_START"
    | "INVALID_DURATION"
    | "EXCEEDS_SCENE_WINDOW";
  readonly message?: string;
};

/**
 * Motion must not extend Scene authored visibility window.
 * startMs + durationMs <= sceneDurationMs.
 * No silent clamp.
 */
export function validateMotionTiming(
  motion: LayerMotionV1,
  sceneDurationMs: number,
): MotionTimingValidation {
  const m = resolveLayerMotion(motion);
  if (m.type === "NONE") {
    return { ok: true };
  }
  if (!Number.isInteger(m.startMs) || m.startMs < 0) {
    return {
      ok: false,
      code: "INVALID_START",
      message: "시작 시간은 0 이상이어야 합니다",
    };
  }
  if (!Number.isInteger(m.durationMs) || m.durationMs < 0) {
    return {
      ok: false,
      code: "INVALID_DURATION",
      message: "지속 시간은 0 이상이어야 합니다",
    };
  }
  if (
    !Number.isInteger(sceneDurationMs) ||
    sceneDurationMs < 0 ||
    m.startMs + m.durationMs > sceneDurationMs
  ) {
    return {
      ok: false,
      code: "EXCEEDS_SCENE_WINDOW",
      message:
        "요소 애니메이션이 장면 표시 시간을 초과합니다 (시작+지속 ≤ 장면 시간)",
    };
  }
  return { ok: true };
}

export function motionSummaryKo(motion: LayerMotionV1): string {
  const m = resolveLayerMotion(motion);
  if (m.type === "NONE") return "없음";
  const label =
    m.type === "FADE_IN"
      ? "페이드 인"
      : m.type === "TOP_IN"
        ? "위에서 나타남"
        : m.type === "BOTTOM_IN"
          ? "아래에서 나타남"
          : m.type === "LEFT_IN"
            ? "왼쪽에서 나타남"
            : m.type === "RIGHT_IN"
              ? "오른쪽에서 나타남"
              : m.type === "SCALE_IN"
                ? "확대하며 나타남"
                : m.type;
  const startSec = (m.startMs / 1000).toFixed(1);
  const endSec = ((m.startMs + m.durationMs) / 1000).toFixed(1);
  return `${label} · ${startSec}초 → ${endSec}초`;
}
