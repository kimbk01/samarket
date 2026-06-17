"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";

type Props = {
  labelKey: string;
  color: string;
};

export function CommunityMessengerCallStatusBadge({ labelKey, color }: Props) {
  const { safeT } = useI18n();
  const label = safeT(labelKey as MessageKey, {
    fallbackKo: "통화",
    fallbackEn: "Call",
  });
  return (
    <span className="sam-text-helper font-medium" style={{ color }}>
      {label}
    </span>
  );
}
