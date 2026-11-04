import { AuthConsentForm } from "@/components/auth/AuthConsentForm";
import { hasStoreTermsConsent } from "@/lib/auth/store-member-policy";
import { resolveDibaySignupRoute, deriveDibaySignupStatus } from "@/lib/auth/dibay-signup-status";
import { resolveRequiredConsentVersions } from "@/lib/legal/resolve-required-consent-versions";
import { loadMarketingConsentDoc, readMemberMarketingConsent } from "@/lib/legal/marketing-consent.server";
import { hasAgeGateConsent } from "@/lib/legal/member-age-gate";
import { readMemberAgeGateState } from "@/lib/legal/member-age-gate-legacy.server";
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
  const [required, marketingDoc] = await Promise.all([resolveRequiredConsentVersions(), loadMarketingConsentDoc()]);
  // 혜택·이벤트 선택 동의는 한 번도 기록이 없는 회원(신규 가입)에게만 — 약관 개정 재동의 때 기존 선택을 덮지 않는다.
  // 조회 오류면 **보여 준다**(확정 설계 B-14): 저장 API 가 다시 읽어 기록이 있으면 덮지 않는다. 숨기면 필수 동의만
  // 저장돼 이 회원에게 다시는 묻지 않게 된다.
  let askMarketing = false;
  if (readSb) {
    const read = await readMemberMarketingConsent(readSb, user.id);
    askMarketing = !read.ok || read.consent?.source == null;
  }
  let termsOk = false;
  let ageOk = false;
  let priorConsent = false;
  if (readSb) {
    const [profile, ageState] = await Promise.all([
      fetchProfileRowSafe(readSb, user.id),
      readMemberAgeGateState(readSb, user.id),
    ]);
    termsOk = hasStoreTermsConsent(profile, required);
    priorConsent = Boolean(profile?.terms_accepted_at);
    // Unreadable age state: no age section here — the save API re-reads and fails closed.
    ageOk = !ageState.ok || hasAgeGateConsent(ageState.fields);
    if (termsOk && ageOk) {
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
  const consentGap = !termsOk && !ageOk ? "terms_privacy_and_age" : !termsOk ? "terms_privacy" : "age";
  return (
    <div className="min-h-screen bg-sam-app">
      <AuthConsentForm
        requiredVersions={{ termsVersion: required.termsVersion, privacyVersion: required.privacyVersion }}
        marketing={askMarketing ? { version: marketingDoc.version, title: marketingDoc.title } : null}
        consentGap={consentGap}
        priorConsent={priorConsent}
      />
    </div>
  );
}
