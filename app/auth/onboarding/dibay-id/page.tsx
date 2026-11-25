import { redirect } from "next/navigation";
import { resolveRegistrationReturnPath } from "@/lib/auth/dibay-registration-steps";
import { deriveDibaySignupStatus, resolveDibaySignupRoute } from "@/lib/auth/dibay-signup-status";
import { hasStoreTermsConsent } from "@/lib/auth/store-member-policy";
import { resolveRequiredConsentVersions } from "@/lib/legal/resolve-required-consent-versions";
import { fetchProfileRowSafe } from "@/lib/profile/fetch-profile-row-safe";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { MYPAGE_PROFILE_EDIT_HREF } from "@/lib/mypage/mypage-mobile-nav-registry";

/** 돌아갈 화면 — 가입 흐름 단일 판정 · 전체 감사 A3·A5 */
const safeNext = resolveRegistrationReturnPath;

/** 레거시 @id 온보딩 — 내정보 프로필 편집으로 위임 */
export default async function AuthOnboardingDibayIdPage({
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
    if (!hasStoreTermsConsent(profile, required)) {
      redirect(
        resolveDibaySignupRoute(
          deriveDibaySignupStatus(profile ?? undefined, { hasSession: true, requiredConsent: required }),
          next,
        ),
      );
    }
  }
  const qs = new URLSearchParams({ required: "dibay_id", next });
  redirect(`${MYPAGE_PROFILE_EDIT_HREF}?${qs.toString()}`);
}
