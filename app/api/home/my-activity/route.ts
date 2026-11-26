import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { normalizeStoreOrderStatusForBuyer } from "@/lib/stores/normalize-store-order-status";
import { communityMessengerRoomHref } from "@/lib/community-messenger/messenger-entry-origin";
import { TRADE_CHAT_MESSENGER_LIST_HREF } from "@/lib/chats/surfaces/trade-chat-surface";
import {
  HOME_MY_ACTIVITY_ORDER_STATUSES,
  HOME_MY_ACTIVITY_TRADE_STATES,
  type HomeMyActivityOrder,
  type HomeMyActivityResponse,
  type HomeMyActivityTrade,
} from "@/lib/home/home-my-activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SALES_HREF = "/mypage/trade/sales";

/**
 * 홈 ⑤ 「내 진행 중」 — 진행 중 주문 + 진행 중 거래를 요청 1번으로 (설계 v2 §3-6).
 * Supabase: 주문 1 · 숨긴 주문 1(주문 있을 때) · 매장 이름 1(주문 있을 때) · 상품 1 · 거래 채팅 1(거래 1건일 때).
 */
export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const uid = auth.userId;
  const sb = tryCreateSupabaseServiceClient() as SupabaseClient | null;
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const [order, trade] = await Promise.all([loadOrder(sb, uid), loadTrade(sb, uid)]);
  if (order === "error" || trade === "error") {
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  const body: HomeMyActivityResponse = { ok: true, order, trade };
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}

async function loadOrder(sb: SupabaseClient, uid: string): Promise<HomeMyActivityOrder | null | "error"> {
  const { data, error } = await sb
    .from("store_orders")
    .select("id, store_id, order_status, fulfillment_type, estimated_ready_at")
    .eq("buyer_user_id", uid)
    .in("order_status", [...HOME_MY_ACTIVITY_ORDER_STATUSES])
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error("[home/my-activity orders]", error.message);
    return "error";
  }
  let rows = (data ?? []) as {
    id: string;
    store_id: string | null;
    order_status: string;
    fulfillment_type: string | null;
    estimated_ready_at: string | null;
  }[];
  if (rows.length === 0) return null;
  const hides = await sb
    .from("store_order_buyer_hides")
    .select("order_id")
    .eq("buyer_user_id", uid)
    .in(
      "order_id",
      rows.map((r) => r.id)
    );
  if (!hides.error && hides.data?.length) {
    const hidden = new Set((hides.data as { order_id: string }[]).map((h) => String(h.order_id)));
    rows = rows.filter((r) => !hidden.has(String(r.id)));
  }
  const first = rows[0];
  if (!first) return null;
  let storeName = "";
  if (first.store_id) {
    const s = await sb.from("stores").select("store_name").eq("id", first.store_id).maybeSingle();
    if (!s.error && s.data) storeName = String((s.data as { store_name?: string | null }).store_name ?? "");
  }
  return {
    count: rows.length,
    id: String(first.id),
    storeName,
    status: normalizeStoreOrderStatusForBuyer(first.order_status) || String(first.order_status),
    fulfillment: String(first.fulfillment_type ?? ""),
    readyAt: first.estimated_ready_at ?? null,
  };
}

async function loadTrade(sb: SupabaseClient, uid: string): Promise<HomeMyActivityTrade | null | "error"> {
  const states = HOME_MY_ACTIVITY_TRADE_STATES.join(",");
  const { data, error } = await sb
    .from("posts")
    .select("id, title, user_id, reserved_buyer_id, updated_at")
    .eq("status", "active")
    .or(`and(user_id.eq.${uid},seller_listing_state.in.(${states})),reserved_buyer_id.eq.${uid}`)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error("[home/my-activity posts]", error.message);
    return "error";
  }
  const rows = (data ?? []) as { id: string; title: string | null; user_id: string; reserved_buyer_id: string | null }[];
  if (rows.length === 0) return null;
  const first = rows[0]!;
  const title = String(first.title ?? "").trim();
  if (rows.length > 1) {
    const allMine = rows.every((r) => r.user_id === uid);
    return { count: rows.length, title, href: allMine ? SALES_HREF : TRADE_CHAT_MESSENGER_LIST_HREF };
  }
  // 1건 — 그 거래 채팅: 내가 판매자면 예약 구매자와의 채팅, 내가 구매자면 내 채팅. 없으면 상품 화면.
  const buyerId = first.user_id === uid ? first.reserved_buyer_id : uid;
  let href = `/post/${encodeURIComponent(first.id)}`;
  if (buyerId) {
    const pc = await sb
      .from("product_chats")
      .select("community_messenger_room_id")
      .eq("post_id", first.id)
      .eq("buyer_id", buyerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const roomId = String((pc.data as { community_messenger_room_id?: string | null } | null)?.community_messenger_room_id ?? "").trim();
    if (roomId) href = communityMessengerRoomHref(roomId, null, "trade");
  }
  return { count: 1, title, href };
}
