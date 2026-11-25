import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { getOnboardingStatus } from "@/lib/auth/get-onboarding-status";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 가입 단계 게이트 — 판정 = `getOnboardingStatus` (DB 함수 `member_onboarding_facts` 1회, 기존 주소·회원 상태 2회 조회 대체).
 * - `needsBlock` = 대표 주소 없음 (ADDRESS_COMPLETE = active user_addresses AND is_default_master — 기존 의미 그대로,
 *   내정보 프로필 편집·알림 온보딩 지연이 이 값을 쓴다).
 * - `registrationNextStep` = 가입(동의 + 전화 인증 + 대표 주소) 첫 미완료 단계 — 화면 사본을 채워 가입 관문(`DibaySignupGate`)이
 *   화면 이동마다 판정한다(건너뛰기 없음, 2026-11-24 가입 SSOT).
 * GET 은 읽기 전용.
 */
export async function GET() {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({
      ok: true,
      authenticated: false,
      needsBlock: false,
      registrationNextStep: null,
    });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  try {
    const status = await getOnboardingStatus(sb, userId);
    return NextResponse.json({
      ok: true,
      authenticated: true,
      needsBlock: !status.addressComplete,
      phoneVerified: status.phoneVerified,
      registrationNextStep: status.registrationNextStep,
    });
  } catch (e) {
    console.error("[mandatory-address-gate]", e);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}
