/**
 * Batch-load campaign funds-secured status for customer resolvers.
 * Stage 1 authority = delivery_ad_store_cash_spends (Store Cash AD_SPEND).
 * Missing row = UNFUNDED. Fail-closed on query error.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeliveryAdFundingStatus } from "@/lib/stores/advertising/delivery-ad-business-cash-contract";
import { loadDeliveryAdStoreCashSpendStatusByCampaignIds } from "@/lib/stores/advertising/delivery-ad-store-cash-writer";

export async function loadDeliveryAdFundingStatusByCampaignIds(
  sb: SupabaseClient,
  input: {
    productKind: "store_sponsored" | "banner";
    campaignIds: readonly string[];
  }
): Promise<Map<string, DeliveryAdFundingStatus>> {
  return loadDeliveryAdStoreCashSpendStatusByCampaignIds(sb, input);
}
