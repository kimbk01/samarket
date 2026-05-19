import type { SupabaseClient } from "@supabase/supabase-js";
import { buildStoreOpsMetaFromRow } from "@/lib/stores/owner-store-ops-snapshot";

const FLOW_COOKING = ["accepted", "preparing"] as const;
const FLOW_DELIVERING = ["ready_for_pickup", "delivering", "arrived"] as const;
const DELIVERY_SLA_REASONS = ["delivery_over_60m", "unassigned_over_10m"] as const;

function startOfLocalDayIso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function endOfLocalDayIso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

function threeMinutesAgoIso(): string {
  return new Date(Date.now() - 3 * 60 * 1000).toISOString();
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function countPendingOver3mForStore(
  sb: SupabaseClient<any>,
  storeId: string
): Promise<number> {
  const sid = storeId.trim();
  if (!sid) return 0;
  const { count, error } = await sb
    .from("store_orders")
    .select("id", { count: "exact", head: true })
    .eq("store_id", sid)
    .eq("order_status", "pending")
    .lt("created_at", threeMinutesAgoIso());
  if (error) {
    console.error("[countPendingOver3mForStore]", error);
    return 0;
  }
  return Math.max(0, Math.floor(Number(count) || 0));
}

export async function countCookingDelayForStore(
  sb: SupabaseClient<any>,
  storeId: string
): Promise<number> {
  const sid = storeId.trim();
  if (!sid) return 0;
  const [slaRes, overdueRes] = await Promise.all([
    sb
      .from("store_orders")
      .select("id", { count: "exact", head: true })
      .eq("store_id", sid)
      .eq("sla_warning_reason", "eta_overdue"),
    sb
      .from("store_orders")
      .select("id", { count: "exact", head: true })
      .eq("store_id", sid)
      .eq("order_status", "preparing")
      .lt("estimated_ready_at", nowIso())
      .not("estimated_ready_at", "is", null),
  ]);
  const sla = Math.max(0, Math.floor(Number(slaRes.count) || 0));
  const overdue = Math.max(0, Math.floor(Number(overdueRes.count) || 0));
  return Math.max(sla, overdue);
}

export async function countDeliveryDelayForStore(
  sb: SupabaseClient<any>,
  storeId: string
): Promise<number> {
  const sid = storeId.trim();
  if (!sid) return 0;
  const { count, error } = await sb
    .from("store_orders")
    .select("id", { count: "exact", head: true })
    .eq("store_id", sid)
    .in("sla_warning_reason", [...DELIVERY_SLA_REASONS])
    .in("order_status", [...FLOW_DELIVERING]);
  if (error) {
    console.error("[countDeliveryDelayForStore]", error);
    return 0;
  }
  return Math.max(0, Math.floor(Number(count) || 0));
}

export async function countRiderUnassignedForStore(
  sb: SupabaseClient<any>,
  storeId: string
): Promise<number> {
  const sid = storeId.trim();
  if (!sid) return 0;
  const { count: slaCount, error: slaErr } = await sb
    .from("store_orders")
    .select("id", { count: "exact", head: true })
    .eq("store_id", sid)
    .eq("sla_warning_reason", "unassigned_over_10m")
    .in("order_status", [...FLOW_DELIVERING]);
  if (!slaErr && Math.max(0, Math.floor(Number(slaCount) || 0)) > 0) {
    return Math.max(0, Math.floor(Number(slaCount) || 0));
  }
  try {
    const { count, error } = await sb
      .from("store_order_deliveries")
      .select("order_id, store_orders!inner(store_id)", { count: "exact", head: true })
      .eq("delivery_status", "waiting_rider")
      .eq("store_orders.store_id", sid);
    if (error) {
      if (/store_order_deliveries/i.test(String(error.message)) && /does not exist/i.test(String(error.message))) {
        return 0;
      }
      console.error("[countRiderUnassignedForStore]", error);
      return 0;
    }
    return Math.max(0, Math.floor(Number(count) || 0));
  } catch {
    return 0;
  }
}

export async function countFlowCookingDelayedForStore(
  sb: SupabaseClient<any>,
  storeId: string
): Promise<number> {
  const sid = storeId.trim();
  if (!sid) return 0;
  const [slaRes, overdueRes] = await Promise.all([
    sb
      .from("store_orders")
      .select("id", { count: "exact", head: true })
      .eq("store_id", sid)
      .eq("order_status", "preparing")
      .eq("sla_warning_reason", "eta_overdue"),
    sb
      .from("store_orders")
      .select("id", { count: "exact", head: true })
      .eq("store_id", sid)
      .eq("order_status", "preparing")
      .lt("estimated_ready_at", nowIso())
      .not("estimated_ready_at", "is", null),
  ]);
  return Math.max(
    Math.max(0, Math.floor(Number(slaRes.count) || 0)),
    Math.max(0, Math.floor(Number(overdueRes.count) || 0))
  );
}

export async function countFlowDeliveringDelayedForStore(
  sb: SupabaseClient<any>,
  storeId: string
): Promise<number> {
  const sid = storeId.trim();
  if (!sid) return 0;
  const { count, error } = await sb
    .from("store_orders")
    .select("id", { count: "exact", head: true })
    .eq("store_id", sid)
    .in("order_status", [...FLOW_DELIVERING])
    .in("sla_warning_reason", [...DELIVERY_SLA_REASONS]);
  if (error) {
    console.error("[countFlowDeliveringDelayedForStore]", error);
    return 0;
  }
  return Math.max(0, Math.floor(Number(count) || 0));
}

export async function countFlowWaitingForStore(sb: SupabaseClient<any>, storeId: string): Promise<number> {
  const sid = storeId.trim();
  if (!sid) return 0;
  const { count, error } = await sb
    .from("store_orders")
    .select("id", { count: "exact", head: true })
    .eq("store_id", sid)
    .eq("order_status", "pending");
  if (error) return 0;
  return Math.max(0, Math.floor(Number(count) || 0));
}

export async function countFlowCookingForStore(sb: SupabaseClient<any>, storeId: string): Promise<number> {
  const sid = storeId.trim();
  if (!sid) return 0;
  const { count, error } = await sb
    .from("store_orders")
    .select("id", { count: "exact", head: true })
    .eq("store_id", sid)
    .in("order_status", [...FLOW_COOKING]);
  if (error) return 0;
  return Math.max(0, Math.floor(Number(count) || 0));
}

export async function countFlowDeliveringForStore(sb: SupabaseClient<any>, storeId: string): Promise<number> {
  const sid = storeId.trim();
  if (!sid) return 0;
  const { count, error } = await sb
    .from("store_orders")
    .select("id", { count: "exact", head: true })
    .eq("store_id", sid)
    .in("order_status", [...FLOW_DELIVERING]);
  if (error) return 0;
  return Math.max(0, Math.floor(Number(count) || 0));
}

export async function countFlowCompletedTodayForStore(
  sb: SupabaseClient<any>,
  storeId: string
): Promise<number> {
  const sid = storeId.trim();
  if (!sid) return 0;
  const { count, error } = await sb
    .from("store_orders")
    .select("id", { count: "exact", head: true })
    .eq("store_id", sid)
    .eq("order_status", "completed")
    .gte("updated_at", startOfLocalDayIso());
  if (error) return 0;
  return Math.max(0, Math.floor(Number(count) || 0));
}

export async function countTodayOrdersForStore(sb: SupabaseClient<any>, storeId: string): Promise<number> {
  const sid = storeId.trim();
  if (!sid) return 0;
  const { count, error } = await sb
    .from("store_orders")
    .select("id", { count: "exact", head: true })
    .eq("store_id", sid)
    .gte("created_at", startOfLocalDayIso());
  if (error) return 0;
  return Math.max(0, Math.floor(Number(count) || 0));
}

export async function countTodayCancelledForStore(sb: SupabaseClient<any>, storeId: string): Promise<number> {
  const sid = storeId.trim();
  if (!sid) return 0;
  const { count, error } = await sb
    .from("store_orders")
    .select("id", { count: "exact", head: true })
    .eq("store_id", sid)
    .eq("order_status", "cancelled")
    .gte("created_at", startOfLocalDayIso());
  if (error) return 0;
  return Math.max(0, Math.floor(Number(count) || 0));
}

export async function sumYesterdayCompletedSalesForStore(
  sb: SupabaseClient<any>,
  storeId: string
): Promise<number> {
  const sid = storeId.trim();
  if (!sid) return 0;
  const { data, error } = await sb
    .from("store_orders")
    .select("payment_amount")
    .eq("store_id", sid)
    .eq("order_status", "completed")
    .gte("updated_at", startOfLocalDayIso(-1))
    .lte("updated_at", endOfLocalDayIso(-1));
  if (error) {
    console.error("[sumYesterdayCompletedSalesForStore]", error);
    return 0;
  }
  let sum = 0;
  for (const row of data ?? []) {
    sum += Math.round(Number((row as { payment_amount?: unknown }).payment_amount) || 0);
  }
  return Math.max(0, sum);
}

export async function countReviewsNeedReplyForStore(
  sb: SupabaseClient<any>,
  storeId: string
): Promise<number> {
  const sid = storeId.trim();
  if (!sid) return 0;
  const { count, error } = await sb
    .from("store_reviews")
    .select("id", { count: "exact", head: true })
    .eq("store_id", sid)
    .is("owner_reply_content", null);
  if (error) {
    if (/store_reviews/i.test(String(error.message)) && /does not exist/i.test(String(error.message))) {
      return 0;
    }
    console.error("[countReviewsNeedReplyForStore]", error);
    return 0;
  }
  return Math.max(0, Math.floor(Number(count) || 0));
}

export async function countActiveDisputesForStore(
  sb: SupabaseClient<any>,
  storeId: string
): Promise<number> {
  const sid = storeId.trim();
  if (!sid) return 0;
  const { count, error } = await sb
    .from("store_orders")
    .select("id", { count: "exact", head: true })
    .eq("store_id", sid)
    .not("dispute_status", "is", null)
    .neq("dispute_status", "");
  if (error) {
    console.error("[countActiveDisputesForStore]", error);
    return 0;
  }
  return Math.max(0, Math.floor(Number(count) || 0));
}

export async function countHiddenProductsForStore(sb: SupabaseClient<any>, storeId: string): Promise<number> {
  const sid = storeId.trim();
  if (!sid) return 0;
  const { count, error } = await sb
    .from("store_products")
    .select("id", { count: "exact", head: true })
    .eq("store_id", sid)
    .eq("product_status", "hidden");
  if (error) {
    console.error("[countHiddenProductsForStore]", error);
    return 0;
  }
  return Math.max(0, Math.floor(Number(count) || 0));
}

export async function countDraftProductsForStore(sb: SupabaseClient<any>, storeId: string): Promise<number> {
  const sid = storeId.trim();
  if (!sid) return 0;
  const { count, error } = await sb
    .from("store_products")
    .select("id", { count: "exact", head: true })
    .eq("store_id", sid)
    .eq("product_status", "draft");
  if (error) {
    console.error("[countDraftProductsForStore]", error);
    return 0;
  }
  return Math.max(0, Math.floor(Number(count) || 0));
}

export async function fetchStoreOpsMetaForOwner(
  sb: SupabaseClient<any>,
  storeId: string
): Promise<ReturnType<typeof buildStoreOpsMetaFromRow>> {
  const sid = storeId.trim();
  if (!sid) return buildStoreOpsMetaFromRow({});
  const { data, error } = await sb
    .from("stores")
    .select("is_open, business_hours_json")
    .eq("id", sid)
    .maybeSingle();
  if (error || !data) {
    console.error("[fetchStoreOpsMetaForOwner]", error);
    return buildStoreOpsMetaFromRow({});
  }
  return buildStoreOpsMetaFromRow({
    is_open: data.is_open as boolean | null,
    business_hours_json: data.business_hours_json,
  });
}
