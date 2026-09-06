/**
 * HERO banner slide order writer — Admin sort_order → runtime carousel.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { DELIVERY_AD_AUDIT_LOG_TABLE } from "@/lib/stores/advertising/delivery-ad-audit";
import { STORE_BANNER_AD_CAMPAIGN_TABLE } from "@/lib/stores/store-banner-ad-campaign-authority";
import {
  DELIVERY_HERO_PLACEMENT_KEY,
  loadHeroOccupancyCampaigns,
} from "@/lib/admin/ads-exposure/capacity-gate";

export type ReorderHeroBannersResult =
  | { ok: true; orderedIds: string[] }
  | { ok: false; error: string; detail?: string };

/**
 * Persist 0-based sort_order for HERO carousel campaigns.
 * Runtime: compareStoreBannerAdCampaigns (sort_order ASC).
 */
export async function reorderDeliveryHeroBannerSlides(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    orderedCampaignIds: string[];
  }
): Promise<ReorderHeroBannersResult> {
  const ids = input.orderedCampaignIds.map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0) {
    return { ok: false, error: "empty_order" };
  }
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: "duplicate_ids" };
  }

  // Touch occupancy loader so HERO inventory authority stays shared with capacity gate.
  await loadHeroOccupancyCampaigns(sb);

  const { data: rows, error } = await sb
    .from(STORE_BANNER_AD_CAMPAIGN_TABLE)
    .select("id")
    .in("id", ids);
  if (error) return { ok: false, error: "db_error", detail: error.message };
  const found = new Set((rows ?? []).map((r) => String((r as { id: string }).id)));
  for (const id of ids) {
    if (!found.has(id)) {
      return { ok: false, error: "campaign_not_found", detail: id };
    }
  }

  const now = new Date().toISOString();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    const { error: updErr } = await sb
      .from(STORE_BANNER_AD_CAMPAIGN_TABLE)
      .update({
        sort_order: i,
        updated_by_user_id: input.adminUserId,
        updated_at: now,
      })
      .eq("id", id);
    if (updErr) return { ok: false, error: "db_error", detail: updErr.message };
  }

  await sb.from(DELIVERY_AD_AUDIT_LOG_TABLE).insert({
    product_kind: "banner",
    campaign_id: ids[0],
    actor_type: "admin",
    actor_user_id: input.adminUserId,
    action: "reorder_slides",
    before_json: null,
    after_json: { orderedCampaignIds: ids, placement: DELIVERY_HERO_PLACEMENT_KEY },
    reason: null,
  });

  return { ok: true, orderedIds: ids };
}
