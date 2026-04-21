import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { CommunityMyHubClient } from "@/components/community/CommunityMyHubClient";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { AppTopHeader } from "@/components/app-shell";
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
    <div className="min-h-screen bg-sam-app pb-24">
      <AppTopHeader title="내 커뮤니티 활동" backButtonProps={{ backHref: "/philife" }} shellVariant="flat" />
      <div className={`${APP_MAIN_GUTTER_X_CLASS} pt-3`}>
        <p className="sam-text-body-secondary">
          작성 글과 참여 중인 모임은 피드에서 확인하거나 아래에서 빠르게 이동할 수 있어요.
        </p>
        <CommunityMyHubClient userId={uid} />
        <Link
          href="/philife"
          className="sam-text-body-secondary mt-6 inline-block font-medium text-signature underline underline-offset-2"
        >
          커뮤니티 피드로
        </Link>
      </div>
    </div>
  );
}
