import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dedupeStrings(ids: Iterable<unknown>): string[] {
  const s = new Set<string>();
  for (const x of ids) {
    const v = String(x ?? "").trim();
    if (v) s.add(v);
  }
  return [...s];
}

function enrichRpcActions(rows: unknown[]): Record<string, unknown>[] {
  const list = Array.isArray(rows) ? rows : [];
  return list.map((raw) => {
    const a = raw as Record<string, unknown>;
    const oid = a.order_id ? String(a.order_id) : "";
    const orderNo = String(a.order_no ?? "");
    return {
      ...a,
      order_no: orderNo,
      admin_order_url: oid ? `/admin/delivery-orders/${encodeURIComponent(oid)}` : "",
      admin_alerts_query: a.event_id ? `/admin/delivery-alerts` : "",
    };
  });
}

async function legacyList(
  sb: ReturnType<typeof getSupabaseServer>,
  limit: number,
  viewer: string
): Promise<NextResponse> {
  const sbAny = sb as any;

  const { data: rows, error } = await sbAny
    .from("delivery_operation_alert_actions")
    .select(
      [
        "id",
        "event_id",
        "action_type",
        "action_status",
        "executed_at",
        "executed_by_system",
        "result_message",
        "metadata",
        "retry_count",
        "max_retries",
        "approval_actor_id",
        "approval_note",
        "decided_at",
      ].join(", ")
    )
    .order("executed_at", { ascending: false })
    .limit(limit);

  if (error) {
    const msg = String(error.message ?? "");
    if (/does not exist|column|schema cache/i.test(msg)) {
      return NextResponse.json({ error: "schema_missing", hint: "Apply migration delivery_auto_actions_safety" }, { status: 503 });
    }
    return NextResponse.json({ error: msg.slice(0, 200) }, { status: 500 });
  }

  const actions = (rows ?? []) as Record<string, unknown>[];
  const eventIds = dedupeStrings(actions.map((a) => a.event_id));

  const eventsRes =
    eventIds.length > 0
      ? await sbAny
          .from("delivery_operation_alert_events")
          .select("id, order_id, rule_id, event_status")
          .in("id", eventIds)
      : { data: [] as Record<string, unknown>[] };

  if (eventsRes.error) {
    return NextResponse.json({ error: String(eventsRes.error.message ?? "").slice(0, 200) }, { status: 500 });
  }

  const evRows = (eventsRes.data ?? []) as Record<string, unknown>[];
  const evById = new Map<string, Record<string, unknown>>();
  for (const e of evRows) {
    const id = String(e.id ?? "");
    if (id) evById.set(id, e);
  }

  const ruleIds = dedupeStrings(evRows.map((e) => e.rule_id));
  const rulesRes =
    ruleIds.length > 0
      ? await sbAny.from("delivery_operation_alert_rules").select("id, rule_key, rule_name").in("id", ruleIds)
      : { data: [] as Record<string, unknown>[] };

  const ruleById = new Map<string, { rule_key?: string; rule_name?: string }>();
  for (const r of (rulesRes.data ?? []) as Record<string, unknown>[]) {
    const id = String(r.id ?? "");
    if (id) ruleById.set(id, { rule_key: String(r.rule_key ?? ""), rule_name: String(r.rule_name ?? "") });
  }

  const orderIds = dedupeStrings(evRows.map((e) => e.order_id));
  const ordersRes =
    orderIds.length > 0
      ? await sbAny.from("store_orders").select("id, order_no").in("id", orderIds)
      : { data: [] as Record<string, unknown>[] };

  const orderNoById = new Map<string, string>();
  for (const o of (ordersRes.data ?? []) as Record<string, unknown>[]) {
    const id = String(o.id ?? "");
    if (id) orderNoById.set(id, String(o.order_no ?? ""));
  }

  const enriched = actions.map((a) => {
    const eid = String(a.event_id ?? "");
    const ev = eid ? evById.get(eid) : undefined;
    const rid = ev ? String(ev.rule_id ?? "") : "";
    const oid = ev ? String(ev.order_id ?? "") : "";
    const ru = rid ? ruleById.get(rid) : undefined;
    return {
      ...a,
      order_id: oid || null,
      order_no: oid ? orderNoById.get(oid) ?? "" : "",
      event_status: ev ? String(ev.event_status ?? "") : "",
      rule_key: ru?.rule_key ?? "",
      rule_name: ru?.rule_name ?? "",
      admin_order_url: oid ? `/admin/delivery-orders/${encodeURIComponent(oid)}` : "",
      admin_alerts_query: eid ? `/admin/delivery-alerts` : "",
    };
  });

  return NextResponse.json({
    actions: enriched,
    dashboard: null,
    query: { limit, legacy: true },
    viewer,
    hint: "rpc_missing_apply_migration_20260515120000_delivery_auto_actions_report_rpc",
  });
}

export async function GET(req: Request) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ error: "server_config" }, { status: 500 });
  }

  const sp = new URL(req.url).searchParams;
  const limRaw = Number(sp.get("limit") ?? "100");
  const limit = Number.isFinite(limRaw) ? Math.min(200, Math.max(10, Math.floor(limRaw))) : 100;

  const statusRaw = sp.get("status")?.trim() ?? "";
  const p_status = !statusRaw || statusRaw === "all" ? null : statusRaw;

  const ruleRaw = sp.get("rule_id")?.trim() ?? "";
  const p_rule_id = ruleRaw || null;

  const p_dangerous_only =
    sp.get("dangerous_only") === "1" || sp.get("dangerous_only")?.toLowerCase() === "true";
  const p_retry_only = sp.get("retry_only") === "1" || sp.get("retry_only")?.toLowerCase() === "true";
  const p_today_only = sp.get("today_only") === "1" || sp.get("today_only")?.toLowerCase() === "true";

  const sbAny = sb as any;

  const { data: dashRaw, error: rpcErr } = await sbAny.rpc("admin_delivery_auto_actions_dashboard", {
    p_status,
    p_rule_id,
    p_dangerous_only,
    p_retry_only,
    p_today_only,
    p_limit: limit,
  });

  if (rpcErr) {
    const msg = String(rpcErr.message ?? "");
    if (/does not exist|function .* not found|schema cache/i.test(msg)) {
      return legacyList(sb, limit, admin.userId);
    }
    return NextResponse.json({ error: msg.slice(0, 240) }, { status: 500 });
  }

  const dashboard = dashRaw && typeof dashRaw === "object" ? (dashRaw as Record<string, unknown>) : null;
  const actionsRaw = dashboard?.actions;
  const actions = enrichRpcActions(actionsRaw as unknown[]);

  const mergedDash =
    dashboard != null
      ? {
          ...dashboard,
          actions,
        }
      : null;

  return NextResponse.json({
    actions,
    dashboard: mergedDash,
    query: {
      limit,
      status: p_status ?? "all",
      rule_id: p_rule_id,
      dangerous_only: p_dangerous_only,
      retry_only: p_retry_only,
      today_only: p_today_only,
    },
    viewer: admin.userId,
  });
}
