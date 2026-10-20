"use client";

/**
 * 주문 상세 「관리자 개입」 — 예외 처리 전용 (매장이 주문 처리의 주체).
 * Contract: lib/admin/store-orders/admin-store-order-intervention-contract.ts
 * Server: POST /api/admin/store-orders/[orderId]/intervene (reason required, expected_status re-check).
 */
import { useState } from "react";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminCard } from "@/components/admin/AdminCard";
import { COMMISSION_PRESS } from "@/components/stores/commission/StoreCommissionLedgerParts";
import { emitAdminQueueChanged } from "@/lib/admin/admin-queue-events";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import {
  ADMIN_INTERVENTION_REASON_MAX,
  ADMIN_STORE_ORDER_INTERVENTION_ERROR,
  ADMIN_STORE_ORDER_INTERVENTION_LABEL,
  adminStoreOrderInterventionActions,
  normalizeAdminInterventionReason,
  type AdminStoreOrderInterventionAction,
} from "@/lib/admin/store-orders/admin-store-order-intervention-contract";

/** Reject reasons reach the store and buyer (existing reject notifications); others stay in the audit log. */
const BUYER_VISIBLE_REASON = new Set<AdminStoreOrderInterventionAction>(["cancel_request_reject", "refund_reject"]);

/** 환불 처리 기록 · 강제 취소 end the order → L3 (reason + order number typed again). Others L2 (reason). */
const L3_ACTIONS = new Set<AdminStoreOrderInterventionAction>(["refund_approve", "force_cancel"]);

/** Errors after which the panel reloads the order (state moved under us). */
const RELOAD_ERRORS = new Set(["status_changed", "transition_conflict", "action_not_allowed_for_status", "expected_status_required"]);

type Notice = { tone: "ok" | "error"; text: string };

/** Labels: contract SSOT (DEF-23 「환불 처리 기록」 / 「강제 취소」 live there). */
function panelLabel(action: AdminStoreOrderInterventionAction) {
  return ADMIN_STORE_ORDER_INTERVENTION_LABEL[action];
}

export function AdminStoreOrderInterventionPanel({
  orderId,
  orderNo,
  orderStatus,
  paymentStatus,
  statusLabel,
  onChanged,
}: {
  orderId: string;
  orderNo: string;
  orderStatus: string;
  paymentStatus: string;
  statusLabel: (status: string) => string;
  /** Reload the order + audit log after a decision (or a stale-state rejection). */
  onChanged: () => Promise<void> | void;
}) {
  const { language } = useI18n();
  const ko = language === "ko";
  const [busy, setBusy] = useState<AdminStoreOrderInterventionAction | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const actions = adminStoreOrderInterventionActions(orderStatus, paymentStatus);

  const errorText = (code: string) => {
    const e = ADMIN_STORE_ORDER_INTERVENTION_ERROR[code];
    return e ? (ko ? e.ko : e.en) : adminOperatorErrorMessage(code, ko);
  };

  const run = async (action: AdminStoreOrderInterventionAction) => {
    const label = panelLabel(action);
    const visibility = BUYER_VISIBLE_REASON.has(action)
      ? ko
        ? "반려 사유는 매장과 구매자에게 표시됩니다."
        : "The reason is shown to the store and buyer."
      : ko
        ? "사유는 관리자 감사 로그에만 기록됩니다."
        : "The reason is kept in the admin audit log only.";
    const confirmed = await confirmAdminAction({
      level: L3_ACTIONS.has(action) ? "L3" : "L2",
      ko,
      title: `${ko ? label.ko : label.en} · ${orderNo}`,
      description: `${ko ? label.confirmKo : label.confirmEn}\n${visibility}`,
      confirmLabel: ko ? label.ko : label.en,
      destructive: label.destructive,
      retypeValue: L3_ACTIONS.has(action) ? orderNo : undefined,
      reasonPlaceholder: ko
        ? `사유 (필수, ${ADMIN_INTERVENTION_REASON_MAX}자 이내)`
        : `Reason (required, max ${ADMIN_INTERVENTION_REASON_MAX})`,
    });
    if (!confirmed.ok) return;
    const reason = normalizeAdminInterventionReason(confirmed.reason);
    if (!reason.ok) {
      setNotice({ tone: "error", text: errorText(reason.error) });
      return;
    }

    setBusy(action);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/store-orders/${encodeURIComponent(orderId)}/intervene`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason.reason, expected_status: orderStatus }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        from_status?: string;
        order_status?: string;
      };
      if (!res.ok || j.ok !== true) {
        const code = typeof j.error === "string" ? j.error : res.status === 403 ? "forbidden" : "action_failed";
        setNotice({ tone: "error", text: errorText(code) });
        if (RELOAD_ERRORS.has(code)) await onChanged();
        return;
      }
      emitAdminQueueChanged("orders_attention");
      setNotice({
        tone: "ok",
        text: ko
          ? `${label.ko} 완료 · ${statusLabel(j.from_status ?? orderStatus)} → ${statusLabel(j.order_status ?? "")}`
          : `${label.en} done · ${statusLabel(j.from_status ?? orderStatus)} → ${statusLabel(j.order_status ?? "")}`,
      });
      await onChanged();
    } catch {
      setNotice({ tone: "error", text: ko ? "네트워크 오류로 처리하지 못했습니다." : "Network error." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminCard title={ko ? "관리자 개입" : "Admin intervention"}>
      <div className="space-y-3" data-admin-intervention-panel="1">
        <p className="sam-text-helper text-sam-muted">
          {ko
            ? "주문 처리와 취소·환불 결정은 매장이 합니다. 매장 결정을 관리자가 대신하는 예외(분쟁·처리 불능)에만 사용하고, 모든 처리는 사유와 처리자가 기록됩니다."
            : "The store runs the order. Use only for exceptions; every action records the reason and the admin."}
        </p>
        {actions.length === 0 ? (
          <p className="sam-text-body-secondary text-sam-muted" data-intervention-empty="1">
            {ko ? `현재 상태(${statusLabel(orderStatus)})에서는 개입할 수 있는 처리가 없습니다.` : `No action for the current status (${statusLabel(orderStatus)}).`}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => {
              const label = panelLabel(a);
              const isBusy = busy === a;
              return (
                <AdminActionButton
                  key={a}
                  variant={label.destructive ? "danger" : "secondary"}
                  disabled={busy !== null}
                  aria-busy={isBusy}
                  data-intervention-action={a}
                  onClick={() => void run(a)}
                  className={COMMISSION_PRESS}
                >
                  {ko ? label.ko : label.en}
                </AdminActionButton>
              );
            })}
          </div>
        )}
        {notice ? (
          <p
            role={notice.tone === "error" ? "alert" : "status"}
            className={`rounded-ui-rect px-3 py-2 sam-text-helper ${
              notice.tone === "error" ? "bg-sam-danger-soft text-sam-danger" : "bg-sam-success-soft text-sam-success"
            }`}
          >
            {notice.text}
          </p>
        ) : null}
      </div>
    </AdminCard>
  );
}
