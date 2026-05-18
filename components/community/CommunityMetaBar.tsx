"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

/** 조회·공감·댓글 작은 메타 줄 (카드/상세 공통) */
export function CommunityMetaBar({
  viewCount,
  likeCount,
  commentCount,
}: {
  viewCount: number;
  likeCount: number;
  commentCount: number;
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-wrap gap-3 sam-text-helper text-sam-muted">
      <span>{t("community_stat_views", { count: viewCount })}</span>
      <span>{t("community_stat_likes", { count: likeCount })}</span>
      <span>{t("community_stat_comments", { count: commentCount })}</span>
    </div>
  );
}
