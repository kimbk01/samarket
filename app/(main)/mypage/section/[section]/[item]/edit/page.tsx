import { notFound, redirect } from "next/navigation";
import { ProfileEditForm } from "@/components/my/edit/ProfileEditForm";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { buildMypageItemHref } from "@/lib/mypage/mypage-mobile-nav-registry";
import { APP_MYPAGE_SUBPAGE_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";

export default async function MypageSectionProfileEditPage({
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
    redirect("/login");
  }

  const backHref = buildMypageItemHref("account", "profile");

  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title="프로필 수정"
        subtitle="닉네임, 사진, 프로필, 지역, 동네"
        backHref={backHref}
        hideCtaStrip
      />
      <div className={`${APP_MYPAGE_SUBPAGE_BODY_CLASS} py-4`}>
        <ProfileEditForm />
      </div>
    </div>
  );
}
