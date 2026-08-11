/**
 * Member Control Center — Trade tab.
 * Authority: posts.user_id + seller_listing_state; product_chats seller_id/buyer_id metadata.
 * DO NOT: chat body, guessed joins, hardcoded 0 display SSOT.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { asCount, asLatest, loadTitlesById, type OverviewMetric } from "@/lib/admin-users/member-tab-query";

export type MemberTradeSection = "listings" | "buyer";

export type MemberTradeSummary = {
  listings: OverviewMetric<number>;
  selling: OverviewMetric<number>;
  reserved: OverviewMetric<number>;
  completed: OverviewMetric<number>;
  buyerChats: OverviewMetric<number>;
  tradeChats: OverviewMetric<number>;
  lastListingAt: OverviewMetric<string | null>;
};

export type MemberTradeListingRow = {
  id: string;
  title: string;
  status: string;
  listingState: string;
  price: number | null;
  createdAt: string;
  updatedAt: string | null;
};

export type MemberTradeBuyerRow = {
  id: string;
  postId: string;
  postTitle: string;
  tradeFlowStatus: string;
  roomId: string | null;
  sellerId: string;
};

export type MemberTradeTabPayload = {
  summary: MemberTradeSummary;
  section: MemberTradeSection;
  page: number;
  pageSize: number;
  total: OverviewMetric<number>;
  listings: MemberTradeListingRow[];
  buyer: MemberTradeBuyerRow[];
};

function str(row: Record<string, unknown>, key: string): string {
  return String(row[key] ?? "").trim();
}

async function loadSummary(sb: SupabaseClient, uid: string): Promise<MemberTradeSummary> {
  const [listings, selling, reserved, completed, buyerChats, sellerChats, lastListingAt] = await Promise.all([
    asCount(sb.from("posts").select("id", { count: "exact", head: true }).eq("user_id", uid)),
    asCount(
      sb.from("posts").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("seller_listing_state", "inquiry"),
    ),
    asCount(
      sb.from("posts").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("seller_listing_state", "reserved"),
    ),
    asCount(
      sb
        .from("posts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .or("seller_listing_state.eq.completed,status.eq.sold"),
    ),
    asCount(sb.from("product_chats").select("id", { count: "exact", head: true }).eq("buyer_id", uid)),
    asCount(sb.from("product_chats").select("id", { count: "exact", head: true }).eq("seller_id", uid)),
    asLatest(
      sb.from("posts").select("created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(1),
      "created_at",
    ),
  ]);

  const tradeChats: OverviewMetric<number> =
    buyerChats.ok && sellerChats.ok
      ? { ok: true, value: buyerChats.value + sellerChats.value }
      : {
          ok: false,
          error: !buyerChats.ok ? buyerChats.error : !sellerChats.ok ? sellerChats.error : "count_failed",
        };

  return { listings, selling, reserved, completed, buyerChats, tradeChats, lastListingAt };
}

export async function loadMemberTradeTab(
  sb: SupabaseClient,
  userId: string,
  opts: { section: MemberTradeSection; page: number; pageSize: number; from: number; to: number },
): Promise<MemberTradeTabPayload> {
  const uid = userId.trim();
  const summary = await loadSummary(sb, uid);
  const empty: MemberTradeTabPayload = {
    summary,
    section: opts.section,
    page: opts.page,
    pageSize: opts.pageSize,
    total: { ok: true, value: 0 },
    listings: [],
    buyer: [],
  };

  if (opts.section === "listings") {
    const { data, error } = await sb
      .from("posts")
      .select("id, title, status, seller_listing_state, price, created_at, updated_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .range(opts.from, opts.to);
    if (error) return { ...empty, total: { ok: false, error: error.message } };
    return {
      ...empty,
      total: summary.listings,
      listings: ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        id: str(row, "id"),
        title: str(row, "title"),
        status: str(row, "status"),
        listingState: str(row, "seller_listing_state"),
        price: row.price == null || row.price === "" ? null : Number(row.price),
        createdAt: str(row, "created_at"),
        updatedAt: str(row, "updated_at") || null,
      })),
    };
  }

  const { data, error } = await sb
    .from("product_chats")
    .select("id, post_id, seller_id, buyer_id, trade_flow_status, community_messenger_room_id")
    .eq("buyer_id", uid)
    .order("id", { ascending: false })
    .range(opts.from, opts.to);
  if (error) return { ...empty, total: { ok: false, error: error.message } };
  const rows = (data ?? []) as Record<string, unknown>[];
  const titles = await loadTitlesById(
    sb,
    "posts",
    rows.map((row) => str(row, "post_id")),
  );
  return {
    ...empty,
    total: summary.buyerChats,
    buyer: rows.map((row) => {
      const postId = str(row, "post_id");
      return {
        id: str(row, "id"),
        postId,
        postTitle: titles.get(postId) ?? "",
        tradeFlowStatus: str(row, "trade_flow_status"),
        roomId: str(row, "community_messenger_room_id") || null,
        sellerId: str(row, "seller_id"),
      };
    }),
  };
}
