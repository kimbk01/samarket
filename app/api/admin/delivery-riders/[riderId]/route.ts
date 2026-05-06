import { NextResponse } from "next/server";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_STATUSES = new Set(["ok", "flagged", "paused"]);

export async function PATCH(req: Request, context: { params: Promise<{ riderId: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

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

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const { data: before, error: lErr } = await sb
    .from("delivery_riders")
    .select(
      "id, user_id, rider_status, is_online, admin_status, admin_note, suspended_at, suspended_by, last_active_at, current_lat, current_lng"
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

  const { data: updated, error: uErr } = await sb
    .from("delivery_riders")
    .update(row)
    .eq("id", rid)
    .select(
      "id, user_id, rider_status, is_online, admin_status, admin_note, suspended_at, suspended_by, last_active_at, current_lat, current_lng, updated_at"
    )
    .maybeSingle();

  if (uErr || !updated) {
    const msg = String(uErr?.message ?? "");
    if (/admin_status|suspended_at|admin_note/i.test(msg) && /does not exist/i.test(msg)) {
      return NextResponse.json({ ok: false, error: "schema_missing_apply_migration" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: msg.slice(0, 240) }, { status: 500 });
  }

  const rm = getAuditRequestMeta(req);
  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: admin.userId,
    target_type: "delivery_rider",
    target_id: rid,
    action: "delivery_rider.admin_patch",
    before_json: before as Record<string, unknown>,
    after_json: row,
    ip: rm.ip,
    user_agent: rm.userAgent,
  });

  return NextResponse.json({ ok: true, rider: updated });
}
