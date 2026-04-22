"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { CommunityFeedSkeleton } from "@/components/community/CommunityFeedSkeleton";

const PhilifeFeedClient = dynamic(
  () => import("@/components/community/Feed").then((m) => ({ default: m.Feed })),
  {
    loading: () => <CommunityFeedSkeleton rows={5} />,
    /** 서버 RSC 에서 피드 트리를 돌리지 않음 — 첫 HTML·번들 경계만 먼저 */
    ssr: false,
  }
);

/**
 * `CommunityFeed` 가 `useSearchParams` 를 사용하므로 Suspense 경계 필수(Next: 훅 순서·서스펜스 불일치 방지).
 * dynamic loading 과 별도로 상위에서 감싼다.
 */
export function PhilifeFeedClientEntry() {
  return (
    <Suspense fallback={<CommunityFeedSkeleton rows={5} />}>
      <PhilifeFeedClient />
    </Suspense>
  );
}
