/**
 * 배달 지표 값 로더 (서버 전용) — `delivery-metrics.ts` 정의를 실제 값으로 채운다.
 * 관리자 읽기 전용 집계만 수행한다 (고객 hot-path 쿼리 없음). 실패 = null (「확인 불가」).
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAdminActionQueueCounts } from "@/lib/admin/admin-action-queue";
import { loadAdminBusinessListOps } from "@/lib/admin-business/load-admin-business-list";
import { BUSINESS_OPS_IN_PROGRESS_ORDER_STATUSES } from "@/lib/admin-business/business-ops-presentation";
import { adminDomainCountExact } from "@/lib/admin/domain-dashboard/count-exact";
import { manilaTodayRangeUtc } from "@/lib/admin/metrics/manila-period";
import {
  DELIVERY_METRIC_DEFINITIONS,
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
      adminDomainCountExact(() =>
        sbAny
          .from("store_orders")
          .select("id", { count: "exact", head: true })
          .gte("created_at", today.fromIso)
          .lt("created_at", today.toIso)
      ),
      adminDomainCountExact(() =>
        sbAny
          .from("store_orders")
          .select("id", { count: "exact", head: true })
          .in("order_status", [...BUSINESS_OPS_IN_PROGRESS_ORDER_STATUSES])
      ),
      adminDomainCountExact(() =>
        sbAny.from("store_orders").select("id", { count: "exact", head: true }).eq("order_status", "delivering")
      ),
      adminDomainCountExact(() =>
        sbAny.from("store_orders").select("id", { count: "exact", head: true }).eq("order_status", "cancel_requested")
      ),
      adminDomainCountExact(() =>
        sbAny.from("store_orders").select("id", { count: "exact", head: true }).eq("order_status", "refund_requested")
      ),
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
    ]),
  ]);

  const kpi = "ok" in listRes && listRes.ok ? listRes.kpi : null;
  if (!kpi) sectionErrors.push(`business_ops_kpi:${"error" in listRes ? listRes.error : "unavailable"}`);

  const [ordersToday, inProgress, delivering, cancelReq, refundReq, autoFailed, autoPending] = direct;
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
  };

  const values = new Map<DeliveryMetricId, DeliveryMetricValue>();
  for (const def of DELIVERY_METRIC_DEFINITIONS) {
    values.set(
      def.id,
      def.source.kind === "queue"
        ? resolveDeliveryQueueMetric(def, queueRes?.categories ?? null)
        : resolveDeliveryDirectMetric(def, directValues[def.id])
    );
  }
  return { values, sectionErrors };
}
