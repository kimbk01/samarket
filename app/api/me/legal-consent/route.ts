import { NextRequest } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { validateActiveSession } from "@/lib/auth/server-guards";
import { jsonError, jsonOk } from "@/lib/http/api-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { STORE_PRIVACY_VERSION, STORE_TERMS_VERSION } from "@/lib/auth/store-member-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;
  return jsonOk({
    consent: {
      termsAcceptedAt: session.profile.terms_accepted_at ?? null,
      termsVersion: session.profile.terms_version ?? null,
      privacyAcceptedAt: session.profile.privacy_accepted_at ?? null,
      privacyVersion: session.profile.privacy_version ?? null,
      requiredTermsVersion: STORE_TERMS_VERSION,
      requiredPrivacyVersion: STORE_PRIVACY_VERSION,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return jsonError("supabase_service_unconfigured", 503);
  }
  let body: { agreeTerms?: boolean; agreePrivacy?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid_json", 400);
  }
  if (body.agreeTerms !== true || body.agreePrivacy !== true) {
    return jsonError("이용약관과 개인정보처리방침 동의가 필요합니다.", 400);
  }
  const now = new Date().toISOString();
  const { error } = await sb
    .from("profiles")
    .update({
      terms_accepted_at: now,
      terms_version: STORE_TERMS_VERSION,
      privacy_accepted_at: now,
      privacy_version: STORE_PRIVACY_VERSION,
      updated_at: now,
    })
    .eq("id", auth.userId);
  if (error) {
    return jsonError(error.message || "consent_save_failed", 500);
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
