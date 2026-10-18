/**
 * Admin order detail reader (공통 주문 상세 모달). Read-only; every source is an existing table:
 * store_orders · store_order_items · gift_certificate_redemptions · store_order_cancel_requests ·
 * store_order_deliveries · audit_logs · stores · profiles · test_users.
 * Order events, delivery timeline and the commission row stay on GET …/history (history panel).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildAdminOrderMoney,
  mapAdminOrderItem,
  toRequester,
  type AdminOrderCancelRequest,
  type AdminOrderGiftLedger,
  type AdminOrderItem,
  type AdminOrderMoney,
} from "@/lib/admin/store-orders/admin-store-order-detail-contract";

const ORDER_COLUMNS = [
  "id",
  "order_no",
  "store_id",
  "buyer_user_id",
  "created_at",
  "order_status",
  "payment_status",
  "fulfillment_type",
  "buyer_payment_method",
  "buyer_payment_method_detail",
  "buyer_note",
  "buyer_phone",
  "total_amount",
  "discount_amount",
  "payment_amount",
  "delivery_fee_amount",
  "gift_redemption_amount",
  "platform_funded_amount",
  "store_funded_amount",
  "coupon_offer_title",
  "delivery_address_summary",
  "delivery_address_detail",
  "delivery_formatted_address",
  "delivery_detail_address",
  "delivery_note",
  "accepted_at",
  "estimated_ready_at",
  "refund_approved_at",
  "refunded_at",
  "admin_locked",
  "admin_flagged",
  "admin_note",
  "dispute_status",
  "needs_admin_attention",
  "sla_warning_level",
  "sla_warning_reason",
  "community_messenger_room_id",
].join(", ");

export type AdminOrderAuditEntry = {
  id: string;
  created_at: string;
  action: string;
  actor_type: string;
  actor_id: string | null;
  actor_label: string | null;
  before_json: unknown;
  after_json: unknown;
};

export type AdminOrderDetail = {
  order: {
    id: string;
    orderNo: string;
    createdAt: string;
    orderStatus: string;
    paymentStatus: string;
    fulfillmentType: string;
    paymentMethod: string | null;
    paymentMethodDetail: string | null;
    buyerNote: string | null;
    buyerPhone: string | null;
    deliveryAddress: string | null;
    deliveryNote: string | null;
    acceptedAt: string | null;
    estimatedReadyAt: string | null;
    refundApprovedAt: string | null;
    refundedAt: string | null;
    adminLocked: boolean;
    adminFlagged: boolean;
    adminNote: string | null;
    disputeStatus: string | null;
    needsAdminAttention: boolean;
    slaWarningLevel: string | null;
    slaWarningReason: string | null;
    hasChat: boolean;
    storeId: string;
    storeName: string;
    storeSlug: string | null;
    buyerUserId: string;
    buyerLabel: string;
  };
  items: AdminOrderItem[];
  money: AdminOrderMoney;
  gift: AdminOrderGiftLedger | null;
  cancelRequests: AdminOrderCancelRequest[];
  riderFailureReportedAt: string | null;
  audit: AdminOrderAuditEntry[];
};

export type LoadAdminOrderDetailOutcome =
  | { ok: true; detail: AdminOrderDetail }
  | { ok: false; error: "order_not_found" | "query_failed"; message?: string };

const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const sOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** Same rule as SQL `admin_store_orders_buyer_label` (display name → nickname → username → id prefix). */
export function adminUserLabel(
  id: string,
  profile: { nickname?: unknown; username?: unknown } | undefined,
  testUser: { display_name?: unknown; username?: unknown } | undefined
): string {
  return (
    sOrNull(testUser?.display_name)?.trim() ||
    sOrNull(profile?.nickname)?.trim() ||
    sOrNull(testUser?.username)?.trim() ||
    sOrNull(profile?.username)?.trim() ||
    id.slice(0, 8)
  );
}

export async function loadAdminUserLabels(sb: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x)))];
  const out = new Map<string, string>();
  if (uniq.length === 0) return out;
  const [p, t] = await Promise.all([
    sb.from("profiles").select("id, nickname, username").in("id", uniq),
    sb.from("test_users").select("id, display_name, username").in("id", uniq),
  ]);
  const profiles = new Map((p.data ?? []).map((r: Record<string, unknown>) => [s(r.id), r]));
  const tests = new Map((t.data ?? []).map((r: Record<string, unknown>) => [s(r.id), r]));
  for (const id of uniq) out.set(id, adminUserLabel(id, profiles.get(id), tests.get(id)));
  return out;
}

