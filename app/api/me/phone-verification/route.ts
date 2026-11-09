import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  canUseVerifiedMemberFeatures,
  loadMemberAccessState,
} from "@/lib/auth/member-access";
import { STORE_PHONE_GATE_MESSAGE } from "@/lib/auth/store-member-policy";
import { loadAuthPhoneSettings } from "@/lib/auth/auth-phone-settings";
import { loadPendingPhoneOtpChallengeForUser } from "@/lib/auth/phone-otp-service";
import { resolveAvailableVerifyDialCodes } from "@/lib/phone/available-verify-countries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_service_unconfigured" }, { status: 503 });
  }
  const state = await loadMemberAccessState(sb, auth.userId);
  const fullMemberAccessOk = canUseVerifiedMemberFeatures(state);
  const phoneSettings = await loadAuthPhoneSettings();
  /** 아직 입력할 수 있는 인증번호 — 화면을 나갔다 와도 6칸 화면으로 이어서 입력 (Owner 2026-11-09) */
  const pendingChallenge = phoneSettings.enabled
    ? await loadPendingPhoneOtpChallengeForUser(sb, auth.userId, phoneSettings).catch(() => null)
    : null;
  return NextResponse.json({
    ok: true,
    verification: {
      phone: state.phone,
      phone_verified: state.phoneVerified,
      phone_verification_status: state.phoneVerificationStatus,
      display_name: state.nickname,
      nickname: state.nickname,
      help_text: fullMemberAccessOk ? "" : STORE_PHONE_GATE_MESSAGE,
      /** Google·카카오·네이버·이메일 가입자의 이용 조건과 동일(관리자 수동 입력 포함) */
      full_member_access_ok: fullMemberAccessOk,
      store_member_status: state.storeMemberStatus ?? "sns_member",
      consent_required: state.hasRequiredConsent === false,
      // 인증 가능한 국가번호 — +63(Semaphore) 항상, +82 는 Solapi 설정이 있을 때만 (Owner 2026-11-09).
      settings: { ...phoneSettings, country_dial_codes: resolveAvailableVerifyDialCodes() },
      pending_challenge: pendingChallenge,
    },
  });
}
