import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { dvDeliveryLatencyLog, dvDeliveryLatencyMeasure, dvNow } from "@/lib/perf/dv-delivery-latency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayBoundsLocal(now = new Date()): { todayStart: Date; todayEndEx: Date } {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEndEx = new Date(todayStart);
  todayEndEx.setDate(todayEndEx.getDate() + 1);
  return { todayStart, todayEndEx };
}

type RuntimeSettingsRow = {
  singleton: number;
  enable_pg_cron: boolean;
  enable_realtime_optimization: boolean;
  enable_auto_actions: boolean;
  enable_alert_runner: boolean;
  enable_recovery_runner: boolean;
  enable_delivery_realtime_filtering: boolean;
  updated_at?: string | null;
};

type CapabilitiesRow = {
  singleton: number;
  pg_version: string | null;
  pg_version_num: number | null;
  supports_pg_cron: boolean;
  supports_publication_column_filter: boolean;
  supports_advanced_rpc: boolean;
  supports_advisory_lock: boolean;
  supports_realtime_optimization: boolean;
  checked_at?: string | null;
};

function computeEffectiveRuntime(
  caps: CapabilitiesRow | null,
  s: RuntimeSettingsRow
): {
  effective: RuntimeSettingsRow;
  warnings: { code: string; message: string }[];
} {
  const warnings: { code: string; message: string }[] = [];
  const supportsPgCron = caps?.supports_pg_cron ?? false;
  const supportsPubCols = caps?.supports_publication_column_filter ?? false;
  const supportsRtOpt = caps?.supports_realtime_optimization ?? false;

  const effective: RuntimeSettingsRow = {
    ...s,
    enable_pg_cron: s.enable_pg_cron && supportsPgCron,
    enable_realtime_optimization: s.enable_realtime_optimization && supportsRtOpt,
    enable_delivery_realtime_filtering: s.enable_delivery_realtime_filtering && supportsPubCols,
  };

  if (s.enable_pg_cron && !supportsPgCron) {
    warnings.push({ code: "pg_cron_unsupported", message: "pg_cron 미지원: enable_pg_cron이 runtime에서 OFF로 처리됨" });
  }
  if (s.enable_delivery_realtime_filtering && !supportsPubCols) {
    warnings.push({
      code: "publication_columns_unsupported",
      message: "publication 컬럼 필터 미지원(PG15+ 필요): enable_delivery_realtime_filtering이 runtime에서 OFF로 처리됨",
    });
  }
  if (s.enable_realtime_optimization && !supportsRtOpt) {
    warnings.push({
      code: "realtime_optimization_unsupported",
      message: "Realtime 최적화 미지원: enable_realtime_optimization이 runtime에서 OFF로 처리됨",
    });
  }

  return { effective, warnings };
}

function arrObj(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Record<string, unknown> => x != null && typeof x === "object" && !Array.isArray(x));
}

function trimStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "";
}

function getOrderId(row: Record<string, unknown>): string {
  const v = "order_id" in row ? row.order_id : (row as any).orderId;
  return trimStr(v);
}

function setIfMissing(row: Record<string, unknown>, key: string, value: unknown) {
  if (!(key in row) || row[key] == null || (typeof row[key] === "string" && String(row[key]).trim() === "")) {
    (row as any)[key] = value;
  }
}

