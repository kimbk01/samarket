/**
 * 음성/영상 — 시그널링·ICE는 **일반 텍스트 메시지 테이블/API와 분리**한다.
 * (사마켓 사용자 대면 「채팅 3종」의 네 번째가 아님 — `samarket-three-chat-pillars`.)
 *
 * - 시그널 저장: `community_messenger_call_signals` 및 `app/api/community-messenger/calls/*`
 * - 미디어 정책: `lib/community-messenger/call-media-stack.ts`
 *
 * 이 파일은 포트 인터페이스 대신 경계 규칙만 둔다(순환 의존 방지).
 */
export type CallSignalingStackKind = "webrtc_group" | "agora";

export const CALL_SIGNALING_DOC = {
  /** 실제 라우트: `GET /api/community-messenger/calls/ice-servers` */
  iceRoute: "app/api/community-messenger/calls/ice-servers",
  signalsTable: "community_messenger_call_signals",
  contractDoc: "docs/call-signaling-contract.md",
} as const;
