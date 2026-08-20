/**
 * Lightweight Trade Overview counts — head COUNT only, no row payloads.
 *
 * CONTRACT (Cut A / S1):
 * - Listing KPIs = posts.type = trade only (same scope as posts-management list).
 * - Status axis = posts.status (active | sold | hidden) — LISTING_OPS, not seller_listing_state.
 * - reportsPending = open only (pending|reviewing) — same open set as list reportCount (S2).
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

/** Open report statuses shared by Overview KPI and List reportCount (S2). */
export const ADMIN_TRADE_OPEN_REPORT_STATUSES = ["pending", "reviewing"] as const;

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

function tradePostsHead(sbAny: any) {
  return sbAny.from(POSTS_TABLE_READ).select("id", { count: "exact", head: true }).eq("type", "trade");
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
    countExact(sb, () => tradePostsHead(sbAny)),
    countExact(sb, () => tradePostsHead(sbAny).eq("status", "active")),
    countExact(sb, () => tradePostsHead(sbAny).eq("status", "sold")),
    countExact(sb, () => tradePostsHead(sbAny).eq("status", "hidden")),
    countExact(sb, () =>
      sbAny
        .from("reports")
        .select("id", { count: "exact", head: true })
        .eq("target_type", "product")
        .in("status", [...ADMIN_TRADE_OPEN_REPORT_STATUSES])
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
