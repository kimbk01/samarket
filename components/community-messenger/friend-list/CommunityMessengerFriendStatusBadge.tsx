"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";

type Props = {
  labelKey: string;
  color: string;
  filled?: boolean;
};

export function CommunityMessengerFriendStatusBadge({ labelKey, color, filled = false }: Props) {
  const { safeT } = useI18n();
  const label = safeT(labelKey as MessageKey, {
    fallbackKo: "친구",
    fallbackEn: "Friend",
  });
  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 sam-text-xxs font-semibold leading-none"
      style={{
        color: filled ? "#fff" : color,
        backgroundColor: filled ? color : "transparent",
        border: `1px solid ${color}`,
      }}
    >
      {label}
    </span>
  );
}
