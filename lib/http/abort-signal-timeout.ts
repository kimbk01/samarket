/** 서버 아웃바운드 fetch용 타임아웃 시그널 (Node 18+ AbortSignal.timeout) */
export function abortSignalForTimeout(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
    return AbortSignal.timeout(ms);
  }
  return undefined;
}
