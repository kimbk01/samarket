/** 상대 읽음(read-ack) Realtime 토픽/이벤트 — 클라·서버 공통 (번들에 `use client` 없음) */

export const CM_READ_ACK_BROADCAST_EVENT = "read_ack";

/**
 * 방 단위 **비공개** 토픽. 수신 = 방 접근 가능자(`realtime.messages` SELECT 정책), 발행 = 서버(서비스 롤)만.
 * 구 전역 토픽 `cm_read_ack` 는 폐기(인증 없이 전 사용자 읽음 커서가 노출됨).
 */
export function communityMessengerReadAckChannelName(roomId: string): string {
  return `cm-read-ack:${String(roomId ?? "").trim().toLowerCase()}`;
}
