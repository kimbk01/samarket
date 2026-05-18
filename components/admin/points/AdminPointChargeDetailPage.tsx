"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  pointActionTypeLabel,
  pointBoardLabel,
  pointChargeStatusLabel,
  pointExecStatusLabel,
  pointExpireCycleLabel,
  pointExpireExecStatusLabel,
  pointLedgerTypeLabel,
  pointPaymentMethodLabel,
  pointRewardTypeLabel,
  pointUserTypeLabel,
} from "@/components/admin/points/admin-points-notifications-i18n";

import { useCallback, useState } from "react";
import type { PointChargeRequest } from "@/lib/types/point";
import {
  getPointChargeRequestById,
  setPointChargeRequestAdminMemo,
} from "@/lib/points/mock-point-charge-requests";
import { getPointActionLogsByRelatedId } from "@/lib/points/mock-point-action-logs";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPointActionPanel } from "./AdminPointActionPanel";

interface AdminPointChargeDetailPageProps {
  requestId: string;
}

export function AdminPointChargeDetailPage({
  requestId,
}: AdminPointChargeDetailPageProps) {
  const { t } = useI18n();

  const [refresh, setRefresh] = useState(0);
  const [memoInput, setMemoInput] = useState("");
  const request = getPointChargeRequestById(requestId);
  const logs = getPointActionLogsByRelatedId(requestId);
  const refreshDetail = useCallback(() => setRefresh((r) => r + 1), []);

  if (!request) {
    return (
      <div className="py-8 text-center sam-text-body text-sam-muted"> {t("admin_points_charge_not_found")}
      </div>
    );
  }

  const handleSaveMemo = () => {
    setPointChargeRequestAdminMemo(requestId, memoInput);
    setMemoInput("");
    refreshDetail();
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        titleKey="admin_points_charge_page_detail"
        backHref="/admin/point-charges"
      />
      <AdminPointActionPanel request={request} onActionSuccess={refreshDetail} />
      <AdminCard titleKey="admin_points_charge_card_request_info">
        <dl className="grid gap-2 sam-text-body">
          <div>
            <dt className="text-sam-muted">{t("admin_points_charge_th_applicant")}</dt>
            <dd>
              {request.userNickname} ({request.userId})
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_points_charge_label_product")}</dt>
            <dd>{request.planName}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_points_charge_label_payment_points")}</dt>
            <dd>
              ₩{request.paymentAmount.toLocaleString()} → {request.pointAmount}P
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_points_charge_label_payment_method")}</dt>
            <dd>{pointPaymentMethodLabel(t, request.paymentMethod)}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_points_th_status")}</dt>
            <dd>
              <span
                className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${
                  request.requestStatus === "approved"
                    ? "bg-emerald-50 text-emerald-800"
                    : request.requestStatus === "rejected"
                      ? "bg-red-50 text-red-700"
                      : "bg-sam-surface-muted text-sam-fg"
                }`}
              >
                {pointChargeStatusLabel(t, request.requestStatus)}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_points_charge_th_depositor")}</dt>
            <dd>{request.depositorName || "-"}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_points_charge_label_dates")}</dt>
            <dd className="sam-text-body-secondary text-sam-muted">
              {new Date(request.requestedAt).toLocaleString("ko-KR")} /{" "}
              {new Date(request.updatedAt).toLocaleString("ko-KR")}
            </dd>
          </div>
          {request.userMemo && (
            <div>
              <dt className="text-sam-muted">{t("admin_points_charge_label_user_memo")}</dt>
              <dd className="whitespace-pre-wrap text-sam-fg">
                {request.userMemo}
              </dd>
            </div>
          )}
        </dl>
      </AdminCard>
      <AdminCard titleKey="admin_points_admin_memo_card">
        <div className="flex gap-2">
          <input
            type="text"
            value={memoInput}
            onChange={(e) => setMemoInput(e.target.value)}
            placeholder={t("admin_points_admin_memo_ph")}
            className="flex-1 rounded border border-sam-border px-3 py-2 sam-text-body"
          />
          <button
            type="button"
            onClick={handleSaveMemo}
            className="rounded border border-sam-border bg-sam-app px-3 py-2 sam-text-body text-sam-fg hover:bg-sam-surface-muted"
          >
            {t("common_save")}
          </button>
        </div>
        {request.adminMemo && (
          <p className="mt-2 sam-text-body-secondary text-sam-muted">{request.adminMemo}</p>
        )}
      </AdminCard>
      <AdminCard titleKey="admin_points_charge_card_manual_adjust">
        <p className="sam-text-body-secondary text-sam-muted"> {t("admin_points_charge_manual_adjust_hint")}
        </p>
      </AdminCard>
      <AdminCard titleKey="admin_points_card_change_history">
        <ul className="space-y-2 sam-text-body-secondary">
          {logs.length === 0 ? (
            <li className="text-sam-muted">{t("admin_points_history_empty")}</li>
          ) : (
            logs.map((l) => (
              <li
                key={l.id}
                className="flex flex-wrap gap-2 border-b border-sam-border-soft pb-2"
              >
                <span className="font-medium text-sam-fg">{l.actionType}</span>
                <span className="text-sam-muted">{l.actorNickname}</span>
                <span className="text-sam-muted">{l.note}</span>
                <span className="ml-auto text-sam-meta">
                  {new Date(l.createdAt).toLocaleString("ko-KR")}
                </span>
              </li>
            ))
          )}
        </ul>
      </AdminCard>
    </div>
  );
}
