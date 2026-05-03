/**
 * 커뮤니티 메신저 통화 UI·세션 단계 — 단방향 전이만 허용(ended 계열 이후 active 금지 등).
 * 제품 상태는 API `session.status` 가 단일 소스이며, 여기 이름은 UX·로그 정렬용이다.
 */
export type CommunityMessengerCallUiPhase =
  | "idle"
  | "outgoing_preparing"
  | "outgoing_ringing"
  | "incoming_ringing"
  | "connecting"
  | "active"
  | "ending"
  | "ended"
  | "failed"
  | "canceled"
  | "missed"
  | "rejected";
