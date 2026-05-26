import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { ProfileEditForm } from "@/components/my/edit/ProfileEditForm";
import { buildMypageItemHref } from "@/lib/mypage/mypage-mobile-nav-registry";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";

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

  return <ProfileEditForm backHref={backHref} />;
}
