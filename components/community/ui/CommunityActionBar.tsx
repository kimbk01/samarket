"use client";

import { Bookmark, ThumbsUp } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAppNumber } from "@/lib/i18n/locale-for-app-language";
import {
  CM_ACTION_BAR_BTN_ACTIVE_CLASS,
  CM_ACTION_BAR_BTN_CLASS,
} from "@/lib/community/community-ui-classes";

type Props = {
  postId: string;
  likeCount: number;
  likedByViewer?: boolean;
  savedByViewer?: boolean;
  busy?: boolean;
  saveBusy?: boolean;
  onLike: () => void;
  onSave: () => void;
};

export function CommunityActionBar({
  postId,
  likeCount,
  likedByViewer = false,
  savedByViewer = false,
  busy = false,
  saveBusy = false,
  onLike,
  onSave,
}: Props) {
  const { t, language } = useI18n();

  const likeBtnClass = likedByViewer ? CM_ACTION_BAR_BTN_ACTIVE_CLASS : CM_ACTION_BAR_BTN_CLASS;
  const saveBtnClass = savedByViewer ? CM_ACTION_BAR_BTN_ACTIVE_CLASS : CM_ACTION_BAR_BTN_CLASS;

  return (
    <div
      className="mt-4 grid grid-cols-2 border-t border-[var(--cm-border)]"
      style={{ minHeight: "var(--cm-action-h)" }}
      data-post-id={postId}
    >
      <button type="button" disabled={busy} className={`${likeBtnClass} min-w-0`} onClick={onLike} aria-pressed={likedByViewer}>
        <ThumbsUp className="h-[18px] w-[18px] shrink-0" strokeWidth={2} fill={likedByViewer ? "currentColor" : "none"} />
        <span className="truncate">{t("community_stat_likes", { count: formatAppNumber(likeCount, language) })}</span>
      </button>
      <button
        type="button"
        disabled={saveBusy}
        className={`${saveBtnClass} min-w-0`}
        onClick={onSave}
        aria-pressed={savedByViewer}
      >
        <Bookmark className="h-[18px] w-[18px] shrink-0" strokeWidth={2} fill={savedByViewer ? "currentColor" : "none"} />
        <span className="truncate">{savedByViewer ? t("community_saved_label") : t("community_save")}</span>
      </button>
    </div>
  );
}
