import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { isValidPhoneOtpCodeInput } from "@/lib/auth/phone-otp-contract";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { requireMemberConsent } from "@/lib/auth/require-member-consent.server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { enforcePhoneVerificationCheckQuota } from "@/lib/security/rate-limit-presets";
import { verifyPhoneOtpForUser } from "@/lib/auth/phone-otp-service";
import { syncPhoneVerifiedServerCache } from "@/lib/auth/phone-otp-server-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;
  /** F4 — OTP 는 동의 뒤 (C4 B6 · SG-06). 발송 한도·SMS 전에 거절 */
  const consentDenied = await requireMemberConsent(auth.userId);
  if (consentDenied) return consentDenied;

  const quota = await enforcePhoneVerificationCheckQuota(auth.userId);
  if (!quota.ok) return quota.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured", code: "supabase_unconfigured" }, { status: 503 });
  }

  let body: { phone?: string; otp?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "invalid_json" }, { status: 400 });
  }

  const otp = String(body.otp ?? "").trim();
  if (!isValidPhoneOtpCodeInput(otp)) {
    return NextResponse.json(
      { ok: false, error: "otp_invalid", code: "otp_invalid" },
      { status: 400 },
    );
  }

  const result = await verifyPhoneOtpForUser(
    sb,
    auth.userId,
    String(body.phone ?? ""),
    otp,
  );
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, code: result.code, message: result.message },
      { status: result.status },
    );
  }
  await syncPhoneVerifiedServerCache(auth.userId);
  return NextResponse.json({
    ok: true,
    phone: result.data.phone,
    member_status: result.data.member_status,
    phone_verified: result.data.phone_verified,
    phone_verification_status: "verified",
  });
}
