"use client";

import type { BusinessProfile } from "@/lib/types/business";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { setBusinessProfileStatus } from "@/lib/business/mock-business-profiles";

interface AdminBusinessActionPanelProps {
  profile: BusinessProfile;
  onActionSuccess: () => void;
}

export function AdminBusinessActionPanel({
  profile,
  onActionSuccess,
}: AdminBusinessActionPanelProps) {
  const { t } = useI18n();
  const handle = (status: BusinessProfile["status"]) => {
    setBusinessProfileStatus(profile.id, status);
    onActionSuccess();
  };

  return (
    <div className="flex flex-wrap gap-2">
      {profile.status === "pending" && (
        <>
          <button
            type="button"
            onClick={() => handle("active")}
            className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 sam-text-body text-emerald-800 hover:bg-emerald-100"
          >
            {t("admin_biz_action_approve")}
          </button>
          <button
            type="button"
            onClick={() => handle("rejected")}
            className="rounded border border-red-200 bg-red-50 px-3 py-2 sam-text-body text-red-700 hover:bg-red-100"
          >
            {t("admin_biz_action_reject")}
          </button>
        </>
      )}
      {profile.status === "active" && (
        <button
          type="button"
          onClick={() => handle("paused")}
          className="rounded border border-amber-200 bg-amber-50 px-3 py-2 sam-text-body text-amber-800 hover:bg-amber-100"
        >
          {t("admin_biz_action_pause")}
        </button>
      )}
      {profile.status === "paused" && (
        <button
          type="button"
          onClick={() => handle("active")}
          className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 sam-text-body text-emerald-800 hover:bg-emerald-100"
        >
          {t("admin_biz_action_resume")}
        </button>
      )}
    </div>
  );
}
