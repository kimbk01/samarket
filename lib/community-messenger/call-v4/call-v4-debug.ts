const TAG = "[DIBAY_CALL_V4]";
const OWNER_TAG = "[DIBAY_CALL_V4_OWNER]";

export function logCallV4(step: string, payload?: Record<string, unknown>): void {
  if (payload && Object.keys(payload).length > 0) {
    console.info(TAG, step, payload);
    return;
  }
  console.info(TAG, step);
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
