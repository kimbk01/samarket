import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission, requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { insertModerationEvent, invalidateAllUserSessions, isSuperAdminRole } from "@/lib/admin/admin-user-server";
import { normalizeAdminRole } from "@/lib/auth/admin-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DELETED_NICKNAME = "탈퇴회원";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const userId = id?.trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let body: { mode?: string; reason?: string; confirmNickname?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const mode = String(body.mode ?? "").trim().toLowerCase();
  const reason = String(body.reason ?? "").trim();
  if (mode !== "soft" && mode !== "hard") {
    return NextResponse.json({ ok: false, error: "invalid_mode" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  }

  const gate =
    mode === "hard"
      ? await requireSuperAdmin()
      : await requireAdminPermission("users");
  if (!gate.ok) return gate.response;

  const { sb, actor } = gate;

  const { data: targetProfile, error: profileErr } = await sb
    .from("profiles")
    .select("id, role, status, deleted_at, nickname")
    .eq("id", userId)
    .maybeSingle();
  if (profileErr) {
    return NextResponse.json({ ok: false, error: profileErr.message }, { status: 500 });
  }
  if (!targetProfile) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const targetRole = normalizeAdminRole((targetProfile as { role?: string }).role);
  if (isSuperAdminRole(targetRole)) {
    return NextResponse.json({ ok: false, error: "forbidden_super_admin_target" }, { status: 403 });
  }
  if (targetRole === "admin" && !actor.isSuperAdmin) {
    return NextResponse.json({ ok: false, error: "forbidden_admin_target" }, { status: 403 });
  }

  const nickname = String((targetProfile as { nickname?: string }).nickname ?? "").trim();
  const confirmNickname = String(body.confirmNickname ?? "").trim();
  if (confirmNickname && confirmNickname !== nickname) {
    return NextResponse.json({ ok: false, error: "confirm_nickname_mismatch" }, { status: 400 });
  }

  const fromStatus = String((targetProfile as { status?: string }).status ?? "");
  const now = new Date().toISOString();
  const action = mode === "hard" ? "hard_delete" : "soft_delete";

  const softPatch = {
    status: "deleted",
    deleted_at: now,
    deletion_requested_at: now,
  };

  const hardPatch = {
    ...softPatch,
    nickname: DELETED_NICKNAME,
    display_name: DELETED_NICKNAME,
    email: null,
    auth_login_email: null,
    phone: null,
    phone_number: null,
    phone_country_code: null,
    phone_verified: false,
    phone_verified_at: null,
    avatar_url: null,
    active_session_id: null,
  };

  const { error: updateErr } = await sb
    .from("profiles")
    .update(mode === "hard" ? hardPatch : softPatch)
    .eq("id", userId);
  if (updateErr) {
    return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
  }

  await insertModerationEvent(sb, {
    userId,
    actorId: actor.userId,
    action,
    fromStatus,
    toStatus: "deleted",
    reason,
  });

  await invalidateAllUserSessions(sb, userId, `account_${mode}_delete`);

  try {
    await sb.auth.admin.updateUserById(userId, { ban_duration: "876000h" } as never);
  } catch {
    /* best-effort */
  }

  await sb
    .from("account_deletion_requests")
    .update({
      status: "completed",
      processed_at: now,
      processed_by: actor.userId,
      admin_note: reason.slice(0, 2000),
      updated_at: now,
    })
    .eq("user_id", userId)
    .in("status", ["requested", "processing"]);

  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actor.userId,
    target_type: "user",
    target_id: userId,
    action: `user_${mode}_delete`,
    before_json: { status: fromStatus, nickname },
    after_json: { status: "deleted", mode },
  });

  return NextResponse.json({ ok: true, mode });
}
