"use client";

import { useState } from "react";
import {
  ALL_CHAT_EMOJIS,
  CHAT_EMOJI_PANEL_PREVIEW_COUNT,
} from "@/lib/chat-ui/chat-emoji-catalog";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function ChatEmojiPicker({
  onPick,
  disabled = false,
  className = "",
}: {
  onPick: (emoji: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? ALL_CHAT_EMOJIS : ALL_CHAT_EMOJIS.slice(0, CHAT_EMOJI_PANEL_PREVIEW_COUNT);

  return (
    <div
      className={`flex max-h-[min(42dvh,300px)] flex-col overflow-hidden sm:max-h-[min(48dvh,380px)] ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--overlay-border)] px-2.5 py-2">
        <span className="text-[length:var(--overlay-body-2-size)] font-semibold text-[color:var(--overlay-text-primary)]">{t("common_emoji")}</span>
        <span className="text-[length:var(--overlay-caption-size)] text-[color:var(--overlay-text-secondary)]">{t("common_emoji_panel_hint")}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 pt-2.5">
        <div className="grid grid-cols-7 gap-1 touch-manipulation sm:grid-cols-8 md:grid-cols-7 md:gap-1.5">
          {visible.map((emoji, i) => (
            <button
              key={`${emoji}-${i}`}
              type="button"
              disabled={disabled}
              className="sam-header-action flex h-10 w-10 items-center justify-center sam-text-hero disabled:cursor-not-allowed disabled:grayscale sm:h-11 sm:w-11 sm:sam-text-hero md:sam-text-hero"
              onClick={() => onPick(emoji)}
              aria-label={`${t("common_emoji")} ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
        {!showAll && ALL_CHAT_EMOJIS.length > CHAT_EMOJI_PANEL_PREVIEW_COUNT ? (
          <button
            type="button"
            disabled={disabled}
            className="dibay-overlay-btn dibay-overlay-btn--secondary !flex-none mt-2"
            onClick={() => setShowAll(true)}
          >
            {t("common_emoji_show_more")} · {ALL_CHAT_EMOJIS.length - CHAT_EMOJI_PANEL_PREVIEW_COUNT}+
          </button>
        ) : null}
      </div>
    </div>
  );
}
