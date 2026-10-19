"use client";

/**
 * 주문 상세 「관리자 개입」 — 예외 처리 전용 (매장이 주문 처리의 주체).
 * Contract: lib/admin/store-orders/admin-store-order-intervention-contract.ts
 * Server: POST /api/admin/store-orders/[orderId]/intervene (reason required, expected_status re-check).
 */
import { useState } from "react";
import { dibayPrompt } from "@/components/ui/dibay-overlay";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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

/** Refund approval and admin cancel end the order / move money → order number typed again. */
const DOUBLE_CONFIRM = new Set<AdminStoreOrderInterventionAction>(["refund_approve", "force_cancel"]);

/** Errors after which the panel reloads the order (state moved under us). */
const RELOAD_ERRORS = new Set(["status_changed", "transition_conflict", "action_not_allowed_for_status"]);

type Notice = { tone: "ok" | "error"; text: string };

type InterventionLabel = (typeof ADMIN_STORE_ORDER_INTERVENTION_LABEL)[AdminStoreOrderInterventionAction];

/**
 * DEF-23 — operator-facing CTA copy. Customers pay the store directly, so 「환불」 here only records
 * the refund state; no platform money moves. Admin cancel is labelled 「강제 취소」.
 */
const PANEL_LABEL_OVERRIDE: Partial<Record<AdminStoreOrderInterventionAction, Partial<InterventionLabel>>> = {
  refund_approve: {
    ko: "환불 처리 기록",
    en: "Record refund",
    confirmKo:
      "고객은 매장에 직접 결제했으므로 플랫폼에서 돈이 이동하지 않습니다. 매장이 고객에게 환불한 사실을 기록하고, 주문을 환불 완료로 바꾸며 상품권·재고를 복원합니다. 수수료는 수수료 검토로 넘어갑니다.",
    confirmEn:
      "The customer paid the store directly, so no platform money moves. This records that the store refunded the customer, marks the order refunded and restores gift/stock. The fee goes to commission review.",
  },
  force_cancel: {
    ko: "강제 취소",
    en: "Force cancel",
  },
};

function panelLabel(action: AdminStoreOrderInterventionAction): InterventionLabel {
  return { ...ADMIN_STORE_ORDER_INTERVENTION_LABEL[action], ...PANEL_LABEL_OVERRIDE[action] };
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
    const raw = await dibayPrompt({
      title: `${ko ? label.ko : label.en} · ${orderNo}`,
      description: `${ko ? label.confirmKo : label.confirmEn}\n${visibility}`,
      placeholder: ko ? `사유 (필수, ${ADMIN_INTERVENTION_REASON_MAX}자 이내)` : `Reason (required, max ${ADMIN_INTERVENTION_REASON_MAX})`,
      confirmLabel: ko ? label.ko : label.en,
      confirmTone: label.destructive ? "destructive" : "primary",
      required: true,
    });
    if (raw == null) return;
    const reason = normalizeAdminInterventionReason(raw);
    if (!reason.ok) {
      setNotice({ tone: "error", text: errorText(reason.error) });
      return;
    }
    // Money-moving / order-ending actions: type the order number again (double confirmation).
    if (DOUBLE_CONFIRM.has(action)) {
      const typed = await dibayPrompt({
        title: ko ? "주문번호 확인" : "Confirm order number",
        description: ko
          ? `되돌릴 수 없는 처리입니다. 확인을 위해 주문번호 ${orderNo} 를 입력하세요.`
          : `This cannot be undone. Type the order number ${orderNo} to confirm.`,
        placeholder: orderNo,
        confirmLabel: ko ? label.ko : label.en,
        confirmTone: "destructive",
        required: true,
      });
      if (typed == null) return;
      if (typed.trim() !== orderNo) {
        setNotice({ tone: "error", text: ko ? "주문번호가 일치하지 않아 처리하지 않았습니다." : "Order number did not match — nothing was done." });
        return;
      }
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
                <button
                  key={a}
                  type="button"
                  disabled={busy !== null}
                  aria-busy={isBusy}
                  data-intervention-action={a}
                  onClick={() => void run(a)}
                  className={`inline-flex min-h-10 items-center rounded-ui-rect px-4 py-2 sam-text-helper font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${COMMISSION_PRESS} ${
                    label.destructive
                      ? "border border-sam-danger/40 bg-sam-danger-soft text-sam-danger hover:opacity-90 active:opacity-80"
                      : "border border-sam-border bg-sam-surface text-sam-fg hover:bg-sam-surface-muted active:bg-sam-surface-muted"
                  }`}
                >
                  {isBusy ? (ko ? "처리 중…" : "Working…") : ko ? label.ko : label.en}
                </button>
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
