import { Suspense } from "react";
import { PhilifeFeedRscSeed } from "@/app/(main)/philife/PhilifeFeedRscSeed";

type PhilifePageProps = {
  searchParams: Promise<{ category?: string; sort?: string }>;
};

/**
 * Philife 글로벌 피드 — Suspense 스트리밍 RSC 시드.
 *
 * page-level blocking `await` 는 탭 전환 체감을 해치므로 쓰지 않는다.
 * 동기 page 는 Suspense 경계만 반환하고, `PhilifeFeedRscSeed` 가
 * `resolvePhilifeGlobalFeedInitialForRsc` 로 피드·주제 옵션을 스트리밍한다.
 * `CommunityFeed` 는 `initialGlobalFeedRsc` 로 첫 페인트부터 칩·목록을 그린다.
 * `loading.tsx`·Suspense fallback 은 `null` — 전면 스켈레톤 overlay 금지.
 */
export default function PhilifePage({ searchParams }: PhilifePageProps) {
  return (
    <Suspense fallback={null}>
      <PhilifeFeedRscSeed searchParamsPromise={searchParams} />
    </Suspense>
  );
}
