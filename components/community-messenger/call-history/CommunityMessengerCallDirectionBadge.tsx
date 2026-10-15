"use client";

import { presentCallHistoryStatus } from "@/lib/community-messenger/call-history/call-history-presenter";
import { isCallLogMissedDisplayType } from "@/lib/community-messenger/call-log-row-copy";
import type { CommunityMessengerCallLogDisplayType } from "@/lib/community-messenger/types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";

const STARBUCKS_GREEN = "#006241";
const MISSED_RED = "#E53935";

type Props = {
  displayType: CommunityMessengerCallLogDisplayType;
  /** viewer 관점 상태 key — `presentCallHistoryRow().badgeLabelKey` (통화 기록 SSOT) */
  labelKey: MessageKey;
};

export function CommunityMessengerCallDirectionBadge({ displayType, labelKey }: Props) {
  const { safeT } = useI18n();
  const presentation = presentCallHistoryStatus(displayType);
  const label = safeT(labelKey, {
    fallbackKo: "통화",
    fallbackEn: "Call",
  });
  const isMissed = isCallLogMissedDisplayType(displayType);
  const isAnswered = displayType === "incoming" || displayType === "outgoing";

  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 sam-text-helper font-semibold"
      style={{
        color: isMissed ? MISSED_RED : isAnswered ? STARBUCKS_GREEN : presentation.color,
        backgroundColor: isMissed ? "rgba(229,57,53,0.12)" : isAnswered ? "rgba(0,98,65,0.12)" : "var(--sam-surface-muted, #f3f4f6)",
      }}
    >
      {label}
    </span>
  );
}
