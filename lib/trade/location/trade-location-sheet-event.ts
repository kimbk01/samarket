/**
 * 거래 D (Owner 2026-10-28) — 📍 위치 시트 열기 신호.
 * 시트는 거래 탭 줄의 📍 버튼(`TradeHeaderLocationPinButton`)이 가진다. 다른 입구(빈 목록의 「위치 선택」 등)는 이 신호로 연다.
 * 옛 위치 화면 주소는 next.config 307 로 `/market?locSheet=1` 이 되고, 📍 버튼이 이 값을 읽어 시트를 연 뒤 지운다.
 */
export const TRADE_LOCATION_SHEET_OPEN_EVENT = "dibay:trade-location-sheet-open";
export const TRADE_LOCATION_SHEET_QUERY_PARAM = "locSheet";

export function requestOpenTradeLocationSheet(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TRADE_LOCATION_SHEET_OPEN_EVENT));
}
