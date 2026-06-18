import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { ProfileEditForm } from "@/components/my/edit/ProfileEditForm";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { MYPAGE_MAIN_HREF } from "@/lib/my/mypage-info-hub";

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
    notFound();
  }

  return <ProfileEditForm backHref={MYPAGE_MAIN_HREF} />;
}
