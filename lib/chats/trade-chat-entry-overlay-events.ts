/** 레거시·기타 경로에서 거래 채팅 진입 오버레이를 켤 때 사용 (신규 채팅 기본 플로우는 compose 화면 전용 셸) */
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
