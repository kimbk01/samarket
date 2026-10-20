import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import { loadMypageSummaryFieldsServer } from "@/lib/mypage/mypage-summary.server";
import type { MypageSummaryResponse } from "@/lib/mypage/mypage-summary-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/**
 * GET /api/me/mypage-summary — 내정보 홈 오른쪽 값(최종 설계 §2.2).
 * 각 필드 = 목적지 화면과 같은 서버 함수. 필드별 실패 → `unavailable`(0 대체 금지).
 * 서버 캐시 없음 · 회원별·금액 포함 → no-store.
 */
export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = resolveServiceSupabaseForApi();
  if (!sb) {
    return NextResponse.json(
      { ok: false, error: "mypage_summary_service_unavailable" },
      { status: 503, headers: NO_STORE },
    );
  }

  const fields = await loadMypageSummaryFieldsServer(sb, auth.userId);
  const computed = Object.values(fields).filter((f) => f.status !== "hidden");
  if (computed.length > 0 && computed.every((f) => f.status === "unavailable")) {
    // 전 필드 실패 — 성공 응답으로 감추지 않는다(API 표 A1: 500)
    return NextResponse.json(
      { ok: false, error: "mypage_summary_unavailable" },
      { status: 500, headers: NO_STORE },
    );
  }
  const body: MypageSummaryResponse = {
    ok: true,
    viewerId: auth.userId,
    generatedAt: new Date().toISOString(),
    fields,
  };
  return NextResponse.json(body, { headers: NO_STORE });
}
