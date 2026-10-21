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

/** 배달 composer 입력 한 줄 높이(px) — K-2 이후 최소 높이(여러 줄이면 늘어남) */
export const MESSENGER_DELIVERY_COMPOSER_SECTOR_HEIGHT_PX = 44;

/** K-2: 고정 max-h 없음 — 최소 44px, 입력 줄 수만큼 늘어난다(실측은 use-cm-room-composer-height RO). */
export const MESSENGER_DELIVERY_COMPOSER_SECTOR_HEIGHT_CLASS = "box-border min-h-[44px]";

/** 한 줄일 때 py-1(4px) + pill 36px = 44px. 여러 줄이면 버튼은 아래(입력 마지막 줄)에 붙는다. */
export const MESSENGER_DELIVERY_COMPOSER_ROW_CLASS =
  "flex w-full min-h-[44px] items-end gap-1.5 py-1";

export const MESSENGER_DELIVERY_COMPOSER_SIDE_SLOT_CLASS = "h-9 w-9 shrink-0 self-end";

/** pill(36px) 안 32px 슬롯 — 아래 정렬 + 2px 여백으로 한 줄일 때 세로 중앙 */
export const MESSENGER_DELIVERY_COMPOSER_MIC_SLOT_CLASS =
  "relative mb-0.5 h-8 w-8 shrink-0 self-end overflow-hidden";

/** K-2: textarea 한 줄 높이(px) — 16px × line-height 1.25 */
export const MESSENGER_COMPOSER_TEXTAREA_LINE_HEIGHT_PX = 20;

/** K-2: 자동 확장 최대 줄 수 */
export const MESSENGER_COMPOSER_TEXTAREA_MAX_LINES = 5;

/** K-2: 자동 확장 최대 높이(px) = 5줄 — 넘으면 textarea 내부 스크롤 */
export const MESSENGER_COMPOSER_TEXTAREA_MAX_HEIGHT_PX =
  MESSENGER_COMPOSER_TEXTAREA_LINE_HEIGHT_PX * MESSENGER_COMPOSER_TEXTAREA_MAX_LINES;

/** K-2: 위 상수와 같은 값의 Tailwind 클래스(JIT 는 리터럴만 인식) */
export const MESSENGER_COMPOSER_TEXTAREA_MAX_HEIGHT_CLASS = "max-h-[100px]";

/** K-2: 내용 높이(scrollHeight) → textarea 높이. 1줄 미만이면 1줄, 5줄 초과면 5줄 + 내부 스크롤. */
export function resolveMessengerComposerTextareaHeight(scrollHeightPx: number): {
  heightPx: number;
  scrollable: boolean;
} {
  const min = MESSENGER_COMPOSER_TEXTAREA_LINE_HEIGHT_PX;
  const max = MESSENGER_COMPOSER_TEXTAREA_MAX_HEIGHT_PX;
  const content = Number.isFinite(scrollHeightPx) ? Math.ceil(scrollHeightPx) : min;
  return { heightPx: Math.min(max, Math.max(min, content)), scrollable: content > max };
}

/** iOS overlay keyboard — use-cm-room-kb-offset → --kb-offset 최소값 */
export const CM_ROOM_KB_OFFSET_MIN_PX = 24;
