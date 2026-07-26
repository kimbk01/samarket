/**
 * Canonical Community home surface — First HTML = Hydration = Warm Tab DOM.
 *
 * AUTHORITY (server-visible root):
 * - `CommunityUiScope` (`data-community-ui`) 는 **이 파일**이 소유 — Client Entry 안에 두지 않음.
 * - `/` · `/philife` · `/community` · InstantMainTabEnter 가 동일 surface contract.
 *
 * DO NOT: page별 Feed 재조립 · Suspense skeleton cold · layout 에만 토큰 스코프.
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
