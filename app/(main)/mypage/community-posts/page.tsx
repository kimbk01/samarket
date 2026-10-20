import { Suspense } from "react";
import { MypageCommunityPostsChrome } from "@/components/mypage/community/MypageCommunityPostsChrome";
import { MypageCommunityPostsGuestPanel } from "@/components/mypage/community/MypageCommunityPostsGuestPanel";
import {
  MyCommunityPostsSkeleton,
  MypageCommunityPostsList,
  type OwnCommunityPostsInitial,
} from "@/components/mypage/community/MypageCommunityPostsList";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { listOwnCommunityPostsPage } from "@/lib/community-feed/list-community-posts-for-user";
import { MYPAGE_LIST_PAGE_DEFAULT } from "@/lib/mypage/mypage-list-cursor";

type PageProps = { searchParams: Promise<{ tab?: string | string[] }> };

/**
 * 내가 쓴 글 (최종 설계 S26) — 첫 화면은 RSC 로 URL 탭(기본 게시중) 첫 페이지 렌더, 탭 전환·더 보기는 클라이언트 A4.
 * 스켈레톤은 실제 행 모양(피드 스켈레톤 재사용 금지).
 */
export default function MypageCommunityPostsPage({ searchParams }: PageProps) {
  return (
    <Suspense
      fallback={
        <MypageCommunityPostsChrome>
          <MyCommunityPostsSkeleton />
        </MypageCommunityPostsChrome>
      }
    >
      <MypageCommunityPostsPageBody searchParams={searchParams} />
    </Suspense>
  );
}

async function MypageCommunityPostsPageBody({ searchParams }: PageProps) {
  const uid = await getOptionalAuthenticatedUserId();
  if (!uid) {
    return (
      <MypageCommunityPostsChrome>
        <MypageCommunityPostsGuestPanel />
      </MypageCommunityPostsChrome>
    );
  }
  const sp = await searchParams;
  const rawTab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const status = rawTab === "hidden" ? "hidden" : "active";
  const page = await listOwnCommunityPostsPage(uid, {
    status,
    limit: MYPAGE_LIST_PAGE_DEFAULT,
    cursor: null,
    withTotal: true,
  });
  const initial: OwnCommunityPostsInitial = page.ok
    ? { ok: true, status, posts: page.posts, next_cursor: page.next_cursor, ...(page.total != null ? { total: page.total } : {}) }
    : { ok: false, status };

  return (
    <MypageCommunityPostsChrome>
      <MypageCommunityPostsList viewerId={uid} initial={initial} />
    </MypageCommunityPostsChrome>
  );
}