async function augmentQueuesWithIds(
  sbAny: any,
  deliveryOps: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const queuesRaw = deliveryOps.queues;
  if (queuesRaw == null || typeof queuesRaw !== "object" || Array.isArray(queuesRaw)) return deliveryOps;
  const queues = queuesRaw as Record<string, unknown>;

  const keys = Object.keys(queues);
  if (keys.length === 0) return deliveryOps;

  // clone shallow + clone each queue rows so we can safely mutate
  const outQueues: Record<string, Record<string, unknown>[]> = {};
  const allRows: Record<string, unknown>[] = [];
  const orderIds: string[] = [];
  const seenOrder = new Set<string>();

  for (const k of keys) {
    const rows = arrObj(queues[k]).map((r) => ({ ...r }));
    outQueues[k] = rows;
    for (const r of rows) {
      allRows.push(r);
      const oid = getOrderId(r);
      if (oid && !seenOrder.has(oid)) {
        seenOrder.add(oid);
        orderIds.push(oid);
      }
    }
  }

  if (orderIds.length === 0) {
    return { ...deliveryOps, queues: outQueues };
  }

  // 1) Alert event: pick latest open/ack per order_id + escalation/repeat/assignment
  const evRes = await sbAny
    .from("delivery_operation_alert_events")
    .select("id, order_id, event_status, escalation_count, repeat_fire_count, assigned_admin_id, created_at")
    .in("order_id", orderIds)
    .in("event_status", ["open", "acknowledged"])
    .order("created_at", { ascending: false })
    .limit(600);

  const eventByOrder = new Map<
    string,
    {
      id: string;
      event_status: string;
      escalation_count: number;
      repeat_fire_count: number;
      assigned_admin_id: string | null;
    }
  >();
  if (!evRes.error) {
    for (const row of arrObj(evRes.data)) {
      const oid = trimStr(row.order_id);
      const eid = trimStr(row.id);
      if (!oid || !eid) continue;
      if (eventByOrder.has(oid)) continue;
      eventByOrder.set(oid, {
        id: eid,
        event_status: trimStr(row.event_status),
        escalation_count: Number(row.escalation_count ?? 0) || 0,
        repeat_fire_count: Number(row.repeat_fire_count ?? 0) || 0,
        assigned_admin_id: trimStr(row.assigned_admin_id) || null,
      });
    }
  }

  // 2) settlement_id: pick held settlement first
  const stRes = await sbAny
    .from("store_settlements")
    .select("id, order_id, settlement_status, updated_at")
    .in("order_id", orderIds)
    .order("updated_at", { ascending: false })
    .limit(600);

  const settlementByOrder = new Map<string, { id: string; settlement_status: string; updated_at: string | null }>();
  if (!stRes.error) {
    for (const row of arrObj(stRes.data)) {
      const oid = trimStr(row.order_id);
      const sid = trimStr(row.id);
      if (!oid || !sid) continue;
      const status = trimStr(row.settlement_status);
      // prefer held
      if (!settlementByOrder.has(oid) || status === "held") {
        settlementByOrder.set(oid, { id: sid, settlement_status: status, updated_at: trimStr(row.updated_at) || null });
      }
    }
  }

  // 3) delivery: status + timestamps + rider/store
  const delRes = await sbAny
    .from("store_order_deliveries")
    .select("order_id, store_id, rider_id, delivery_status, assigned_at, picked_up_at, delivered_at, updated_at")
    .in("order_id", orderIds)
    .limit(600);

  const deliveryByOrder = new Map<
    string,
    {
      store_id: string | null;
      rider_id: string | null;
      delivery_status: string;
      assigned_at: string | null;
      picked_up_at: string | null;
      delivered_at: string | null;
      updated_at: string | null;
    }
  >();
  if (!delRes.error) {
    for (const row of arrObj(delRes.data)) {
      const oid = trimStr(row.order_id);
      if (!oid) continue;
      deliveryByOrder.set(oid, {
        store_id: trimStr(row.store_id) || null,
        rider_id: trimStr(row.rider_id) || null,
        delivery_status: trimStr(row.delivery_status),
        assigned_at: trimStr(row.assigned_at) || null,
        picked_up_at: trimStr(row.picked_up_at) || null,
        delivered_at: trimStr(row.delivered_at) || null,
        updated_at: trimStr(row.updated_at) || null,
      });
    }
  }

  // 4) orders: SLA + attention + order status + store id
  const soRes = await sbAny
    .from("store_orders")
    .select(
      "id, store_id, order_no, order_status, needs_admin_attention, sla_warning_level, sla_warning_reason, updated_at"
    )
    .in("id", orderIds)
    .limit(600);

  const orderById = new Map<
    string,
    {
      store_id: string | null;
      order_no: string | null;
      order_status: string;
      needs_admin_attention: boolean;
      sla_warning_level: string | null;
      sla_warning_reason: string | null;
      updated_at: string | null;
    }
  >();
  if (!soRes.error) {
    for (const row of arrObj(soRes.data)) {
      const oid = trimStr(row.id);
      if (!oid) continue;
      orderById.set(oid, {
        store_id: trimStr(row.store_id) || null,
        order_no: trimStr(row.order_no) || null,
        order_status: trimStr(row.order_status),
        needs_admin_attention: row.needs_admin_attention === true,
        sla_warning_level: trimStr(row.sla_warning_level) || null,
        sla_warning_reason: trimStr(row.sla_warning_reason) || null,
        updated_at: trimStr(row.updated_at) || null,
      });
    }
  }

  const storeIds: string[] = [];
  const seenStore = new Set<string>();
  const riderIds: string[] = [];
  const seenRider = new Set<string>();
  for (const oid of orderIds) {
    const sto = orderById.get(oid)?.store_id ?? deliveryByOrder.get(oid)?.store_id ?? null;
    if (sto && !seenStore.has(sto)) {
      seenStore.add(sto);
      storeIds.push(sto);
    }
    const rid = deliveryByOrder.get(oid)?.rider_id ?? null;
    if (rid && !seenRider.has(rid)) {
      seenRider.add(rid);
      riderIds.push(rid);
    }
  }

  // 5) stores: store_name + region/city
  const storesRes =
    storeIds.length > 0
      ? await sbAny.from("stores").select("id, store_name, region, city").in("id", storeIds).limit(600)
      : { data: [] as unknown[] };

  const storeById = new Map<string, { store_name: string; region: string | null; city: string | null }>();
  for (const row of arrObj((storesRes as any).data)) {
    const id = trimStr(row.id);
    if (!id) continue;
    storeById.set(id, {
      store_name: trimStr(row.store_name) || id.slice(0, 8),
      region: trimStr(row.region) || null,
      city: trimStr(row.city) || null,
    });
  }

  // 6) rider name: delivery_riders -> profiles nickname
  const ridersRes =
    riderIds.length > 0
      ? await sbAny.from("delivery_riders").select("id, user_id, admin_status, suspended_at, is_online").in("id", riderIds).limit(600)
      : { data: [] as unknown[] };

  const riderUserIdByRiderId = new Map<string, { user_id: string | null; admin_status: string; suspended_at: string | null; is_online: boolean }>();
  const userIds: string[] = [];
  const seenUser = new Set<string>();
  for (const row of arrObj((ridersRes as any).data)) {
    const id = trimStr(row.id);
    if (!id) continue;
    const uid = trimStr(row.user_id) || null;
    riderUserIdByRiderId.set(id, {
      user_id: uid,
      admin_status: trimStr(row.admin_status) || "ok",
      suspended_at: trimStr(row.suspended_at) || null,
      is_online: row.is_online === true,
    });
    if (uid && !seenUser.has(uid)) {
      seenUser.add(uid);
      userIds.push(uid);
    }
  }

  const profRes =
    userIds.length > 0
      ? await sbAny.from("profiles").select("id, nickname").in("id", userIds).limit(600)
      : { data: [] as unknown[] };
  const nicknameByUserId = new Map<string, string>();
  for (const row of arrObj((profRes as any).data)) {
    const id = trimStr(row.id);
    if (!id) continue;
    const nn = trimStr(row.nickname);
    if (nn) nicknameByUserId.set(id, nn);
  }

  const riderNameByRiderId = new Map<string, string>();
  for (const [rid, meta] of riderUserIdByRiderId.entries()) {
    const nn = meta.user_id ? nicknameByUserId.get(meta.user_id) : undefined;
    riderNameByRiderId.set(rid, nn ?? rid.slice(0, 8));
  }

  // apply patch to each row
  for (const r of allRows) {
    const oid = getOrderId(r);
    if (!oid) continue;
    const ev = eventByOrder.get(oid);
    setIfMissing(r, "event_id", ev?.id ?? null);
    setIfMissing(r, "event_status", ev?.event_status ?? null);
    setIfMissing(r, "escalation_count", ev?.escalation_count ?? 0);
    setIfMissing(r, "repeat_fire_count", ev?.repeat_fire_count ?? 0);
    setIfMissing(r, "assigned_admin_id", ev?.assigned_admin_id ?? null);

    const st = settlementByOrder.get(oid);
    setIfMissing(r, "settlement_id", st?.id ?? null);
    setIfMissing(r, "settlement_status", st?.settlement_status ?? null);

    const del = deliveryByOrder.get(oid);
    setIfMissing(r, "rider_id", del?.rider_id ?? null);
    setIfMissing(r, "delivery_status", del?.delivery_status ?? null);
    setIfMissing(r, "assigned_at", del?.assigned_at ?? null);
    setIfMissing(r, "picked_up_at", del?.picked_up_at ?? null);
    setIfMissing(r, "delivered_at", del?.delivered_at ?? null);
    setIfMissing(r, "updated_at", del?.updated_at ?? null);

    const o = orderById.get(oid);
    setIfMissing(r, "order_no", o?.order_no ?? null);
    setIfMissing(r, "order_status", o?.order_status ?? null);
    setIfMissing(r, "needs_admin_attention", o?.needs_admin_attention ?? false);
    setIfMissing(r, "sla_warning_level", o?.sla_warning_level ?? null);
    setIfMissing(r, "sla_warning_reason", o?.sla_warning_reason ?? null);

    const storeId = o?.store_id ?? del?.store_id ?? null;
    setIfMissing(r, "store_id", storeId ?? null);
    const stRow = storeId ? storeById.get(storeId) : undefined;
    setIfMissing(r, "store_name", stRow?.store_name ?? null);
    setIfMissing(r, "region", stRow?.region ?? null);
    setIfMissing(r, "city", stRow?.city ?? null);

    const rid = del?.rider_id ?? null;
    setIfMissing(r, "rider_name", rid ? riderNameByRiderId.get(rid) ?? rid.slice(0, 8) : null);
    // "delivery_id"는 현재 모델상 order_id = delivery PK (store_order_deliveries.order_id)
    setIfMissing(r, "delivery_id", oid);
  }

  return { ...deliveryOps, queues: outQueues };
}

