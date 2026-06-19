"use client";

import { Pin } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type GroupPinnedMessageBannerProps = {
  previewText: string;
  senderLabel?: string;
  onClick?: () => void;
};

/** Kakao/Telegram-style single pinned notice strip above group timeline. */
export function GroupPinnedMessageBanner({
  previewText,
  senderLabel,
  onClick,
}: GroupPinnedMessageBannerProps) {
  const { safeT } = useI18n();
  const body = previewText.trim();
  if (!body) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-3 mb-2 flex w-[calc(100%-1.5rem)] items-start gap-2 rounded-ui-rect border border-[#006241]/20 bg-[#EAF4EF] px-3 py-2 text-left active:bg-[#004C3F]/10"
    >
      <Pin className="mt-0.5 h-4 w-4 shrink-0 text-[#006241]" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="sam-text-xxs font-semibold text-[#006241]">
          {safeT("cm_ui_group_pinned_notice", {
            fallbackKo: "공지",
            fallbackEn: "Notice",
          })}
        </p>
        {senderLabel ? (
          <p className="sam-text-xxs font-medium text-sam-muted">{senderLabel}</p>
        ) : null}
        <p className="line-clamp-2 sam-text-body-secondary text-sam-fg">{body}</p>
      </div>
    </button>
  );
}
