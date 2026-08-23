import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveStorePopularitySinceIso,
  STORE_POPULARITY_WINDOW_DAYS,
} from "@/lib/stores/store-discovery-popular-store";

export type ApplyOrderPopularityProjectionResult = {
  inserted: boolean;
  counted: boolean;
};

/** Idempotent completed-order popularity projection — exact rolling created_at >= since. */
export async function applyStoreOrderPopularityProjectionOnCompleted(
  sb: SupabaseClient,
  input: { orderId: string; storeId: string; orderCreatedAt: string; now?: Date }
): Promise<ApplyOrderPopularityProjectionResult> {
  const orderId = input.orderId.trim();
  const storeId = input.storeId.trim();
  const orderCreatedAt = input.orderCreatedAt.trim();
  if (!orderId || !storeId || !orderCreatedAt) {
    return { inserted: false, counted: false };
  }

  const since = resolveStorePopularitySinceIso(input.now ?? new Date());
  const { data, error } = await sb.rpc("apply_store_order_popularity_ledger", {
    p_order_id: orderId,
    p_store_id: storeId,
    p_order_created_at: orderCreatedAt,
    p_since: since,
  });

  if (error) {
    console.error("[applyStoreOrderPopularityProjectionOnCompleted]", error.message);
    return { inserted: false, counted: false };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const rec = (row ?? {}) as Record<string, unknown>;
  const inserted = rec.inserted === true;
  const counted = rec.counted === true;

  if (inserted) {
    void sb.rpc("upsert_store_order_daily_stat_on_completed", {
      p_store_id: storeId,
      p_order_created_at: orderCreatedAt,
    });
  }

  return { inserted, counted };
}

export type ExpirePopularityProjectionResult = {
  expiredCount: number;
  storesTouched: number;
};

export async function expireStoreOrderPopularityProjectionBatch(
  sb: SupabaseClient,
  opts: { batchSize?: number; now?: Date } = {}
): Promise<ExpirePopularityProjectionResult> {
  const since = resolveStorePopularitySinceIso(opts.now ?? new Date());
  const { data, error } = await sb.rpc("expire_store_order_popularity_ledger_batch", {
    p_since: since,
    p_limit: opts.batchSize ?? 500,
  });
  if (error) {
    console.error("[expireStoreOrderPopularityProjectionBatch]", error.message);
    return { expiredCount: 0, storesTouched: 0 };
  }
  const row = Array.isArray(data) ? data[0] : data;
  const rec = (row ?? {}) as Record<string, unknown>;
  return {
    expiredCount: Number(rec.expired_count) || 0,
    storesTouched: Number(rec.stores_touched) || 0,
  };
}

export type ReconcilePopularityProjectionResult = {
  storeId: string;
  projected: number;
  recomputed: number;
  repaired: boolean;
};

/** Controlled reconcile — optional store scope, never used on discovery request path. */
export async function reconcileStoreOrderPopularityProjection(
  sb: SupabaseClient,
  opts: { storeId?: string; now?: Date; dryRun?: boolean } = {}
): Promise<ReconcilePopularityProjectionResult[]> {
  const since = resolveStorePopularitySinceIso(opts.now ?? new Date());
  const storeFilter = opts.storeId?.trim();

  let storeQuery = sb.from("stores").select("id, completed_orders_30d");
  if (storeFilter) storeQuery = storeQuery.eq("id", storeFilter);

  const { data: stores, error: storesErr } = await storeQuery;
  if (storesErr || !stores) return [];

  const out: ReconcilePopularityProjectionResult[] = [];

  for (const store of stores) {
    const storeId = String(store.id ?? "").trim();
    if (!storeId) continue;

    const { count, error: countErr } = await sb
      .from("store_order_popularity_ledger")
      .select("order_id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .gte("order_created_at", since);

    if (countErr) continue;
    const recomputed = count ?? 0;
    const projected = Math.max(0, Math.floor(Number(store.completed_orders_30d) || 0));
    const repaired = projected !== recomputed;
    if (repaired && !opts.dryRun) {
      await sb
        .from("stores")
        .update({ completed_orders_30d: recomputed, completed_orders_30d_at: new Date().toISOString() })
        .eq("id", storeId);
    }
    out.push({ storeId, projected, recomputed, repaired });
  }

  return out;
}

export { STORE_POPULARITY_WINDOW_DAYS, resolveStorePopularitySinceIso };