export async function GET(req: NextRequest) {
  const dvReqStart = dvNow();
  dvDeliveryLatencyLog("request_start_ms", { route: "GET /api/admin/ops-console/summary" });
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 503 });
  }
  const sbAny = sb as any;

  const sp = req.nextUrl.searchParams;
  const daysRaw = Number(sp.get("days") ?? "7");
  const days = Number.isFinite(daysRaw) ? Math.min(30, Math.max(1, Math.floor(daysRaw))) : 7;

  const { todayStart, todayEndEx } = todayBoundsLocal();
  const rangeStart = new Date(todayStart);
  rangeStart.setDate(rangeStart.getDate() - (days - 1));

  // 1) Delivery ops dashboard + health (single roundtrip each)
  const [dashRes, healthRes] = await Promise.all([
    sbAny.rpc("admin_delivery_operations_dashboard", {
      p_today_start: todayStart.toISOString(),
      p_today_end_ex: todayEndEx.toISOString(),
      p_range_start: rangeStart.toISOString(),
      p_range_end_ex: todayEndEx.toISOString(),
    }),
    sbAny.rpc("admin_delivery_operations_health"),
  ]);
  dvDeliveryLatencyMeasure("db_query_done_ms", dvReqStart, undefined, {
    route: "GET /api/admin/ops-console/summary",
    step: "rpc_dashboard_health",
  });

  const dashErr = dashRes.error as { message?: string } | null;
  if (dashErr) {
    const msg = String(dashErr.message ?? "");
    if (/function .* does not exist|Could not find the function/i.test(msg)) {
      return NextResponse.json(
        { ok: false, error: "rpc_missing_admin_delivery_operations_dashboard", hint: "Apply migration admin_delivery_operations_dashboard" },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: false, error: "rpc_failed_dashboard", message: msg.slice(0, 240) }, { status: 500 });
  }

  let healthPatch: Record<string, unknown> = {};
  const he = healthRes.error as { message?: string } | null;
  if (!he && healthRes.data != null) {
    healthPatch = { health: healthRes.data };
  } else if (he) {
    const hm = String(he.message ?? "");
    if (/function .* does not exist|Could not find the function/i.test(hm)) {
      healthPatch = {
        health: null,
        health_rpc_missing: true,
        health_rpc_hint: "Apply migration 20260516120000_delivery_operations_recovery_center",
      };
    } else {
      healthPatch = {
        health: null,
        health_rpc_error: hm.slice(0, 200),
      };
    }
  } else {
    healthPatch = { health: null };
  }

  const deliveryOps =
    dashRes.data != null && typeof dashRes.data === "object"
      ? { ...(dashRes.data as Record<string, unknown>), ...healthPatch, query: { days } }
      : { ...healthPatch, query: { days } };

  // 1.5) Ops 콘솔 액션용 ID 보강 (event_id/settlement_id/rider_id/store_id 등)
  const deliveryOpsAugmented = await augmentQueuesWithIds(sbAny, deliveryOps);
  dvDeliveryLatencyMeasure("db_query_done_ms", dvReqStart, undefined, {
    route: "GET /api/admin/ops-console/summary",
    step: "augment_queues",
  });

  // 2) Auto actions counts (fast KPI)
  const [{ count: failedAutoActions }, { count: pendingApprovals }] = await Promise.all([
    sbAny
      .from("delivery_operation_alert_actions")
      .select("id", { head: true, count: "exact" })
      .eq("action_status", "failed"),
    sbAny
      .from("delivery_operation_alert_actions")
      .select("id", { head: true, count: "exact" })
      .eq("action_status", "pending_approval"),
  ]);
  dvDeliveryLatencyMeasure("db_query_done_ms", dvReqStart, undefined, {
    route: "GET /api/admin/ops-console/summary",
    step: "kpi_auto_actions_counts",
  });

  // 3) Runtime health (capabilities detect + settings)
  const capRes = await sbAny.rpc("detect_platform_runtime_capabilities", { p_force: false });
  const capabilities = (capRes.data ?? null) as CapabilitiesRow | null;
  dvDeliveryLatencyMeasure("db_query_done_ms", dvReqStart, undefined, {
    route: "GET /api/admin/ops-console/summary",
    step: "rpc_detect_capabilities",
  });

  const setRes = await sbAny
    .from("platform_runtime_settings")
    .select(
      "singleton, enable_pg_cron, enable_realtime_optimization, enable_auto_actions, enable_alert_runner, enable_recovery_runner, enable_delivery_realtime_filtering, updated_at"
    )
    .eq("singleton", 1)
    .maybeSingle();
  dvDeliveryLatencyMeasure("db_query_done_ms", dvReqStart, undefined, {
    route: "GET /api/admin/ops-console/summary",
    step: "load_runtime_settings",
  });

  const settings =
    (setRes.data as RuntimeSettingsRow | null) ?? ({
      singleton: 1,
      enable_pg_cron: true,
      enable_realtime_optimization: true,
      enable_auto_actions: false,
      enable_alert_runner: true,
      enable_recovery_runner: true,
      enable_delivery_realtime_filtering: true,
    } satisfies RuntimeSettingsRow);

  const runtime = computeEffectiveRuntime(capabilities, settings);

  return NextResponse.json({
    ok: true,
    viewer_admin_id: admin.userId,
    generated_at: new Date().toISOString(),
    deliveryOps: deliveryOpsAugmented,
    kpi: {
      failed_auto_actions: Number.isFinite(failedAutoActions) ? failedAutoActions : 0,
      pending_approvals: Number.isFinite(pendingApprovals) ? pendingApprovals : 0,
    },
    runtime: {
      capabilities,
      settings,
      effective: runtime.effective,
      warnings: runtime.warnings,
    },
  });
}

