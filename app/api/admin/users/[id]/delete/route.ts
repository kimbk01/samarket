import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission, requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import {
  buildWithdrawProfilePatch,
  clearLegacyAuthBanForWithdraw,
  fetchAuthUserPurgeBlockers,
  moderationActionForDeleteMode,
  normalizeAdminUserDeleteMode,
  purgeAuthUserById,
  type AdminUserDeleteMode,
} from "@/lib/admin/admin-user-deletion";
import { isDeletedStoreMember } from "@/lib/auth/store-member-policy";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { insertModerationEvent, invalidateAllUserSessions, isSuperAdminRole } from "@/lib/admin/admin-user-server";
import { loadActiveAdminMembership } from "@/lib/admin/admin-membership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const mode = normalizeAdminUserDeleteMode(body.mode);
  const reason = String(body.reason ?? "").trim();
  if (!mode) {
    return NextResponse.json({ ok: false, error: "invalid_mode" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  }

  const gate =
    mode === "purge"
      ? await requireSuperAdmin()
      : await requireAdminPermission("users");
  if (!gate.ok) return gate.response;

  const { sb, actor } = gate;

  const { data: targetProfile, error: profileErr } = await sb
    .from("profiles")
    .select("id, status, deleted_at, nickname")
    .eq("id", userId)
    .maybeSingle();
  if (profileErr) {
    return NextResponse.json({ ok: false, error: profileErr.message }, { status: 500 });
  }
  if (!targetProfile) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const targetMembership = await loadActiveAdminMembership(sb, userId).catch(() => null);
  if (isSuperAdminRole(targetMembership?.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_super_admin_target" }, { status: 403 });
  }
  if (targetMembership?.role === "admin") {
    return NextResponse.json(
      { ok: false, error: "use_staff_api_for_admin_revoke" },
      { status: 409 }
    );
  }

  const nickname = String((targetProfile as { nickname?: string }).nickname ?? "").trim();
  const confirmNickname = String(body.confirmNickname ?? "").trim();
  if (mode === "purge") {
    if (!confirmNickname) {
      return NextResponse.json({ ok: false, error: "confirm_nickname_required" }, { status: 400 });
    }
    if (confirmNickname !== nickname) {
      return NextResponse.json({ ok: false, error: "confirm_nickname_mismatch" }, { status: 400 });
    }
  }

  const fromStatus = String((targetProfile as { status?: string }).status ?? "");
  const now = new Date().toISOString();
  const moderationAction = moderationActionForDeleteMode(mode);

  if (mode === "purge") {
    const blockers = await fetchAuthUserPurgeBlockers(sb, userId);
    if (!blockers.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "purge_blocked",
          blockers: blockers.blockers,
          message:
            blockers.blockers.length > 0
              ? `DB 영구 삭제를 막는 연결 데이터가 있습니다: ${blockers.blockers.join(", ")}`
              : "DB 영구 삭제 사전 검사에 실패했습니다.",
        },
        { status: 409 }
      );
    }
  }

  const alreadyWithdrawn = isDeletedStoreMember(targetProfile as { status?: string; deleted_at?: string | null });

  if (mode === "withdraw") {
    if (!alreadyWithdrawn) {
      const { error: updateErr } = await sb
        .from("profiles")
        .update(buildWithdrawProfilePatch(now))
        .eq("id", userId);
      if (updateErr) {
        return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
      }
    }
    await clearLegacyAuthBanForWithdraw(sb, userId);
  }

  try {
    await insertModerationEvent(sb, {
      userId,
      actorId: actor.userId,
      action: moderationAction,
      fromStatus,
      toStatus: mode === "purge" ? "purged" : "deleted",
      reason,
    });
  } catch (eventErr) {
    const message = eventErr instanceof Error ? eventErr.message : "moderation_event_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  await invalidateAllUserSessions(sb, userId, "account_deleted");

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
    action: mode === "purge" ? "user_purge" : "user_withdraw",
    before_json: { status: fromStatus, nickname },
    after_json: { mode, purged: mode === "purge" },
  });

  if (mode === "purge") {
    const purged = await purgeAuthUserById(sb, userId);
    if (!purged.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "auth_user_delete_failed",
          message: purged.error,
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, mode: mode satisfies AdminUserDeleteMode });
}
