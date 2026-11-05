import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { readAppleIapServerConfig } from "@/lib/apple-iap/apple-iap-config.server";
import {
  parseAppleSignedTransaction,
  recordAndCreditAppleTransaction,
} from "@/lib/apple-iap/apple-iap-service.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/me/apple-iap/verify — StoreKit 서명 거래 제출 → 서버 서명 검증 → 기록 → 자동 지급.
 * body: { signedTransaction }
 * 지급 대상은 Apple 서명 안의 appAccountToken(준비 기록) 소유자. 다른 계정 거래면 기록·지급은 하되 상태는 알려주지 않는다.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  const config = readAppleIapServerConfig();
  if (!config) return NextResponse.json({ ok: false, error: "apple_iap_unconfigured" }, { status: 503 });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const signedTransaction = String(body.signedTransaction ?? "").trim();
  if (!signedTransaction || signedTransaction.length > 20000) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const parsed = parseAppleSignedTransaction(signedTransaction, config);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });

  try {
    const r = await recordAndCreditAppleTransaction(sb, parsed.tx, "app");
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: r.error }, { status: r.error === "attempt_not_found" ? 404 : 409 });
    }
    if (r.ownerUserId !== auth.userId) {
      return NextResponse.json({ ok: false, error: "attempt_not_owned", finish: true }, { status: 403 });
    }
    return NextResponse.json({
      ok: true,
      attemptId: r.attemptId,
      phase: r.phase,
      duplicate: r.duplicate,
      creditError: r.creditError,
      transactionId: parsed.tx.transactionId,
      attempt: r.attempt,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
