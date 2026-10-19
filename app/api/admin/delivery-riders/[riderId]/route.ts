import { NextResponse } from "next/server";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_STATUSES = new Set(["ok", "flagged", "paused"]);

export async function PATCH(req: Request, context: { params: Promise<{ riderId: string }> }) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const admin = { userId: gate.actor.userId };

  const { riderId } = await context.params;
  const rid = typeof riderId === "string" ? riderId.trim() : "";
  if (!rid) return NextResponse.json({ ok: false, error: "missing_rider_id" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (body.suspend === true && body.resume === true) {
    return NextResponse.json({ ok: false, error: "suspend_resume_conflict" }, { status: 400 });
  }
  // 정지 = L2 (사유 필수 — 작업 기록에 남김)
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 600) : "";
  if (body.suspend === true && reason.length < 2) {
    return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const { data: before, error: lErr } = await sb
    .from("delivery_riders")
    .select(
      "id, user_id, rider_status, is_online, admin_status, admin_note, suspended_at, suspended_by, last_active_at, current_lat, current_lng, updated_at"
    )
    .eq("id", rid)
    .maybeSingle();

  if (lErr || !before) {
    return NextResponse.json({ ok: false, error: "rider_not_found" }, { status: 404 });
  }

  const row: Record<string, unknown> = {};

  if (typeof body.is_online === "boolean") {
    row.is_online = body.is_online;
  }

  if (body.admin_status !== undefined) {
    const st = typeof body.admin_status === "string" ? body.admin_status.trim() : "";
    if (!ADMIN_STATUSES.has(st)) {
      return NextResponse.json({ ok: false, error: "invalid_admin_status" }, { status: 400 });
    }
    row.admin_status = st;
  }

  if (body.admin_note !== undefined) {
    const n = typeof body.admin_note === "string" ? body.admin_note.trim() : "";
    row.admin_note = n.length ? n.slice(0, 4000) : null;
  }

  if (body.suspend === true) {
    row.suspended_at = new Date().toISOString();
    row.suspended_by = admin.userId;
    row.is_online = false;
    row.admin_status = "paused";
  }

  if (body.resume === true) {
    row.suspended_at = null;
    row.suspended_by = null;
    if (body.admin_status === undefined && typeof body.is_online !== "boolean") {
      row.admin_status = "ok";
    }
  }

  if (Object.keys(row).length === 0) {
    return NextResponse.json({ ok: false, error: "empty_patch" }, { status: 400 });
  }

  // CAS — 화면이 본 updated_at (있으면) + 정지/해제 상태 조건
  let q = sb.from("delivery_riders").update(row).eq("id", rid);
  const expectedUpdatedAt = typeof body.expected_updated_at === "string" ? body.expected_updated_at.trim() : "";
  if (expectedUpdatedAt) q = q.eq("updated_at", expectedUpdatedAt);
  if (body.suspend === true) q = q.is("suspended_at", null);
  if (body.resume === true) q = q.not("suspended_at", "is", null);
  // 메모 CAS — 화면이 불러온 메모 내용과 같을 때만 덮어쓴다 (동시 저장 시 409 → 재조회).
  if (body.admin_note !== undefined && "expected_admin_note" in body) {
    const exp = typeof body.expected_admin_note === "string" ? body.expected_admin_note.trim() : "";
    q = exp ? q.eq("admin_note", exp) : q.or("admin_note.is.null,admin_note.eq.");
  }
  const { data: updated, error: uErr } = await q
    .select(
      "id, user_id, rider_status, is_online, admin_status, admin_note, suspended_at, suspended_by, last_active_at, current_lat, current_lng, updated_at"
    )
    .maybeSingle();

  if (!uErr && !updated) {
    return NextResponse.json({ ok: false, error: "status_changed" }, { status: 409 });
  }
  if (uErr || !updated) {
    const msg = String(uErr?.message ?? "");
    if (/admin_status|suspended_at|admin_note/i.test(msg) && /does not exist/i.test(msg)) {
      return NextResponse.json({ ok: false, error: "schema_missing_apply_migration" }, { status: 503 });
    }
    console.error("[admin delivery-rider PATCH]", msg.slice(0, 240));
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }

  const rm = getAuditRequestMeta(req);
  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: admin.userId,
    target_type: "delivery_rider",
    target_id: rid,
    action: "delivery_rider.admin_patch",
    before_json: before as Record<string, unknown>,
    after_json: { ...row, ...(reason ? { reason } : {}) },
    ip: rm.ip,
    user_agent: rm.userAgent,
  });

  return NextResponse.json({ ok: true, rider: updated });
}
