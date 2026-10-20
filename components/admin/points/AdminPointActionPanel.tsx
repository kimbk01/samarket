"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { PointChargeRequest } from "@/lib/types/point";
import { useState } from "react";
import { resolveAdminApiErrorMessage } from "@/lib/admin/admin-api-error-i18n";
import { runPointChargeAction, type PointChargeAction } from "@/components/admin/points/point-charge-action-client";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { formatAdminNumber, formatAdminPhp } from "@/lib/admin/ui-standard/admin-format";

interface AdminPointActionPanelProps {
  request: PointChargeRequest;
  onActionSuccess: () => void | Promise<void>;
}

export function AdminPointActionPanel({
  request,
  onActionSuccess,
}: AdminPointActionPanelProps) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const canAct =
    request.requestStatus === "pending" ||
    request.requestStatus === "waiting_confirm" ||
    request.requestStatus === "on_hold";

  const doAction = async (action: PointChargeAction) => {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const out = await runPointChargeAction({
        requestId: request.id,
        action,
        ko,
        summary: `${request.userNickname} · ${formatAdminNumber(request.pointAmount)}P · ${formatAdminPhp(request.paymentAmount)} · ${request.depositorName || "-"}`,
      });
      if (!out.ok) {
        if (!out.cancelled) setErr(resolveAdminApiErrorMessage(out.error, t, "admin_points_err_action_failed"));
        return;
      }
      await onActionSuccess();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {err ? <p className="sam-text-helper text-sam-danger">{err}</p> : null}
      <div className="flex flex-wrap gap-2">
        {canAct && (
          <>
            <AdminActionButton variant="primary" disabled={busy} onClick={() => void doAction("approve")}>
              {busy ? "…" : t("admin_points_action_approve")}
            </AdminActionButton>
            <AdminActionButton variant="secondary" disabled={busy} onClick={() => void doAction("reject")}>
              {t("admin_points_action_reject")}
            </AdminActionButton>
            {request.requestStatus !== "on_hold" && (
              <AdminActionButton variant="secondary" disabled={busy} onClick={() => void doAction("hold")}>
                {t("admin_points_action_hold")}
              </AdminActionButton>
            )}
          </>
        )}
      </div>
    </div>
  );
}
