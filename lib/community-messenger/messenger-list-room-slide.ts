/** 메신저 채팅 목록 ↔ 방 전환 — VT 없이 CSS/상태 기반 */
/** 모바일(세로): 하→상 · 가로 split 우측 pane: 좌→우 — `MESSENGER_LIST_ROOM_ENTER_MS` */
export const MESSENGER_LIST_ROOM_ENTER_MS = 360;
export const MESSENGER_LIST_ROOM_EXIT_MS = 280;

export const MESSENGER_LIST_ROOM_ENTER_EASING = "cubic-bezier(0.25, 0.1, 0.25, 1)";
export const MESSENGER_LIST_ROOM_EXIT_EASING = "cubic-bezier(0.4, 0, 1, 1)";

/** 거래/주문 허브 목록 진입·퇴장 — CSS `sam-messenger-pillar-list-*` 와 동기 */
export const MESSENGER_PILLAR_LIST_ENTER_MS = 369;
export const MESSENGER_PILLAR_LIST_EXIT_MS = 300;
