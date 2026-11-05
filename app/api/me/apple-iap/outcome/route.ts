import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { appleIapIsUuid } from "@/lib/apple-iap/apple-iap-contract";
import { markAppleIapOutcome } from "@/lib/apple-iap/apple-iap-service.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OUTCOMES = new Set(["user_cancelled", "failed", "deferred"]);

/**
 * POST /api/me/apple-iap/outcome — 거래 없이 끝난 StoreKit 결과 (취소·실패·보호자 승인 대기).
 * 이미 결제 기록이 있으면 서버가 바꾸지 않는다.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const attemptId = String(body.attemptId ?? "").trim().toLowerCase();
  const outcome = String(body.outcome ?? "").trim();
  if (!appleIapIsUuid(attemptId) || !OUTCOMES.has(outcome)) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  try {
    const r = await markAppleIapOutcome(sb, {
      attemptId,
      userId: auth.userId,
      outcome: outcome as "user_cancelled" | "failed" | "deferred",
    });
    if (r.ok !== true) {
      const error = String(r.error ?? "outcome_failed");
      return NextResponse.json({ ok: false, error }, { status: error === "not_found" ? 404 : 400 });
    }
    return NextResponse.json({ ok: true, changed: r.changed === true, status: String(r.status) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
