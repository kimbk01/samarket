/**
 * HERO banner slide order writer — Admin sort_order → runtime carousel.
 * H-04 — 한 트랜잭션 RPC `reorder_store_banner_hero_slides` (HERO 캠페인만, 나머지 HERO 는 뒤로 재번호).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

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

  const { data, error } = await sb.rpc("reorder_store_banner_hero_slides", {
    p_admin_user_id: input.adminUserId,
    p_ordered_ids: ids,
  });
  if (error) return { ok: false, error: "db_error", detail: error.message };
  const result = (data ?? {}) as { ok?: boolean; error?: string };
  if (!result.ok) return { ok: false, error: String(result.error ?? "save_failed") };
  return { ok: true, orderedIds: ids };
}
