import "server-only";

/**
 * 빈 계정 스스로 지우기 — 실행 단일 구현 (`POST /api/me/registration/discard-empty-account`).
 * 등록 후속 감사 B12:
 * (a) 빈 계정이 아닌 이유(내부 표 이름)는 **응답에 넣지 않는다** — 화면은 `not_empty_account` 하나로 고객센터 안내,
 *     이유는 서버 감사 기록(`audit_logs`)에만 남긴다.
 * (b) 경합 줄이기 — 같은 서버 인스턴스에서 같은 회원의 동시 요청은 하나만 진행(single-flight),
 *     Apple 토큰 폐기 뒤 **삭제 직전에 빈 계정인지 다시 확인**하고 아니면 지우지 않는다.
 *     (DB 함수·잠금 없음 — 인스턴스가 다른 동시 요청·확인과 삭제 사이의 아주 짧은 틈은 남는다.)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkEmptyAccountForDiscard } from "@/lib/auth/discard-empty-account.server";
import { purgeAuthUserById } from "@/lib/admin/admin-user-deletion";
import { deactivateAllUserPushTokensForAccountRemoval } from "@/lib/push/dispatch/deactivate-failed-token";
import {
  revokeAppleSigninTokenForUser,
  type AppleTokenRevokeResult,
} from "@/lib/auth/native/apple-siwa-token.server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";

export type DiscardEmptyAccountResult = {
  status: number;
  body: { ok: true } | { ok: false; error: string };
};

const NOT_EMPTY: DiscardEmptyAccountResult = { status: 409, body: { ok: false, error: "not_empty_account" } };

/** 같은 인스턴스에서 진행 중인 회원 id */
const discardInFlight = new Set<string>();

/** 테스트 전용 — 진행 중 표시 확인 */
export function isDiscardEmptyAccountInFlight(userId: string): boolean {
  return discardInFlight.has(String(userId ?? "").trim());
}

function recordRefusal(
  sb: SupabaseClient,
  userId: string,
  stage: "precheck" | "recheck",
  detail: Record<string, unknown>,
): void {
  void appendAuditLog(sb, {
    actor_type: "user",
    actor_id: userId,
    target_type: "user",
    target_id: userId,
    action: "user_discard_empty_account_refused",
    before_json: null,
    after_json: { at: new Date().toISOString(), stage, ...detail },
  });
}

export async function runDiscardEmptyAccount(
  sb: SupabaseClient,
  userId: string,
  attemptedPhone: string,
): Promise<DiscardEmptyAccountResult> {
  const uid = String(userId ?? "").trim();
  if (!uid) return { status: 400, body: { ok: false, error: "invalid_user_id" } };
  if (discardInFlight.has(uid)) {
    return { status: 409, body: { ok: false, error: "discard_in_progress" } };
  }
  discardInFlight.add(uid);
  try {
    const phone = String(attemptedPhone ?? "").trim();
    if (!phone) {
      recordRefusal(sb, uid, "precheck", { reasons: ["no_duplicate_phone"] });
      return NOT_EMPTY;
    }

    const check = await checkEmptyAccountForDiscard(sb, uid, phone);
    if (!check.ok) {
      return { status: check.error === "not_found" ? 404 : 503, body: { ok: false, error: check.error } };
    }
    if (!check.empty) {
      recordRefusal(sb, uid, "precheck", { reasons: check.reasons });
      return NOT_EMPTY;
    }

    const now = new Date().toISOString();
    // Apple 토큰 폐기는 삭제 전에만 가능하다(토큰 행이 함께 지워짐) — 관리자 완전 삭제와 같은 순서. 실패는 기록만.
    const appleTokenRevoke = await revokeAppleSigninTokenForUser(sb, uid).catch(
      (): AppleTokenRevokeResult => ({ status: "failed", detail: "unexpected_error" }),
    );

    /** 삭제 직전 다시 확인 — 첫 확인 뒤 활동(글·채팅·주문 등)이 생겼으면 지우지 않는다 */
    const recheck = await checkEmptyAccountForDiscard(sb, uid, phone);
    if (!recheck.ok || !recheck.empty) {
      recordRefusal(sb, uid, "recheck", {
        reasons: recheck.ok && !recheck.empty ? recheck.reasons : [],
        lookupError: recheck.ok ? null : recheck.error,
        appleTokenRevoke,
      });
      if (!recheck.ok) {
        return { status: recheck.error === "not_found" ? 404 : 503, body: { ok: false, error: recheck.error } };
      }
      return NOT_EMPTY;
    }

    const purged = await purgeAuthUserById(sb, uid);
    if (!purged.ok) {
      void appendAuditLog(sb, {
        actor_type: "user",
        actor_id: uid,
        target_type: "user",
        target_id: uid,
        action: "user_discard_empty_account_failed",
        before_json: null,
        after_json: { at: now, appleTokenRevoke, error: purged.error },
      });
      return { status: 500, body: { ok: false, error: "auth_user_delete_failed" } };
    }
    // 삭제가 끝난 뒤 — 남은 푸시 토큰 행이 있으면 끈다(재감사3 #11: 삭제 실패 때 푸시만 끊기지 않게)
    const pushTokenDeactivation = await deactivateAllUserPushTokensForAccountRemoval(sb, uid);
    await appendAuditLog(sb, {
      actor_type: "user",
      actor_id: uid,
      target_type: "user",
      target_id: uid,
      action: "user_discard_empty_account",
      before_json: null,
      after_json: {
        at: now,
        reason: "duplicate_phone_empty_account",
        pushTokensDeactivated: pushTokenDeactivation.ok,
        pushTokenDeactivationErrors: pushTokenDeactivation.errors,
        appleTokenRevoke,
      },
    });
    return { status: 200, body: { ok: true } };
  } finally {
    discardInFlight.delete(uid);
  }
}
