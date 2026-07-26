/**
 * Canonical Community home surface — Cold Boot Cache-First 계약.
 *
 * AUTHORITY: `/` · `/philife` · `/community` 가 이 entry 만 렌더한다.
 * DO NOT: page별로 Feed/Header/category 를 다시 조립.
 * DO NOT: Suspense + RSC await 로 첫 paint 차단.
 * DO NOT: MainFeedRouteLoading / CommunityFeedSkeleton cold fallback.
 * Feed first paint = persistent cache (CommunityFeed useLayoutEffect) → background network patch.
 */
import { PhilifeFeedClientEntry } from "@/components/community/PhilifeFeedClientEntry";

export function CommunityHomeSurface() {
  return <PhilifeFeedClientEntry />;
}

/** @deprecated Use `CommunityHomeSurface` — kept as alias for existing imports during rename. */
export const PhilifeHomeFeedPage = CommunityHomeSurface;
