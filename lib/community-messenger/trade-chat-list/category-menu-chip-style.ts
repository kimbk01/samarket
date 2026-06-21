/** 썸네일 좌상단 소형 카테고리 pill — height ≤18px */
export const TRADE_CHAT_LIST_CATEGORY_PILL_CLASS =
  "pointer-events-none inline-block max-w-[calc(100%-4px)] truncate whitespace-nowrap rounded-[3px] border border-[#D7E5DE] bg-white/90 px-1 text-[10px] font-semibold leading-[14px] text-[#006241]";

/** @deprecated 큰 칩 스타일 — trade 리스트는 TRADE_CHAT_LIST_CATEGORY_PILL_CLASS 만 사용 */
export function tradeChatListCategoryChipClassName(_categoryMenuLabel: string): string {
  return TRADE_CHAT_LIST_CATEGORY_PILL_CLASS;
}
