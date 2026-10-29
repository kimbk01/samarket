import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { internalErrorResponse } from "@/lib/security/internal-error-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ error: "server_config" }, { status: 500 });
  }

  const { data, error } = await (sb as any)
    .from("delivery_auto_actions_runtime_settings")
    .select("singleton, delivery_auto_actions_enabled, updated_at")
    .eq("singleton", 1)
    .maybeSingle();

  if (error) {
    const msg = String(error.message ?? "");
    if (/does not exist|schema cache/i.test(msg)) {
      return NextResponse.json({ error: "schema_missing", hint: "Apply migration delivery_auto_actions_safety" }, { status: 503 });
    }
    return internalErrorResponse("load_failed", "[/api/admin/delivery-auto-actions/settings GET]", msg, 500);
  }

  return NextResponse.json({
    settings: data ?? { singleton: 1, delivery_auto_actions_enabled: false },
  });
}

/**
 * 자동 조치 ON/OFF — **권위 스위치** (DEF-42).
 * 크론 러너 `run_delivery_operation_alert_auto_actions()` 와 승인/재실행 RPC 가 읽는 테이블은
 * `delivery_auto_actions_runtime_settings` 뿐이다. 런타임 상태 화면의
 * `platform_runtime_settings.enable_auto_actions` 는 어떤 러너도 읽지 않으므로 권위가 아니다.
 * L1 확인 + CAS(`expected_enabled`) + 감사 기록.
 */
export async function PATCH(req: Request) {
  const admin = await requireAdminPermission("business");
  if (!admin.ok) return admin.response;

  let body: { delivery_auto_actions_enabled?: boolean; expected_enabled?: boolean };
  try {
    body = (await req.json()) as { delivery_auto_actions_enabled?: boolean; expected_enabled?: boolean };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.delivery_auto_actions_enabled !== "boolean") {
    return NextResponse.json({ error: "delivery_auto_actions_enabled_required" }, { status: 400 });
  }
  if (typeof body.expected_enabled !== "boolean") {
    return NextResponse.json({ error: "expected_status_required" }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ error: "server_config" }, { status: 500 });
  }

  const { data, error } = await (sb as any)
    .from("delivery_auto_actions_runtime_settings")
    .update({ delivery_auto_actions_enabled: body.delivery_auto_actions_enabled })
    .eq("singleton", 1)
    .eq("delivery_auto_actions_enabled", body.expected_enabled)
    .select("singleton, delivery_auto_actions_enabled, updated_at")
    .maybeSingle();

  if (error) {
    const msg = String(error.message ?? "");
    if (/does not exist|schema cache/i.test(msg)) {
      return NextResponse.json({ error: "schema_missing" }, { status: 503 });
    }
    return internalErrorResponse("save_failed", "[/api/admin/delivery-auto-actions/settings PATCH]", msg, 500);
  }

  if (!data) {
    // CAS 실패 — 다른 관리자가 먼저 바꿨다 (행이 있으면 status_changed)
    return NextResponse.json({ error: "status_changed" }, { status: 409 });
  }

  await appendAdminRouteAudit(admin.sb, req, {
    actorId: admin.actor.userId,
    targetType: "delivery_auto_actions_runtime_settings",
    targetId: "1",
    action: "delivery_auto_actions.settings",
    before: { delivery_auto_actions_enabled: body.expected_enabled },
    after: data as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true, settings: data });
}
