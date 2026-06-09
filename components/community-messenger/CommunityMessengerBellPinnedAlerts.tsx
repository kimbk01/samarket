"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dispatchTier1HeaderOverlayClose } from "@/lib/layout/tier1-header-overlay-events";

type MessengerAlertSummary = {
  requestCount: number;
  groupInviteCount: number;
  missedCallCount: number;
  importantCount: number;
};

function formatPinnedSummaryLine(summary: MessengerAlertSummary, t: ReturnType<typeof useI18n>["t"]): string | null {
  const parts: string[] = [];
  if (summary.requestCount > 0) {
    parts.push(t("cm_ui_request_count", { count: summary.requestCount }));
  }
  if (summary.groupInviteCount > 0) {
    parts.push(t("cm_ui_group_invite_count", { count: summary.groupInviteCount }));
  }
  if (summary.missedCallCount > 0) {
    parts.push(t("cm_ui_missed_call_count", { count: summary.missedCallCount }));
  }
  if (summary.importantCount > 0) {
    parts.push(t("cm_ui_important_chat_count", { count: summary.importantCount }));
  }
  return parts.length ? parts.join(" · ") : null;
}

/**
 * 메신저 1단 종 인박스 상단 — 친구요청·부재중 통화·중요 대화(주요 알림) 진입.
 */
export function CommunityMessengerBellPinnedAlerts({
  summary,
  onOpenNotificationCenter,
}: {
  summary: MessengerAlertSummary;
  onOpenNotificationCenter: () => void;
}) {
  const { t } = useI18n();
  const total = summary.requestCount + summary.groupInviteCount + summary.missedCallCount + summary.importantCount;
  const summaryLine = formatPinnedSummaryLine(summary, t);
  if (total < 1) return null;

  return (
    <button
      type="button"
      className="flex w-full items-center justify-between gap-2 rounded-ui-rect px-2.5 py-2 text-left hover:bg-sam-muted/10 active:bg-sam-muted/15"
      onClick={() => {
        dispatchTier1HeaderOverlayClose();
        onOpenNotificationCenter();
      }}
    >
      <div className="min-w-0">
        <p className="sam-text-body-secondary font-semibold text-sam-fg">{t("cm_ui_notification_center")}</p>
        {summaryLine ? <p className="mt-0.5 truncate sam-text-xxs text-sam-muted">{summaryLine}</p> : null}
      </div>
      <span className="shrink-0 rounded-full bg-sam-primary px-1.5 py-0.5 sam-text-xxs font-bold leading-none text-sam-on-primary">
        {total > 99 ? "99+" : total}
      </span>
    </button>
  );
}
