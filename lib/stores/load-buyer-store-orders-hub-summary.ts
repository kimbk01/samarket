import type { SupabaseClient } from "@supabase/supabase-js";
import { sumBuyerOrderChatUnreadForBuyerExcludingHiddenOrders } from "@/lib/order-chat/service";
import { normalizeStoreOrderStatusForBuyer } from "@/lib/stores/normalize-store-order-status";

const BUYER_HUB_ACTIVE_STATUSES = new Set([
  "pending",
  "accepted",
  "preparing",
  "delivering",
  "ready_for_pickup",
  "arrived",
]);

export type BuyerStoreOrdersHubSummary = {
  activeOrders: number;
  totalOrders: number;
  orderChatRooms: number;
  unreadChats: number;
  recent: {
    id: string;
    store_name: string;
    order_status: string;
    created_at: string;
  } | null;
};

/** Stores hub buyer digest — no line items, reviews, or heavy joins. */
export async function loadBuyerStoreOrdersHubSummary(
  sb: SupabaseClient,
  buyerId: string
): Promise<{ ok: true; hub_summary: BuyerStoreOrdersHubSummary } | { ok: false; error: string }> {
  const uid = buyerId.trim();
  if (!uid) return { ok: false, error: "buyer_required" };

  const { data: ordersRaw, error: oErr } = await sb
    .from("store_orders")
    .select("id, store_id, order_status, created_at")
    .eq("buyer_user_id", uid)
    .order("created_at", { ascending: false });

  if (oErr) {
    console.error("[hub-summary store_orders]", oErr);
    return { ok: false, error: oErr.message };
  }

  const rawList = ordersRaw ?? [];
  if (!rawList.length) {
    return {
      ok: true,
      hub_summary: {
        activeOrders: 0,
        totalOrders: 0,
        orderChatRooms: 0,
        unreadChats: 0,
        recent: null,
      },
    };
  }

  const { data: hiddenRows, error: hiddenErr } = await sb
    .from("store_order_buyer_hides")
    .select("order_id")
    .eq("buyer_user_id", uid);

  if (hiddenErr) {
    if (
      !(
        hiddenErr.message?.includes("store_order_buyer_hides") &&
        hiddenErr.message?.includes("does not exist")
      )
    ) {
      console.error("[hub-summary hidden]", hiddenErr);
      return { ok: false, error: hiddenErr.message };
    }
  }

  const hidden = new Set(
    (hiddenRows ?? [])
      .map((r) => String((r as { order_id?: string }).order_id ?? "").trim())
      .filter(Boolean)
  );

  const visible = rawList.filter((o) => !hidden.has(String(o.id ?? "").trim()));

  let activeOrders = 0;
  for (const o of visible) {
    const norm = normalizeStoreOrderStatusForBuyer(o.order_status);
    const status = norm || String(o.order_status ?? "").trim() || "pending";
    if (BUYER_HUB_ACTIVE_STATUSES.has(status)) activeOrders += 1;
  }

  const totalOrders = visible.length;
  const first = visible[0];
  const recentStoreId = first ? String(first.store_id ?? "").trim() : "";

  const unreadP = sumBuyerOrderChatUnreadForBuyerExcludingHiddenOrders(sb as SupabaseClient<any>, uid, hidden);

  let unreadChats: number;
  let storeName = "";
  if (recentStoreId) {
    const [unread, storeRes] = await Promise.all([
      unreadP,
      sb.from("stores").select("store_name").eq("id", recentStoreId).maybeSingle(),
    ]);
    unreadChats = unread;
    if (!storeRes.error && storeRes.data) {
      storeName = String(storeRes.data.store_name ?? "");
    }
  } else {
    unreadChats = await unreadP;
  }

  let recent: BuyerStoreOrdersHubSummary["recent"] = null;
  if (first?.id) {
    const norm = normalizeStoreOrderStatusForBuyer(first.order_status);
    const status = norm || String(first.order_status ?? "").trim() || "pending";
    recent = {
      id: String(first.id),
      store_name: storeName,
      order_status: status,
      created_at: String(first.created_at ?? ""),
    };
  }

  return {
    ok: true,
    hub_summary: {
      activeOrders,
      totalOrders,
      orderChatRooms: totalOrders,
      unreadChats,
      recent,
    },
  };
}
