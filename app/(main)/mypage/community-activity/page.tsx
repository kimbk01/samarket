import { Suspense } from "react";
import {
  ActivitySkeleton,
  CommunityActivityHubView,
  type CommunityActivityInitial,
} from "@/components/mypage/community-activity/CommunityActivityHubView";
import { MypageCommunityActivityChrome } from "@/components/mypage/community-activity/MypageCommunityActivityChrome";
import { MypageCommunityActivityGuestPanel } from "@/components/mypage/community-activity/MypageCommunityActivityGuestPanel";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import { loadCommunityActivityTabPageServer } from "@/lib/mypage/community-activity-load-server";
import {
  parseCommunityActivityHubTab,
  type CommunityActivityHubTabId,
} from "@/lib/mypage/community-activity-types";
import { MYPAGE_LIST_PAGE_DEFAULT } from "@/lib/mypage/mypage-list-cursor";

type PageProps = { searchParams: Promise<{ tab?: string | string[] }> };

function parseTab(raw: string | string[] | undefined): CommunityActivityHubTabId {
  return parseCommunityActivityHubTab(Array.isArray(raw) ? raw[0] : raw) ?? "comments";
}

/**
 * 댓글·반응 (최종 설계 S27) — 첫 화면 RSC 는 URL 탭(기본 댓글) 첫 페이지 1회만(5테이블 전부 읽지 않음).
 * RSC 조회 실패는 페이지 오류 경계 대신 클라이언트 오류+재시도.
 */
export default function MypageCommunityActivityPage({ searchParams }: PageProps) {
  return (
    <Suspense
      fallback={
        <MypageCommunityActivityChrome>
          <ActivitySkeleton tab="comments" />
        </MypageCommunityActivityChrome>
      }
    >
      <MypageCommunityActivityPageBody searchParams={searchParams} />
    </Suspense>
  );
}

async function MypageCommunityActivityPageBody({ searchParams }: PageProps) {
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

  let initial: CommunityActivityInitial;
  try {
    const page = await loadCommunityActivityTabPageServer(uid, {
      tab: initialTab,
      limit: MYPAGE_LIST_PAGE_DEFAULT,
      cursor: null,
    });
    initial = { ok: true, tab: page.tab, items: page.items, next_cursor: page.next_cursor };
  } catch {
    initial = { ok: false, tab: initialTab };
  }

  return (
    <MypageCommunityActivityChrome>
      <CommunityActivityHubView viewerId={uid} initial={initial} />
    </MypageCommunityActivityChrome>
  );
}
