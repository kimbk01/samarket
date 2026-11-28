"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatTimeAgo } from "@/lib/utils/format";
import { CommunityAuthorRow } from "@/components/community/ui/CommunityAuthorRow";

type Props = {
  authorName: string;
  authorAvatarUrl?: string | null;
  locationLabel: string;
  createdAt: string;
  subline?: string;
  showMoreMenu?: boolean;
  postId?: string;
  targetUserId?: string | null;
  canReport?: boolean;
  onReport?: () => void;
  isOwnPost?: boolean;
  onOwnDelete?: () => void;
  onOwnEdit?: () => void;
  ownDeleteBusy?: boolean;
  /** 글 상세 첫 데이터(`post.viewer`)의 관심이웃·차단 — ⋯ 메뉴 시작 값 */
  relationSeed?: { following?: boolean | null; blocked?: boolean | null };
};

export function CommunityPostDetailAuthorRow({
  authorName,
  authorAvatarUrl,
  locationLabel,
  createdAt,
  subline,
  showMoreMenu,
  postId,
  targetUserId,
  canReport,
  onReport,
  isOwnPost,
  onOwnDelete,
  onOwnEdit,
  ownDeleteBusy,
  relationSeed,
}: Props) {
  const { t, language } = useI18n();
  const time =
    createdAt && !Number.isNaN(Date.parse(createdAt)) ? formatTimeAgo(createdAt, language) : "";

  return (
    <CommunityAuthorRow
      authorName={authorName || t("community_anonymous")}
      avatarUrl={authorAvatarUrl}
      locationLabel={locationLabel}
      timeLabel={time}
      subline={subline}
      showMoreMenu={showMoreMenu}
      postId={postId}
      targetUserId={targetUserId}
      canReport={canReport}
      onReport={onReport}
      isOwnPost={isOwnPost}
      onOwnDelete={onOwnDelete}
      onOwnEdit={onOwnEdit}
      ownDeleteBusy={ownDeleteBusy}
      relationSeed={relationSeed}
    />
  );
}
