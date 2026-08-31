/**
 * Batch-load campaign funds-secured status for customer resolvers.
 * Stage 1 product authority = delivery_ad_canonical_bc_fundings (AST-005).
 * Legacy Store Cash SECURED retained for historical campaigns only.
 * Missing row = UNFUNDED. Fail-closed on query error.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeliveryAdFundingStatus } from "@/lib/stores/advertising/delivery-ad-business-cash-contract";
import { loadCanonicalBcFundingStatusByApplicationIds } from "@/lib/stores/advertising/canonical-business-cash-writer";
import { loadDeliveryAdStoreCashSpendStatusByCampaignIds } from "@/lib/stores/advertising/delivery-ad-store-cash-writer";

export async function loadDeliveryAdFundingStatusByCampaignIds(
  sb: SupabaseClient,
  input: {
    productKind: "store_sponsored" | "banner";
    campaignIds: readonly string[];
  }
): Promise<Map<string, DeliveryAdFundingStatus>> {
  const canonical = await loadCanonicalBcFundingStatusByApplicationIds(sb, {
    productKind: input.productKind,
    applicationIds: input.campaignIds,
  });
  const missing = input.campaignIds
    .map((id) => String(id ?? "").trim())
    .filter((id) => id && !canonical.has(id));
  if (!missing.length) return canonical;

  const legacy = await loadDeliveryAdStoreCashSpendStatusByCampaignIds(sb, {
    productKind: input.productKind,
    campaignIds: missing,
  });
  for (const [id, status] of legacy) {
    if (!canonical.has(id)) canonical.set(id, status);
  }
  return canonical;
}
