import { redirect } from "next/navigation";
import { deriveDibaySignupStatus, resolveDibaySignupRoute } from "@/lib/auth/dibay-signup-status";
import { hasStoreTermsConsent } from "@/lib/auth/store-member-policy";
import { fetchProfileRowSafe } from "@/lib/profile/fetch-profile-row-safe";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { MYPAGE_PROFILE_EDIT_HREF } from "@/lib/mypage/mypage-mobile-nav-registry";

function safeNext(input: string | string[] | undefined): string {
  const raw = Array.isArray(input) ? input[0] : input;
  const next = typeof raw === "string" ? raw.trim() : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/philife";
}

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
    const profile = await fetchProfileRowSafe(readSb, user.id);
    if (!hasStoreTermsConsent(profile)) {
      redirect(resolveDibaySignupRoute(deriveDibaySignupStatus(profile ?? undefined, { hasSession: true }), next));
    }
  }
  const qs = new URLSearchParams({ required: "dibay_id", next });
  redirect(`${MYPAGE_PROFILE_EDIT_HREF}?${qs.toString()}`);
}
