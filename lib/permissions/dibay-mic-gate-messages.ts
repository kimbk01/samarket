/**
 * 마이크 게이트는 브라우저 관례상 `AbortError` 로 통일하고, `message` 로 나중에/연기 구분.
 */

export const DIBAY_MIC_ABORT_MESSAGE_LATER = "dibay_mic_later";
export const DIBAY_MIC_ABORT_MESSAGE_DEFERRED = "dibay_mic_deferred";

export function isDiBaYMicGateLaterAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError" && err.message === DIBAY_MIC_ABORT_MESSAGE_LATER;
}

export function isDiBaYMicGateDeferredAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError" && err.message === DIBAY_MIC_ABORT_MESSAGE_DEFERRED;
}
