/**
 * `/stores/owner` RSC 대시보드 meta → `fetchStoreOrderCountsDeduped` 첫 왕복 제거.
 */
import type { OwnerStoreOpsSnapshot } from "@/lib/stores/owner-store-ops-snapshot";
import { EMPTY_OWNER_STORE_OPS_SNAPSHOT } from "@/lib/stores/owner-store-ops-snapshot";

export type OwnerHubOrderCountsCacheValue = {
  ok: true;
} & OwnerStoreOpsSnapshot;

const TTL_MS = 20_000;

let cached: { storeId: string; expiresAt: number; value: OwnerHubOrderCountsCacheValue } | null =
  null;

export type OwnerHubOrderCountsSeedInput = Partial<OwnerStoreOpsSnapshot> & {
  pending_accept_count: number;
  refund_requested_count: number;
  pending_delivery_count: number;
};

function n(v: unknown): number {
  return Math.max(0, Math.floor(Number(v) || 0));
}

function money(v: unknown): number {
  return Math.max(0, Math.round(Number(v) || 0));
}

function normalizeOrderCountsSeed(meta: OwnerHubOrderCountsSeedInput): OwnerHubOrderCountsCacheValue {
  const base = { ...EMPTY_OWNER_STORE_OPS_SNAPSHOT };
  const merged = { ...base, ...meta };
  return {
    ok: true,
    refund_requested_count: n(merged.refund_requested_count),
    pending_accept_count: n(merged.pending_accept_count),
    pending_delivery_count: n(merged.pending_delivery_count),
    in_progress_count: n(merged.in_progress_count),
    today_completed_sales_amount: money(merged.today_completed_sales_amount),
    open_inquiries_count: n(merged.open_inquiries_count),
    sold_out_product_count: n(merged.sold_out_product_count),
    pending_over_3m_count: n(merged.pending_over_3m_count),
    cooking_delay_count: n(merged.cooking_delay_count),
    delivery_delay_count: n(merged.delivery_delay_count),
    rider_unassigned_count: n(merged.rider_unassigned_count),
    flow_waiting_count: n(merged.flow_waiting_count),
    flow_cooking_count: n(merged.flow_cooking_count),
    flow_delivering_count: n(merged.flow_delivering_count),
    flow_completed_today_count: n(merged.flow_completed_today_count),
    flow_cooking_delayed_count: n(merged.flow_cooking_delayed_count),
    flow_delivering_delayed_count: n(merged.flow_delivering_delayed_count),
    today_order_count: n(merged.today_order_count),
    yesterday_completed_sales_amount: money(merged.yesterday_completed_sales_amount),
    today_cancelled_count: n(merged.today_cancelled_count),
    latest_pending_order_id:
      typeof merged.latest_pending_order_id === "string" && merged.latest_pending_order_id.trim()
        ? merged.latest_pending_order_id.trim()
        : null,
    avg_order_value_today: money(merged.avg_order_value_today),
    reviews_need_reply_count: n(merged.reviews_need_reply_count),
    active_dispute_count: n(merged.active_dispute_count),
    hidden_product_count: n(merged.hidden_product_count),
    sale_suspended_product_count: n(merged.sale_suspended_product_count),
    option_error_product_count: n(merged.option_error_product_count),
    option_error_health_available: merged.option_error_health_available === true,
    store_ops: merged.store_ops ?? base.store_ops,
  };
}

export function seedOwnerHubOrderCountsCache(storeId: string, meta: OwnerHubOrderCountsSeedInput): void {
  const sid = storeId.trim();
  if (!sid) return;
  cached = {
    storeId: sid,
    expiresAt: Date.now() + TTL_MS,
    value: normalizeOrderCountsSeed(meta),
  };
}

export function peekOwnerHubOrderCountsCache(storeId: string): OwnerHubOrderCountsCacheValue | null {
  const sid = storeId.trim();
  if (!sid || !cached || cached.storeId !== sid) return null;
  if (cached.expiresAt <= Date.now()) {
    cached = null;
    return null;
  }
  return cached.value;
}

/** 허브 order-counts 클라이언트 캐시 → 대시보드 스냅샷 (첫 페인트·중복 fetch 완화) */
export function peekOwnerStoreOpsSnapshotFromHubCache(storeId: string): OwnerStoreOpsSnapshot | null {
  const peek = peekOwnerHubOrderCountsCache(storeId);
  if (!peek) return null;
  const { ok: _ok, ...snapshot } = peek;
  return snapshot;
}

export function invalidateOwnerHubOrderCountsCache(storeId?: string): void {
  if (!storeId?.trim()) {
    cached = null;
    return;
  }
  if (cached?.storeId === storeId.trim()) cached = null;
}

export function ownerHubOrderAlertsFromMeta(meta: {
  pending_accept_count: number;
  refund_requested_count: number;
}): number {
  return Math.max(0, meta.pending_accept_count) + Math.max(0, meta.refund_requested_count);
}
