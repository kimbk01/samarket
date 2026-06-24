/**
 * Call V4 Phase 6 — video / PiP / dock flags (V4 lane only).
 * Global CM_CALL_PHASE0_BASICS_ONLY stays true; legacy CallClient unaffected.
 */
export function isCallV4VideoEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DIBAY_CALL_V4_VIDEO === "1";
}

export function isCallV4PipEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DIBAY_CALL_V4_PIP === "1";
}

export function isCallV4DockEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DIBAY_CALL_V4_DOCK === "1";
}
