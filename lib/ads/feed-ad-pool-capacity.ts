/**
 * Feed banner pool capacity / occupancy — Admin inventory + create form share this.
 * Pool N/3 semantics. Not Slide/Slot frames.
 */

import {
  BANNER_PLACEMENT_CAPACITY_SSOT,
  bannerPlacementDefaultCapacity,
} from "@/lib/ads/banner-placement-capacity-ssot";
import type { FeedAdPlacement } from "@/lib/ads/feed-ad-placement";

/** Canonical pool cap (3) for Community/Trade home + topic/category. */
export function feedAdPoolCapacity(placement: FeedAdPlacement | string): number {
  const p = String(placement ?? "").toUpperCase();
  if (p === "TRADE_HOME" || p === "COMMUNITY_HOME") {
    return bannerPlacementDefaultCapacity(p);
  }
  // Topic/category pool uses the same 3-cap semantics as home (Owner R2 / Admin create).
  if (p === "TRADE_CATEGORY" || p === "COMMUNITY_TOPIC") {
    return BANNER_PLACEMENT_CAPACITY_SSOT.COMMUNITY_HOME.defaultCapacity;
  }
  return bannerPlacementDefaultCapacity(p);
}

/** Counts toward pool occupancy (matches AdminFeedAdCreatePage authority). */
export function feedAdPoolOccupiesStatus(status: string | null | undefined): boolean {
  const st = String(status ?? "").toLowerCase();
  if (!st) return false;
  return st !== "ended" && st !== "rejected" && st !== "draft";
}
