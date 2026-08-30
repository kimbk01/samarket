/**
 * Batch-load campaign funding status for customer resolvers.
 * Missing row = UNFUNDED. Fail-closed on query error (empty map → callers treat as UNFUNDED).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DELIVERY_AD_CAMPAIGN_FUNDINGS_TABLE,
  resolveDeliveryAdFundingStatus,
  type DeliveryAdFundingStatus,
} from "@/lib/stores/advertising/delivery-ad-business-cash-contract";

export async function loadDeliveryAdFundingStatusByCampaignIds(
  sb: SupabaseClient,
  input: {
    productKind: "store_sponsored" | "banner";
    campaignIds: readonly string[];
  }
): Promise<Map<string, DeliveryAdFundingStatus>> {
  const out = new Map<string, DeliveryAdFundingStatus>();
  const ids = [...new Set(input.campaignIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
  if (!ids.length) return out;

  try {
    const { data, error } = await sb
      .from(DELIVERY_AD_CAMPAIGN_FUNDINGS_TABLE)
      .select("campaign_id, funding_status")
      .eq("product_kind", input.productKind)
      .in("campaign_id", ids);
    if (error) {
      if (/delivery_ad_campaign_fundings|schema cache|does not exist/i.test(String(error.message))) {
        return out;
      }
      console.error("[loadDeliveryAdFundingStatusByCampaignIds]", error.message);
      return out;
    }
    for (const row of (data ?? []) as Array<{ campaign_id?: string; funding_status?: string }>) {
      const cid = String(row.campaign_id ?? "").trim();
      if (!cid) continue;
      out.set(cid, resolveDeliveryAdFundingStatus({ rowStatus: row.funding_status }));
    }
  } catch (e) {
    console.error(
      "[loadDeliveryAdFundingStatusByCampaignIds]",
      e instanceof Error ? e.message : e
    );
  }
  return out;
}
