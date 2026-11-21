import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { checkEmptyAccountForDiscard } from "@/lib/auth/discard-empty-account.server";
import { purgeAuthUserById } from "@/lib/admin/admin-user-deletion";
import { deactivateAllUserPushTokensForAccountRemoval } from "@/lib/push/dispatch/deactivate-failed-token";
import {
  revokeAppleSigninTokenForUser,
  type AppleTokenRevokeResult,
} from "@/lib/auth/native/apple-siwa-token.server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST `{ confirm: true }` — 실수로 만든 빈 계정을 회원이 스스로 지운다 (설계 2026-11-21 §5-6).
 * 빈 계정이 아니면 지우지 않고 409 `not_empty_account` (화면은 고객센터 안내).
 * 절차: Apple 토큰 폐기(삭제 전에만 가능) → auth 사용자 삭제(연결 행 CASCADE) → 남은 푸시 토큰 끄기 → 감사 기록.
 * body `{ confirm: true, phone }` — `phone` = 방금 중복으로 거절된 번호(서버가 다시 확인).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;

  const rate = await enforceRateLimit({
    key: `registration:discard-empty-account:${getRateLimitKey(req, auth.userId)}`,
    limit: 5,
    windowMs: 60_000,
    message: "too_many_requests",
    code: "discard_empty_account_rate_limited",
  });
  if (!rate.ok) return rate.response;

  const body = (await req.json().catch(() => null)) as { confirm?: unknown; phone?: unknown } | null;
  if (body?.confirm !== true) {
    return NextResponse.json({ ok: false, error: "confirm_required" }, { status: 400 });
  }
  /** 번호 중복 상황에서만 — 방금 시도한 번호가 다른 계정에 실제로 있는지 서버가 다시 확인한다 (재감사3 #1) */
  const attemptedPhone = typeof body.phone === "string" ? body.phone.trim() : "";
  if (!attemptedPhone) {
    return NextResponse.json({ ok: false, error: "not_empty_account", reasons: ["no_duplicate_phone"] }, { status: 409 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const check = await checkEmptyAccountForDiscard(sb, auth.userId, attemptedPhone);
  if (!check.ok) {
    return NextResponse.json({ ok: false, error: check.error }, { status: check.error === "not_found" ? 404 : 503 });
  }
  if (!check.empty) {
    return NextResponse.json({ ok: false, error: "not_empty_account", reasons: check.reasons }, { status: 409 });
  }

  const now = new Date().toISOString();
  // Apple 토큰 폐기는 삭제 전에만 가능하다(토큰 행이 함께 지워짐) — 관리자 완전 삭제와 같은 순서. 실패는 기록만.
  const appleTokenRevoke = await revokeAppleSigninTokenForUser(sb, auth.userId).catch(
    (): AppleTokenRevokeResult => ({ status: "failed", detail: "unexpected_error" }),
  );
  const purged = await purgeAuthUserById(sb, auth.userId);
  if (!purged.ok) {
    void appendAuditLog(sb, {
      actor_type: "user",
      actor_id: auth.userId,
      target_type: "user",
      target_id: auth.userId,
      action: "user_discard_empty_account_failed",
      before_json: null,
      after_json: { at: now, appleTokenRevoke, error: purged.error },
    });
    return NextResponse.json({ ok: false, error: "auth_user_delete_failed" }, { status: 500 });
  }
  // 삭제가 끝난 뒤 — 남은 푸시 토큰 행이 있으면 끈다(재감사3 #11: 삭제 실패 때 푸시만 끊기지 않게)
  const pushTokenDeactivation = await deactivateAllUserPushTokensForAccountRemoval(sb, auth.userId);
  await appendAuditLog(sb, {
    actor_type: "user",
    actor_id: auth.userId,
    target_type: "user",
    target_id: auth.userId,
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

  return NextResponse.json({ ok: true });
}
