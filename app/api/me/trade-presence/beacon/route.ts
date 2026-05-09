import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST `sendBeacon` — 탭 백그라운드/언로드 시 마지막 접속 시각 flush.
 *
 * 자매 라우트(`/heartbeat`, GET `/me/trade-presence`) 와 **동형 에러 처리** 를 유지한다.
 * - 컬럼 미존재 → `schema_missing` (503): 로그인·프로필 흐름을 깨지 않도록 best-effort.
 * - 그 외 supabase 에러 → 500 + 서버 콘솔 구조화 로그 (원인 가시성 확보, 헌장 [근본 대책만]).
 *
 * sendBeacon 클라이언트는 응답을 보지 않으므로 코드만 분기해도 사용자 영향은 없고,
 * dev 터미널에 한 줄로 실패 원인을 남겨야 schema 미적용·RLS·트리거 중 어디인지 단일 원인으로 좁힐 수 있다.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = await createSupabaseRouteHandlerClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  try {
    const _raw = await req.text();
    void _raw;
  } catch {
    /* ignore */
  }

  const now = new Date().toISOString();
  const { error } = await sb
    .from("profiles")
    .update({ trade_presence_last_seen_at: now })
    .eq("id", auth.userId);

  if (error) {
    if (error.message?.includes("column") || error.message?.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "schema_missing", detail: error.message }, { status: 503 });
    }
    console.error("[trade-presence:beacon] update failed", {
      userIdSuffix: auth.userId ? auth.userId.slice(-8) : null,
      pgCode: (error as { code?: string }).code ?? null,
      pgDetails: (error as { details?: string }).details ?? null,
      pgHint: (error as { hint?: string }).hint ?? null,
      message: error.message,
    });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
