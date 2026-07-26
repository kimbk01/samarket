"use client";

/**
 * Canonical Community home surface — First HTML = Hydration = Warm Tab DOM.
 *
 * AUTHORITY (single instance via MainTabSurfaceKeepAlive after hydrate):
 * - `CommunityUiScope` (`data-community-ui`) 는 **이 파일**이 소유 — Client Entry 안에 두지 않음.
 * - `/` · `/philife` · `/community` share one keep-alive Surface — Instant enter panel 금지.
 *
 * DO NOT: page별 Feed 재조립 · Suspense skeleton cold · layout 에만 토큰 스코프.
 * DO NOT: CommunityUiScope 를 PhilifeFeedClientEntry / useEffect 로 추가.
 * DO NOT: MainShellTabContentTransition / InstantMainTabEnterPanel 에서 이 Surface 재생성.
 * Feed data: `resolveInitialCommunityFeedSnapshot` (Cold=Warm) → CommunityFeed row patch.
 */
import { CommunityUiScope } from "@/components/community/CommunityUiScope";
import { PhilifeFeedClientEntry } from "@/components/community/PhilifeFeedClientEntry";

export function CommunityHomeSurface() {
  return (
    <CommunityUiScope>
      <PhilifeFeedClientEntry />
    </CommunityUiScope>
  );
}

/** @deprecated Use `CommunityHomeSurface` — kept as alias for existing imports during rename. */
export const PhilifeHomeFeedPage = CommunityHomeSurface;
