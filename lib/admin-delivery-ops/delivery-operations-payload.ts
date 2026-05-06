/**
 * 배달 운영 통계 RPC(`admin_delivery_operations_dashboard`) 응답 파서.
 * 필드 누락·타입 왜곡에 방어적으로 대응합니다.
 */

import {
  parseDeliveryOperationsHealth,
  type DeliveryOperationsHealth,
} from "@/lib/admin-delivery-ops/delivery-operations-health";

export type DeliveryOperationsKpis = {
  orders_today: number;
  orders_in_progress: number;
  sla_attention_orders: number;
  unassigned_delivery_orders: number;
  platform_revenue_today: number;
  refund_amount_today: number;
  settlement_pending_amount_today: number;
  held_settlements_count: number;
  online_riders: number;
};

export type DeliveryOperationsQueues = Record<string, Record<string, unknown>[]>;

export type DeliveryOperationsCharts = {
  orders_by_day: { date: string; count: number }[];
  orders_by_hour_utc: { hour: number; count: number }[];
  refunds_by_day: { date: string; amount: number }[];
  platform_revenue_by_day: { date: string; amount: number }[];
  top_stores: Record<string, unknown>[];
  top_regions: Record<string, unknown>[];
};

export type DeliveryOperationsRiderRow = {
  rider_id: string;
  completed_deliveries: number;
  avg_delivery_minutes: number | null;
  failed_or_terminal_orders: number;
  sla_flags: number;
};

export type DeliveryOperationsPayload = {
  generated_at?: string;
  query?: { days: number };
  kpis: DeliveryOperationsKpis;
  queues: DeliveryOperationsQueues;
  charts: DeliveryOperationsCharts;
  riders: DeliveryOperationsRiderRow[];
  /** `/api/admin/stats/delivery-operations` 가 병합하는 헬스 RPC 결과 */
  health?: DeliveryOperationsHealth | null;
  health_rpc_missing?: boolean;
  health_rpc_hint?: string;
  health_rpc_error?: string;
};

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = num(v, NaN);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v != null ? String(v) : "";
}

function arrObj(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Record<string, unknown> => x != null && typeof x === "object" && !Array.isArray(x));
}

function parseChartDays(raw: unknown): { date: string; count: number }[] {
  return arrObj(raw).map((row) => ({
    date: str(row.date),
    count: num(row.count),
  }));
}

function parseChartAmountDays(raw: unknown): { date: string; amount: number }[] {
  return arrObj(raw).map((row) => ({
    date: str(row.date),
    amount: num(row.amount),
  }));
}

function parseHourBuckets(raw: unknown): { hour: number; count: number }[] {
  return arrObj(raw).map((row) => ({
    hour: Math.min(23, Math.max(0, Math.floor(num(row.hour)))),
    count: num(row.count),
  }));
}

function parseRiders(raw: unknown): DeliveryOperationsRiderRow[] {
  return arrObj(raw).map((row) => ({
    rider_id: str(row.rider_id),
    completed_deliveries: num(row.completed_deliveries),
    avg_delivery_minutes: numOrNull(row.avg_delivery_minutes),
    failed_or_terminal_orders: num(row.failed_or_terminal_orders),
    sla_flags: num(row.sla_flags),
  }));
}

export function isDeliveryOperationsPayload(v: unknown): v is DeliveryOperationsPayload {
  return parseDeliveryOperationsPayload(v) != null;
}

export function parseDeliveryOperationsPayload(v: unknown): DeliveryOperationsPayload | null {
  if (v == null || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const kpisRaw = o.kpis;
  if (kpisRaw == null || typeof kpisRaw !== "object" || Array.isArray(kpisRaw)) return null;
  const k = kpisRaw as Record<string, unknown>;

  const queuesRaw = o.queues;
  if (queuesRaw == null || typeof queuesRaw !== "object" || Array.isArray(queuesRaw)) return null;
  const queues: DeliveryOperationsQueues = {};
  for (const [key, val] of Object.entries(queuesRaw as Record<string, unknown>)) {
    queues[key] = arrObj(val);
  }

  const chartsRaw = o.charts;
  if (chartsRaw == null || typeof chartsRaw !== "object" || Array.isArray(chartsRaw)) return null;
  const c = chartsRaw as Record<string, unknown>;

  const charts: DeliveryOperationsCharts = {
    orders_by_day: parseChartDays(c.orders_by_day),
    orders_by_hour_utc: parseHourBuckets(c.orders_by_hour_utc),
    refunds_by_day: parseChartAmountDays(c.refunds_by_day),
    platform_revenue_by_day: parseChartAmountDays(c.platform_revenue_by_day),
    top_stores: arrObj(c.top_stores),
    top_regions: arrObj(c.top_regions),
  };

  const kpis: DeliveryOperationsKpis = {
    orders_today: num(k.orders_today),
    orders_in_progress: num(k.orders_in_progress),
    sla_attention_orders: num(k.sla_attention_orders),
    unassigned_delivery_orders: num(k.unassigned_delivery_orders),
    platform_revenue_today: num(k.platform_revenue_today),
    refund_amount_today: num(k.refund_amount_today),
    settlement_pending_amount_today: num(k.settlement_pending_amount_today),
    held_settlements_count: num(k.held_settlements_count),
    online_riders: num(k.online_riders),
  };

  const healthField =
    "health" in o ? parseDeliveryOperationsHealth((o as Record<string, unknown>).health) : undefined;

  return {
    generated_at: typeof o.generated_at === "string" ? o.generated_at : undefined,
    query: o.query != null && typeof o.query === "object" && !Array.isArray(o.query)
      ? { days: num((o.query as Record<string, unknown>).days, 14) }
      : undefined,
    kpis,
    queues,
    charts,
    riders: parseRiders(o.riders),
    ...("health" in o ? { health: healthField ?? null } : {}),
    ...(o.health_rpc_missing === true ? { health_rpc_missing: true } : {}),
    ...(typeof o.health_rpc_hint === "string" && o.health_rpc_hint
      ? { health_rpc_hint: o.health_rpc_hint }
      : {}),
    ...(typeof o.health_rpc_error === "string" && o.health_rpc_error
      ? { health_rpc_error: o.health_rpc_error }
      : {}),
  };
}
