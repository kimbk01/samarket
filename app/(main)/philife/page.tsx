import { Suspense } from "react";
import { PhilifeFeedClientEntry } from "@/components/community/PhilifeFeedClientEntry";

/**
 * Philife 글로벌 피드 — RSC `await` 제거 (네이티브급 탭 전환 체감).
 *
 * 이전 구조: page-level `await resolvePhilifeGlobalFeedInitialForRsc(...)` 가
 * 매 진입마다 Supabase 라운드트립을 발생시켜 dev/prod 모두에서
 * 라우트 전환에 대기 시간을 만들었다.
 *
 * 새 구조: 서버는 즉시 셸만 반환하고, 클라 `Feed` 컴포넌트가
 * `readPhilifeFeedCache` (sessionStorage) / 토픽 옵션 메모리 캐시 히트 시
 * 즉시 그리고, 미스이면 `/api/philife/neighborhood-feed` 1회 fetch.
 * URL `?category` / `?sort` 는 클라 `useSearchParams` 가 자체적으로 읽으므로
 * 서버에서 분기할 필요가 없다. 첫 방문은 하단 nav `pointerdown` prewarm 으로
 * 라우트 전환과 데이터 fetch 가 병렬 진행돼 체감 지연이 줄어든다.
 */
export default function PhilifePage() {
  return (
    <Suspense fallback={null}>
      <PhilifeFeedClientEntry />
    </Suspense>
  );
}
