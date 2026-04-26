import { NextRequest } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { ensureAuthProfileRow } from "@/lib/auth/member-access";
import { jsonError, jsonOk } from "@/lib/http/api-route";
import { fetchProfileRowSafe } from "@/lib/profile/fetch-profile-row-safe";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { STORE_PRIVACY_VERSION, STORE_TERMS_VERSION } from "@/lib/auth/store-member-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  const routeSb = await createSupabaseRouteHandlerClient();
  const readSb = tryCreateSupabaseServiceClient() ?? routeSb;
  if (!readSb) return jsonError("인증 설정이 준비되지 않았습니다.", 503, { code: "supabase_unconfigured" });
  const profile = await fetchProfileRowSafe(readSb, auth.userId);
  return jsonOk({
    consent: {
      termsAcceptedAt: profile?.terms_accepted_at ?? null,
      termsVersion: profile?.terms_version ?? null,
      privacyAcceptedAt: profile?.privacy_accepted_at ?? null,
      privacyVersion: profile?.privacy_version ?? null,
      requiredTermsVersion: STORE_TERMS_VERSION,
      requiredPrivacyVersion: STORE_PRIVACY_VERSION,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  const routeSb = await createSupabaseRouteHandlerClient();
  if (!routeSb) return jsonError("인증 설정이 준비되지 않았습니다.", 503, { code: "supabase_unconfigured" });
  let body: { agreeTerms?: boolean; agreePrivacy?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid_json", 400);
  }
  if (body.agreeTerms !== true || body.agreePrivacy !== true) {
    return jsonError("이용약관과 개인정보처리방침 동의가 필요합니다.", 400);
  }
  const {
    data: { user },
  } = await routeSb.auth.getUser();
  if (!user?.id || user.id !== auth.userId) {
    return jsonError("로그인이 필요합니다.", 401, { authenticated: false });
  }
  const sb = tryCreateSupabaseServiceClient() ?? routeSb;
  try {
    await ensureAuthProfileRow(sb, user);
  } catch {
    // 이미 프로필이 있거나 최소 row 생성이 다음 update 에서 검증된다.
  }
  const now = new Date().toISOString();
  const { data: updated, error } = await sb
    .from("profiles")
    .update({
      terms_accepted_at: now,
      terms_version: STORE_TERMS_VERSION,
      privacy_accepted_at: now,
      privacy_version: STORE_PRIVACY_VERSION,
      updated_at: now,
    })
    .eq("id", auth.userId)
    .select("id")
    .maybeSingle();
  if (error) {
    return jsonError(error.message || "consent_save_failed", 500);
  }
  if (!updated) {
    return jsonError("profile_missing_for_consent", 404, { code: "profile_missing_for_consent" });
  }
  return jsonOk({
    consent: {
      termsAcceptedAt: now,
      termsVersion: STORE_TERMS_VERSION,
      privacyAcceptedAt: now,
      privacyVersion: STORE_PRIVACY_VERSION,
    },
  });
}
