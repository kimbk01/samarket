import { NextRequest, NextResponse } from "next/server";
import { writeMemberMarketingConsent } from "@/lib/legal/marketing-consent.server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  buildWithdrawProfilePatch,
  clearLegacyAuthBanForWithdraw,
  fetchAuthUserPurgeBlockers,
  moderationActionForDeleteMode,
  normalizeAdminUserDeleteMode,
  prepareAuthUserPurge,
  purgeAuthUserById,
  PURGE_BLOCKER_SYSTEM_ACCOUNT,
  type AdminUserDeleteMode,
} from "@/lib/admin/admin-user-deletion";
import { isDeletedStoreMember } from "@/lib/auth/store-member-policy";
import { deactivateAllUserPushTokensForAccountRemoval } from "@/lib/push/dispatch/deactivate-failed-token";
import {
  revokeAppleSigninTokenForUser,
  type AppleTokenRevokeResult,
} from "@/lib/auth/native/apple-siwa-token.server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { suspendOwnerStoreSalesOnMemberSanction } from "@/lib/admin-business/suspend-owner-store-sales-on-member-sanction";
import { insertModerationEvent, invalidateAllUserSessions, isSuperAdminRole } from "@/lib/admin/admin-user-server";
import { loadActiveAdminMembership } from "@/lib/admin/admin-membership";
import { ADMIN_REASON_REQUIRED_CODE, parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";
import { adminServerText } from "@/lib/i18n/admin-server-language";
import { runMoimAccountCleanup } from "@/lib/moim/server/moim-account-cleanup.server";

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
          message: blockers.blockers.includes(PURGE_BLOCKER_SYSTEM_ACCOUNT)
            ? await adminServerText("admin_api_users_purge_system_account")
            : blockers.blockers.length > 0
              ? await adminServerText("admin_api_users_purge_blocked", { list: blockers.blockers.join(", ") })
              : await adminServerText("admin_api_users_purge_precheck_failed"),
        },
        { status: 409 }
      );
    }
    /** 아무것도 바꾸기 전에 — 기기 삭제 때 발송 기록 고유키 충돌을 없앤다(설계 D2·C1) */
    const prepared = await prepareAuthUserPurge(sb, userId);
    if (!prepared.ok) {
      return NextResponse.json({ ok: false, error: "purge_prepare_failed", message: prepared.error }, { status: 500 });
    }
    /**
     * 모임 정리 — Auth 삭제 바로 앞(모임 기록 FK 에 막히지 않게 · 모임장은 자동 위임, 모임 설계 P8 · 감사 B8).
     * 정리는 되돌릴 수 없는 동작이라 점검·준비가 모두 끝난 뒤에 한다. 정리가 실패하면 삭제를 멈춘다.
     */
    const moimCleanup = await runMoimAccountCleanup(sb, userId);
    if (!moimCleanup.ok) {
      return NextResponse.json({ ok: false, error: "moim_cleanup_failed" }, { status: 500 });
    }
  }

  const alreadyWithdrawn = isDeletedStoreMember(targetProfile as { status?: string; deleted_at?: string | null });

  if (mode === "withdraw") {
    /** 모임 정리 — 탈퇴한 모임장이 모임장으로 남지 않게 자동 위임·모든 모임 퇴장 (모임 설계 P8 · 감사 B8). 실패하면 탈퇴를 멈춘다 */
    const moimCleanup = await runMoimAccountCleanup(sb, userId);
    if (!moimCleanup.ok) {
      return NextResponse.json({ ok: false, error: "moim_cleanup_failed" }, { status: 500 });
    }
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
    // 탈퇴 = 혜택·이벤트 동의 철회 (재감사 D-10) — 실패해도 탈퇴는 유지, 로그만
    const consentOff = await writeMemberMarketingConsent(sb as never, userId, {
      enabled: false,
      source: "settings",
      version: null,
    });
    if (!consentOff.ok) console.warn("[admin/users/delete] marketing consent off failed", { code: consentOff.error });
  }

  /**
   * 제재 이력: 영구 삭제는 기록하지 않는다 — user_moderation_events.user_id 는 profiles ON DELETE CASCADE 라 성공하면 함께 지워지고,
   * 실패할 때만 「영구 삭제」로 남아 이력을 속인다(2026-11-27 실패 10건 · 독립 재감사). 영구 삭제 기록은 감사 기록(user_purge)이 맡는다.
   */
  if (mode !== "purge") {
    try {
      await insertModerationEvent(sb, {
        userId,
        actorId: actor.userId,
        action: moderationAction,
        fromStatus,
        toStatus: "deleted",
        reason,
      });
    } catch (eventErr) {
      const message = eventErr instanceof Error ? eventErr.message : "moderation_event_failed";
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
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

  // App Store 계정 삭제 요구 — Sign in with Apple 토큰 폐기 (purge 로 auth 행이 지워지기 전에). 실패는 기록만.
  const appleTokenRevoke = await revokeAppleSigninTokenForUser(sb, userId).catch(
    (): AppleTokenRevokeResult => ({ status: "failed", detail: "unexpected_error" })
  );

  const sideEffects = {
    pushTokensDeactivated: pushTokenDeactivation.ok,
    ownerStoresSuspended: ownerStoreSales.filter((r) => r.changed).map((r) => r.storeId),
    pushTokenDeactivationErrors: pushTokenDeactivation.errors,
    appleTokenRevoke,
  };

  /**
   * 영구 삭제는 Auth 삭제가 성공한 뒤에만 「완료」·`user_purge` 를 기록한다.
   * 실패하면 `user_purge_failed` 만 남기고 탈퇴 요청은 그대로 둔다(2026-11-27 실패 10건이 「삭제됨」으로 남던 결함 · 설계 C2).
   */
  if (mode === "purge") {
    const purged = await purgeAuthUserById(sb, userId);
    if (!purged.ok) {
      void appendAuditLog(sb, {
        actor_type: "admin",
        actor_id: actor.userId,
        target_type: "user",
        target_id: userId,
        action: "user_purge_failed",
        before_json: { status: fromStatus, nickname },
        after_json: { mode, purged: false, error: purged.error, reason, at: now, actorId: actor.userId, ...sideEffects },
      });
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
      ...sideEffects,
    },
  });

  return NextResponse.json({ ok: true, mode: mode satisfies AdminUserDeleteMode });
}
