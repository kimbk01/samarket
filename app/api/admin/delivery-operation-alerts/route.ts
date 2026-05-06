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

function todayStartISO(now = new Date()): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * GET: 룰 + 이벤트 + 요약 + 배정 필터.
 */
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
  const limitRaw = Number(sp.get("events_limit") ?? "120");
  const limit = Number.isFinite(limitRaw) ? Math.min(300, Math.max(10, Math.floor(limitRaw))) : 120;
  const statusFilter = sp.get("event_status")?.trim() ?? "open";
  const assignmentFilter = sp.get("assignment")?.trim() ?? "all";
  const uid = admin.userId;
  const sbAny = sb as any;
  const todayIso = todayStartISO();

  const rulesSelect = sbAny
    .from("delivery_operation_alert_rules")
    .select(
      "id, rule_key, rule_name, target_type, threshold_minutes, warning_level, repeat_minutes, is_active, escalation_level, escalate_after_minutes, max_escalation_level, notify_admin, auto_action_enabled, auto_action_type, auto_action_delay_minutes, auto_action_min_escalation_count, auto_action_requires_approval, updated_at"
    )
    .order("rule_key", { ascending: true });

  let evQ = sbAny
    .from("delivery_operation_alert_events")
    .select(
      [
        "id",
        "rule_id",
        "order_id",
        "store_id",
        "severity",
        "event_status",
        "first_triggered_at",
        "last_triggered_at",
        "acknowledged_at",
        "resolved_at",
        "assigned_admin_id",
        "assigned_at",
        "assignment_note",
        "escalation_count",
        "escalated_at",
        "handling_note",
        "acknowledge_note",
        "resolve_note",
        "mute_note",
        "repeat_fire_count",
      ].join(", ")
    )
    .order("last_triggered_at", { ascending: false })
    .limit(limit);

  if (statusFilter === "open") {
    evQ = evQ.in("event_status", ["open", "acknowledged", "muted"]);
  } else if (statusFilter !== "all") {
    evQ = evQ.eq("event_status", statusFilter);
  }

  if (assignmentFilter === "mine") {
    evQ = evQ.eq("assigned_admin_id", uid);
  } else if (assignmentFilter === "unassigned") {
    evQ = evQ.is("assigned_admin_id", null);
  }

  const summaryQueries = Promise.all([
    sbAny
      .from("delivery_operation_alert_events")
      .select("id", { count: "exact", head: true })
      .eq("assigned_admin_id", uid)
      .in("event_status", ["open", "acknowledged"]),
    sbAny
      .from("delivery_operation_alert_events")
      .select("id", { count: "exact", head: true })
      .is("assigned_admin_id", null)
      .in("event_status", ["open", "acknowledged"]),
    sbAny
      .from("delivery_operation_alert_events")
      .select("id", { count: "exact", head: true })
      .gt("escalation_count", 0)
      .in("event_status", ["open", "acknowledged", "muted"]),
    sbAny
      .from("delivery_operation_alert_events")
      .select("id", { count: "exact", head: true })
      .eq("resolved_by", uid)
      .eq("event_status", "resolved")
      .gte("resolved_at", todayIso),
    sbAny
      .from("delivery_operation_alert_events")
      .select("first_triggered_at, resolved_at")
      .eq("resolved_by", uid)
      .eq("event_status", "resolved")
      .gte("resolved_at", todayIso)
      .limit(400),
  ]);

  const [rulesRes, eventsRes, summaryRes] = await Promise.all([rulesSelect, evQ, summaryQueries]);

  if (rulesRes.error) {
    return NextResponse.json(
      { error: "rules_fetch_failed", message: String(rulesRes.error.message ?? "").slice(0, 200) },
      { status: 500 }
    );
  }
  if (eventsRes.error) {
    const msg = String(eventsRes.error.message ?? "");
    if (/delivery_operation_alert_events|does not exist|column/i.test(msg)) {
      return NextResponse.json(
        { error: "schema_missing", hint: "Apply migration delivery_alert_assignment_escalation" },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "events_fetch_failed", message: msg.slice(0, 200) }, { status: 500 });
  }

  const rules = (rulesRes.data ?? []) as Record<string, unknown>[];
  const ruleById = new Map<string, Record<string, unknown>>();
  for (const r of rules) {
    const id = String(r.id ?? "");
    if (id) ruleById.set(id, r);
  }

  const eventsRaw = (eventsRes.data ?? []) as Record<string, unknown>[];
  const storeIds = dedupeStrings(eventsRaw.map((e) => e.store_id));
  const orderIds = dedupeStrings(eventsRaw.map((e) => e.order_id));
  const adminIds = dedupeStrings(eventsRaw.map((e) => e.assigned_admin_id));

  const [storesRes, ordersRes, profilesRes] = await Promise.all([
    storeIds.length
      ? sbAny.from("stores").select("id, store_name").in("id", storeIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    orderIds.length
      ? sbAny.from("store_orders").select("id, order_no").in("id", orderIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    adminIds.length
      ? sbAny.from("profiles").select("id, nickname, username").in("id", adminIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const storeNameById = new Map<string, string>();
  for (const row of (storesRes.data ?? []) as { id?: string; store_name?: string | null }[]) {
    const id = String(row.id ?? "");
    if (id) storeNameById.set(id, String(row.store_name ?? ""));
  }
  const orderNoById = new Map<string, string>();
  for (const row of (ordersRes.data ?? []) as { id?: string; order_no?: string | null }[]) {
    const id = String(row.id ?? "");
    if (id) orderNoById.set(id, String(row.order_no ?? ""));
  }
  const adminLabelById = new Map<string, string>();
  for (const row of (profilesRes.data ?? []) as {
    id?: string;
    nickname?: string | null;
    username?: string | null;
  }[]) {
    const id = String(row.id ?? "");
    if (!id) continue;
    const label = String(row.nickname ?? row.username ?? id).trim().slice(0, 40) || id.slice(0, 8);
    adminLabelById.set(id, label);
  }

  const events = eventsRaw.map((e) => {
    const rid = String(e.rule_id ?? "");
    const oid = String(e.order_id ?? "");
    const sid = String(e.store_id ?? "");
    const aid = String(e.assigned_admin_id ?? "");
    return {
      ...e,
      rule: ruleById.get(rid) ?? null,
      store_name: sid ? storeNameById.get(sid) ?? "" : "",
      order_no: oid ? orderNoById.get(oid) ?? "" : "",
      assigned_label: aid ? adminLabelById.get(aid) ?? aid.slice(0, 8) : "",
    };
  });

  const [mineOpenRes, unassignedOpenRes, escalatedRes, todayResolvedRes, avgRowsRes] = summaryRes;
  const mine_open = mineOpenRes.count ?? 0;
  const unassigned_open = unassignedOpenRes.count ?? 0;
  const escalated_active = escalatedRes.count ?? 0;
  const today_resolved_mine = todayResolvedRes.count ?? 0;

  const avgRows = (avgRowsRes.data ?? []) as { first_triggered_at?: string; resolved_at?: string }[];
  let avg_handle_minutes: number | null = null;
  if (avgRows.length > 0) {
    let sumMin = 0;
    let n = 0;
    for (const row of avgRows) {
      const a = Date.parse(String(row.first_triggered_at ?? ""));
      const b = Date.parse(String(row.resolved_at ?? ""));
      if (Number.isFinite(a) && Number.isFinite(b) && b >= a) {
        sumMin += (b - a) / 60000;
        n += 1;
      }
    }
    avg_handle_minutes = n > 0 ? Math.round(sumMin / n) : null;
  }

  return NextResponse.json({
    rules,
    events,
    summary: {
      mine_open,
      unassigned_open,
      escalated_active,
      today_resolved_mine,
      avg_handle_minutes_today_mine: avg_handle_minutes,
    },
    query: { events_limit: limit, event_status: statusFilter, assignment: assignmentFilter },
  });
}
