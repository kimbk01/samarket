const TAG = "[DIBAY_CALL_V3]";

export function logCallV3(step: string, payload?: Record<string, unknown>): void {
  if (payload && Object.keys(payload).length > 0) {
    console.info(TAG, step, payload);
    return;
  }
  console.info(TAG, step);
}
