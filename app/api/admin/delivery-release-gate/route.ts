import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GateStatus = "pass" | "warn" | "fail" | "needs_check";

type GateItem = {
  key: string;
  status: GateStatus;
  title: string;
  description: string;
  howTo: string;
  links: { label: string; href: string }[];
  checked_at?: string | null;
};

type ManualRow = {
  key: string;
  label: string;
  checked: boolean;
  checked_at: string | null;
  checked_by: string | null;
  note: string | null;
  updated_at: string | null;
};

function statusRank(s: GateStatus): number {
  // worse is larger
  if (s === "fail") return 3;
  if (s === "warn") return 2;
  if (s === "needs_check") return 1;
  return 0;
}

function overallFrom(items: GateItem[]): "READY" | "WARNING" | "BLOCKED" {
  const worst = Math.max(0, ...items.map((x) => statusRank(x.status)));
  if (worst >= 3) return "BLOCKED";
  if (worst >= 2) return "WARNING";
  return "READY";
}

function nowIso() {
  return new Date().toISOString();
}

async function tryCount(sbAny: any, query: any): Promise<number | null> {
  try {
    const { count, error } = await query;
    if (error) return null;
    return typeof count === "number" && Number.isFinite(count) ? count : 0;
  } catch {
    return null;
  }
}

