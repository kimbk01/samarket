import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { MyStateSkeleton } from "@/components/mypage/ds/MyStateView";
import { ProfileEditForm } from "@/components/my/edit/ProfileEditForm";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isProfileSetupMode } from "@/lib/auth/profile-setup-flow";
import { MYPAGE_MAIN_HREF } from "@/lib/my/mypage-info-hub";
import { MYPAGE_PROFILE_EDIT_SHEET_HREF } from "@/lib/mypage/mypage-profile-routes";

type SearchParams = Record<string, string | string[] | undefined>;

function toUrlSearchParams(sp: SearchParams): URLSearchParams {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") out.set(k, v);
    else if (Array.isArray(v) && typeof v[0] === "string") out.set(k, v[0]);
  }
  return out;
}

/**
 * `section/account/profile/edit` — `?setup=1`(로그인 직후 필수정보 온보딩)만 페이지로 남긴다.
 * 그 외 직접 진입은 홈 위 프로필 수정 시트(`/mypage?edit=profile`)로 HTTP 리다이렉트 (X1·S01).
 * 리다이렉트는 Suspense 밖에서 실행해 실제 HTTP 리다이렉트가 되게 한다.
 */
export default async function MypageSectionProfileEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string; item: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ section, item }, sp] = await Promise.all([params, searchParams]);
  if (section !== "account" || item !== "profile") {
    notFound();
  }
  if (!isProfileSetupMode(toUrlSearchParams(sp))) {
    redirect(MYPAGE_PROFILE_EDIT_SHEET_HREF);
  }

  return (
    <Suspense fallback={<MyStateSkeleton template="form" rows={4} />}>
      <MypageSectionProfileEditPageBody />
    </Suspense>
  );
}

async function MypageSectionProfileEditPageBody() {
  const userId = await getRouteUserId();
  if (!userId) {
    notFound();
  }

  return <ProfileEditForm backHref={MYPAGE_MAIN_HREF} />;
}
