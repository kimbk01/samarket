"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { pointChargeStatusLabel, pointPaymentMethodLabel } from "@/components/admin/points/admin-points-notifications-i18n";
import { useCallback, useEffect, useState } from "react";
import type { PointChargeRequest } from "@/lib/types/point";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPointActionPanel } from "./AdminPointActionPanel";
import { resolveAdminApiErrorMessage } from "@/lib/admin/admin-api-error-i18n";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { formatAdminNumber, formatAdminPhp } from "@/lib/admin/ui-standard/admin-format";

interface AdminPointChargeDetailPageProps {
  requestId: string;
}

export function AdminPointChargeDetailPage({
  requestId,
}: AdminPointChargeDetailPageProps) {
  const { t, language } = useI18n();
  const ko = language !== "en";

  const [request, setRequest] = useState<PointChargeRequest | null>(null);
  const [loading, setLoading] = useState(true);
  /** 불러오기 실패 — 404(신청 없음)와 구분 */
  const [loadError, setLoadError] = useState<{ code: string | null; httpStatus?: number } | null>(null);
  const [memoInput, setMemoInput] = useState("");
  const [memoBusy, setMemoBusy] = useState(false);
  const [memoErr, setMemoErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/point-charges/${requestId}`, { credentials: "include" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        request?: PointChargeRequest;
      };
      if (!res.ok || json.ok === false || !json.request) {
        setRequest(null);
        if (res.status !== 404) setLoadError({ code: json.error ?? null, httpStatus: res.status });
        return;
      }
      setRequest(json.request);
      setMemoInput(json.request.adminMemo ?? "");
    } catch {
      setRequest(null);
      setLoadError({ code: "network_error" });
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSaveMemo = async () => {
    setMemoBusy(true);
    setMemoErr("");
    try {
      const res = await fetch(`/api/admin/point-charges/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ adminMemo: memoInput }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setMemoErr(resolveAdminApiErrorMessage(j.error, t, "admin_points_err_action_failed"));
        return;
      }
      await load();
    } finally {
      setMemoBusy(false);
    }
  };

  if (loading) {
    return <AdminLoadingState ko={ko} label={t("common_loading")} />;
  }

  if (loadError) {
    return <AdminErrorState ko={ko} code={loadError.code} httpStatus={loadError.httpStatus} onRetry={() => void load()} />;
  }

  if (!request) {
    return <AdminEmptyState ko={ko} message={t("admin_points_charge_not_found")} />;
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        titleKey="admin_points_charge_page_detail"
        backHref="/admin/point-charges"
      />
      <AdminPointActionPanel request={request} onActionSuccess={load} />
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
              {formatAdminPhp(request.paymentAmount)} → {formatAdminNumber(request.pointAmount)}P
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
                    ? "bg-sam-success-soft text-sam-success"
                    : request.requestStatus === "rejected"
                      ? "bg-sam-danger-soft text-sam-danger"
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
              {formatAdminManilaDateTime(request.requestedAt)} /{" "}
              {formatAdminManilaDateTime(request.updatedAt)}
            </dd>
          </div>
          {request.approvedAt ? (
            <div>
              <dt className="text-sam-muted">{t("admin_points_charge_label_approved_at")}</dt>
              <dd className="text-sam-fg">
                {formatAdminManilaDateTime(request.approvedAt)}
                {request.approvedBy ? ` · ${request.approvedBy}` : ""}
              </dd>
            </div>
          ) : null}
          {request.processedAt && request.requestStatus !== "approved" ? (
            <div>
              <dt className="text-sam-muted">{t("admin_points_charge_label_processed_at")}</dt>
              <dd className="text-sam-fg">
                {formatAdminManilaDateTime(request.processedAt)}
                {request.processedBy ? ` · ${request.processedBy}` : ""}
              </dd>
            </div>
          ) : null}
          {request.userMemo && (
            <div>
              <dt className="text-sam-muted">{t("admin_points_charge_label_user_memo")}</dt>
              <dd className="whitespace-pre-wrap text-sam-fg">{request.userMemo}</dd>
            </div>
          )}
        </dl>
      </AdminCard>
      <AdminCard titleKey="admin_points_admin_memo_card">
        {memoErr ? <p className="mb-2 sam-text-helper text-sam-danger">{memoErr}</p> : null}
        <div className="flex gap-2">
          <input
            type="text"
            value={memoInput}
            onChange={(e) => setMemoInput(e.target.value)}
            placeholder={t("admin_points_admin_memo_ph")}
            className="flex-1 rounded border border-sam-border px-3 py-2 sam-text-body"
          />
          <AdminActionButton variant="secondary" disabled={memoBusy} onClick={() => void handleSaveMemo()}>
            {memoBusy ? "…" : t("common_save")}
          </AdminActionButton>
        </div>
        {request.adminMemo && (
          <p className="mt-2 sam-text-body-secondary text-sam-muted">{request.adminMemo}</p>
        )}
      </AdminCard>
      <AdminCard titleKey="admin_points_charge_card_manual_adjust">
        <p className="sam-text-body-secondary text-sam-muted">
          {t("admin_points_charge_manual_adjust_hint")}
        </p>
      </AdminCard>
    </div>
  );
}
