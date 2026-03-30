import Link from "next/link";
import { redirect } from "next/navigation";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { CommunityMyHubClient } from "@/components/community/CommunityMyHubClient";
import { TradePrimaryColumnStickyAppBar } from "@/components/layout/TradePrimaryColumnStickyAppBar";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";

export default async function PhilifeMyPage() {
  const uid = await getOptionalAuthenticatedUserId();
  if (!uid) redirect("/login?next=/philife/my");

  return (
    <div className="min-h-screen bg-[#f3f4f6] pb-24">
      <TradePrimaryColumnStickyAppBar title="내 커뮤니티 활동" backButtonProps={{ backHref: "/philife" }} />
      <div className={`${APP_MAIN_GUTTER_X_CLASS} pt-3`}>
        <p className="text-[13px] text-gray-600">
          작성 글·참여 오픈채팅은 피드에서 확인하거나 아래에서 빠르게 이동할 수 있어요.
        </p>
        <CommunityMyHubClient userId={uid} />
        <Link href="/philife" className="mt-6 inline-block text-[14px] text-sky-700 underline">
          커뮤니티 피드로
        </Link>
      </div>
    </div>
  );
}
