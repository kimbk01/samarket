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
 * 지우는 절차는 관리자 「완전 삭제」와 같다: 푸시 토큰 해제 → Apple 토큰 폐기 → 감사 기록 → auth 사용자 삭제(연결 행 CASCADE).
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

  const body = (await req.json().catch(() => null)) as { confirm?: unknown } | null;
  if (body?.confirm !== true) {
    return NextResponse.json({ ok: false, error: "confirm_required" }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const check = await checkEmptyAccountForDiscard(sb, auth.userId);
  if (!check.ok) {
    return NextResponse.json({ ok: false, error: check.error }, { status: check.error === "not_found" ? 404 : 503 });
  }
  if (!check.empty) {
    return NextResponse.json({ ok: false, error: "not_empty_account", reasons: check.reasons }, { status: 409 });
  }

  const now = new Date().toISOString();
  const pushTokenDeactivation = await deactivateAllUserPushTokensForAccountRemoval(sb, auth.userId);
  const appleTokenRevoke = await revokeAppleSigninTokenForUser(sb, auth.userId).catch(
    (): AppleTokenRevokeResult => ({ status: "failed", detail: "unexpected_error" }),
  );
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

  const purged = await purgeAuthUserById(sb, auth.userId);
  if (!purged.ok) {
    return NextResponse.json({ ok: false, error: "auth_user_delete_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
