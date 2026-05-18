"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdApplication } from "@/lib/types/ad-application";
import {
  markAdApplicationPaid,
  approveAdApplication,
  rejectAdApplication,
  activateAdApplication,
  expireAdApplication,
} from "@/lib/ads/mock-ad-applications";

interface AdminAdActionPanelProps {
  application: AdApplication;
  onActionSuccess: () => void;
}

export function AdminAdActionPanel({
  application,
  onActionSuccess,
}: AdminAdActionPanelProps) {
  const { t } = useI18n();

  const handle = (fn: () => AdApplication | undefined) => {
    fn();
    onActionSuccess();
  };

  return (
    <div className="flex flex-wrap gap-2">
      {application.paymentStatus === "waiting_confirm" && (
        <button
          type="button"
          onClick={() => handle(() => markAdApplicationPaid(application.id))}
          className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 sam-text-body text-emerald-800 hover:bg-emerald-100"
        >
          {t("admin_ads_action_confirm_deposit")}
        </button>
      )}
      {["waiting_payment", "pending"].includes(application.applicationStatus) &&
        application.paymentStatus === "paid" && (
          <button
            type="button"
            onClick={() => handle(() => approveAdApplication(application.id))}
            className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 sam-text-body text-emerald-800 hover:bg-emerald-100"
          >
            {t("admin_ads_action_approve")}
          </button>
        )}
      {["waiting_payment", "pending"].includes(application.applicationStatus) && (
        <button
          type="button"
          onClick={() => handle(() => rejectAdApplication(application.id))}
          className="rounded border border-red-200 bg-red-50 px-3 py-2 sam-text-body text-red-700 hover:bg-red-100"
        >
          {t("admin_ads_action_reject")}
        </button>
      )}
      {application.applicationStatus === "approved" && (
        <button
          type="button"
          onClick={() => handle(() => activateAdApplication(application.id))}
          className="rounded border border-signature bg-signature/10 px-3 py-2 sam-text-body text-signature hover:bg-signature/20"
        >
          {t("admin_ads_action_start_exposure")}
        </button>
      )}
      {application.applicationStatus === "active" && (
        <button
          type="button"
          onClick={() => handle(() => expireAdApplication(application.id))}
          className="rounded border border-sam-border bg-sam-surface-muted px-3 py-2 sam-text-body text-sam-fg hover:bg-sam-border-soft"
        >
          {t("admin_ads_action_end_exposure")}
        </button>
      )}
    </div>
  );
}
