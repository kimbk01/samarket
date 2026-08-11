import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { canUseVerifiedMemberFeatures, loadMemberAccessState } from "@/lib/auth/member-access";
import { isMandatoryAddressGateSatisfied } from "@/lib/addresses/user-address-service";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 대표 주소 필수 게이트 — ADDRESS_COMPLETE = active user_addresses AND is_default_master.
 * Geo / region_name / any-row 보정 없음. GET list 는 read-only.
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
    const [satisfied, accessState] = await Promise.all([
      isMandatoryAddressGateSatisfied(sb, userId),
      loadMemberAccessState(sb as never, userId),
    ]);
    return NextResponse.json({
      ok: true,
      authenticated: true,
      needsBlock: !satisfied,
      /** 글쓰기·채팅 등 — 전화(또는 관리자 동등) 완료 여부(읽기 전용과 구분 안내용) */
      fullInteractiveMemberOk: canUseVerifiedMemberFeatures(accessState),
    });
  } catch (e) {
    console.error("[mandatory-address-gate]", e);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}
