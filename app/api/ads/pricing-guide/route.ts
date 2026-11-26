import { NextResponse } from "next/server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { loadAdPricingGuide } from "@/lib/ads/ad-pricing-guide";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/**
 * GET /api/ads/pricing-guide — 광고 요금 안내(내정보 › 공지 고정 게시물 · 고객센터 「광고 금액 확인」).
 * 금액은 결제 창과 같은 표에서 매번 읽는다(캐시 없음 · 광고 감사 E · D-18). 가격은 공개 정보라 로그인 없이 볼 수 있다.
 */
export async function GET(): Promise<NextResponse> {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503, headers: NO_STORE });
  try {
    const guide = await loadAdPricingGuide(sb);
    return NextResponse.json({ ok: true, guide }, { headers: NO_STORE });
  } catch (e) {
    console.error("[ads/pricing-guide]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500, headers: NO_STORE });
  }
}
