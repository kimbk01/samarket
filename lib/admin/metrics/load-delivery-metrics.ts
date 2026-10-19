/**
 * 배달 지표 값 로더 (서버 전용) — `delivery-metrics.ts` 정의를 실제 값으로 채운다.
 * 관리자 읽기 전용 집계만 수행한다 (고객 hot-path 쿼리 없음). 실패 = null (「확인 불가」).
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAdminActionQueueCounts } from "@/lib/admin/admin-action-queue";
import { loadAdminBusinessListOps } from "@/lib/admin-business/load-admin-business-list";
import { adminDomainCountExact } from "@/lib/admin/domain-dashboard/count-exact";
import { manilaTodayRangeUtc } from "@/lib/admin/metrics/manila-period";
import { ADMIN_STORE_ORDERS_TAB_STATUSES } from "@/lib/admin/store-orders/admin-store-orders-contract";
import { resolveAdminOrderOpsPeriod } from "@/lib/admin/store-orders/admin-store-order-ops-contract";
import { STORE_ORDER_ADMIN_QUEUE_EXCLUDED_STATUSES } from "@/lib/admin/admin-ops-actionable-status";
import {
  DELIVERY_METRIC_DEFINITIONS,
  deliveryStaleMetricHref,
  resolveDeliveryDirectMetric,
  resolveDeliveryQueueMetric,
  type DeliveryMetricId,
  type DeliveryMetricValue,
} from "@/lib/admin/metrics/delivery-metrics";

export type DeliveryMetricsSnapshot = {
  values: ReadonlyMap<DeliveryMetricId, DeliveryMetricValue>;
  sectionErrors: string[];
};

export async function loadDeliveryMetrics(sb: SupabaseClient, now: Date = new Date()): Promise<DeliveryMetricsSnapshot> {
  const sectionErrors: string[] = [];
  const sbAny = sb as any;
  const today = manilaTodayRangeUtc(now);
  // 활성 기간 = 최근 7일(마닐라) — 주문 목록 `period=last_7_days` 와 같은 경계.
  const activeFrom = String(resolveAdminOrderOpsPeriod("last_7_days", null, null, now).fromIso);
  const IN_PROGRESS = [...ADMIN_STORE_ORDERS_TAB_STATUSES.in_progress];
  const orders = () => sbAny.from("store_orders").select("id", { count: "exact", head: true });
  const count = (f: (q: any) => any) => adminDomainCountExact(() => f(orders()));
  // 처리 필요 주문(운영 예외) — 주문 목록 RPC 와 같은 조건: 관리자 확인 표시 + 종결 상태 제외
  const attentionOpen = (q: any) =>
    q
      .eq("needs_admin_attention", true)
      .not("order_status", "in", `(${STORE_ORDER_ADMIN_QUEUE_EXCLUDED_STATUSES.join(",")})`);

  const [listRes, queueRes, direct] = await Promise.all([
    loadAdminBusinessListOps(sb, { page: 1, pageSize: 1 }).catch((e: unknown) => ({
      ok: false as const,
      error: e instanceof Error ? e.message : "error",
    })),
    loadAdminActionQueueCounts({ storesSb: sbAny, notesSb: sbAny }).catch((e: unknown) => {
      sectionErrors.push(`action_queue:${e instanceof Error ? e.message : "error"}`);
      return null;
    }),
    Promise.all([
      count((q) => q.gte("created_at", today.fromIso).lt("created_at", today.toIso)),
      count((q) => q.in("order_status", IN_PROGRESS).gte("created_at", activeFrom)),
      count((q) => q.eq("order_status", "delivering").gte("created_at", activeFrom)),
      count((q) => q.eq("order_status", "cancel_requested").gte("created_at", activeFrom)),
      count((q) => q.eq("order_status", "refund_requested").gte("created_at", activeFrom)),
      adminDomainCountExact(() =>
        sbAny
          .from("delivery_operation_alert_actions")
          .select("id", { count: "exact", head: true })
          .eq("action_status", "failed")
      ),
      adminDomainCountExact(() =>
        sbAny
          .from("delivery_operation_alert_actions")
          .select("id", { count: "exact", head: true })
          .eq("action_status", "pending_approval")
      ),
      count((q) => attentionOpen(q).gte("created_at", activeFrom)),
      // 운영 위험 — 활성 기간 이전 생성, 아직 종결되지 않음 (현재 처리 업무로 세지 않는다)
      count((q) => q.in("order_status", IN_PROGRESS).lt("created_at", activeFrom)),
      count((q) => attentionOpen(q).lt("created_at", activeFrom)),
      count((q) => q.eq("order_status", "cancel_requested").lt("created_at", activeFrom)),
      count((q) => q.eq("order_status", "refund_requested").lt("created_at", activeFrom)),
    ]),
  ]);

  const kpi = "ok" in listRes && listRes.ok ? listRes.kpi : null;
  if (!kpi) sectionErrors.push(`business_ops_kpi:${"error" in listRes ? listRes.error : "unavailable"}`);

  const [
    ordersToday,
    inProgress,
    delivering,
    cancelReq,
    refundReq,
    autoFailed,
    autoPending,
    attentionRecent,
    staleInProgress,
    staleAttention,
    staleCancel,
    staleRefund,
  ] = direct;
  const directValues: Partial<Record<DeliveryMetricId, number | null>> = {
    "delivery.stores_by_state.total": kpi?.totalStores ?? null,
    "delivery.stores_by_state.open": kpi?.openNow ?? null,
    "delivery.stores_by_state.closed": kpi?.closedNow ?? null,
    "delivery.stores_by_state.restricted": kpi?.restricted ?? null,
    "delivery.orders_new_today": ordersToday,
    "delivery.orders_in_progress": inProgress,
    "delivery.orders_delivering": delivering,
    "delivery.cancel_refund_requests.cancel": cancelReq,
    "delivery.cancel_refund_requests.refund": refundReq,
    "delivery.auto_actions_failed": autoFailed,
    "delivery.auto_actions_pending_approval": autoPending,
    "delivery.orders_attention_recent": attentionRecent,
    "delivery.orders_stale_in_progress": staleInProgress,
    "delivery.orders_stale_attention": staleAttention,
    "delivery.orders_stale_cancel_requested": staleCancel,
    "delivery.orders_stale_refund_requested": staleRefund,
  };

  const values = new Map<DeliveryMetricId, DeliveryMetricValue>();
  for (const def of DELIVERY_METRIC_DEFINITIONS) {
    values.set(
      def.id,
      def.source.kind === "queue"
        ? resolveDeliveryQueueMetric(def, queueRes?.categories ?? null)
        : resolveDeliveryDirectMetric(
            def,
            directValues[def.id],
            def.period === "stale" ? deliveryStaleMetricHref(def.href, activeFrom) : null
          )
    );
  }
  return { values, sectionErrors };
}
