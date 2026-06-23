const TAG = "[DIBAY_CALL_V4]";

export function logCallV4(step: string, payload?: Record<string, unknown>): void {
  if (payload && Object.keys(payload).length > 0) {
    console.info(TAG, step, payload);
    return;
  }
  console.info(TAG, step);
}
