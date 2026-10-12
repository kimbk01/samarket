/**
 * 실제 통화 화면 라우트인지 — `/community-messenger/calls/<id>`(통화 기록 목록 `calls/logs` 제외)·`calls-v3/`·`calls-v4/`.
 * (v3 `isOnCallV3ScreenPath` 와 같은 규칙 + logs 제외)
 *
 * 의존성 없는 단일 정의 — 통화 종료 후 복귀 이동 가드(legacy `finalizeCommunityMessengerCallTerminalExit`,
 * v4 `exitCallV4ScreenAfterCleanup`)가 함께 쓴다.
 */
export function isCommunityMessengerCallScreenPathname(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").trim();
  if (/^\/community-messenger\/calls-v[34]\/[^/]+/.test(p)) return true;
  const m = /^\/community-messenger\/calls\/([^/?#]+)/.exec(p);
  return Boolean(m && m[1] !== "logs");
}
