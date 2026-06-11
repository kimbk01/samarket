import { NextRequest } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { isValidPhoneOtpCodeInput } from "@/lib/auth/phone-otp-contract";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { jsonError, jsonOk } from "@/lib/http/api-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { enforcePhoneVerificationCheckQuota } from "@/lib/security/rate-limit-presets";
import { verifyPhoneOtpForUser } from "@/lib/auth/phone-otp-service";
import { patchProfileDisplayName, syncPhoneVerifiedServerCache } from "@/lib/auth/phone-otp-server-sync";

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
  let body: { phone?: string; code?: string; nickname?: string; display_name?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid_json", 400);
  }
  const inputPhone = String(body.phone ?? "").trim();
  const code = String(body.code ?? "").trim();
  const displayName = String(body.display_name ?? body.nickname ?? "").trim().slice(0, 20);
  if (!isValidPhoneOtpCodeInput(code)) {
    return jsonError("인증번호를 입력해 주세요.", 400);
  }
  const verified = await verifyPhoneOtpForUser(sb, auth.userId, inputPhone, code);
  if (!verified.ok) {
    return jsonError(verified.message, { status: verified.status, code: verified.code });
  }
  const namePatch = await patchProfileDisplayName(sb, auth.userId, displayName);
  if (!namePatch.ok) {
    return jsonError(namePatch.message, 500);
  }
  await syncPhoneVerifiedServerCache(auth.userId);
  return jsonOk({
    verification: {
      phone: verified.data.phone,
      phone_verified: true,
      phone_verification_status: "verified",
      nickname: displayName,
      full_member_access_ok: true,
    },
  });
}
