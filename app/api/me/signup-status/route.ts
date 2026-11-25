import { NextRequest } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { deriveDibaySignupStatus } from "@/lib/auth/dibay-signup-status";
import { resolvePostLoginRoute } from "@/lib/auth/resolve-post-login-route";
import { getOnboardingStatus } from "@/lib/auth/get-onboarding-status";
import { RequiredConsentVersionsUnavailableError } from "@/lib/legal/resolve-required-consent-versions";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";
import { jsonError, jsonOk } from "@/lib/http/api-route";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;

  const safeNext = sanitizeNextPath(req.nextUrl.searchParams.get("next"));

  const routeSb = await createSupabaseRouteHandlerClient();
  const readSb = tryCreateSupabaseServiceClient() ?? routeSb;
  if (!readSb) {
    return jsonError("인증 설정이 준비되지 않았습니다.", 503, { code: "supabase_unconfigured" });
  }

  try {
    const onboarding = await getOnboardingStatus(readSb, auth.userId, { strictConsentVersions: true });
    const signup = deriveDibaySignupStatus(
      {
        id: auth.userId,
        dibay_id: onboarding.dibayId,
        dibay_id_locked: onboarding.dibayIdLocked,
        username: onboarding.username,
        username_confirmed: onboarding.usernameConfirmed,
        display_name: onboarding.displayName,
        avatar_url: onboarding.avatarUrl,
        terms_accepted_at: onboarding.termsAcceptedAt,
        terms_version: onboarding.termsVersion,
        privacy_accepted_at: onboarding.privacyAcceptedAt,
        privacy_version: onboarding.privacyVersion,
        onboarding_completed_at: onboarding.onboardingCompletedAt,
        onboarding_status: onboarding.onboardingStatus,
        role: onboarding.isPrivilegedAdmin ? "admin" : "user",
      },
      // B11: same CMS versions as getOnboardingStatus — never STORE_* alone.
      // P2-3: admin 판정은 membership verdict (getOnboardingStatus.isPrivilegedAdmin).
      {
        hasSession: true,
        privilegedAdmin: onboarding.isPrivilegedAdmin === true,
        requiredConsent: onboarding.requiredConsent ?? null,
      }
    );
    return jsonOk({
      signup,
      /** 가입 완료 = 동의 + 전화 인증 + 대표 주소 (`dibay-registration-steps`) */
      registration: {
        complete: onboarding.registrationComplete,
        nextStep: onboarding.registrationNextStep,
      },
      /** 동의 미완 → 동의 화면 · 가입 미완 → 빠진 단계 화면 · 완료 → next (로그인 목적지와 같은 함수) */
      route: resolvePostLoginRoute({
        hasSession: true,
        status: onboarding,
        next: safeNext,
        inSession: req.nextUrl.searchParams.get("scope") === "session",
      }),
      requiredConsent: onboarding.requiredConsent ?? null,
    });
  } catch (error) {
    /** 필수 약관 버전을 모름 — 판정하지 않음(클라이언트 관문은 재시도, 이동 없음) · 가입 후속 감사 B10 */
    if (error instanceof RequiredConsentVersionsUnavailableError) {
      return jsonError("consent_versions_unavailable", 503, { code: "consent_versions_unavailable" });
    }
    return jsonError(error instanceof Error ? error.message : "signup_status_failed", 500);
  }
}
