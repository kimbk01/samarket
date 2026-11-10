/** 통화 탭 주소 — `/community-messenger/calls/logs` 가 이리로 보낸다 (메신저 진입 출처 `?from=` 유지) */
export function buildMessengerCallLogsSectionHref(from?: string | null): string {
  const qs = new URLSearchParams();
  qs.set("section", "call_logs");
  const f = from?.trim();
  if (f) qs.set("from", f);
  return `/community-messenger?${qs.toString()}`;
}
