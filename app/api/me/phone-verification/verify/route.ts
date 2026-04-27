import { NextRequest } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { jsonError, jsonOk } from "@/lib/http/api-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { enforcePhoneVerificationCheckQuota } from "@/lib/security/rate-limit-presets";
import { verifyPhoneOtpForUser } from "@/lib/auth/phone-otp-service";

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
  const inputPhone = String(body.phone ?? "").trim();
  const code = String(body.code ?? "").trim();
  const nickname = String(body.nickname ?? "").trim().slice(0, 20);
  if (!code || code.length < 4) {
    return jsonError("인증번호를 입력해 주세요.", 400);
  }
  const verified = await verifyPhoneOtpForUser(sb, auth.userId, inputPhone, code);
  if (!verified.ok) {
    return jsonError(verified.message, verified.status);
  }
  const normalizedPhone = verified.data.phone;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    ...(nickname ? { nickname } : {}),
    phone_country_code: "+63",
    phone_number: normalizedPhone.replace(/^\+63/, ""),
    phone_verification_status: "verified",
    phone_verification_method: verified.data.verification_method,
    preferred_country: "PH",
    updated_at: now,
  };
  const { error } = await sb.from("profiles").update(patch).eq("id", auth.userId);
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
