import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { deriveDibaySignupStatus, resolveDibaySignupRoute } from "@/lib/auth/dibay-signup-status";
import { getOnboardingStatus } from "@/lib/auth/get-onboarding-status";
import { jsonError, jsonOk } from "@/lib/http/api-route";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;

  const routeSb = await createSupabaseRouteHandlerClient();
  const readSb = tryCreateSupabaseServiceClient() ?? routeSb;
  if (!readSb) {
    return jsonError("인증 설정이 준비되지 않았습니다.", 503, { code: "supabase_unconfigured" });
  }

  try {
    const onboarding = await getOnboardingStatus(readSb, auth.userId);
    const signup = deriveDibaySignupStatus(
      {
        id: auth.userId,
        dibay_id: onboarding.dibayId,
        dibay_id_locked: onboarding.dibayIdLocked,
        username: onboarding.username,
        username_confirmed: onboarding.usernameConfirmed,
        terms_accepted_at: onboarding.termsAcceptedAt,
        terms_version: onboarding.termsVersion,
        privacy_accepted_at: onboarding.privacyAcceptedAt,
        privacy_version: onboarding.privacyVersion,
        onboarding_completed_at: onboarding.onboardingCompletedAt,
        onboarding_status: onboarding.onboardingStatus,
        role: onboarding.isPrivilegedAdmin ? "admin" : "user",
      },
      { hasSession: true }
    );
    return jsonOk({
      signup,
      route: resolveDibaySignupRoute(signup, null),
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "signup_status_failed", 500);
  }
}
