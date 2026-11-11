import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { getOptionalAuthenticatedUserId, requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requirePhoneVerified, validateActiveSession } from "@/lib/auth/server-guards";
import { isProductWriteDeniedMemberAccount, MEMBER_ACCOUNT_WRITE_DENIED_MESSAGE } from "@/lib/auth/member-account-state";
import { requireSignupCompleteForUser } from "@/lib/auth/require-signup-complete-api";
import { assertCommunityWriteAllowed } from "@/lib/community/community-write-restriction";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { getSupabaseServer, type SupabaseServer } from "@/lib/chat/supabase-server";
import { isUuidString } from "@/lib/shared/uuid-string";

/**
 * 모임 API 공통 관문 — 로그인·세션·쓰기 제한·약관·(필요 시)전화 인증·요청 수 제한.
 * 권한(역할) 판정은 DB RPC 가 한다. 이 관문은 「누가 요청했는가」만 확정한다.
 */

export type MoimWriteKind = "post" | "comment" | "report" | "none";

export type MoimGuardOk = { ok: true; userId: string; sb: SupabaseServer };
export type MoimGuardFail = { ok: false; response: NextResponse };

export async function guardMoimWrite(
  req: NextRequest,
  /** consentExempt: 약관 동의 전에도 허용(나가기·신청 취소·신고·내 글 삭제 — member-consent-mutation-policy 와 같은 목록) */
  opts: { rateKey: string; limit?: number; writeKind?: MoimWriteKind; phone?: boolean; consentExempt?: boolean }
): Promise<MoimGuardOk | MoimGuardFail> {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return { ok: false, response: session.response };
  if (isProductWriteDeniedMemberAccount(session.profile)) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: MEMBER_ACCOUNT_WRITE_DENIED_MESSAGE, code: "member_activity_restricted" },
        { status: 403 }
      ),
    };
  }
  const kind = opts.writeKind ?? "post";
  if (kind !== "none") {
    const restricted = await assertCommunityWriteAllowed(auth.userId, kind);
    if (restricted) return { ok: false, response: restricted };
  }
  if (opts.phone) {
    const phone = await requirePhoneVerified(auth.userId);
    if (!phone.ok) return { ok: false, response: phone.response };
  }
  const rl = await enforceRateLimit({
    key: `moim:${opts.rateKey}:${getRateLimitKey(req, auth.userId)}`,
    limit: opts.limit ?? 30,
    windowMs: 60_000,
    code: "moim_rate_limited",
  });
  if (!rl.ok) return { ok: false, response: rl.response };
  const sb = getSupabaseServer();
  if (!opts.consentExempt) {
    const terms = await requireSignupCompleteForUser(sb, auth.userId);
    if (!terms.ok) return { ok: false, response: terms.response };
  }
  return { ok: true, userId: auth.userId, sb };
}

/** 읽기 — 로그인 선택 (공개 페이지는 비로그인도 본다) */
export async function guardMoimRead(
  req: NextRequest,
  opts: { rateKey: string; limit?: number; requireLogin?: boolean }
): Promise<{ ok: true; userId: string | null; sb: SupabaseServer } | MoimGuardFail> {
  const userId = await getOptionalAuthenticatedUserId();
  if (opts.requireLogin && !userId) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 }) };
  }
  const rl = await enforceRateLimit({
    key: `moim:${opts.rateKey}:${getRateLimitKey(req, userId)}`,
    limit: opts.limit ?? 120,
    windowMs: 60_000,
    code: "moim_rate_limited",
  });
  if (!rl.ok) return { ok: false, response: rl.response };
  return { ok: true, userId, sb: getSupabaseServer() };
}

export function moimBadRequest(error = "invalid_request") {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

export function moimNotFound() {
  return NextResponse.json({ ok: false, error: "moim_not_found" }, { status: 404 });
}

export async function readMoimJson<T>(req: NextRequest): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export function requireUuid(value: string | undefined | null): string | null {
  const v = (value ?? "").trim();
  return isUuidString(v) ? v : null;
}

/** RPC 결과 → 응답 (권한 오류 403 · 없음 404 · 그 외 400) */
export function moimRpcResponse(result: { ok: true } | { ok: false; error: string }, extra?: Record<string, unknown>) {
  if (result.ok) return NextResponse.json({ ...result, ...(extra ?? {}) });
  const error = result.error;
  const status =
    error === "moim_forbidden" || error === "moim_not_member" || error === "moim_join_not_allowed"
      ? 403
      : error === "moim_not_found" || error.endsWith("_not_found")
        ? 404
        : error === "moim_conflict"
          ? 409
          : 400;
  return NextResponse.json({ ok: false, error }, { status });
}
