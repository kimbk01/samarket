"use client";

/**
 * Canonical Community home surface — First HTML = Hydration = Warm Tab DOM.
 *
 * AUTHORITY: route pages (`/`, `/philife`, `/community`) only.
 * DO NOT: InstantMainTabEnterPanel / KeepAlive host 에서 이 Surface 재생성.
 * DO NOT: CommunityUiScope 를 PhilifeFeedClientEntry / useEffect 로 추가.
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
