"use client";

/**
 * FEED 게시글 공유 — 통합 공유 시트(`DibayShareSheet`) 사용 (S3).
 * 노출 칸 = 「다른 앱으로 공유」(share_option_native) · 「링크 복사」(share_option_copy) 만.
 * 카카오(G-2 키 검증 전)·DIBAY 친구에게 보내기(S6 차단)는 두지 않는다.
 */
import { DibayShareSheet } from "@/components/share/DibayShareSheet";
import type { UseCommunityPostShareReturn } from "@/lib/community/share/use-community-post-share";

type Props = Pick<UseCommunityPostShareReturn, "sheetOpen" | "closeSheet" | "card" | "nativePayload" | "onShareEvent">;

export function CommunityShareSheet({ sheetOpen, closeSheet, card, nativePayload, onShareEvent }: Props) {
  return (
    <DibayShareSheet
      open={sheetOpen}
      onClose={closeSheet}
      url={card.canonicalUrl}
      previewTitle={nativePayload.title}
      previewSubtitle={card.categoryName || undefined}
      previewImageUrl={card.thumbnailUrl}
      shareText={card.excerpt || undefined}
      onEvent={onShareEvent}
    />
  );
}
