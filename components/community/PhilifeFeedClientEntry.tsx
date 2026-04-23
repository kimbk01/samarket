"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { CommunityFeedSkeleton } from "@/components/community/CommunityFeedSkeleton";
import type { PhilifeGlobalFeedInitialRsc } from "@/lib/philife/resolve-philife-global-feed-initial-rsc";

const PhilifeFeedClient = dynamic(
  () => import("@/components/community/Feed").then((m) => ({ default: m.Feed })),
  {
    loading: () => <CommunityFeedSkeleton rows={5} />,
    /**
     * `useSearchParams` 는 상위 `Suspense` 로 경계를 두고, SSR 첫 HTML 에도 셸·헤더·스켈레톤 분기가 내려가
     * `ssr:false` 때보다 청크 전용 공백 구간을 줄인다. RSC `initialGlobalFeed` 는 그대로 플라이트로 병합.
     */
    ssr: true,
  }
);

/**
 * `CommunityFeed` 가 `useSearchParams` 를 사용하므로 Suspense 경계 필수(Next: 훅 순서·서스펜스 불일치 방지).
 * dynamic loading 과 별도로 상위에서 감싼다.
 */
export function PhilifeFeedClientEntry({
  initialGlobalFeed = null,
}: {
  initialGlobalFeed?: PhilifeGlobalFeedInitialRsc | null;
}) {
  return (
    <Suspense fallback={<CommunityFeedSkeleton rows={5} />}>
      <PhilifeFeedClient initialGlobalFeedRsc={initialGlobalFeed} />
    </Suspense>
  );
}
