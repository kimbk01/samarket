import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { ProfileEditForm } from "@/components/my/edit/ProfileEditForm";
import { buildMypageItemHref } from "@/lib/mypage/mypage-mobile-nav-registry";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { ProfileEditHeader } from "@/components/my/edit/ui/ProfileEditHeader";
import { PROFILE_EDIT_FORM_ID } from "@/components/my/edit/ProfileEditForm";

export default function MypageSectionProfileEditPage({
  params,
}: {
  params: Promise<{ section: string; item: string }>;
}) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={4} />}>
      <MypageSectionProfileEditPageBody params={params} />
    </Suspense>
  );
}

async function MypageSectionProfileEditPageBody({
  params,
}: {
  params: Promise<{ section: string; item: string }>;
}) {
  const { section, item } = await params;
  if (section !== "account" || item !== "profile") {
    notFound();
  }

  const userId = await getRouteUserId();
  if (!userId) {
    return redirect("/login");
  }

  const backHref = buildMypageItemHref("account", "profile");

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <ProfileEditHeader backHref={backHref} formId={PROFILE_EDIT_FORM_ID} />
      <div className={`${APP_MAIN_TAB_SCROLL_BODY_CLASS} py-4`}>
        <ProfileEditForm />
      </div>
    </div>
  );
}
