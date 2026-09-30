/**
 * REBUILD 14 P3 — System Start phase readiness ladder (semantic only).
 *
 * Do not collapse:
 * IR ready ≠ draw model ready ≠ surface attached ≠ frame committed ≠ Owner-visible
 */

export const SYSTEM_START_PHASE = "SYSTEM_START" as const;

export type SystemStartReadiness =
  | "SS_IR_READY"
  | "SS_RENDER_READY"
  | "SS_PAINTABLE"
  | "SS_FIRST_MEANINGFUL_FRAME_COMMITTED"
  | "SS_OWNER_VISIBLE";

const ORDER: readonly SystemStartReadiness[] = [
  "SS_IR_READY",
  "SS_RENDER_READY",
  "SS_PAINTABLE",
  "SS_FIRST_MEANINGFUL_FRAME_COMMITTED",
  "SS_OWNER_VISIBLE",
] as const;

export type SystemStartPhaseState = {
  readonly phase: typeof SYSTEM_START_PHASE;
  readonly readiness: SystemStartReadiness | null;
  readonly generationId: string | null;
};

export function createSystemStartPhaseState(): SystemStartPhaseState {
  return {
    phase: SYSTEM_START_PHASE,
    readiness: null,
    generationId: null,
  };
}

export function advanceSystemStartReadiness(
  state: SystemStartPhaseState,
  next: SystemStartReadiness,
  generationId?: string | null,
):
  | { readonly ok: true; readonly value: SystemStartPhaseState }
  | { readonly ok: false; readonly reason: string; readonly value: SystemStartPhaseState } {
  const curIdx = state.readiness == null ? -1 : ORDER.indexOf(state.readiness);
  const nextIdx = ORDER.indexOf(next);
  if (nextIdx < 0) {
    return { ok: false, reason: "unknown_readiness", value: state };
  }
  if (nextIdx <= curIdx) {
    // idempotent stay / ignore regression
    return { ok: true, value: state };
  }
  if (nextIdx > curIdx + 1) {
    return { ok: false, reason: "readiness_skip_forbidden", value: state };
  }
  return {
    ok: true,
    value: {
      phase: SYSTEM_START_PHASE,
      readiness: next,
      generationId:
        generationId !== undefined ? generationId : state.generationId,
    },
  };
}

/**
 * Production presentation inactive ⇒ must not claim SS_OWNER_VISIBLE as device truth.
 * Tests may advance the semantic ladder with an explicit test harness flag.
 */
export function mayClaimOwnerVisible(args: {
  readonly productionPresentationActive: boolean;
  readonly testHarnessAllowOwnerVisibleSemantic: boolean;
}): boolean {
  if (args.productionPresentationActive) return true;
  return args.testHarnessAllowOwnerVisibleSemantic === true;
}
