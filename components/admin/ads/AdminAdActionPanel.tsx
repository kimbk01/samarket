"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
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
        <p className="sam-text-body text-sam-danger" role="alert">
          {err}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {application.paymentStatus === "waiting_confirm" && (
          <AdminActionButton
            disabled={busy}
            onClick={() => void patch("confirm_payment")}
            variant="primary"
          >
            {t("admin_ads_action_confirm_deposit")}
          </AdminActionButton>
        )}
        {["waiting_payment", "pending"].includes(application.applicationStatus) &&
          application.paymentStatus === "paid" && (
            <AdminActionButton
              disabled={busy}
              onClick={() => void patch("approve")}
              variant="primary"
            >
              {t("admin_ads_action_approve")}
            </AdminActionButton>
          )}
        {["waiting_payment", "pending"].includes(application.applicationStatus) && (
          <AdminActionButton
            disabled={busy}
            onClick={() => void patch("reject")}
            variant="secondary"
          >
            {t("admin_ads_action_reject")}
          </AdminActionButton>
        )}
        {application.applicationStatus === "active" && (
          <AdminActionButton
            disabled={busy}
            onClick={() => void patch("expire")}
            variant="secondary"
          >
            {t("admin_ads_action_end_exposure")}
          </AdminActionButton>
        )}
      </div>
    </div>
  );
}
