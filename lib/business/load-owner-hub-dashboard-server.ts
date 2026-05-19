import { cache } from "react";
import type { TimelineOrder } from "@/components/business/admin/dashboard/BusinessDashboardOrderTimeline";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { fetchOwnerStoreOrderCounts } from "@/lib/stores/fetch-owner-store-order-counts";
import { getCachedStoreIfOwner } from "@/lib/stores/owner-store-ownership-cache";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

const DASHBOARD_ORDERS_LIMIT = 30;

const DASHBOARD_ORDERS_SELECT =
  "id, order_no, buyer_user_id, payment_amount, payment_status, order_status, created_at, buyer_payment_method, buyer_payment_method_detail, community_messenger_room_id";

export type OwnerHubDashboardPack = {
  orders: TimelineOrder[];
  meta: {
    pending_accept_count: number;
    refund_requested_count: number;
    pending_delivery_count: number;
  };
};

function mapTimelineRow(o: Record<string, unknown>): TimelineOrder {
  return {
    id: String(o.id ?? ""),
    order_no: String(o.order_no ?? ""),
    buyer_user_id: String(o.buyer_user_id ?? ""),
    payment_amount: Math.round(Number(o.payment_amount) || 0),
    payment_status: String(o.payment_status ?? ""),
    order_status: String(o.order_status ?? ""),
    created_at: String(o.created_at ?? ""),
    buyer_payment_method:
      typeof o.buyer_payment_method === "string" ? o.buyer_payment_method : null,
    buyer_payment_method_detail:
      typeof o.buyer_payment_method_detail === "string" ? o.buyer_payment_method_detail : null,
    community_messenger_room_id:
      typeof o.community_messenger_room_id === "string" && o.community_messenger_room_id.trim()
        ? o.community_messenger_room_id.trim()
        : null,
  };
}

/**
 * `/stores/owner` 허브 — 주문 타임라인·KPI meta 를 RSC 1회에 선로딩(라인아이템·무거운 transform 생략).
 */
export const loadOwnerHubDashboardPackServer = cache(
  async (storeId: string): Promise<OwnerHubDashboardPack | null> => {
    const id = storeId.trim();
    if (!id) return null;

    const userId = await getRouteUserId();
    if (!userId) return null;

    const sb = tryGetSupabaseForStores();
    if (!sb) return null;

    const gate = await getCachedStoreIfOwner(sb, userId, id);
    if (!gate.ok) return null;

    const [counts, ordersRes] = await Promise.all([
      fetchOwnerStoreOrderCounts(sb, id),
      sb
        .from("store_orders")
        .select(DASHBOARD_ORDERS_SELECT)
        .eq("store_id", id)
        .order("created_at", { ascending: false })
        .limit(DASHBOARD_ORDERS_LIMIT),
    ]);

    if (ordersRes.error) {
      console.error("[loadOwnerHubDashboardPackServer]", ordersRes.error);
      return {
        orders: [],
        meta: {
          pending_accept_count: counts.pending_accept_count,
          refund_requested_count: counts.refund_requested_count,
          pending_delivery_count: counts.pending_delivery_count,
        },
      };
    }

    const orders = (ordersRes.data ?? []).map((row) =>
      mapTimelineRow(row as Record<string, unknown>)
    );

    return {
      orders,
      meta: {
        pending_accept_count: counts.pending_accept_count,
        refund_requested_count: counts.refund_requested_count,
        pending_delivery_count: counts.pending_delivery_count,
      },
    };
  }
);
