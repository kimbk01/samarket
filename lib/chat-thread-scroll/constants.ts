/** 전 채팅 표면 stick-to-bottom 판정(px) — CM tuning 과 동일 SSOT */
export const CHAT_THREAD_STICK_THRESHOLD_PX = 96;

/** entry terminal bottom — layout commit 후 1회 scroll 재시도 */
export const CHAT_THREAD_ENTRY_SCROLL_MAX_ATTEMPTS = 12;

/** ↓ 버튼·메시지 이동 부드러운 스크롤 길이(ms) — 텔레그램 체감과 비슷한 짧은 ease-out. */
export const CHAT_THREAD_ANIMATED_SCROLL_MS = 320;
