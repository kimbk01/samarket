/**
 * 어드민 › 거래 › 설정 「판매완료 목록 노출 기간」 (Owner 2026-11-03).
 * Spread into runtime MESSAGES + MessageKey only — NOT into adminMessages
 * (adminMessages 는 TS7056 선언 크기 한도 — 선례 `admin-deploy`·`admin-boost-prices`).
 */
export const adminTradeSoldWindowMessages = {
  ko: {
    admin_trade_settings_sold_visible_days: "판매완료 목록 노출 기간(일)",
    admin_trade_settings_sold_visible_hint:
      "판매완료 후 이 기간이 지나면 거래 목록·찾기·카테고리·상세 관련 글에서 빠집니다. 내 매물·찜·최근 본 글에는 남습니다. 기본 30일 · 1~90일.",
    admin_trade_settings_conflict: "다른 관리자가 먼저 저장했어요. 새로 불러온 값을 확인한 뒤 다시 저장하세요.",
    admin_trade_settings_history: "판매완료 노출 기간 변경 내역 (PHT)",
    admin_trade_settings_history_days: "{before}일 → {after}일",
  },
  en: {
    admin_trade_settings_sold_visible_days: "Sold listing visibility (days)",
    admin_trade_settings_sold_visible_hint:
      "After this many days from sale, sold listings leave the trade list, search, categories and related items. They stay in My listings, Favorites and Recently viewed. Default 30 · 1–90.",
    admin_trade_settings_conflict: "Another admin saved first. Check the reloaded values and save again.",
    admin_trade_settings_history: "Sold visibility change history (PHT)",
    admin_trade_settings_history_days: "{before}d → {after}d",
  },
} as const;
