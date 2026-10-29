/**
 * Admin 배달 샘플 운영·매장 유형 필터·배너 슬롯 상태 i18n (2026-10-28 배달 감사 §F).
 * Spread into runtime MESSAGES + MessageKey only — NOT into adminMessages
 * (avoids TS7056 declaration emit growth on the giant admin catalog).
 */

export const adminDeliverySampleMessages = {
  ko: {
    admin_stores_home_hidden_no_product: "해당 매장에 대표 메뉴가 없음",
    admin_stores_home_hidden_max_zero: "최대 노출 개수 0",
    admin_biz_ops_owner_sample: "샘플 매장 · 오너 없음",
    admin_stores_kind_all: "유형 전체",
    admin_stores_kind_real: "실제 매장",
    admin_stores_kind_sample: "샘플 매장",
    admin_stores_kind_legacy_test: "기존 테스트",
    admin_stores_visibility_all: "노출 전체",
    admin_stores_visibility_visible: "고객 노출",
    admin_stores_visibility_hidden: "숨김",
    admin_stores_category_filter: "업종 필터",
    admin_stores_category_all: "업종 전체",
    admin_fp_home_inline_ops: "배달 홈 「더 많은 매장」 위 · 1장",
    admin_fp_category_top_ops: "업종 목록 상단 · 1장",
    admin_fp_slot_closed: "슬롯 꺼짐 — 등록해도 고객에게 보이지 않습니다",
    admin_fp_slot_open_categories: "열린 업종",
  },
  en: {
    admin_stores_home_hidden_no_product: "Matching stores have no representative menu",
    admin_stores_home_hidden_max_zero: "Max items is 0",
    admin_biz_ops_owner_sample: "Sample store · no owner",
    admin_stores_kind_all: "All types",
    admin_stores_kind_real: "Real store",
    admin_stores_kind_sample: "Sample store",
    admin_stores_kind_legacy_test: "Legacy test",
    admin_stores_visibility_all: "All visibility",
    admin_stores_visibility_visible: "Visible",
    admin_stores_visibility_hidden: "Hidden",
    admin_stores_category_filter: "Category filter",
    admin_stores_category_all: "All categories",
    admin_fp_home_inline_ops: "Above “More stores” on delivery home · 1",
    admin_fp_category_top_ops: "Top of category list · 1",
    admin_fp_slot_closed: "Slot off — customers will not see this banner",
    admin_fp_slot_open_categories: "Open categories",
  },
} as const;
