import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { runDiscardEmptyAccount } from "@/lib/auth/discard-empty-account-run.server";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST `{ confirm: true }` — 실수로 만든 빈 계정을 회원이 스스로 지운다 (설계 2026-11-21 §5-6).
 * 빈 계정이 아니면 지우지 않고 409 `not_empty_account` (화면은 고객센터 안내).
 * 절차(`runDiscardEmptyAccount`): 확인 → Apple 토큰 폐기(삭제 전에만 가능) → 삭제 직전 재확인 → auth 사용자 삭제(연결 행 CASCADE)
 * → 남은 푸시 토큰 끄기 → 감사 기록.
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

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  /** 빈 계정 아님 이유는 응답에 넣지 않는다(서버 감사 기록에만) · 삭제 직전 재확인 · 같은 회원 동시 요청 1개 (등록 후속 감사 B12) */
  const result = await runDiscardEmptyAccount(sb, auth.userId, attemptedPhone);
  return NextResponse.json(result.body, { status: result.status });
}
