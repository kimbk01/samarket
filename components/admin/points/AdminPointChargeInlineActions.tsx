"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { pointPaymentMethodLabel } from "@/components/admin/points/admin-points-notifications-i18n";

import { useState } from "react";
import type { PointChargeRequest } from "@/lib/types/point";
import { PointChargeBadge } from "@/components/points/PointChargeBadge";
import Link from "next/link";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { resolveAdminApiErrorMessage } from "@/lib/admin/admin-api-error-i18n";
import { runPointChargeAction, type PointChargeAction } from "@/components/admin/points/point-charge-action-client";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminTechId } from "@/components/admin/ui/AdminTechId";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { formatAdminNumber, formatAdminPhp } from "@/lib/admin/ui-standard/admin-format";

interface AdminPointChargeInlineActionsProps {
  requests: PointChargeRequest[];
  onActionSuccess?: () => void | Promise<void>;
  /** 접근표 쓰기 권한 — false 면 처리 버튼 비활성 (서버 가드는 그대로). */
  actionAllowed?: boolean;
}

export function AdminPointChargeInlineActions({
  requests,
  onActionSuccess,
  actionAllowed = true,
}: AdminPointChargeInlineActionsProps) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [busyId, setBusyId] = useState<string | null>(null);
  const [memoInputs, setMemoInputs] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");

  const doAction = async (r: PointChargeRequest, action: PointChargeAction, memo?: string) => {
    if (busyId) return;
    setBusyId(r.id);
    setErr("");
    try {
      const out = await runPointChargeAction({
        requestId: r.id,
        action,
        ko,
        summary: `${r.userNickname} · ${formatAdminNumber(r.pointAmount)}P · ${formatAdminPhp(r.paymentAmount)} · ${r.depositorName || "-"}`,
        adminMemo: memo,
      });
      if (!out.ok) {
        if (!out.cancelled) setErr(resolveAdminApiErrorMessage(out.error, t, "admin_points_err_action_failed"));
        return;
      }
      await onActionSuccess?.();
    } finally {
      setBusyId(null);
    }
  };

  if (requests.length === 0) {
    return (
      <p className="py-10 text-center sam-text-body-secondary text-sam-meta">{t("admin_points_charge_empty_list")}</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      {err ? (
        <p role="alert" className="mb-2 rounded-ui-rect border border-sam-danger bg-sam-danger-soft px-3 py-2 sam-text-helper text-sam-fg">
          {err}
        </p>
      ) : null}
      <table className="w-full min-w-[820px] border-collapse sam-text-body-secondary">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app sam-text-helper">
            {[
              t("admin_points_charge_th_applicant"),
              t("admin_points_charge_th_plan_points"),
              t("admin_points_charge_th_payment"),
              t("admin_points_charge_th_depositor"),
              t("admin_points_th_status"),
              t("admin_points_charge_th_requested_at"),
              t("admin_points_charge_th_memo"),
              t("admin_points_th_action"),
            ].map((h) => (
              <th key={h} className="px-3 py-2.5 text-left font-semibold text-sam-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => {
            const busy = busyId === r.id;
            const canAct =
              r.requestStatus === "pending" ||
              r.requestStatus === "waiting_confirm" ||
              r.requestStatus === "on_hold";
            const memo = memoInputs[r.id] ?? r.adminMemo ?? "";
            return (
              <tr
                key={r.id}
                className={`border-b border-sam-border-soft hover:bg-sam-app ${
                  r.requestStatus === "waiting_confirm" ? "bg-sam-warning-soft" : ""
                }`}
              >
                <td className="px-3 py-2.5">
                  <Link
                    href={`/admin/users/${r.userId}?tab=points`}
                    className="font-semibold text-sam-primary hover:underline"
                  >
                    {r.userNickname}
                  </Link>
                  <AdminTechId id={r.userId} className="sam-text-xxs text-sam-meta" />
                </td>
                <td className="px-3 py-2.5">
                  <p className="font-medium text-sam-fg">{r.planName}</p>
                  <p className="sam-text-helper font-bold tabular-nums text-sam-info">+{formatAdminNumber(r.pointAmount)}P</p>
                  <p className="sam-text-xxs tabular-nums text-sam-muted">{formatAdminPhp(r.paymentAmount)}</p>
                </td>
                <td className="px-3 py-2.5 text-sam-muted">
                  {pointPaymentMethodLabel(t, r.paymentMethod)}
                </td>
                <td className="px-3 py-2.5 text-sam-fg">
                  {r.depositorName || <span className="text-sam-meta">-</span>}
                </td>
                <td className="px-3 py-2.5">
                  <PointChargeBadge status={r.requestStatus} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-sam-muted">
                  {formatAdminManilaDateTime(r.requestedAt)}
                </td>
                <td className="px-3 py-2.5">
                  <input
                    type="text"
                    value={memo}
                    onChange={(e) =>
                      setMemoInputs((prev) => ({ ...prev, [r.id]: e.target.value }))
                    }
                    placeholder={t("admin_points_admin_memo_inline_ph")}
                    className="w-28 rounded border border-sam-border px-2 py-1 sam-text-xxs outline-none focus:border-sam-primary"
                  />
                </td>
                <td className="px-3 py-2.5">
                  {canAct ? (
                    <div className="flex flex-wrap gap-1">
                      <AdminActionButton
                        variant="ghost"
                        size="sm"
                        disabled={busy || !actionAllowed}
                        onClick={() => void doAction(r, "approve", memo)}
                      >
                        {adminCta("approve", ko)}
                      </AdminActionButton>
                      <AdminActionButton
                        variant="ghost"
                        size="sm"
                        disabled={busy || !actionAllowed}
                        onClick={() => void doAction(r, "reject", memo)}
                      >
                        {adminCta("reject", ko)}
                      </AdminActionButton>
                      {/* 행 버튼은 2개까지 — 보류는 상세 화면에서 (R7 버튼 배치). */}
                      <Link
                        href={`/admin/point-charges/${encodeURIComponent(r.id)}`}
                        className="self-center sam-text-xxs font-medium text-sam-primary hover:underline"
                        data-point-charge-detail-link="1"
                      >
                        {ko ? "상세" : "Details"}
                      </Link>
                    </div>
                  ) : (
                    <span className="sam-text-xxs text-sam-meta">{t("admin_points_done")}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
