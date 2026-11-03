import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseStoreSalesSummary, type StoreSalesGrain } from "@/lib/stores/sales/store-sales-period";

/** DB `store_sales_period_summary` (service_role 전용) — 홈 스냅샷과 같은 매출 정의 */
export async function loadStoreSalesPeriodSummary(
  sb: SupabaseClient,
  input: { storeIds: readonly string[]; fromIso: string; toIso: string; grain: StoreSalesGrain }
) {
  const { data, error } = await sb.rpc("store_sales_period_summary", {
    p_store_ids: [...input.storeIds],
    p_from: input.fromIso,
    p_to: input.toIso,
    p_grain: input.grain,
  });
  if (error) throw new Error(error.message);
  return parseStoreSalesSummary(data);
}
