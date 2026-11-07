/**
 * 광고 3차 재감사 + 어드민 광고 SSOT 구현 (Owner 「설계안대로 진행」 2026-11-07) — 돈·피드·상위노출·iOS 문구. 뒤에 spread 되므로 같은 키는 이 파일 값이 우선한다.
 */
export const adsImpl1107MoneyMessages = {
  ko: {
    feed_ad_renew_price_changed: "가격이 바뀌었습니다. 결제되지 않았습니다. 새 가격을 확인하고 다시 눌러 주세요.",
    /** D-07 — iOS 앱 구 빌드(StoreKit 없음) 포인트 충전 */
    points_charge_ios_update_required: "앱을 최신 버전으로 업데이트하면 충전할 수 있어요",
    points_charge_ios_update_cta: "앱 업데이트하기",
    /** D-08 — 커뮤니티 상위노출 결제 창: 거래와 같은 뜻 (피드 위쪽 자리 1개 · 나머지 제자리 「포인트 노출」) */
    promo_sheet_surface_community_home: "커뮤니티 홈 피드",
    promo_sheet_surface_community_topic: "이 게시물 주제(토픽) 피드",
    promo_sheet_community_immediate_note:
      "포인트 결제 즉시 노출됩니다. 피드 위쪽 자리는 1개(가장 최근 결제)이고, 나머지는 제자리에 ‘포인트 노출’로 보입니다. 관리자 승인이 없습니다.",
    /** Owner 2026-11-07 「불필요한 설명이 너무 많다」: 상위노출 창 상품 줄 한 줄 (위치 · 위쪽 1자리 = 가장 최근 결제) */
    promo_sheet_where_community: "커뮤니티 홈·주제 피드 위쪽 · 1자리(가장 최근 결제)",
    trade_ad_boost_paused_short: "멈춤",
    philife_write_ad_product_top_fixed_desc:
      "커뮤니티 피드에 {days}일간 노출됩니다. 피드 위쪽 자리는 1개(가장 최근 결제)이고, 나머지는 제자리에 ‘포인트 노출’로 보입니다.",
  },
  en: {
    feed_ad_renew_price_changed: "The price has changed. You were not charged. Check the new price and tap again.",
    points_charge_ios_update_required: "Update the app to the latest version to charge points.",
    points_charge_ios_update_cta: "Update app",
    promo_sheet_surface_community_home: "Community home feed",
    promo_sheet_surface_community_topic: "This post's topic feed",
    promo_sheet_community_immediate_note:
      "Goes live immediately with Point. One top spot per feed (latest payment); others show a “Promoted” label in their usual place. No admin approval.",
    promo_sheet_where_community: "Top of Community home & topic feed · 1 spot (latest payment)",
    trade_ad_boost_paused_short: "Paused",
    philife_write_ad_product_top_fixed_desc:
      "Shown on the community feed for {days} days. One top spot per feed (latest payment); others show a “Promoted” label in their usual place.",
  },
} as const;
