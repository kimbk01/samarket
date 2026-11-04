"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { UserBlockButton } from "@/components/community/UserBlockButton";
import { ReportActionSheet } from "@/components/reports/ReportActionSheet";
import { DibayToast } from "@/components/ui/dibay-overlay";
import { getCurrentUser, getHydrationSafeCurrentUser } from "@/lib/auth/get-current-user";
import { useRequireAuthAction } from "@/hooks/use-require-auth-action";
import { DIBAY_TOAST_MS } from "@/lib/ui/dibay-overlay-contract";

/** 공개 프로필 신고·차단 — 기존 신고 원장(`/api/reports`)·차단 SSOT(`/api/community/block-relations`) 재사용 */
export function PublicProfileSafetyActions({
  targetUserId,
  targetLabel,
}: {
  targetUserId: string;
  targetLabel: string;
}) {
  const { t } = useI18n();
  const requireAction = useRequireAuthAction();
  const [mounted, setMounted] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const me = mounted ? getCurrentUser() : getHydrationSafeCurrentUser();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), DIBAY_TOAST_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  if (!targetUserId || me?.id === targetUserId) return null;

  const openReport = async () => {
    if (!getCurrentUser()?.id) {
      await requireAction("community_report", () => setReportOpen(true));
      return;
    }
    setReportOpen(true);
  };

  return (
    <div className="mx-auto flex w-full max-w-xl justify-end gap-2 px-4 pt-4" data-testid="public-profile-safety-actions">
      <button
        type="button"
        onClick={() => void openReport()}
        className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 sam-text-helper text-sam-fg"
      >
        {t("common_report")}
      </button>
      <UserBlockButton targetUserId={targetUserId} />
      {reportOpen ? (
        <ReportActionSheet
          targetType="user"
          targetId={targetUserId}
          targetUserId={targetUserId}
          targetLabel={targetLabel}
          onClose={() => setReportOpen(false)}
          onSuccess={() => {
            setReportOpen(false);
            setToast(t("community_report_submitted"));
          }}
        />
      ) : null}
      {toast ? <DibayToast message={toast} tone="success" /> : null}
    </div>
  );
}
