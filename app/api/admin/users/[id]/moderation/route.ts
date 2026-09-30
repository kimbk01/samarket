import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { insertModerationEvent, invalidateAllUserSessions } from "@/lib/admin/admin-user-server";
import { moderationActionToProfilePatch } from "@/lib/admin-users/moderation-status";
import { assertMemberModerationTargetAllowed } from "@/lib/admin-users/member-moderation-target";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = ["warn", "suspend", "ban", "restore"] as const;

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminPermission("users");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const userId = id?.trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const { sb } = gate;
  const { data, error } = await sb
    .from("user_moderation_events")
    .select("id, user_id, actor_id, action, from_status, to_status, reason, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    if (error.message?.includes("user_moderation_events") && error.message.includes("does not exist")) {
      return NextResponse.json({ ok: true, events: [] });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, events: data ?? [] });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminPermission("users");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const userId = id?.trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let body: { action?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const action = String(body.action ?? "").trim().toLowerCase();
  const reason = String(body.reason ?? "").trim();
  if (!ACTIONS.includes(action as (typeof ACTIONS)[number])) {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  }

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

  const targetGuard = await assertMemberModerationTargetAllowed(sb, {
    targetUserId: userId,
    actorIsSuperAdmin: actor.isSuperAdmin,
  });
  if (!targetGuard.ok) {
    return NextResponse.json({ ok: false, error: targetGuard.error }, { status: targetGuard.status });
  }

  const fromStatus = String((targetProfile as { status?: string }).status ?? "");
  const deletedAt = (targetProfile as { deleted_at?: string | null }).deleted_at ?? null;
  const fromStatusNorm = fromStatus.trim().toLowerCase();
  const isWithdrawnTarget =
    Boolean(deletedAt) ||
    fromStatusNorm === "deleted" ||
    fromStatusNorm === "withdrawn" ||
    fromStatusNorm === "deactivated";

  // P0: withdraw/anonymize is not recoverable via moderation restore.
  if (action === "restore" && isWithdrawnTarget) {
    return NextResponse.json(
      { ok: false, error: "withdrawn_not_restorable", message: "탈퇴 처리된 회원은 일반 복구할 수 없습니다." },
      { status: 409 }
    );
  }
  // P0: ban/block must not target already withdrawn accounts (collision with delete path).
  if (action === "ban" && isWithdrawnTarget) {
    return NextResponse.json(
      { ok: false, error: "already_withdrawn", message: "탈퇴 회원에는 이용 차단을 적용할 수 없습니다." },
      { status: 409 }
    );
  }
  if (action === "restore" && fromStatusNorm !== "suspended" && fromStatusNorm !== "blocked") {
    return NextResponse.json(
      { ok: false, error: "restore_not_applicable", message: "정지 또는 차단 상태에서만 해제할 수 있습니다." },
      { status: 409 }
    );
  }

  const patch = moderationActionToProfilePatch(action as (typeof ACTIONS)[number]);
  const toStatus = patch?.status ? String(patch.status) : fromStatus;

  /**
   * P0-R2 moderation consistency (Auth ⟂ Postgres — not a fake single DB TX):
   *
   * BLOCK (ban):
   *   1) Auth ban first — fail closed with no DB mutation if Auth fails
   *   2) Profile → blocked
   *   3) Session revoke + cache invalidate
   *   4) Success audit + moderation log
   *   On profile fail after Auth: Auth unban compensate + FAILED audit\n   *   On compensate fail: COMPENSATION_FAILED (not false SUCCESS)
   *
   * UNBLOCK (restore from blocked):
   *   1) Profile → verified_user
   *   2) Auth unban
   *   3) Cache invalidate
   *   4) Success audit + log
   *   On Auth fail: profile rollback to blocked + FAILED audit
   *
   * SUSPEND:
   *   Profile → suspended → session/cache invalidate (login remains allowed) → audit/log
   *
   * Silent partial success FORBIDDEN — operator receives ok:false with explicit error.
   */

  const failAudit = (errorCode: string, detail: string, after: Record<string, unknown>) => {
    void appendAuditLog(sb, {
      actor_type: "admin",
      actor_id: actor.userId,
      target_type: "user",
      target_id: userId,
      action: `moderation_${action}_failed`,
      before_json: { status: fromStatus },
      after_json: { ...after, result: "FAILED", errorCode, detail: detail.slice(0, 500) },
    });
  };

  // —— BAN / BLOCK —— Auth first
  if (action === "ban") {
    try {
      const { error: banErr } = await sb.auth.admin.updateUserById(userId, {
        ban_duration: "876000h",
      } as never);
      if (banErr) throw banErr;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      failAudit("auth_block_failed", detail, { status: fromStatus });
      return NextResponse.json(
        {
          ok: false,
          error: "auth_block_failed",
          result: "FAILED",
          message: "이용 차단 Auth 반영에 실패했습니다. 계정 상태는 변경되지 않았습니다.",
          detail,
        },
        { status: 500 }
      );
    }

    if (patch) {
      const { error: updateErr } = await sb.from("profiles").update(patch).eq("id", userId);
      if (updateErr) {
        let compensateOk = false;
        let compensateDetail = "";
        try {
          const { error: unbanErr } = await sb.auth.admin.updateUserById(userId, {
            ban_duration: "none",
          } as never);
          if (unbanErr) throw unbanErr;
          compensateOk = true;
        } catch (compErr) {
          compensateDetail =
            compErr instanceof Error ? compErr.message : String(compErr);
        }
        if (!compensateOk) {
          failAudit("compensation_failed", `${updateErr.message} | unban: ${compensateDetail}`, {
            status: fromStatus,
            auth: "COMPENSATION_FAILED",
            profile: "still_pre_ban",
            auth_ban: "still_banned",
          });
          return NextResponse.json(
            {
              ok: false,
              error: "compensation_failed",
              result: "COMPENSATION_FAILED",
              message:
                "이용 차단 프로필 반영에 실패했고 Auth 차단 보정에도 실패했습니다. 운영 확인이 필요합니다.",
              // detail is operator-facing; do not invent success
            },
            { status: 500 }
          );
        }
        failAudit("profile_block_failed", updateErr.message, {
          status: fromStatus,
          auth: "compensated_unban",
          result: "FAILED",
        });
        return NextResponse.json(
          {
            ok: false,
            error: "profile_block_failed",
            result: "FAILED",
            message: "이용 차단 프로필 반영에 실패했습니다. Auth 차단은 보정되었습니다.",
            detail: updateErr.message,
          },
          { status: 500 }
        );
      }
    }

    await invalidateAllUserSessions(sb, userId, "moderation_ban");

    const logId = await insertModerationEvent(sb, {
      userId,
      actorId: actor.userId,
      action: "ban",
      fromStatus,
      toStatus,
      reason: `[SUCCESS] ${reason}`.slice(0, 2000),
    });

    void appendAuditLog(sb, {
      actor_type: "admin",
      actor_id: actor.userId,
      target_type: "user",
      target_id: userId,
      action: "moderation_ban",
      before_json: { status: fromStatus },
      after_json: { status: toStatus, logId, result: "SUCCESS", auth: "banned", sessions: "revoked" },
    });

    return NextResponse.json({ ok: true, result: "SUCCESS", logId, status: toStatus });
  }

  // —— RESTORE from blocked —— profile then Auth unban
  if (action === "restore" && fromStatusNorm === "blocked") {
    if (patch) {
      const { error: updateErr } = await sb.from("profiles").update(patch).eq("id", userId);
      if (updateErr) {
        failAudit("profile_unblock_failed", updateErr.message, { status: fromStatus });
        return NextResponse.json(
          {
            ok: false,
            error: "profile_unblock_failed",
            result: "FAILED",
            message: "차단 해제 프로필 반영에 실패했습니다.",
            detail: updateErr.message,
          },
          { status: 500 }
        );
      }
    }

    try {
      const { error: unbanErr } = await sb.auth.admin.updateUserById(userId, {
        ban_duration: "none",
      } as never);
      if (unbanErr) throw unbanErr;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const { error: rollbackErr } = await sb
        .from("profiles")
        .update({ status: "blocked", deleted_at: null })
        .eq("id", userId);
      if (rollbackErr) {
        failAudit("compensation_failed", `${detail} | rollback: ${rollbackErr.message}`, {
          status: "inconsistent",
          auth: "still_banned",
          profile: "ROLLBACK_FAILED",
          result: "COMPENSATION_FAILED",
        });
        return NextResponse.json(
          {
            ok: false,
            error: "compensation_failed",
            result: "COMPENSATION_FAILED",
            message:
              "차단 해제 Auth 반영에 실패했고 프로필 롤백에도 실패했습니다. 운영 확인이 필요합니다.",
          },
          { status: 500 }
        );
      }
      failAudit("auth_unblock_failed", detail, {
        status: "blocked",
        profile: "rolled_back_blocked",
        result: "FAILED",
      });
      return NextResponse.json(
        {
          ok: false,
          error: "auth_unblock_failed",
          result: "FAILED",
          message: "차단 해제 Auth 반영에 실패했습니다. 계정 상태는 차단으로 유지됩니다.",
          detail,
        },
        { status: 500 }
      );
    }

    // Restore does not re-issue sessions; clear warm caches so new login sees ACTIVE.
    await invalidateAllUserSessions(sb, userId, "moderation_restore");

    const logId = await insertModerationEvent(sb, {
      userId,
      actorId: actor.userId,
      action: "restore",
      fromStatus,
      toStatus,
      reason: `[SUCCESS] ${reason}`.slice(0, 2000),
    });

    void appendAuditLog(sb, {
      actor_type: "admin",
      actor_id: actor.userId,
      target_type: "user",
      target_id: userId,
      action: "moderation_restore",
      before_json: { status: fromStatus },
      after_json: { status: toStatus, logId, result: "SUCCESS", auth: "unbanned" },
    });

    return NextResponse.json({ ok: true, result: "SUCCESS", logId, status: toStatus });
  }

  // —— warn / suspend / restore-from-suspended ——
  if (patch) {
    const { error: updateErr } = await sb.from("profiles").update(patch).eq("id", userId);
    if (updateErr) {
      failAudit("profile_update_failed", updateErr.message, { status: fromStatus });
      return NextResponse.json(
        {
          ok: false,
          error: updateErr.message,
          result: "FAILED",
        },
        { status: 500 }
      );
    }
  }

  if (action === "suspend") {
    await invalidateAllUserSessions(sb, userId, "moderation_suspend");
  }

  if (action === "restore") {
    await invalidateAllUserSessions(sb, userId, "moderation_restore");
  }

  const logId = await insertModerationEvent(sb, {
    userId,
    actorId: actor.userId,
    action: action as "warn" | "suspend" | "ban" | "restore",
    fromStatus,
    toStatus,
    reason: `[SUCCESS] ${reason}`.slice(0, 2000),
  });

  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actor.userId,
    target_type: "user",
    target_id: userId,
    action: `moderation_${action}`,
    before_json: { status: fromStatus },
    after_json: { status: toStatus, logId, result: "SUCCESS" },
  });

  return NextResponse.json({ ok: true, result: "SUCCESS", logId, status: toStatus });
}
