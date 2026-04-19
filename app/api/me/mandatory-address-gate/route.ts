import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isMandatoryAddressGateSatisfied } from "@/lib/addresses/user-address-service";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 대표 주소 필수 게이트 — 클라이언트 추측 없이 서버가 단일 진실원으로 판정합니다.
 * (레거시: session + 전체 주소 목록 이중 호출 대체)
 */
export async function GET() {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({
      ok: true,
      authenticated: false,
      needsBlock: false,
    });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  try {
    const satisfied = await isMandatoryAddressGateSatisfied(sb, userId);
    return NextResponse.json({
      ok: true,
      authenticated: true,
      needsBlock: !satisfied,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "gate_check_failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
