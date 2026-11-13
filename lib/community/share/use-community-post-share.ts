"use client";

import { useCallback, useMemo } from "react";
import { useDibayShareSheet } from "@/components/share/use-dibay-share-sheet";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import type { ShareSheetEvent } from "@/lib/share/platform-share";
import { logCommunityShareEvent } from "./community-share-analytics";
import { buildCommunityPostShareCardData, buildCommunityPostShareNativePayload } from "./community-share-payload";

/**
 * FEED 상세 공유 — 머리글 공유 1곳(§N-3)이 부르는 `share()` 와 화면에 한 번 그릴 `shareSheet`.
 * 실행(기기 공유 창 바로 · 없으면 복사 시트)·결과 계약은 `useDibayShareSheet`·`lib/share/platform-share.ts` 가 갖는다.
 */
export function useCommunityPostShare(post: NeighborhoodFeedPostDTO, categoryLabel?: string) {
  const { openShare, shareSheet } = useDibayShareSheet();

  const card = useMemo(() => buildCommunityPostShareCardData(post, categoryLabel), [post, categoryLabel]);
  const nativePayload = useMemo(() => buildCommunityPostShareNativePayload(card), [card]);

  const onShareEvent = useCallback(
    (e: ShareSheetEvent) => {
      const postId = card.postId;
      if (e.channel === "copy") {
        logCommunityShareEvent(e.result === "copied" ? "community_share_success" : "community_share_error", {
          postId,
          platform: "copy",
          result: e.result,
        });
        return;
      }
      const event =
        e.result === "handed_off"
          ? "community_share_success"
          : e.result === "cancelled"
            ? "community_share_cancel"
            : "community_share_error";
      logCommunityShareEvent(event, { postId, platform: "native", result: e.result });
    },
    [card.postId]
  );

  const share = useCallback(() => {
    logCommunityShareEvent("community_share_sheet_open", { postId: card.postId, result: "open" });
    openShare({
      url: card.canonicalUrl,
      previewTitle: nativePayload.title,
      previewSubtitle: card.categoryName || undefined,
      previewImageUrl: card.thumbnailUrl,
      shareText: card.excerpt || undefined,
      onEvent: onShareEvent,
    });
  }, [card, nativePayload.title, onShareEvent, openShare]);

  return { share, shareSheet };
}
