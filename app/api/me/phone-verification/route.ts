import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  canUseVerifiedMemberFeatures,
  loadMemberAccessState,
} from "@/lib/auth/member-access";
import { STORE_PHONE_GATE_MESSAGE } from "@/lib/auth/store-member-policy";

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
  return NextResponse.json({
    ok: true,
    verification: {
      phone: state.phone,
      phone_verified: state.phoneVerified,
      phone_verification_status: state.phoneVerificationStatus,
      nickname: state.nickname,
      help_text: fullMemberAccessOk ? "" : STORE_PHONE_GATE_MESSAGE,
      /** Google·카카오·네이버·이메일 가입자의 이용 조건과 동일(관리자 수동 입력 포함) */
      full_member_access_ok: fullMemberAccessOk,
      store_member_status: state.storeMemberStatus ?? "sns_member",
      consent_required: state.hasRequiredConsent === false,
    },
  });
}
