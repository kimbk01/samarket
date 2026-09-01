/**
 * Batch-load campaign funds-secured status for customer resolvers.
 * Product authority = canonical Cash funding (AST-005).
 * Missing row = UNFUNDED. Fail-closed on query error.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeliveryAdFundingStatus } from "@/lib/stores/advertising/delivery-ad-business-cash-contract";
import { loadCanonicalBcFundingStatusByApplicationIds } from "@/lib/stores/advertising/canonical-business-cash-writer";

export async function loadDeliveryAdFundingStatusByCampaignIds(
  sb: SupabaseClient,
  input: {
    productKind: "store_sponsored" | "banner";
    campaignIds: readonly string[];
  }
): Promise<Map<string, DeliveryAdFundingStatus>> {
  return loadCanonicalBcFundingStatusByApplicationIds(sb, {
    productKind: input.productKind,
    applicationIds: input.campaignIds,
  });
}