async function loadManual(sbAny: any): Promise<ManualRow[] | null> {
  const { data, error } = await sbAny
    .from("delivery_release_gate_manual_checks")
    .select("key, label, checked, checked_at, checked_by, note, updated_at")
    .order("key", { ascending: true });
  if (error) {
    const msg = String(error.message ?? "");
    if (/does not exist|schema cache/i.test(msg)) return null;
    return null;
  }
  return (data ?? []) as ManualRow[];
}

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 503 });
  }
  const sbAny = sb as any;

  // ─── Auto checks (best-effort, no full scan) ──────────────────────────────
  const items: GateItem[] = [];

  // 1) PG version + capability/runtime (from existing RPC/table)
  let pgVersionNum: number | null = null;
  let supportsPgCron = false;
  let supportsPubCols = false;
  let capsCheckedAt: string | null = null;

  const capRes = await sbAny.rpc("detect_platform_runtime_capabilities", { p_force: false });
  if (!capRes.error && capRes.data) {
    const c = capRes.data as Record<string, unknown>;
    pgVersionNum = typeof c.pg_version_num === "number" ? c.pg_version_num : Number(c.pg_version_num ?? NaN);
    supportsPgCron = c.supports_pg_cron === true;
    supportsPubCols = c.supports_publication_column_filter === true;
    capsCheckedAt = typeof c.checked_at === "string" ? c.checked_at : null;
  }

  items.push({
    key: "pg_version",
    status: pgVersionNum ? "pass" : "warn",
    title: "PG version 확인",
    description: pgVersionNum ? `server_version_num=${pgVersionNum}` : "capability 감지 결과가 없습니다.",
    howTo: "runtime-health에서 PG version 표시 확인",
    links: [
      { label: "Runtime Health", href: "/admin/runtime-health" },
      { label: "Ops Console", href: "/admin/ops-console" },
    ],
    checked_at: capsCheckedAt,
  });

  items.push({
    key: "pg_cron_status",
    status: supportsPgCron ? "pass" : "warn",
    title: "pg_cron extension",
    description: supportsPgCron ? "pg_cron detected" : "pg_cron 미지원 또는 미설치(운영 잡은 fallback 필요)",
    howTo: "Supabase DB extensions에서 pg_cron 설치 여부 확인",
    links: [{ label: "Delivery Operations", href: "/admin/delivery-operations" }],
    checked_at: capsCheckedAt,
  });

  items.push({
    key: "publication_column_filter_support",
    status: supportsPubCols ? "pass" : "warn",
    title: "publication 컬럼 필터 지원(PG15+)",
    description: supportsPubCols ? "supported" : "미지원: Realtime payload 최소화 하드닝 제한",
    howTo: "PG15+ 여부 확인",
    links: [{ label: "Runtime Health", href: "/admin/runtime-health" }],
    checked_at: capsCheckedAt,
  });

  // 2) delivery-proofs private
  {
    const { data, error } = await sbAny.from("storage.buckets").select("id, public, updated_at").eq("id", "delivery-proofs").maybeSingle();
    if (error) {
      items.push({
        key: "delivery_proofs_bucket_private",
        status: "warn",
        title: "delivery-proofs bucket private",
        description: `bucket 조회 실패: ${String(error.message ?? "").slice(0, 120)}`,
        howTo: "Supabase Storage buckets에서 delivery-proofs의 public=false 확인",
        links: [{ label: "POD Admin(주문)", href: "/admin/delivery-orders" }],
      });
    } else {
      const isPublic = data?.public === true;
      items.push({
        key: "delivery_proofs_bucket_private",
        status: isPublic ? "fail" : "pass",
        title: "delivery-proofs bucket private",
        description: isPublic ? "public=true (BLOCKED)" : "public=false",
        howTo: "migrations 적용(20260520120000) 또는 storage.buckets 업데이트",
        links: [{ label: "Ops Console", href: "/admin/ops-console" }],
        checked_at: typeof data?.updated_at === "string" ? data.updated_at : null,
      });
    }
  }

  // 3) Required RPC existence (lightweight): rely on endpoints’ 503 hints via minimal function calls
  {
    const { data, error } = await sbAny.rpc("admin_delivery_operations_health");
    items.push({
      key: "rpc_admin_delivery_operations_health",
      status: error ? "fail" : "pass",
      title: "RPC: admin_delivery_operations_health",
      description: error ? String(error.message ?? "").slice(0, 160) : "ok",
      howTo: "migration 20260516120000_delivery_operations_recovery_center 적용",
      links: [{ label: "Delivery Operations", href: "/admin/delivery-operations" }],
    });
  }

  // 4) Auto actions kill switch status (existing table)
  {
    const { data, error } = await sbAny
      .from("delivery_auto_actions_runtime_settings")
      .select("delivery_auto_actions_enabled, updated_at")
      .eq("singleton", 1)
      .maybeSingle();

    if (error) {
      items.push({
        key: "auto_actions_kill_switch",
        status: "warn",
        title: "자동 액션 kill switch",
        description: `설정 조회 실패: ${String(error.message ?? "").slice(0, 140)}`,
        howTo: "delivery_auto_actions_runtime_settings 마이그레이션 적용 후 /admin/delivery-auto-actions 에서 확인",
        links: [{ label: "Auto Actions", href: "/admin/delivery-auto-actions" }],
      });
    } else {
      const enabled = data?.delivery_auto_actions_enabled === true;
      items.push({
        key: "auto_actions_kill_switch",
        status: enabled ? "pass" : "warn",
        title: "자동 액션 kill switch",
        description: enabled ? "enabled" : "disabled (운영 의도면 ok, 미의도면 WARNING)",
        howTo: "/admin/delivery-auto-actions 설정에서 ON/OFF 확인",
        links: [{ label: "Auto Actions", href: "/admin/delivery-auto-actions" }],
        checked_at: typeof data?.updated_at === "string" ? data.updated_at : null,
      });
    }
  }

  // 5) Backlogs (counts only)
  {
    const failed = await tryCount(
      sbAny,
      sbAny.from("delivery_operation_alert_actions").select("id", { head: true, count: "exact" }).eq("action_status", "failed")
    );
    const pending = await tryCount(
      sbAny,
      sbAny
        .from("delivery_operation_alert_actions")
        .select("id", { head: true, count: "exact" })
        .eq("action_status", "pending_approval")
    );
    items.push({
      key: "auto_action_backlog",
      status: failed != null && failed > 0 ? "warn" : "pass",
      title: "자동 액션 backlog",
      description:
        failed == null || pending == null ? "count 실패(권한/스키마 확인 필요)" : `failed=${failed}, pending_approval=${pending}`,
      howTo: "Auto Actions 페이지에서 실패/승인대기 처리",
      links: [{ label: "Auto Actions", href: "/admin/delivery-auto-actions" }],
    });
  }

  {
    const unresolved = await tryCount(
      sbAny,
      sbAny
        .from("delivery_operation_alert_events")
        .select("id", { head: true, count: "exact" })
        .in("event_status", ["open", "acknowledged"])
    );
    items.push({
      key: "unresolved_alerts",
      status: unresolved != null && unresolved > 0 ? "warn" : "pass",
      title: "미해결 운영 알림(open/ack)",
      description: unresolved == null ? "count 실패" : `unresolved=${unresolved}`,
      howTo: "Delivery Alerts에서 ack/resolve 처리",
      links: [{ label: "Delivery Alerts", href: "/admin/delivery-alerts" }],
    });
  }

  // 6) Realtime proof-media exclusion cannot be fully auto-verified from app without WS capture.
  // We mark it as needs_check and rely on manual checks below.
  items.push({
    key: "ws_payload_no_proof_media",
    status: "needs_check",
    title: "WS payload 증빙 미노출",
    description: "구매자/오너 세션에서 store_order_deliveries WS payload에 proof path/url 키가 없는지 확인 필요",
    howTo: "브라우저 DevTools → WS → postgres_changes payload에서 proof 4필드 검색",
    links: [{ label: "Ops Console", href: "/admin/ops-console" }],
  });

  // ─── Manual checks ─────────────────────────────────────────────────────────
  const manual = await loadManual(sbAny);
  const manualItems: GateItem[] =
    manual?.map((m) => ({
      key: `manual:${m.key}`,
      status: m.checked ? "pass" : "needs_check",
      title: m.label,
      description: m.note ? `note: ${m.note}` : "수동 확인 필요",
      howTo: "체크박스 후 저장",
      links: [{ label: "Ops Console", href: "/admin/ops-console" }],
      checked_at: m.checked_at,
    })) ?? [];

  const all = [...items, ...manualItems];

  return NextResponse.json({
    ok: true,
    generated_at: nowIso(),
    gate: {
      overall: overallFrom(all),
      items,
      manual: manual ?? [],
    },
  });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let body: {
    key?: string;
    checked?: boolean;
    note?: string | null;
  };
  try {
    body = (await req.json()) as any;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const key = String(body.key ?? "").trim();
  if (!key) return NextResponse.json({ ok: false, error: "missing_key" }, { status: 400 });
  if (typeof body.checked !== "boolean") return NextResponse.json({ ok: false, error: "checked_required" }, { status: 400 });

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 503 });
  }
  const sbAny = sb as any;

  const noteRaw = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";
  const patch: Record<string, unknown> = {
    checked: body.checked,
    checked_at: body.checked ? nowIso() : null,
    checked_by: body.checked ? admin.userId : null,
    note: noteRaw ? noteRaw : null,
  };

  const { data, error } = await sbAny
    .from("delivery_release_gate_manual_checks")
    .update(patch)
    .eq("key", key)
    .select("key, label, checked, checked_at, checked_by, note, updated_at")
    .maybeSingle();

  if (error) {
    const msg = String(error.message ?? "");
    if (/does not exist|schema cache/i.test(msg)) {
      return NextResponse.json(
        { ok: false, error: "schema_missing_manual_checks", hint: "Apply migration delivery_release_gate_manual_checks" },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: false, error: msg.slice(0, 180) }, { status: 500 });
  }
  if (!data) return NextResponse.json({ ok: false, error: "row_missing" }, { status: 404 });

  return NextResponse.json({ ok: true, row: data });
}

