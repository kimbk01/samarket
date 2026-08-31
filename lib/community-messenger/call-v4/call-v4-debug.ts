const TAG = "[DIBAY_CALL_V4]";
const OWNER_TAG = "[DIBAY_CALL_V4_OWNER]";
/** Correlated APK↔iOS / latency markers — grep `DIBAY_CALL_CORR`. Never log tokens. */
const CORR_TAG = "[DIBAY_CALL_CORR]";

export function logCallV4(step: string, payload?: Record<string, unknown>): void {
  if (payload && Object.keys(payload).length > 0) {
    console.info(TAG, step, payload);
    return;
  }
  console.info(TAG, step);
}

/**
 * Evidence-first correlation log (CUT1/CUT2).
 * marker: A0–A4 (caller) or stage ids (reconcile/room/create/dispatch/handoff/ui).
 */
export function logCallCorr(
  marker: string,
  payload?: { callId?: string | null; [key: string]: unknown },
): void {
  const wall_ms = Date.now();
  const mono_ms = typeof performance !== "undefined" ? performance.now() : wall_ms;
  console.info(CORR_TAG, {
    marker,
    wall_ms,
    mono_ms,
    callId: payload?.callId ?? null,
    ...payload,
  });
}

export function logCallV4OwnerSheetEval(payload: {
  callId: string;
  owner: string;
  phase: string;
  nativeAcceptInflight: boolean;
  terminal: boolean;
  canRender: boolean;
  reason: string;
}): void {
  console.info(OWNER_TAG, "incoming_sheet_eval", payload);
}
