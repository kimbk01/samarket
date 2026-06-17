"use client";

import { Eye } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAppNumber } from "@/lib/i18n/locale-for-app-language";
import { CM_META_CLASS } from "@/lib/community/community-ui-classes";
import { CommunityActionBar } from "@/components/community/ui/CommunityActionBar";

type Props = {
  postId: string;
  viewCount: number;
  likeCount: number;
  likedByViewer?: boolean;
  savedByViewer?: boolean;
  busy: boolean;
  saveBusy?: boolean;
  onLike: () => void;
  onSave: () => void;
  onShare: () => void;
};

export function CommunityPostDetailViewLine({ viewCount }: { viewCount: number }) {
  const { t, language } = useI18n();
  return (
    <div className={`mt-4 flex items-center gap-1.5 ${CM_META_CLASS}`}>
      <Eye className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.8} aria-hidden />
      <p>{t("community_views_read_line", { count: formatAppNumber(viewCount, language) })}</p>
    </div>
  );
}

/** @deprecated use CommunityActionBar directly — kept for import compatibility */
export function CommunityPostDetailStatsActions({
  postId,
  viewCount,
  likeCount,
  likedByViewer = false,
  savedByViewer = false,
  busy,
  saveBusy = false,
  onLike,
  onSave,
  onShare,
}: Props) {
  return (
    <>
      <CommunityPostDetailViewLine viewCount={viewCount} />
      <CommunityActionBar
        postId={postId}
        likeCount={likeCount}
        likedByViewer={likedByViewer}
        savedByViewer={savedByViewer}
        busy={busy}
        saveBusy={saveBusy}
        onLike={onLike}
        onSave={onSave}
        onShare={onShare}
      />
    </>
  );
}
