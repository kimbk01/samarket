"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdApplication } from "@/lib/types/ad-application";

interface AdminAdActionPanelProps {
  application: AdApplication;
  onActionSuccess: () => void;
}

type PatchAction = "confirm_payment" | "approve" | "reject" | "expire";

export function AdminAdActionPanel({
  application,
  onActionSuccess,
}: AdminAdActionPanelProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const patch = async (action: PatchAction) => {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/ad-applications/${application.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? t("admin_ads_action_failed"));
        return;
      }
      onActionSuccess();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {err ? (
        <p className="sam-text-body text-red-600" role="alert">
          {err}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {application.paymentStatus === "waiting_confirm" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void patch("confirm_payment")}
            className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 sam-text-body text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
          >
            {t("admin_ads_action_confirm_deposit")}
          </button>
        )}
        {["waiting_payment", "pending"].includes(application.applicationStatus) &&
          application.paymentStatus === "paid" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void patch("approve")}
              className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 sam-text-body text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
            >
              {t("admin_ads_action_approve")}
            </button>
          )}
        {["waiting_payment", "pending"].includes(application.applicationStatus) && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void patch("reject")}
            className="rounded border border-red-200 bg-red-50 px-3 py-2 sam-text-body text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            {t("admin_ads_action_reject")}
          </button>
        )}
        {application.applicationStatus === "active" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void patch("expire")}
            className="rounded border border-sam-border bg-sam-surface-muted px-3 py-2 sam-text-body text-sam-fg hover:bg-sam-border-soft disabled:opacity-50"
          >
            {t("admin_ads_action_end_exposure")}
          </button>
        )}
      </div>
    </div>
  );
}
