/** 상품 상세 등에서 `openCreateTradeChat` 이 방 URL 로 이동하기 전까지 전역 오버레이 표시용 */
export const KASAMA_TRADE_CHAT_ENTRY_CREATING_OVERLAY = "kasama:trade-chat-entry-creating-overlay";

export type TradeChatEntryCreatingOverlayDetail = { visible: boolean };

export function setTradeChatEntryCreatingOverlayVisible(visible: boolean): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<TradeChatEntryCreatingOverlayDetail>(KASAMA_TRADE_CHAT_ENTRY_CREATING_OVERLAY, {
      detail: { visible },
    })
  );
}
