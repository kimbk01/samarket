import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  PHONE_VERIFICATION_REQUIRED_MESSAGE,
  canUseVerifiedMemberFeatures,
  loadMemberAccessState,
} from "@/lib/auth/member-access";
import { normalizePhMobileDb, PH_LOCAL_MOBILE_RULE_MESSAGE_KO } from "@/lib/utils/ph-mobile";
import { enforcePhoneVerificationPatchQuota } from "@/lib/security/rate-limit-presets";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
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
      /** SMS 미완료여도 OAuth·관리자 수동 정식 회원이면 빈 문자열(불필요한 경고 억제) */
      help_text: fullMemberAccessOk ? "" : PHONE_VERIFICATION_REQUIRED_MESSAGE,
      /** Google·카카오·애플·이메일 가입자의 이용 조건과 동일(관리자 수동 입력 포함) */
      full_member_access_ok: fullMemberAccessOk,
    },
  });
}

type PatchBody = {
  phone?: string;
  nickname?: string;
};

export async function PATCH(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;

  const phoneRl = await enforcePhoneVerificationPatchQuota(auth.userId);
  if (!phoneRl.ok) return phoneRl.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_service_unconfigured" }, { status: 503 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const normalizedPhone = normalizePhMobileDb(String(body.phone ?? "").trim());
  const nickname = String(body.nickname ?? "").trim();
  if (!normalizedPhone) {
    return NextResponse.json({ ok: false, error: PH_LOCAL_MOBILE_RULE_MESSAGE_KO }, { status: 400 });
  }
  if (!nickname) {
    return NextResponse.json({ ok: false, error: "닉네임을 입력해 주세요." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    phone: normalizedPhone,
    nickname,
    phone_verified: false,
    phone_verification_status: "pending",
    phone_verification_requested_at: new Date().toISOString(),
    preferred_country: "PH",
  };
  const { error } = await sb.from("profiles").upsert({
    id: auth.userId,
    ...patch,
  });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message || "save_failed" }, { status: 500 });
  }

  await sb
    .from("test_users")
    .update({
      display_name: nickname,
      contact_phone: normalizedPhone,
    })
    .eq("id", auth.userId);

  const nextState = await loadMemberAccessState(sb, auth.userId);
  const fullMemberAccessOk = canUseVerifiedMemberFeatures(nextState);

  return NextResponse.json({
    ok: true,
    verification: {
      phone: normalizedPhone,
      phone_verified: false,
      phone_verification_status: "pending",
      nickname,
      help_text: fullMemberAccessOk ? "" : PHONE_VERIFICATION_REQUIRED_MESSAGE,
      full_member_access_ok: fullMemberAccessOk,
    },
  });
}
