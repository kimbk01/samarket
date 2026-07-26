/**
 * Canonical Community home surface — Cold Boot Cache-First 계약.
 *
 * AUTHORITY: `/` · `/philife` · `/community` 가 이 entry 만 렌더한다.
 * UI chrome: `PhilifeFeedClientEntry` → `CommunityUiScope` (`data-community-ui`)
 * + feed list → canonical rounded post card classes (첨부 2).
 *
 * DO NOT: page별로 Feed/Header/category 를 다시 조립.
 * DO NOT: Suspense + RSC await 로 첫 paint 차단.
 * DO NOT: MainFeedRouteLoading / CommunityFeedSkeleton cold fallback.
 * DO NOT: philife layout 에만 토큰 스코프를 두어 Cold `/` 에서 각진 카드(첨부 1)를 허용.
 * Feed first paint = persistent cache (CommunityFeed useLayoutEffect) → background network patch
 * (cache·network 동일 renderer).
 */
import { PhilifeFeedClientEntry } from "@/components/community/PhilifeFeedClientEntry";

export function CommunityHomeSurface() {
  return <PhilifeFeedClientEntry />;
}

/** @deprecated Use `CommunityHomeSurface` — kept as alias for existing imports during rename. */
export const PhilifeHomeFeedPage = CommunityHomeSurface;
