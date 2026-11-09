import { NextRequest } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { enforceRateLimit, jsonError, jsonOk } from "@/lib/http/api-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  STORE_PHONE_VERIFY_PURPOSES,
  verifyStorePhoneOtp,
  type StorePhoneVerifyPurpose,
} from "@/lib/stores/store-phone-otp-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 매장 전화 인증번호 확인 → 인증 기록 id (신청·번호 변경 저장 때 이 id 로만 번호를 받는다). */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return jsonError("supabase_service_unconfigured", 503);

  const quota = await enforceRateLimit({
    key: `store_phone_verification_check:${auth.userId}`,
    limit: 20,
    windowMs: 3_600_000,
    message: "store_phone_otp_rate_limited",
    code: "store_phone_otp_rate_limited",
  });
  if (!quota.ok) return quota.response;

  let body: { phone?: unknown; code?: unknown; purpose?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid_json", 400);
  }
  const purpose = String(body.purpose ?? "") as StorePhoneVerifyPurpose;
  if (!STORE_PHONE_VERIFY_PURPOSES.includes(purpose)) return jsonError("invalid_purpose", 400);

  const r = await verifyStorePhoneOtp(sb, {
    userId: auth.userId,
    phone: String(body.phone ?? ""),
    code: String(body.code ?? ""),
    purpose,
  });
  if (!r.ok) return jsonError(r.code, { status: r.status, code: r.code });
  return jsonOk({ verificationId: r.data.verificationId, phone: r.data.phone, verifiedAt: r.data.verifiedAt });
}
