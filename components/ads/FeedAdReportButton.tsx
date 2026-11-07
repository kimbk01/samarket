"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ReportActionSheet } from "@/components/reports/ReportActionSheet";
import { DibayToast } from "@/components/ui/dibay-overlay";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { useRequireAuthAction } from "@/hooks/use-require-auth-action";
import { DIBAY_TOAST_MS } from "@/lib/ui/dibay-overlay-contract";

/**
 * 피드 광고 신고 — 기존 신고 원장(`reports`, target_type `feed_ad`) · 관리자 신고 큐에서 처리.
 * D-17: 누르는 영역 44px(줄 높이는 음수 여백으로 그대로) · `preview` = 어드민 미리보기(같은 모양 · 누르지 않음).
 */
export const FEED_AD_REPORT_BUTTON_CLASS =
  "-my-3 ml-1 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center px-1 sam-text-helper text-sam-muted";

export function FeedAdReportButton({ campaignId, preview = false }: { campaignId: string; preview?: boolean }) {
  const { t } = useI18n();
  const requireAction = useRequireAuthAction();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), DIBAY_TOAST_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  if (preview) {
    return (
      <span aria-hidden className={FEED_AD_REPORT_BUTTON_CLASS} data-feed-ad-report="" data-feed-ad-report-preview="">
        {t("common_report")}
      </span>
    );
  }
  if (!campaignId) return null;

  const onPress = async () => {
    if (!getCurrentUser()?.id) {
      await requireAction("community_report", () => setOpen(true));
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void onPress()}
        className={FEED_AD_REPORT_BUTTON_CLASS}
        data-feed-ad-report=""
      >
        {t("common_report")}
      </button>
      {open ? (
        <ReportActionSheet
          targetType="feed_ad"
          targetId={campaignId}
          targetUserId=""
          onClose={() => setOpen(false)}
          onSuccess={() => {
            setOpen(false);
            setToast(t("community_report_submitted"));
          }}
        />
      ) : null}
      {toast ? <DibayToast message={toast} tone="success" /> : null}
    </>
  );
}
