/**
 * C1 — Default HOME composition policy = CURRENT PRODUCTION BEHAVIOR (declarative only).
 *
 * Does not wire into `composeStoresHomeFeed` — runtime unchanged until C3+ engine cutover.
 * Caps must stay in sync with `lib/stores/stores-home-composer.ts` constants.
 */

import type { StoresCompositionSectionContract } from "@/lib/stores/composition/stores-composition-contract";
import {
  STORES_HOME_CAMPAIGN_SHELF_MAX,
  STORES_HOME_NEARBY_MAX,
  STORES_HOME_NEW_STORE_SHELF_MAX,
  STORES_HOME_POPULAR_SHELF_MAX,
  STORES_HOME_SLOT0_FOOD_MAX,
  STORES_HOME_SLOT5_FOOD_MAX,
  STORES_HOME_TOP_RATED_SHELF_MAX,
} from "@/lib/stores/stores-home-composer";

const NOT_CONSUMED_INTERVAL = { consumed: false as const, reason: "NOT_CONSUMED" as const };

/**
 * Frozen @ C1 — mirrors `composeStoresHomeFeed` + Hub/BelowFold presentation order.
 * `slot1Stores` max=null: all Discovery pool remainder after Slot0 (API order preserved).
 */
export const STORES_HOME_COMPOSITION_DEFAULT_POLICY: readonly StoresCompositionSectionContract[] = [
  {
    surface: "home",
    slot: "slot0Food",
    contentType: "food_product",
    enabled: true,
    order: 0,
    interval: NOT_CONSUMED_INTERVAL,
    max: STORES_HOME_SLOT0_FOOD_MAX,
    titleAuthority: "presentation_i18n",
    titleRef: "store_order_now_title",
    notes: "Open+deliverable filter in composer; owner_representative product per store.",
  },
  {
    surface: "home",
    slot: "slot1Stores",
    contentType: "store",
    enabled: true,
    order: 1,
    interval: NOT_CONSUMED_INTERVAL,
    max: null,
    titleAuthority: "none",
    notes: "Primary vertical row; Discovery API order minus Slot0 stores.",
  },
  {
    surface: "home",
    slot: "slot2Food",
    contentType: "food_product",
    enabled: true,
    order: 2,
    interval: NOT_CONSUMED_INTERVAL,
    max: STORES_HOME_POPULAR_SHELF_MAX,
    titleAuthority: "presentation_i18n",
    titleRef: "store_home_popular_stores_title",
    notes: "Popular metric shelf; platform_popular when qualified.",
  },
  {
    surface: "home",
    slot: "newStoreFood",
    contentType: "food_product",
    enabled: true,
    order: 3,
    interval: NOT_CONSUMED_INTERVAL,
    max: STORES_HOME_NEW_STORE_SHELF_MAX,
    titleAuthority: "presentation_i18n",
    titleRef: "store_home_new_stores_title",
    notes: "first_listed_at DESC within new-store signal; not Discovery home ranking.",
  },
  {
    surface: "home",
    slot: "campaignFood",
    contentType: "campaign_food",
    enabled: true,
    order: 4,
    interval: NOT_CONSUMED_INTERVAL,
    max: STORES_HOME_CAMPAIGN_SHELF_MAX,
    titleAuthority: "presentation_i18n",
    titleRef: "store_home_campaigns_title",
    notes: "Input: store.discoveryCampaign from home-feed loader; campaign eligibility NOT editable here.",
  },
  {
    surface: "home",
    slot: "slot3Food",
    contentType: "food_product",
    enabled: true,
    order: 5,
    interval: NOT_CONSUMED_INTERVAL,
    max: STORES_HOME_POPULAR_SHELF_MAX,
    titleAuthority: "presentation_i18n",
    titleRef: "store_badge_menu_discount",
    notes: "delivery_fee_strike evidence filter.",
  },
  {
    surface: "home",
    slot: "slot4Food",
    contentType: "food_product",
    enabled: true,
    order: 6,
    interval: NOT_CONSUMED_INTERVAL,
    max: STORES_HOME_TOP_RATED_SHELF_MAX,
    titleAuthority: "presentation_i18n",
    titleRef: "store_spot_recommended_subtitle",
    notes: "rating≥4 & reviews≥3 filter.",
  },
  {
    surface: "home",
    slot: "slot5Food",
    contentType: "food_product",
    enabled: true,
    order: 7,
    interval: NOT_CONSUMED_INTERVAL,
    max: STORES_HOME_SLOT5_FOOD_MAX,
    titleAuthority: "presentation_i18n",
    titleRef: "store_spot_recommended_title",
    notes: "Composer max 8; Hub grid renders slice(0,4) — presentation cap, not composition reorder.",
  },
  {
    surface: "home",
    slot: "slot6NearbyStores",
    contentType: "store",
    enabled: true,
    order: 8,
    interval: NOT_CONSUMED_INTERVAL,
    max: STORES_HOME_NEARBY_MAX,
    titleAuthority: "presentation_i18n",
    titleRef: "store_neighborhood_more_title",
    notes: "distanceKm sort within final-row exclude set — not Discovery home ranking reorder.",
  },
  {
    surface: "home",
    slot: "slot6RestStores",
    contentType: "store",
    enabled: true,
    order: 9,
    interval: NOT_CONSUMED_INTERVAL,
    max: null,
    titleAuthority: "presentation_i18n",
    titleRef: "store_feed_stores_title",
    notes: "Discovery pool remainder for final row; preserves API order.",
  },
] as const;
