/**
 * Product Recovery QA fixture contract — markers + taxonomy targets.
 * Does NOT invent ranking metrics. Fixture install/restore is lifecycle-scoped.
 */

export const STORES_PRODUCT_RECOVERY_QA = {
  markerPrefix: "QA-PR-",
  homeTitleMarker: "QA-PR-HOME-TITLE",
  homeSubtitleMarker: "QA-PR-HOME-SUB",
  categoryPrimaryTitleMarker: "QA-PR-PRIMARY",
  categorySecondaryTitleMarker: "QA-PR-SUB",
  /** Canonical taxonomy targets for Production QA (existing seed authority) */
  primarySlug: "restaurant",
  secondarySlugA: "korean",
  secondarySlugB: "chinese",
  /** Customer surfaces */
  homePath: "/stores",
  browsePrimaryPath: "/stores/browse/restaurant?sub=all",
  browseSubAPath: "/stores/browse/restaurant?sub=korean",
  browseSubBPath: "/stores/browse/restaurant?sub=chinese",
  /** Admin real-entry paths (menu labels are i18n; paths for harness after menu click) */
  adminHomeShelvesPath: "/admin/stores-home-shelves",
  adminCategoryPath: "/admin/stores-category-policy",
  releaseSignalSelectors: [
    '[href="/admin/stores-home-shelves"]',
    '[href="/admin/stores-category-policy"]',
  ],
  presentationMarkers: {
    food_horizontal: '[data-stores-home-presentation="food_horizontal"]',
    store_horizontal: '[data-stores-home-presentation="store_horizontal"]',
    brand_circular: '[data-stores-home-presentation="brand_circular"]',
    timesale_vertical: '[data-stores-home-presentation="timesale_vertical"]',
    store_teaser_horizontal: '[data-stores-home-presentation="store_teaser_horizontal"]',
    editorial_grid: '[data-stores-home-presentation="editorial_grid"]',
    high_rating_horizontal: '[data-stores-home-presentation="high_rating_horizontal"]',
  },
  forbiddenCustomerSelectors: [
    '[data-composition-slot="homePaidAdInsertion"]',
    '[data-composition-slot="homeCouponInsertion"]',
  ],
} as const;

export type StoresProductRecoveryQaContract = typeof STORES_PRODUCT_RECOVERY_QA;
