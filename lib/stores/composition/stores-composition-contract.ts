/**
 * C1 — Stores Composition Contract (SSOT types only).
 *
 * Authority: `docs/dibay-stores-composition-contract.md`
 * Runtime engine / Admin writer / DB — NOT in C1 scope.
 */

import type { StoresHomeSlotId } from "@/lib/stores/presentation/stores-home-presentation-map";

/** Surfaces that may eventually consume composition policy. */
export const STORES_COMPOSITION_SURFACES = ["home", "browse"] as const;
export type StoresCompositionSurface = (typeof STORES_COMPOSITION_SURFACES)[number];

/**
 * Content kinds a composition section may place on a surface.
 * `ad` / `coupon` — contract field only until insertion engine exists (NOT_CONSUMED).
 */
export const STORES_COMPOSITION_CONTENT_TYPES = [
  "store",
  "food_product",
  "campaign_food",
  "ad",
  "coupon",
  "banner",
] as const;
export type StoresCompositionContentType = (typeof STORES_COMPOSITION_CONTENT_TYPES)[number];

/** Interval placement — future insertion surfaces; not consumed in C1. */
export type StoresCompositionIntervalContract =
  | { consumed: true; everyN: number }
  | { consumed: false; reason: "NOT_CONSUMED" };

/** Where section titles come from today (C1 documents authority; does not move titles into engine). */
export type StoresCompositionTitleAuthority =
  | "presentation_i18n"
  | "campaign_field_copy"
  | "none";

/**
 * Canonical composition section policy row.
 * `slot` reuses HOME slot ids from presentation map; browse uses synthetic slot ids.
 */
export type StoresCompositionSectionContract = {
  surface: StoresCompositionSurface;
  slot: StoresHomeSlotId | StoresBrowseCompositionSlotId | StoresHomeAInsertionSlotId;
  contentType: StoresCompositionContentType;
  enabled: boolean;
  /** Presentation section order on the surface (not Discovery ranking order). */
  order: number;
  interval: StoresCompositionIntervalContract;
  /** Max items this section may consume from its source stream; `null` = unbounded. */
  max: number | null;
  titleAuthority: StoresCompositionTitleAuthority;
  /** Optional i18n key or field reference for C2 handoff — documentation only in C1. */
  titleRef?: string;
  notes?: string;
};

/** BROWSE — organic list + future insertion anchors (contract only in C1). */
export const STORES_BROWSE_COMPOSITION_SLOTS = [
  "organic_discovery_list",
  "future_ad_insertion",
  "future_coupon_insertion",
  "future_promoted_placement",
] as const;
export type StoresBrowseCompositionSlotId = (typeof STORES_BROWSE_COMPOSITION_SLOTS)[number];

/** Stores A — HOME paid insertion rails + Stage 2 Banner boundary (composition policy gated). */
export const STORES_HOME_A_INSERTION_SLOTS = [
  "homePaidAdInsertion",
  "homeCouponInsertion",
  "homeBannerBeforeRest",
] as const;
export type StoresHomeAInsertionSlotId = (typeof STORES_HOME_A_INSERTION_SLOTS)[number];

/**
 * C1 invariant — Composition MUST preserve Discovery input order within each source stream.
 * See `stores-composition-invariants.ts` for pure helpers and tests.
 */
export const STORES_COMPOSITION_DISCOVERY_ORDER_INVARIANT_ID =
  "composition_preserves_discovery_input_order_per_stream" as const;

/** Authorities Composition must never mutate (Discovery HARD LOCK). */
export const STORES_COMPOSITION_FORBIDDEN_AUTHORITIES = [
  "candidate_generation",
  "category_membership",
  "eligibility",
  "ranking_score",
  "ranking_weights",
  "sort_authority",
  "pagination_authority",
  "distance_calculation",
  "popularity_metric",
  "new_store_authority",
  "campaign_eligibility_authority",
  "rating_authority",
] as const;
export type StoresCompositionForbiddenAuthority =
  (typeof STORES_COMPOSITION_FORBIDDEN_AUTHORITIES)[number];
