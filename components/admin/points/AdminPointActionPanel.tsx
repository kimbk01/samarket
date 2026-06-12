"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { PointChargeRequest } from "@/lib/types/point";
import { useState } from "react";
import { resolveAdminApiErrorMessage } from "@/lib/admin/admin-api-error-i18n";

interface AdminPointActionPanelProps {
  request: PointChargeRequest;
  onActionSuccess: () => void | Promise<void>;
}

export function AdminPointActionPanel({
  request,
  onActionSuccess,
}: AdminPointActionPanelProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const canAct =
    request.requestStatus === "pending" ||
    request.requestStatus === "waiting_confirm" ||
    request.requestStatus === "on_hold";

  const doAction = async (action: "approve" | "reject" | "hold") => {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/point-charges/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(resolveAdminApiErrorMessage(j.error, t, "admin_points_err_action_failed"));
        return;
      }
      await onActionSuccess();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {err ? <p className="sam-text-helper text-red-600">{err}</p> : null}
      <div className="flex flex-wrap gap-2">
        {canAct && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void doAction("approve")}
              className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 sam-text-body text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
            >
              {busy ? "…" : t("admin_points_action_approve")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void doAction("reject")}
              className="rounded border border-red-200 bg-red-50 px-3 py-2 sam-text-body text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              {t("admin_points_action_reject")}
            </button>
            {request.requestStatus !== "on_hold" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void doAction("hold")}
                className="rounded border border-sam-border bg-sam-surface-muted px-3 py-2 sam-text-body text-sam-fg hover:bg-sam-border-soft disabled:opacity-50"
              >
                {t("admin_points_action_hold")}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
