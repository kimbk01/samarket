import { AuthConsentForm } from "@/components/auth/AuthConsentForm";
import { hasStoreTermsConsent } from "@/lib/auth/store-member-policy";
import { resolveDibaySignupRoute, deriveDibaySignupStatus } from "@/lib/auth/dibay-signup-status";
import { resolveRequiredConsentVersions } from "@/lib/legal/resolve-required-consent-versions";
import { fetchProfileRowSafe } from "@/lib/profile/fetch-profile-row-safe";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { redirect } from "next/navigation";

function safeNext(input: string | string[] | undefined): string {
  const raw = Array.isArray(input) ? input[0] : input;
  const next = typeof raw === "string" ? raw.trim() : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/philife";
}

export default async function AuthOnboardingTermsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const next = safeNext(params.next);
  const routeSb = await createSupabaseRouteHandlerClient();
  const {
    data: { user },
  } = routeSb ? await routeSb.auth.getUser() : { data: { user: null } };
  if (!user?.id) {
    redirect("/login");
  }
  const readSb = tryCreateSupabaseServiceClient() ?? routeSb;
  if (readSb) {
    const [profile, required] = await Promise.all([
      fetchProfileRowSafe(readSb, user.id),
      resolveRequiredConsentVersions(),
    ]);
    if (hasStoreTermsConsent(profile, required)) {
      const signup = deriveDibaySignupStatus(profile ?? undefined, {
        hasSession: true,
        requiredConsent: required,
      });
      if (signup.signupComplete) {
        redirect(next);
      }
      redirect(resolveDibaySignupRoute(signup, next));
    }
  }
  return (
    <div className="min-h-screen bg-[#F2F0EB]">
      <AuthConsentForm />
    </div>
  );
}
