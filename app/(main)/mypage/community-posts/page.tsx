import Link from "next/link";
import { Suspense } from "react";
import { CommunityPostCard } from "@/components/community/CommunityPostCard";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { listCommunityPostsForUser } from "@/lib/community-feed/queries";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { PHILIFE_FB_CARD_CLASS } from "@/lib/philife/philife-flat-ui-classes";

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
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title="내 활동"
        subtitle="내가 남긴 커뮤니티 글"
        backHref="/mypage"
        hideCtaStrip
      />

      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
        <div className="flex min-w-0 flex-col gap-1 py-4">
        {!uid ? (
          <div className={`${PHILIFE_FB_CARD_CLASS} sam-card-pad py-8 text-center sam-text-body text-sam-muted`}>
            로그인 후 내 활동을 확인할 수 있어요.
            <div className="mt-4">
              <Link href="/login" className="font-medium text-sam-primary hover:underline">
                로그인
              </Link>
            </div>
          </div>
        ) : posts.length === 0 ? (
          <p className={`${PHILIFE_FB_CARD_CLASS} sam-card-pad py-12 text-center sam-text-body text-sam-muted`}>
            아직 남긴 활동이 없어요.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {posts.map((p) => (
              <CommunityPostCard key={p.id} post={p} />
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
