import { NextRequest } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { jsonError, jsonOk } from "@/lib/http/api-route";
import { canUseVerifiedMemberFeatures, loadMemberAccessState } from "@/lib/auth/member-access";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { enforcePhoneVerificationSendQuota } from "@/lib/security/rate-limit-presets";
import { STORE_PHONE_GATE_MESSAGE } from "@/lib/auth/store-member-policy";
import { sendPhoneOtpForUser } from "@/lib/auth/phone-otp-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return jsonError("supabase_service_unconfigured", 503);
  }
  const state = await loadMemberAccessState(sb, auth.userId);
  if (canUseVerifiedMemberFeatures(state)) {
    return jsonOk({
      verification: {
        phone: state.phone,
        phone_verified: state.phoneVerified,
        phone_verification_status: state.phoneVerificationStatus,
        nickname: state.nickname,
        help_text: "",
        full_member_access_ok: true,
      },
    });
  }
  const quota = await enforcePhoneVerificationSendQuota(auth.userId);
  if (!quota.ok) return quota.response;
  let body: { phone?: string; nickname?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid_json", 400);
  }
  const normalizedPhone = String(body.phone ?? "").trim();
  const nickname = String(body.nickname ?? "").trim().slice(0, 20);
  if (!nickname) {
    return jsonError("닉네임을 입력해 주세요.", 400);
  }
  const result = await sendPhoneOtpForUser(sb, auth.userId, normalizedPhone);
  if (!result.ok) {
    return jsonError(result.message, result.status);
  }
  const phone = result.data.phone;
  const now = new Date().toISOString();
  const { error } = await sb.from("profiles").update({
    nickname,
    phone,
    phone_country_code: "+63",
    phone_number: phone.replace(/^\+63/, ""),
    phone_verified: false,
    phone_verified_at: null,
    phone_verification_status: "pending",
    phone_verification_requested_at: now,
    preferred_country: "PH",
    updated_at: now,
  }).eq("id", auth.userId);
  if (error) {
    return jsonError(error.message || "phone_verification_send_failed", 500);
  }
  return jsonOk({
    verification: {
      phone,
      phone_verified: false,
      phone_verification_status: "pending",
      nickname,
      help_text: STORE_PHONE_GATE_MESSAGE,
      full_member_access_ok: false,
    },
  });
}
