import { AuthConsentForm } from "@/components/auth/AuthConsentForm";
import { ConsentVersionsUnavailable } from "@/components/auth/ConsentVersionsUnavailable";
import { hasStoreTermsConsent } from "@/lib/auth/store-member-policy";
import { getOnboardingStatus } from "@/lib/auth/get-onboarding-status";
import { resolvePostLoginRoute } from "@/lib/auth/resolve-post-login-route";
import { resolveRequiredConsentVersionsStrict } from "@/lib/legal/resolve-required-consent-versions";
import { loadMarketingConsentDoc, readMemberMarketingConsent } from "@/lib/legal/marketing-consent.server";
import { hasAgeGateConsent } from "@/lib/legal/member-age-gate";
import { readMemberAgeGateState } from "@/lib/legal/member-age-gate-legacy.server";
import { fetchProfileRowSafe } from "@/lib/profile/fetch-profile-row-safe";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { redirect } from "next/navigation";
import { REGISTRATION_DONE_DEFAULT_PATH, resolveRegistrationReturnPath } from "@/lib/auth/dibay-registration-steps";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";

/** 돌아갈 화면 — 가입 흐름 단일 판정(외부 이동·자기 자신·단계 화면 거부, 없으면 홈) · 전체 감사 A3·A5 */
const safeNext = resolveRegistrationReturnPath;

export default async function AuthOnboardingTermsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const routeSb = await createSupabaseRouteHandlerClient();
  const {
    data: { user },
  } = routeSb ? await routeSb.auth.getUser() : { data: { user: null } };
  if (!user?.id) {
    redirect("/login");
  }
  const readSb = tryCreateSupabaseServiceClient() ?? routeSb;
  /**
   * 필수 약관 버전을 모르면 기본 버전으로 동의 화면을 그리지 않는다 — 저장(PATCH)이 503 이라 빠져나올 수 없게 된다(가입 후속 감사 B10).
   * [다시 시도] = 화면 전체 새로 받기(`ConsentVersionsUnavailable`).
   */
  const [required, marketingDoc] = await Promise.all([
    resolveRequiredConsentVersionsStrict().catch(() => null),
    loadMarketingConsentDoc(),
  ]);
  if (!required) return <ConsentVersionsUnavailable />;
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
  let next: string = safeNext(params.next);
  if (readSb) {
    const [profile, ageState] = await Promise.all([
      fetchProfileRowSafe(readSb, user.id),
      readMemberAgeGateState(readSb, user.id),
    ]);
    termsOk = hasStoreTermsConsent(profile, required);
    priorConsent = Boolean(profile?.terms_accepted_at);
    /** 돌려보낼 곳이 없으면 — 신규 가입은 앱 홈, 이미 가입한 회원의 재동의는 로그인 착지 `/mypage`(2026-11-25 후속 결정 1) */
    next = safeNext(params.next, priorConsent ? POST_LOGIN_PATH : REGISTRATION_DONE_DEFAULT_PATH);
    // Unreadable age state: no age section here — the save API re-reads and fails closed.
    ageOk = !ageState.ok || hasAgeGateConsent(ageState.fields);
    if (termsOk && ageOk) {
      // 동의 완료 — 가입 단계(전화·주소)가 남았으면 그 화면, 끝났으면 next (로그인 목적지와 같은 함수).
      const status = await getOnboardingStatus(readSb, user.id, { strictConsentVersions: true });
      // 화면 안 이동 — 403 복구(채팅방 등)에서 온 next 를 지우지 않는다(재감사 M1). 로그인 직후 next 는 서버 목적지가 이미 걸렀다.
      const target = status.registrationComplete
        ? next
        : resolvePostLoginRoute({ hasSession: true, status, next, inSession: true });
      /**
       * 같은 요청에서 판정이 엇갈리면(동의 확인은 완료인데 가입 상태 조회가 일시 실패해 「동의 필요」) 이 화면으로 다시 보내
       * 무한 반복이 된다(전체 감사 A3) — 이 화면 자신이 목적지면 이동하지 않고 화면을 그린다.
       */
      if ((target.split("?")[0] ?? target) !== "/auth/onboarding/terms") redirect(target);
    }
  }
  /**
   * 동의·나이 모두 확인됐는데 화면을 그리는 경우(위 자기 자신 목적지 — 일시 조회 실패)에는 「나이 확인」만 묻지 않고
   * 약관 다시 동의로 보인다(저장은 같은 값이라 무해 · 감사 검토 #4).
   */
  const consentGap =
    !termsOk && !ageOk ? "terms_privacy_and_age" : !termsOk || ageOk ? "terms_privacy" : "age";
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
