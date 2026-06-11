"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function CommunityLikeButton({
  liked,
  count,
  disabled,
  onToggle,
}: {
  liked: boolean;
  count: number;
  disabled?: boolean;
  onToggle?: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={`rounded-full border px-3 py-1 sam-text-body-secondary ${liked ? "border-rose-300 bg-rose-50 text-rose-800" : "border-sam-border bg-sam-surface text-sam-fg"}`}
    >
      {t("community_stat_likes", { count })}
    </button>
  );
}
