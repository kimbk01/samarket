/** 상품 상세 등에서 `openCreateTradeChat` 이 방 URL 로 이동하기 전까지 전역 오버레이 표시용 */
export const KASAMA_TRADE_CHAT_ENTRY_CREATING_OVERLAY = "kasama:trade-chat-entry-creating-overlay";

export type TradeChatEntryCreatingOverlayPhase = "resolving" | "entering";

export type TradeChatEntryCreatingOverlayDetail = {
  visible: boolean;
  /** `visible: true` 일 때만 의미 있음 — 단계별 문구 전환 */
  phase?: TradeChatEntryCreatingOverlayPhase;
};

export function setTradeChatEntryCreatingOverlayState(detail: TradeChatEntryCreatingOverlayDetail): void {
  if (typeof window === "undefined") return;
  const visible = detail.visible === true;
  const normalized: TradeChatEntryCreatingOverlayDetail = visible
    ? { visible: true, phase: detail.phase ?? "resolving" }
    : { visible: false };
  window.dispatchEvent(
    new CustomEvent<TradeChatEntryCreatingOverlayDetail>(KASAMA_TRADE_CHAT_ENTRY_CREATING_OVERLAY, {
      detail: normalized,
    })
  );
}

export function setTradeChatEntryCreatingOverlayVisible(visible: boolean): void {
  setTradeChatEntryCreatingOverlayState({ visible });
}
