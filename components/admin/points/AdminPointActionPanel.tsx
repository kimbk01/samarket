"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { PointChargeRequest } from "@/lib/types/point";
import {
  approvePointChargeRequest,
  rejectPointChargeRequest,
  holdPointChargeRequest,
} from "@/lib/points/mock-point-charge-requests";

interface AdminPointActionPanelProps {
  request: PointChargeRequest;
  onActionSuccess: () => void;
}

export function AdminPointActionPanel({
  request,
  onActionSuccess,
}: AdminPointActionPanelProps) {
  const { t } = useI18n();

  const handle = (fn: () => PointChargeRequest | undefined) => {
    fn();
    onActionSuccess();
  };

  const canAct =
    request.requestStatus === "pending" ||
    request.requestStatus === "waiting_confirm" ||
    request.requestStatus === "on_hold";

  return (
    <div className="flex flex-wrap gap-2">
      {canAct && (
        <>
          <button
            type="button"
            onClick={() => handle(() => approvePointChargeRequest(request.id))}
            className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 sam-text-body text-emerald-800 hover:bg-emerald-100"
          >
            {t("admin_points_action_approve")}
          </button>
          <button
            type="button"
            onClick={() => handle(() => rejectPointChargeRequest(request.id))}
            className="rounded border border-red-200 bg-red-50 px-3 py-2 sam-text-body text-red-700 hover:bg-red-100"
          >
            {t("admin_points_action_reject")}
          </button>
          {request.requestStatus !== "on_hold" && (
            <button
              type="button"
              onClick={() => handle(() => holdPointChargeRequest(request.id))}
              className="rounded border border-sam-border bg-sam-surface-muted px-3 py-2 sam-text-body text-sam-fg hover:bg-sam-border-soft"
            >
              {t("admin_points_action_hold")}
            </button>
          )}
        </>
      )}
    </div>
  );
}
