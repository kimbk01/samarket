"use client";

import { useCallback, useMemo, useState } from "react";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import type { ShareSheetEvent } from "@/lib/share/platform-share";
import { logCommunityShareEvent } from "./community-share-analytics";
import { buildCommunityPostShareCardData, buildCommunityPostShareNativePayload } from "./community-share-payload";

/**
 * FEED 상세 공유 — 통합 공유 시트(`DibayShareSheet`)에 넘길 값만 만든다 (S3).
 * 실행·결과 계약(취소 무반응·실패 시 자동 복사 없음)은 시트·`lib/share/platform-share.ts` 가 갖는다.
 */
export function useCommunityPostShare(post: NeighborhoodFeedPostDTO, categoryLabel?: string) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const card = useMemo(() => buildCommunityPostShareCardData(post, categoryLabel), [post, categoryLabel]);
  const nativePayload = useMemo(() => buildCommunityPostShareNativePayload(card), [card]);

  const openSheet = useCallback(() => {
    setSheetOpen(true);
    logCommunityShareEvent("community_share_sheet_open", { postId: card.postId, result: "open" });
  }, [card.postId]);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
  }, []);

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

  return {
    sheetOpen,
    openSheet,
    closeSheet,
    card,
    nativePayload,
    onShareEvent,
  };
}

export type UseCommunityPostShareReturn = ReturnType<typeof useCommunityPostShare>;
