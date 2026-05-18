import { Suspense } from "react";
import { CommunityPostCard } from "@/components/community/CommunityPostCard";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { MypageCommunityPostsChrome } from "@/components/mypage/community/MypageCommunityPostsChrome";
import {
  MypageCommunityPostsEmpty,
  MypageCommunityPostsGuestPanel,
} from "@/components/mypage/community/MypageCommunityPostsGuestPanel";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { listCommunityPostsForUser } from "@/lib/community-feed/queries";
export default function MypageCommunityPostsPage() {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={6} />}>
      <MypageCommunityPostsPageBody />
    </Suspense>
  );
}

async function MypageCommunityPostsPageBody() {
  const uid = await getOptionalAuthenticatedUserId();
  const posts = uid ? await listCommunityPostsForUser(uid) : [];

  return (
    <MypageCommunityPostsChrome>
      {!uid ? (
        <MypageCommunityPostsGuestPanel />
      ) : posts.length === 0 ? (
        <MypageCommunityPostsEmpty />
      ) : (
        <div className="flex flex-col gap-1">
          {posts.map((p) => (
            <CommunityPostCard key={p.id} post={p} />
          ))}
        </div>
      )}
    </MypageCommunityPostsChrome>
  );
}
