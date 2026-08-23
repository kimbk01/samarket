/**
 * DIBAY Stores List — Presentation Authority SSOT (code contract).
 *
 * DISCOVERY CORE: CLOSED — ranking / eligibility / composer / browse server order 변경 금지.
 * 이 모듈은 presentation owner·semantic 경계만 잠근다.
 *
 * Pixel note:
 * - Competitor exact px geometry = NOT_PROVEN (경쟁사 실측 규격으로 승격 금지).
 * - 아래 수치는 DIBAY design decision 또는 DIBAY legacy CODE_PROVEN 이다.
 */

export const STORES_LIST_PRESENTATION_SSOT = {
  discoveryCore: "CLOSED",
  track: "PRESENTATION_UI_UX_CTA_ONLY",

  owners: {
    /** Existing HOME food rail card */
    homeFood: "StoresHomeFoodCard",
    homeStore: "StoresHomeStoreTeaserCard",
    browseStore: "StoresBrowseStoreComparisonCard",
    /** Legacy shared RowCard — presentation owner 아님 (mapper/type 잔존만 허용) */
    legacySharedRowCard: "StoreDeliveryRowCard",
  },

  browseHierarchy: {
    L1: "store_identity",
    L2: "decision_meta",
    L3: "benefit_badges",
    L4: "menu_preview_secondary",
  },

  /** DIBAY legacy CODE_PROVEN (Facebook-row era 40px avatar) — not competitor claim */
  browseStoreThumbPx: 40,
  /**
   * DIBAY_PRESENTATION_DECISION — menu preview demoted from L1 116px band.
   * Not a competitor-measured pixel; runtime-proof target for CUT2.
   */
  browseMenuPreviewThumbPx: 56,
  browseMenuPreviewMaxVisible: 2,

  /** Badge cap per card (status + promo/recommended + out-of-range) */
  badgeMaxVisible: 3,

  semantics: {
    isFeaturedMeans: "recommended_only",
    isFeaturedIsNot: "instant_discount",
    nullFeeMeans: "unknown_or_hide",
    nullFeeForbids: ["synthesize_zero", "synthesize_free"],
    decorativeDeliveryPickupBadges: "omit_from_list_cards",
    paymentMethodsOnList: "omit_from_decision_hierarchy",
  },

  cta: {
    primary: "existing_store_detail_route",
    secondaryMenu: "existing_focus_product_route",
    forbidNewDestinations: true,
  },
} as const;

export type StoresListPresentationOwner =
  (typeof STORES_LIST_PRESENTATION_SSOT.owners)[keyof typeof STORES_LIST_PRESENTATION_SSOT.owners];
