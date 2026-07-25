/**
 * Philife 홈 피드 — Cold Boot Cache-First 계약.
 *
 * DO NOT: Suspense + RSC await 로 첫 paint 차단.
 * DO NOT: MainFeedRouteLoading / CommunityFeedSkeleton cold fallback.
 * Feed first paint = persistent cache (CommunityFeed useLayoutEffect) → background network patch.
 */
import { PhilifeFeedClientEntry } from "@/components/community/PhilifeFeedClientEntry";

export function PhilifeHomeFeedPage() {
  return <PhilifeFeedClientEntry />;
}
