import { Suspense } from "react";
import { CommunityActivityHubView } from "@/components/mypage/community-activity/CommunityActivityHubView";
import { MypageCommunityActivityChrome } from "@/components/mypage/community-activity/MypageCommunityActivityChrome";
import { MypageCommunityActivityGuestPanel } from "@/components/mypage/community-activity/MypageCommunityActivityGuestPanel";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { loadCommunityActivityHubServer } from "@/lib/mypage/community-activity-load-server";
import type { CommunityActivityHubTabId } from "@/lib/mypage/community-activity-types";

function parseTab(raw: string | undefined): CommunityActivityHubTabId {
  if (raw === "reactions" || raw === "reports") return raw;
  return "comments";
}

export default function MypageCommunityActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={6} />}>
      <MypageCommunityActivityPageBody searchParams={searchParams} />
    </Suspense>
  );
}

async function MypageCommunityActivityPageBody({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const uid = await getOptionalAuthenticatedUserId();
  const { tab: tabRaw } = await searchParams;
  const initialTab = parseTab(tabRaw);

  if (!uid) {
    return (
      <MypageCommunityActivityChrome>
        <MypageCommunityActivityGuestPanel />
      </MypageCommunityActivityChrome>
    );
  }

  const initialData = await loadCommunityActivityHubServer(uid);

  return (
    <MypageCommunityActivityChrome>
      <CommunityActivityHubView initialData={initialData} initialTab={initialTab} />
    </MypageCommunityActivityChrome>
  );
}
