"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ReportActionSheet } from "@/components/reports/ReportActionSheet";
import { DibayToast } from "@/components/ui/dibay-overlay";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { useRequireAuthAction } from "@/hooks/use-require-auth-action";
import { DIBAY_TOAST_MS } from "@/lib/ui/dibay-overlay-contract";

/** 피드 광고 신고 — 기존 신고 원장(`reports`, target_type `feed_ad`) · 관리자 신고 큐에서 처리 */
export function FeedAdReportButton({ campaignId }: { campaignId: string }) {
  const { t } = useI18n();
  const requireAction = useRequireAuthAction();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), DIBAY_TOAST_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

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
        className="ml-2 inline-flex min-h-6 shrink-0 items-center px-1 sam-text-helper text-sam-muted"
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
