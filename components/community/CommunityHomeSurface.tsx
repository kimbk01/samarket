/**
 * Canonical Community home surface — First HTML = Hydration = Warm Tab DOM.
 *
 * AUTHORITY: server route pages (`/`, `/philife`, `/community`) only.
 * DO NOT: InstantMainTabEnterPanel / KeepAlive host 에서 이 Surface 재생성.
 * DO NOT: `"use client"` 경계를 올려 First HTML shell 을 client-only authority 로 변경.
 * DO NOT: CommunityUiScope 를 PhilifeFeedClientEntry / useEffect 로 추가.
 * Feed data: server seed 또는 hydration 후 layoutEffect persistent snapshot → row patch.
 *
 * FD5: hub feed mounts inside CommunityUiScope from LayoutMode. This surface
 * stays a server wrapper so First HTML still owns the scope attachment.
 */
import { CommunityUiScope } from "@/components/community/CommunityUiScope";

export function CommunityHomeSurface() {
  return <CommunityUiScope />;
}

/** @deprecated Use `CommunityHomeSurface` — kept as alias for existing imports during rename. */
export const PhilifeHomeFeedPage = CommunityHomeSurface;
