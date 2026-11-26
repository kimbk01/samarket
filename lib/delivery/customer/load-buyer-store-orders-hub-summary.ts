import type { SupabaseClient } from "@supabase/supabase-js";
import { sumBuyerStoreOrderMessengerUnreadFromRoomIds } from "@/lib/community-messenger/store-order-chat-service";
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
    fulfillment_type?: string;
  } | null;
  /** 가장 최근 진행 중 주문 — 앱 홈 「내 진행 중」(슈퍼앱 개편 2026-11-26 §3⑤). 없으면 null */
  firstActive?: {
    id: string;
    store_name: string;
    order_status: string;
    fulfillment_type: string;
  } | null;
};

/** Stores hub buyer digest — no line items, reviews, or heavy joins. */
export async function loadBuyerStoreOrdersHubSummary(
  sb: SupabaseClient,
  buyerId: string
): Promise<{ ok: true; hub_summary: BuyerStoreOrdersHubSummary } | { ok: false; error: string }> {
  const uid = buyerId.trim();
  if (!uid) return { ok: false, error: "buyer_required" };

  // Phase B D3: one orders pass includes room ids — unread does not re-scan store_orders
  const { data: ordersRaw, error: oErr } = await sb
    .from("store_orders")
    .select("id, store_id, order_status, created_at, community_messenger_room_id, fulfillment_type")
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
        firstActive: null,
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
  let firstActiveRow: (typeof visible)[number] | null = null;
  let firstActiveStatus = "";
  const roomIds: string[] = [];
  for (const o of visible) {
    const norm = normalizeStoreOrderStatusForBuyer(o.order_status);
    const status = norm || String(o.order_status ?? "").trim() || "pending";
    if (BUYER_HUB_ACTIVE_STATUSES.has(status)) {
      activeOrders += 1;
      if (!firstActiveRow) {
        firstActiveRow = o;
        firstActiveStatus = status;
      }
    }
    const rid = String((o as { community_messenger_room_id?: string | null }).community_messenger_room_id ?? "").trim();
    if (rid) roomIds.push(rid);
  }

  const totalOrders = visible.length;
  const first = visible[0];
  const recentStoreId = first ? String(first.store_id ?? "").trim() : "";
  const activeStoreId = firstActiveRow ? String(firstActiveRow.store_id ?? "").trim() : "";
  /** 매장 이름 조회는 1번 — 최근·진행 중 매장이 다르면 둘을 함께 읽는다 */
  const storeIds = [...new Set([recentStoreId, activeStoreId].filter(Boolean))];

  const unreadP = sumBuyerStoreOrderMessengerUnreadFromRoomIds(sb as SupabaseClient<any>, uid, roomIds);

  let unreadChats: number;
  const storeNames = new Map<string, string>();
  if (storeIds.length > 0) {
    const [unread, storeRes] = await Promise.all([
      unreadP,
      sb.from("stores").select("id, store_name").in("id", storeIds),
    ]);
    unreadChats = unread;
    if (!storeRes.error && storeRes.data) {
      for (const r of storeRes.data as { id?: string; store_name?: string | null }[]) {
        storeNames.set(String(r.id ?? ""), String(r.store_name ?? ""));
      }
    }
  } else {
    unreadChats = await unreadP;
  }
  const storeName = storeNames.get(recentStoreId) ?? "";

  let recent: BuyerStoreOrdersHubSummary["recent"] = null;
  if (first?.id) {
    const norm = normalizeStoreOrderStatusForBuyer(first.order_status);
    const status = norm || String(first.order_status ?? "").trim() || "pending";
    recent = {
      id: String(first.id),
      store_name: storeName,
      order_status: status,
      created_at: String(first.created_at ?? ""),
      fulfillment_type: String((first as { fulfillment_type?: string | null }).fulfillment_type ?? ""),
    };
  }
  const firstActive: BuyerStoreOrdersHubSummary["firstActive"] = firstActiveRow?.id
    ? {
        id: String(firstActiveRow.id),
        store_name: storeNames.get(activeStoreId) ?? "",
        order_status: firstActiveStatus,
        fulfillment_type: String((firstActiveRow as { fulfillment_type?: string | null }).fulfillment_type ?? ""),
      }
    : null;

  return {
    ok: true,
    hub_summary: {
      activeOrders,
      totalOrders,
      orderChatRooms: totalOrders,
      unreadChats,
      recent,
      firstActive,
    },
  };
}
