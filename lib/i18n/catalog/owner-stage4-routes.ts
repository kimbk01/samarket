/**
 * Stage 4 (4-2·4-3·4-5) 오너 라우트·진입점·용어 정리 i18n — IA-07·08·12·13·18.
 * Separate top-level catalog — `adminMessages` / `businessMessages` 는 TS 직렬화 한도(TS7056) 근처.
 */

export const ownerStage4RoutesMessages = {
  ko: {
    owner_stage4_change_in_store_manage: "매장 관리에서 변경",
    owner_stage4_status_visible_label: "노출",
    owner_stage4_status_open_label: "영업",
    owner_stage4_ads_event_promo_card_title: "이벤트 프로모션",
    owner_stage4_ads_event_promo_card_desc: "플랫폼 이벤트·프로모션 참여를 신청하고 심사 상태를 확인합니다.",
    owner_stage4_ads_event_promo_card_cta: "이벤트 프로모션 보기",
  },
  en: {
    owner_stage4_change_in_store_manage: "Change in Store management",
    owner_stage4_status_visible_label: "Visibility",
    owner_stage4_status_open_label: "Open",
    owner_stage4_ads_event_promo_card_title: "Event promotions",
    owner_stage4_ads_event_promo_card_desc:
      "Apply to join platform events and promotions and track the review status.",
    owner_stage4_ads_event_promo_card_cta: "View event promotions",
  },
} as const;
