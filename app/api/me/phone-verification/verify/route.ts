import { NextRequest } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { jsonError, jsonOk } from "@/lib/http/api-route";
import { checkTwilioVerificationCode } from "@/lib/auth/twilio-verify";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { enforcePhoneVerificationCheckQuota } from "@/lib/security/rate-limit-presets";
import { normalizePhMobileDb, PH_LOCAL_MOBILE_RULE_MESSAGE_KO } from "@/lib/utils/ph-mobile";

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
  const quota = await enforcePhoneVerificationCheckQuota(auth.userId);
  if (!quota.ok) return quota.response;
  let body: { phone?: string; code?: string; nickname?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid_json", 400);
  }
  const normalizedPhone = normalizePhMobileDb(String(body.phone ?? "").trim());
  const code = String(body.code ?? "").trim();
  const nickname = String(body.nickname ?? "").trim().slice(0, 20);
  if (!normalizedPhone) {
    return jsonError(PH_LOCAL_MOBILE_RULE_MESSAGE_KO, 400);
  }
  if (!code || code.length < 4) {
    return jsonError("인증번호를 입력해 주세요.", 400);
  }
  const verification = await checkTwilioVerificationCode(normalizedPhone, code);
  if (!verification.ok) {
    return jsonError(verification.error, verification.status);
  }
  if (verification.status !== "approved") {
    return jsonError("인증번호가 올바르지 않거나 만료되었습니다.", 400);
  }
  const now = new Date().toISOString();
  const { error } = await sb.from("profiles").upsert({
    id: auth.userId,
    ...(nickname ? { nickname } : {}),
    phone: normalizedPhone,
    phone_country_code: "+63",
    phone_number: normalizedPhone.replace(/^\+63/, ""),
    phone_verified: true,
    phone_verified_at: now,
    phone_verification_status: "verified",
    phone_verification_method: "twilio_verify",
    status: "active",
    member_status: "verified_member",
    preferred_country: "PH",
    updated_at: now,
  });
  if (error) {
    return jsonError(error.message || "phone_verification_verify_failed", 500);
  }
  return jsonOk({
    verification: {
      phone: normalizedPhone,
      phone_verified: true,
      phone_verification_status: "verified",
      nickname,
      full_member_access_ok: true,
    },
  });
}
