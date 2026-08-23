import type { SupabaseClient } from "@supabase/supabase-js";
import { rebuildStoreDeliveryCoverageForStore } from "@/lib/stores/discovery/persist-store-delivery-coverage";

export type GlobalRebuildBatchResult = {
  processed: number;
  failed: number;
  lastStoreId: string | null;
};

export async function runDeliveryCoverageGlobalRebuildBatch(
  sb: SupabaseClient,
  opts: { policyVersion: number; batchSize?: number; cursorStoreId?: string | null }
): Promise<GlobalRebuildBatchResult> {
  const limit = Math.max(1, Math.min(opts.batchSize ?? 100, 500));
  let query = sb
    .from("stores")
    .select("id")
    .eq("approval_status", "approved")
    .eq("is_visible", true)
    .order("id", { ascending: true })
    .limit(limit);

  if (opts.cursorStoreId) {
    query = query.gt("id", opts.cursorStoreId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[runDeliveryCoverageGlobalRebuildBatch]", error.message);
    return { processed: 0, failed: 1, lastStoreId: opts.cursorStoreId ?? null };
  }

  const rows = (data ?? []) as { id: string }[];
  let processed = 0;
  let failed = 0;
  let lastStoreId: string | null = opts.cursorStoreId ?? null;

  for (const row of rows) {
    const storeId = String(row.id ?? "").trim();
    if (!storeId) continue;
    lastStoreId = storeId;
    const result = await rebuildStoreDeliveryCoverageForStore(sb, storeId, {
      policyVersion: opts.policyVersion,
    });
    const isFailed = !result.ok;
    if (isFailed) failed += 1;
    else processed += 1;
    await sb.rpc("mark_delivery_coverage_rebuild_progress", {
      p_store_id: storeId,
      p_failed: isFailed,
    });
  }

  return { processed, failed, lastStoreId };
}
