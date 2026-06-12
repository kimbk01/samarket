"use client";

import { useState } from "react";
import type { BusinessProfile } from "@/lib/types/business";
import { storeApprovalToBusinessAction } from "@/lib/admin-business/map-admin-store-to-business";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

interface AdminBusinessActionPanelProps {
  profile: BusinessProfile;
  onActionSuccess: () => void;
}

export function AdminBusinessActionPanel({
  profile,
  onActionSuccess,
}: AdminBusinessActionPanelProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);

  const run = async (target: BusinessProfile["status"]) => {
    const action = storeApprovalToBusinessAction(profile.status, target);
    if (!action) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/stores/${encodeURIComponent(profile.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        alert(j.error ?? t("common_content_unavailable"));
        return;
      }
      onActionSuccess();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {profile.status === "pending" && (
        <>
          <button
            type="button"
            disabled={loading}
            onClick={() => void run("active")}
            className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 sam-text-body text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
          >
            {t("admin_biz_action_approve")}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void run("rejected")}
            className="rounded border border-red-200 bg-red-50 px-3 py-2 sam-text-body text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            {t("admin_biz_action_reject")}
          </button>
        </>
      )}
      {profile.status === "active" && (
        <button
          type="button"
          disabled={loading}
          onClick={() => void run("paused")}
          className="rounded border border-amber-200 bg-amber-50 px-3 py-2 sam-text-body text-amber-800 hover:bg-amber-100 disabled:opacity-50"
        >
          {t("admin_biz_action_pause")}
        </button>
      )}
      {profile.status === "paused" && (
        <button
          type="button"
          disabled={loading}
          onClick={() => void run("active")}
          className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 sam-text-body text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
        >
          {t("admin_biz_action_resume")}
        </button>
      )}
    </div>
  );
}
