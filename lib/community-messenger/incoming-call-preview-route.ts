/** Foreground 배너 탭 → 통화 화면(연결중) 미리보기 — accept PATCH 없음 */

export const INCOMING_CALL_PREVIEW_QUERY = "incomingPreview=1";

export function buildIncomingCallPreviewHref(sessionId: string): string {
  const sid = sessionId.trim();
  return `/community-messenger/calls/${encodeURIComponent(sid)}?${INCOMING_CALL_PREVIEW_QUERY}`;
}

export function isIncomingCallPreviewRoute(searchParams: Pick<URLSearchParams, "get">): boolean {
  return searchParams.get("incomingPreview") === "1";
}
