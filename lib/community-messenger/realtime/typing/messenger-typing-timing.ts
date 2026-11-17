/**
 * 입력 중 신호 시간 계약 — P3(Owner 2026-11-18 「권장안대로 반영」, 레거시 Telegram 기준).
 *
 * - 발신: 입력이 이어지는 동안 **5초마다** `typing:start` 재전송 (Telegram `ChatActivityEnterView` `lastTypingTimeSend < now - 5000`).
 *   키 입력 구동 — 타이머 폴링 없음. 조건 = 화면 보임 + 입력창 포커스.
 * - 수신: 마지막 신호 뒤 **5.9초** 지나면 해제 (Telegram `MessagesController` `timeToRemove = 5900`).
 * - 유휴: 마지막 입력 뒤 2.6초 동안 입력이 없으면 `typing:stop` 1회.
 * - 인원 상한 없음(레거시 동일).
 * - 특성(레거시와 같음): 재전송이 키 입력 구동이라, 마지막 발신 뒤 5초 안에 입력하다 멈추면(재전송 없이) 받는 쪽은
 *   마지막 발신 5.9초 뒤 표시가 지워진다 — 이어서 입력하면 5초 경과 시점의 다음 글자에서 다시 보낸다.
 * @see docs/group-chat-presence-typing.md §3
 */
export const MESSENGER_TYPING_RESEND_MS = 5_000;
export const MESSENGER_TYPING_TTL_MS = 5_900;
export const MESSENGER_TYPING_IDLE_MS = 2_600;
/** 만료 항목 정리 주기 — 표시 해제 지연 상한 = TTL + 이 값 */
export const MESSENGER_TYPING_PRUNE_MS = 1_000;
/** 상대 메시지 도착 시 그 사람 입력 중 해제 — 이보다 오래된 메시지(따라잡기 재적용)는 해제하지 않는다 */
export const MESSENGER_TYPING_CLEAR_ON_MESSAGE_MAX_AGE_MS = 15_000;
