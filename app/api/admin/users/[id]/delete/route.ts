import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
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
import { deactivateAllUserPushTokensForAccountRemoval } from "@/lib/push/dispatch/deactivate-failed-token";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { suspendOwnerStoreSalesOnMemberSanction } from "@/lib/admin-business/suspend-owner-store-sales-on-member-sanction";
import { insertModerationEvent, invalidateAllUserSessions, isSuperAdminRole } from "@/lib/admin/admin-user-server";
import { loadActiveAdminMembership } from "@/lib/admin/admin-membership";
import { ADMIN_REASON_REQUIRED_CODE, parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";

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
  if (!mode) {
    return NextResponse.json({ ok: false, error: "invalid_mode" }, { status: 400 });
  }
  /** R2 — 탈퇴·영구 삭제(L3) 사유 필수: 화면 확인창의 사유를 받아 감사·처리 기록에 남긴다. */
  const reason = parseAdminReason(body.reason);
  if (!reason) {
    return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
  }

  /** withdraw · purge 모두 users 권한. */
  const gate = await requireAdminPermission("users");
  if (!gate.ok) return gate.response;

  const { sb, actor } = gate;

  const { data: targetProfile, error: profileErr } = await sb
    .from("profiles")
    .select("id, status, deleted_at, nickname, display_name")
    .eq("id", userId)
    .maybeSingle();
  if (profileErr) {
    return NextResponse.json({ ok: false, error: profileErr.message }, { status: 500 });
  }
  if (!targetProfile) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  // AD-06: 대상 관리자 확인 DB 오류 = 503 (일반 회원으로 간주하지 않는다 · fail-closed).
  let targetMembership: Awaited<ReturnType<typeof loadActiveAdminMembership>>;
  try {
    targetMembership = await loadActiveAdminMembership(sb, userId);
  } catch {
    return NextResponse.json({ ok: false, error: "admin_target_check_failed" }, { status: 503 });
  }
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
  /** 영구 삭제·탈퇴: 대상 재입력은 화면 확인창(confirmAdminAction L3)이 맡는다. */

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

  // ACC-03: 탈퇴·영구 삭제 회원이 사장님이면 매장 판매 중지 + 비노출 (회원 제재 DEF-68 과 같은 경로, 자동 재개 없음).
  const ownerStoreSales = await suspendOwnerStoreSalesOnMemberSanction(sb, {
    userId,
    actorId: actor.userId,
    sanction: "withdraw",
    reason,
  });

  // WP-13 NEW-09: a withdrawn/purged account's push tokens must stop receiving pushes. Deactivate
  // the user's own token rows (is_active=false) — policy-independent (no retention period / FK
  // CASCADE decision). Best-effort: the account removal already succeeded above, so a token
  // deactivation error is recorded but never rolls it back.
  const pushTokenDeactivation = await deactivateAllUserPushTokensForAccountRemoval(sb, userId);

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
    after_json: {
      mode,
      purged: mode === "purge",
      reason,
      at: now,
      actorId: actor.userId,
      pushTokensDeactivated: pushTokenDeactivation.ok,
      ownerStoresSuspended: ownerStoreSales.filter((r) => r.changed).map((r) => r.storeId),
      pushTokenDeactivationErrors: pushTokenDeactivation.errors,
    },
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
