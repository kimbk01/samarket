/**
 * R5 (2026-11-09) — 방이 없는 상대에게 발신: `POST /api/community-messenger/rooms/by-peer/calls` + `{ peerUserId }`.
 * 서버가 1:1 방 확보와 통화 생성을 한 요청에서 처리한다. 방 ID 는 UUID 라 이 값과 겹치지 않는다.
 * 클라이언트·서버 공용(서버 전용 모듈 import 금지).
 */
export const PEER_DIRECT_CALL_ROOM_SEGMENT = "by-peer";