export async function loadAdminStoreOrderDetail(sb: SupabaseClient, orderId: string): Promise<LoadAdminOrderDetailOutcome> {
  const { data: o, error } = await sb.from("store_orders").select(ORDER_COLUMNS).eq("id", orderId).maybeSingle();
  if (error) return { ok: false, error: "query_failed", message: error.message };
  if (!o) return { ok: false, error: "order_not_found" };
  const order = o as unknown as Record<string, unknown>;

  const [itemsRes, giftRes, cancelRes, storeRes, deliveryRes, auditRes] = await Promise.all([
    sb
      .from("store_order_items")
      .select("id, product_title_snapshot, qty, price_snapshot, base_price_snapshot, options_unit_delta_snapshot, subtotal, options_snapshot_json")
      .eq("order_id", orderId),
    sb.from("gift_certificate_redemptions").select("redeemed_amount, reversed, forfeited_amount").eq("order_id", orderId),
    sb
      .from("store_order_cancel_requests")
      .select("id, requested_by, requested_role, reason, status, previous_order_status, created_at, approved_by, approved_at, rejected_at, rejected_reason")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false }),
    sb.from("stores").select("id, store_name, slug").eq("id", s(order.store_id)).maybeSingle(),
    sb.from("store_order_deliveries").select("rider_failure_reported_at").eq("order_id", orderId).maybeSingle(),
    sb
      .from("audit_logs")
      .select("id, created_at, action, actor_type, actor_id, before_json, after_json")
      .eq("target_type", "store_order")
      .eq("target_id", orderId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const failed = [itemsRes, giftRes, cancelRes, auditRes].find((r) => r.error);
  if (failed?.error) return { ok: false, error: "query_failed", message: failed.error.message };

  const items = (itemsRes.data ?? [])
    .map((r) => mapAdminOrderItem(r as Record<string, unknown>))
    // Representative-first (D4): largest subtotal, then title.
    .sort((a, b) => b.subtotal - a.subtotal || a.title.localeCompare(b.title));

  const giftRows = (giftRes.data ?? []) as Record<string, unknown>[];
  const gift: AdminOrderGiftLedger | null =
    giftRows.length === 0
      ? null
      : {
          rows: giftRows.length,
          redeemed: giftRows.reduce((n, r) => n + (Number(r.redeemed_amount) || 0), 0),
          reversed: giftRows.some((r) => r.reversed === true),
          forfeited: giftRows.reduce((n, r) => n + (Number(r.forfeited_amount) || 0), 0),
        };

  const cancelRows = (cancelRes.data ?? []) as Record<string, unknown>[];
  const auditRows = (auditRes.data ?? []) as Record<string, unknown>[];
  const labels = await loadAdminUserLabels(sb, [
    s(order.buyer_user_id),
    ...cancelRows.map((r) => s(r.approved_by)),
    ...auditRows.map((r) => s(r.actor_id)),
  ]);

  const cancelRequests: AdminOrderCancelRequest[] = cancelRows.map((r) => ({
    id: s(r.id),
    requester: toRequester(r.requested_role),
    reason: s(r.reason),
    status: s(r.status),
    previousStatus: sOrNull(r.previous_order_status),
    requestedAt: s(r.created_at),
    decidedAt: sOrNull(r.approved_at) ?? sOrNull(r.rejected_at),
    decidedBy: sOrNull(r.approved_by) ? labels.get(s(r.approved_by)) ?? s(r.approved_by).slice(0, 8) : null,
    rejectedReason: sOrNull(r.rejected_reason),
  }));

  const store = (storeRes.data ?? null) as Record<string, unknown> | null;
  const address =
    sOrNull(order.delivery_formatted_address) ?? sOrNull(order.delivery_address_summary);
  const addressDetail = sOrNull(order.delivery_detail_address) ?? sOrNull(order.delivery_address_detail);

  return {
    ok: true,
    detail: {
      order: {
        id: s(order.id),
        orderNo: s(order.order_no),
        createdAt: s(order.created_at),
        orderStatus: s(order.order_status),
        paymentStatus: s(order.payment_status),
        fulfillmentType: s(order.fulfillment_type),
        paymentMethod: sOrNull(order.buyer_payment_method),
        paymentMethodDetail: sOrNull(order.buyer_payment_method_detail),
        buyerNote: sOrNull(order.buyer_note),
        buyerPhone: sOrNull(order.buyer_phone),
        deliveryAddress: address ? (addressDetail ? `${address} · ${addressDetail}` : address) : null,
        deliveryNote: sOrNull(order.delivery_note),
        acceptedAt: sOrNull(order.accepted_at),
        estimatedReadyAt: sOrNull(order.estimated_ready_at),
        refundApprovedAt: sOrNull(order.refund_approved_at),
        refundedAt: sOrNull(order.refunded_at),
        adminLocked: order.admin_locked === true,
        adminFlagged: order.admin_flagged === true,
        adminNote: sOrNull(order.admin_note),
        disputeStatus: sOrNull(order.dispute_status),
        needsAdminAttention: order.needs_admin_attention === true,
        slaWarningLevel: sOrNull(order.sla_warning_level),
        slaWarningReason: sOrNull(order.sla_warning_reason),
        hasChat: Boolean(sOrNull(order.community_messenger_room_id)),
        storeId: s(order.store_id),
        storeName: s(store?.store_name) || "—",
        storeSlug: sOrNull(store?.slug),
        buyerUserId: s(order.buyer_user_id),
        buyerLabel: labels.get(s(order.buyer_user_id)) ?? s(order.buyer_user_id).slice(0, 8),
      },
      items,
      money: buildAdminOrderMoney(order, items, gift),
      gift,
      cancelRequests,
      riderFailureReportedAt: sOrNull((deliveryRes.data as Record<string, unknown> | null)?.rider_failure_reported_at),
      audit: auditRows.map((r) => ({
        id: s(r.id),
        created_at: s(r.created_at),
        action: s(r.action),
        actor_type: s(r.actor_type),
        actor_id: sOrNull(r.actor_id),
        actor_label: sOrNull(r.actor_id) ? labels.get(s(r.actor_id)) ?? null : null,
        before_json: r.before_json ?? null,
        after_json: r.after_json ?? null,
      })),
    },
  };
}
