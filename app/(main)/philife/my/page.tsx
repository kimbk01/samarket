import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { CommunityMyHubClient } from "@/components/community/CommunityMyHubClient";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { TradePrimaryColumnStickyAppBar } from "@/components/layout/TradePrimaryColumnStickyAppBar";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";

export default function PhilifeMyPage() {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={5} />}>
      <PhilifeMyPageBody />
    </Suspense>
  );
}

async function PhilifeMyPageBody() {
  const uid = await getOptionalAuthenticatedUserId();
  if (!uid) return redirect("/login");

  return (
    <div className="min-h-screen bg-[#f3f4f6] pb-24">
      <TradePrimaryColumnStickyAppBar title="내 커뮤니티 활동" backButtonProps={{ backHref: "/philife" }} />
      <div className={`${APP_MAIN_GUTTER_X_CLASS} pt-3`}>
        <p className="text-[13px] text-sam-muted">
          작성 글과 참여 중인 모임은 피드에서 확인하거나 아래에서 빠르게 이동할 수 있어요.
        </p>
        <CommunityMyHubClient userId={uid} />
        <Link href="/philife" className="mt-6 inline-block text-[14px] text-sky-700 underline">
          커뮤니티 피드로
        </Link>
      </div>
    </div>
  );
}
