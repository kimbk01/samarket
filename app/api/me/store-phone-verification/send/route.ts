import { NextRequest } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { enforceRateLimit, jsonError, jsonOk } from "@/lib/http/api-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  sendStorePhoneOtp,
  STORE_PHONE_VERIFY_PURPOSES,
  type StorePhoneVerifyPurpose,
} from "@/lib/stores/store-phone-otp-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 매장 전화 전용 인증번호 보내기 (회원 전화 인증과 분리 — Owner 2026-11-10).
 * body: { phone, purpose: "store_apply" | "store_phone_change", storeId? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return jsonError("supabase_service_unconfigured", 503);

  const quota = await enforceRateLimit({
    key: `store_phone_verification_send:${auth.userId}`,
    limit: 8,
    windowMs: 3_600_000,
    message: "store_phone_otp_rate_limited",
    code: "store_phone_otp_rate_limited",
  });
  if (!quota.ok) return quota.response;

  let body: { phone?: unknown; purpose?: unknown; storeId?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid_json", 400);
  }
  const purpose = String(body.purpose ?? "") as StorePhoneVerifyPurpose;
  if (!STORE_PHONE_VERIFY_PURPOSES.includes(purpose)) return jsonError("invalid_purpose", 400);

  let storeId: string | null = null;
  if (purpose === "store_phone_change") {
    storeId = String(body.storeId ?? "").trim() || null;
    if (!storeId) return jsonError("store_id_required", 400);
    const { data: own, error } = await sb
      .from("stores")
      .select("id")
      .eq("id", storeId)
      .eq("owner_user_id", auth.userId)
      .maybeSingle();
    if (error) return jsonError("server_error", 500);
    if (!own) return jsonError("store_not_found", 404);
  }

  const r = await sendStorePhoneOtp(sb, {
    userId: auth.userId,
    phone: String(body.phone ?? ""),
    purpose,
    storeId,
  });
  if (!r.ok) {
    return jsonError(r.code, { status: r.status, code: r.code }, r.retryAfterSec != null ? { retryAfterSec: r.retryAfterSec } : {});
  }
  return jsonOk({ phone: r.data.phone, expiresAt: r.data.expiresAt, resendAvailableAt: r.data.resendAvailableAt });
}
