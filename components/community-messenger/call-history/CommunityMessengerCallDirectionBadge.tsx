"use client";

import { presentCallHistoryStatus } from "@/lib/community-messenger/call-history/call-history-presenter";
import { isCallLogMissedDisplayType } from "@/lib/community-messenger/call-log-row-copy";
import type { CommunityMessengerCallLogDisplayType } from "@/lib/community-messenger/types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";

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
      /** U-8 (1단계 문서 §13-6): 하드코딩 색 → 공용 상태 토큰(친구·대화 칩과 같은 색 체계) */
      style={{
        color: isMissed ? "var(--sam-danger)" : isAnswered ? "var(--sam-primary)" : presentation.color,
        backgroundColor: isMissed ? "var(--sam-danger-soft)" : isAnswered ? "var(--sam-primary-soft)" : "var(--sam-surface-muted)",
      }}
    >
      {label}
    </span>
  );
}
