import { validateIntroCta } from "@/lib/startup/intro-v2/cta";
import { validateIntroLayers } from "@/lib/startup/intro-v2/layers";
import {
  INTRO_ADVANCE_MODES,
  INTRO_INTERACTION_MODES,
  INTRO_SKIP_POLICIES,
  INTRO_TRANSITIONS,
  isIn,
  type ContractResult,
  type IntroAdvanceMode,
  type IntroCta,
  type IntroInteractionMode,
  type IntroLayer,
  type IntroSkipPolicy,
  type IntroTransition,
} from "@/lib/startup/intro-v2/types";

export type IntroSceneAdvanceInput = {
  advanceMode: IntroAdvanceMode;
  durationMs: number | null;
  maxHoldMs: number | null;
  allowIncomplete?: boolean;
};

export function validateIntroAdvance(input: IntroSceneAdvanceInput): ContractResult<IntroSceneAdvanceInput> {
  if (!isIn(INTRO_ADVANCE_MODES, input.advanceMode)) return { ok: false, error: "advance_mode_invalid" };
  const duration = input.durationMs;
  const hold = input.maxHoldMs;
  if (duration != null && (!Number.isInteger(duration) || duration < 0)) {
    return { ok: false, error: "duration_ms_invalid" };
  }
  if (hold != null && (!Number.isInteger(hold) || hold < 0)) {
    return { ok: false, error: "max_hold_ms_invalid" };
  }
  if (input.advanceMode === "timer") {
    if (duration == null || duration < 1) return { ok: false, error: "timer_duration_required" };
    return { ok: true, value: input };
  }
  if (hold == null || hold < 1) {
    if (input.allowIncomplete && duration == null && hold == null) return { ok: true, value: input };
    return { ok: false, error: "max_hold_ms_required" };
  }
  return { ok: true, value: input };
}

export type IntroSceneContract = {
  advanceMode: IntroAdvanceMode;
  durationMs: number | null;
  maxHoldMs: number | null;
  transition: IntroTransition;
  skipPolicy: IntroSkipPolicy;
  interactionMode: IntroInteractionMode;
  interactionLayerId: string | null;
  layers: IntroLayer[];
  cta: IntroCta | null;
  backgroundColor: string;
  backgroundAssetId: string | null;
};

const HEX = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

export function validateIntroSceneContract(
  raw: unknown,
  opts?: { allowIncompleteAdvance?: boolean }
): ContractResult<IntroSceneContract> {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "scene_not_object" };
  }
  const rec = raw as Record<string, unknown>;
  if (!isIn(INTRO_ADVANCE_MODES, rec.advanceMode)) return { ok: false, error: "advance_mode_invalid" };
  const advance = validateIntroAdvance({
    advanceMode: rec.advanceMode,
    durationMs: rec.durationMs == null ? null : Number(rec.durationMs),
    maxHoldMs: rec.maxHoldMs == null ? null : Number(rec.maxHoldMs),
    allowIncomplete: opts?.allowIncompleteAdvance === true,
  });
  if (!advance.ok) return advance;
  if (!isIn(INTRO_TRANSITIONS, rec.transition ?? "none")) return { ok: false, error: "transition_invalid" };
  if (!isIn(INTRO_SKIP_POLICIES, rec.skipPolicy ?? "deny")) return { ok: false, error: "skip_policy_invalid" };
  if (!isIn(INTRO_INTERACTION_MODES, rec.interactionMode ?? "none")) {
    return { ok: false, error: "interaction_mode_invalid" };
  }
  const interactionMode = (rec.interactionMode ?? "none") as IntroInteractionMode;
  const interactionLayerId =
    rec.interactionLayerId == null || rec.interactionLayerId === ""
      ? null
      : String(rec.interactionLayerId);
  if (interactionMode === "tap_layer" && !interactionLayerId) {
    return { ok: false, error: "interaction_layer_required" };
  }
  const layers = validateIntroLayers(rec.layers ?? []);
  if (!layers.ok) return layers;
  if (interactionLayerId && !layers.value.some((l) => l.id === interactionLayerId)) {
    return { ok: false, error: "interaction_layer_missing" };
  }
  const cta = validateIntroCta(rec.cta ?? null);
  if (!cta.ok) return cta;
  const backgroundColor = String(rec.backgroundColor ?? "#ffffff");
  if (!HEX.test(backgroundColor)) return { ok: false, error: "background_color_invalid" };
  const backgroundAssetId =
    rec.backgroundAssetId == null || rec.backgroundAssetId === ""
      ? null
      : String(rec.backgroundAssetId);
  return {
    ok: true,
    value: {
      advanceMode: advance.value.advanceMode,
      durationMs: advance.value.durationMs,
      maxHoldMs: advance.value.maxHoldMs,
      transition: (rec.transition ?? "none") as IntroTransition,
      skipPolicy: (rec.skipPolicy ?? "deny") as IntroSkipPolicy,
      interactionMode,
      interactionLayerId,
      layers: layers.value,
      cta: cta.value,
      backgroundColor,
      backgroundAssetId,
    },
  };
}
