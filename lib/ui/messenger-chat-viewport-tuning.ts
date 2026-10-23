/**
 * 메신저 방 scroll·composer UI 상수 (layout/viewport 패치 없음).
 *
 * @see docs/community-messenger-mobile-room-viewport.md
 */

/** stick-to-bottom 판정(px) — scroll anchor controller 와 동기 */
export const MESSENGER_STICK_TO_BOTTOM_THRESHOLD_PX = 96;

/** Composer footer 기본 하단 패딩(px) — legacy /chats ChatInputBar */
export const MESSENGER_COMPOSER_FOOTER_PADDING_DEFAULT_PX = 10;

/** 배달·주문 채팅 composer — 홈 인디케이터 여유 */
export const MESSENGER_DELIVERY_COMPOSER_FOOTER_EXTRA_PX = 14;

/** 배달 composer 입력 한 줄(최소) 높이(px) */
export const MESSENGER_DELIVERY_COMPOSER_SECTOR_HEIGHT_PX = 44;

/**
 * K-2 — textarea 성장 상한(px). ~4–5줄(16px · line 1.25).
 * 초과 시 textarea 내부 스크롤. sector max는 pill 패딩 여유 포함.
 */
export const MESSENGER_DELIVERY_COMPOSER_TEXTAREA_MAX_HEIGHT_PX = 100;

export const MESSENGER_DELIVERY_COMPOSER_SECTOR_MAX_HEIGHT_PX = 120;

/** min 1행 · max 다줄(K-2). 고정 h-[44px] 금지. */
export const MESSENGER_DELIVERY_COMPOSER_SECTOR_HEIGHT_CLASS =
  "box-border min-h-[44px] max-h-[120px]";

export const MESSENGER_DELIVERY_COMPOSER_ROW_CLASS =
  "flex h-full w-full min-h-0 items-end gap-1.5 py-0.5";

export const MESSENGER_DELIVERY_COMPOSER_SIDE_SLOT_CLASS = "h-9 w-9 shrink-0 self-end";

export const MESSENGER_DELIVERY_COMPOSER_MIC_SLOT_CLASS =
  "relative h-8 w-8 shrink-0 self-end overflow-hidden";

/** iOS overlay keyboard — use-cm-room-kb-offset → --kb-offset 최소값 */
export const CM_ROOM_KB_OFFSET_MIN_PX = 24;
