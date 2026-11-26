import { NextResponse } from "next/server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { loadAdPricingGuide, type AdPricingMine } from "@/lib/ads/ad-pricing-guide";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { readUserPointBalanceResult } from "@/lib/points/user-point-ledger";
import { loadStoreBusinessCashBalance } from "@/lib/stores/advertising/canonical-business-cash-writer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/**
 * 재감사 G-6 (2026-11-27): 로그인했으면 내 포인트 · 승인된 내 매장 비즈 캐시를 함께 — 「내 보유액을 모른다」.
 * 잔액 조회 실패는 0 이 아니라 null(화면 「확인 못 함」). 비로그인 = null. Supabase +2~3회(예산 13).
 */
async function loadMine(
  sb: NonNullable<ReturnType<typeof tryCreateSupabaseServiceClient>>,
  userId: string
): Promise<AdPricingMine> {
  const [points, storeRes] = await Promise.all([
    readUserPointBalanceResult(sb, userId),
    sb
      .from("stores")
      .select("id")
      .eq("owner_user_id", userId)
      .eq("approval_status", "approved")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  const storeId = storeRes.error ? null : ((storeRes.data as { id?: string } | null)?.id ?? null);
  const cash = storeId ? await loadStoreBusinessCashBalance(sb, storeId) : null;
  return {
    points: points.ok ? points.balance : null,
    store: storeId ? { storeId, businessCashMinor: cash?.balanceMinor ?? null } : null,
  };
}

/**
 * GET /api/ads/pricing-guide — 광고 요금 안내(내정보 › 공지 고정 게시물 · 고객센터 「광고 금액 확인」).
 * 금액은 결제 창과 같은 표에서 매번 읽는다(캐시 없음 · 광고 감사 E · D-18). 가격은 공개 정보라 로그인 없이 볼 수 있다.
 */
export async function GET(): Promise<NextResponse> {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503, headers: NO_STORE });
  try {
    const userId = await getRouteUserId();
    const [guide, mine] = await Promise.all([
      loadAdPricingGuide(sb),
      userId ? loadMine(sb, userId) : Promise.resolve(null),
    ]);
    return NextResponse.json({ ok: true, guide, mine }, { headers: NO_STORE });
  } catch (e) {
    console.error("[ads/pricing-guide]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500, headers: NO_STORE });
  }
}
