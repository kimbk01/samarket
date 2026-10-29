"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import type { AdApplication } from "@/lib/types/ad-application";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel, type AdminActionKind } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";

interface AdminAdActionPanelProps {
  application: AdApplication;
  onActionSuccess: () => void;
}

type PatchAction = "confirm_payment" | "approve" | "reject" | "expire";

/** 동작 → 확인 단계 (lib/admin/operator-ux/admin-action-levels.ts). L2 사유는 adminNote 로 보내 감사 기록에 남는다. */
const PATCH_ACTION_KIND: Record<PatchAction, AdminActionKind> = {
  confirm_payment: "moneyApprove",
  approve: "approve",
  reject: "reject",
  expire: "exposeStop",
};

export function AdminAdActionPanel({
  application,
  onActionSuccess,
}: AdminAdActionPanelProps) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  /** IA-04 (K-2): 광고 신청 처리(PATCH) = ads 키 (접근표 action — API 403 과 같은 판정) */
  const adminAction = useAdminRouteAction("/admin/ad-applications");
  const writeBlocked = busy || !adminAction.allowed;

  const patch = async (action: PatchAction, label: string) => {
    if (busy) return;
    const confirmed = await confirmAdminAction({
      level: adminActionLevel(PATCH_ACTION_KIND[action]),
      ko,
      title: ko ? `「${label}」 처리할까요?` : `${label}?`,
      description: application.targetTitle || undefined,
      confirmLabel: label,
      destructive: action === "reject",
    });
    if (!confirmed.ok) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/ad-applications/${application.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, adminNote: confirmed.reason ?? undefined }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ? adminOperatorErrorMessage(j.error, ko) : t("admin_ads_action_failed"));
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
      {!adminAction.allowed && adminAction.reason ? (
        <p className="sam-text-body-secondary text-sam-muted" data-admin-action-denied="1">
          {adminAction.reason}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {application.paymentStatus === "waiting_confirm" && (
          <AdminActionButton
            disabled={writeBlocked}
            onClick={() => void patch("confirm_payment", t("admin_ads_action_confirm_deposit"))}
            variant="primary"
          >
            {t("admin_ads_action_confirm_deposit")}
          </AdminActionButton>
        )}
        {["waiting_payment", "pending"].includes(application.applicationStatus) &&
          application.paymentStatus === "paid" && (
            <AdminActionButton
              disabled={writeBlocked}
              onClick={() => void patch("approve", t("admin_ads_action_approve"))}
              variant="primary"
            >
              {t("admin_ads_action_approve")}
            </AdminActionButton>
          )}
        {["waiting_payment", "pending"].includes(application.applicationStatus) && (
          <AdminActionButton
            disabled={writeBlocked}
            onClick={() => void patch("reject", t("admin_ads_action_reject"))}
            variant="secondary"
          >
            {t("admin_ads_action_reject")}
          </AdminActionButton>
        )}
        {application.applicationStatus === "active" && (
          <AdminActionButton
            disabled={writeBlocked}
            onClick={() => void patch("expire", t("admin_ads_action_end_exposure"))}
            variant="secondary"
          >
            {t("admin_ads_action_end_exposure")}
          </AdminActionButton>
        )}
      </div>
    </div>
  );
}
