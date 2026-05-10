/**
 * 메신저 home-sync / bootstrap / room **콘솔 출력** 게이트 (터미널·브라우저).
 * trace 객체·ms 계측·API 응답 헤더는 호출부에서 유지 — 여기서는 console 만 제어.
 *
 * 켜기 (둘 중 하나):
 * - `SAMARKET_MESSENGER_TRACE_LOG=1` (서버·빌드 시 클라에 주입 가능)
 * - `NEXT_PUBLIC_MESSENGER_PERF_TRACE=1` (클라 번들에 포함)
 */

export function messengerVerboseTraceConsoleEnabled(): boolean {
  try {
    return (
      process.env.SAMARKET_MESSENGER_TRACE_LOG === "1" ||
      process.env.NEXT_PUBLIC_MESSENGER_PERF_TRACE === "1"
    );
  } catch {
    return false;
  }
}

/** 상세 관측 — 기본 숨김, 플래그 시 `console.debug` */
export function messengerTraceConsoleDebug(label: string, ...args: unknown[]): void {
  if (!messengerVerboseTraceConsoleEnabled()) return;
  // eslint-disable-next-line no-console -- gated perf diagnostics
  console.debug(label, ...args);
}
