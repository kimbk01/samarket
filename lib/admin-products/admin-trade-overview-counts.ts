/**
 * Lightweight Trade Overview counts — head COUNT only, no row payloads.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";

export type AdminTradeOverviewCounts = {
  listingsTotal: number | null;
  listingsActive: number | null;
  listingsSold: number | null;
  listingsHidden: number | null;
  reportsPending: number | null;
  promoPending: number | null;
  promoActive: number | null;
};

async function countExact(
  sb: SupabaseClient,
  run: () => PromiseLike<{ count: number | null; error: { message?: string } | null }>
): Promise<number | null> {
  try {
    const { count, error } = await run();
    if (error) return null;
    return typeof count === "number" ? count : 0;
  } catch {
    return null;
  }
}

export async function fetchAdminTradeOverviewCounts(
  sb: SupabaseClient
): Promise<AdminTradeOverviewCounts> {
  const sbAny = sb as any;
  const nowIso = new Date().toISOString();

  const [
    listingsTotal,
    listingsActive,
    listingsSold,
    listingsHidden,
    reportsPending,
    promoPending,
    promoActive,
  ] = await Promise.all([
    countExact(sb, () =>
      sbAny.from(POSTS_TABLE_READ).select("id", { count: "exact", head: true })
    ),
    countExact(sb, () =>
      sbAny.from(POSTS_TABLE_READ).select("id", { count: "exact", head: true }).eq("status", "active")
    ),
    countExact(sb, () =>
      sbAny.from(POSTS_TABLE_READ).select("id", { count: "exact", head: true }).eq("status", "sold")
    ),
    countExact(sb, () =>
      sbAny.from(POSTS_TABLE_READ).select("id", { count: "exact", head: true }).eq("status", "hidden")
    ),
    countExact(sb, () =>
      sbAny
        .from("reports")
        .select("id", { count: "exact", head: true })
        .eq("target_type", "product")
        .in("status", ["pending", "reviewing"])
    ),
    countExact(sb, () =>
      sbAny
        .from("point_promotion_orders")
        .select("id", { count: "exact", head: true })
        .eq("domain", "trade")
        .eq("order_status", "pending_review")
    ),
    countExact(sb, () =>
      sbAny
        .from("point_promotion_orders")
        .select("id", { count: "exact", head: true })
        .eq("domain", "trade")
        .eq("order_status", "active")
        .lte("start_at", nowIso)
        .gte("end_at", nowIso)
    ),
  ]);

  return {
    listingsTotal,
    listingsActive,
    listingsSold,
    listingsHidden,
    reportsPending,
    promoPending,
    promoActive,
  };
}
