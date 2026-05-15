/** admin_settings.key — value_json: { "value": number } */
export const COMMERCE_SETTING_KEYS = {
  autoCompleteDays: "store_auto_complete_days",
  settlementFeeBp: "store_settlement_fee_bp",
  settlementDelayDays: "store_settlement_delay_days",
  /** 인기 메뉴 집계 기간(일) — 기본 30 */
  popularMenuWindowDays: "popular_menu_window_days",
  /** 인기 메뉴 섹션 노출 최소 누적 수량 — 기본 1 */
  popularMenuMinQty: "popular_menu_min_qty",
  /** 인기 메뉴 TOP N — 기본 5 */
  popularMenuTopN: "popular_menu_top_n",
  /** 사장님 추천 섹션 최대 개수 — 기본 10 */
  popularMenuRecommendedMax: "popular_menu_recommended_max",
} as const;

export type CommerceSettingKey =
  (typeof COMMERCE_SETTING_KEYS)[keyof typeof COMMERCE_SETTING_KEYS];
