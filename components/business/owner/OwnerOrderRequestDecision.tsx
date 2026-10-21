"use client";

/**
 * 매장 결정 — 고객 취소 요청 · 환불 요청 승인/반려 (3단계: 매장이 주문 처리의 주체).
 * Contract: lib/stores/owner-store-order-decision-contract.ts · POST …/orders/[orderId]/decide
 * Approve = confirm dialog; reject = reason sheet (reason reaches the buyer). The server re-checks
 * the status the owner saw; a stale view reloads instead of acting.
 */
import { useState } from "react";
import { dibayConfirm } from "@/components/ui/dibay-overlay";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerOrderRejectSheet } from "@/components/business/owner/OwnerOrderRejectSheet";
import { OwnerCta } from "@/lib/business/owner-cta-classes";
import { postOwnerStoreOrderDecision } from "@/lib/business/patch-owner-store-order-status";
import {
  ownerStoreOrderDecisionActions,
  type OwnerStoreOrderDecisionAction,
} from "@/lib/stores/owner-store-order-decision-contract";
import type { MessageKey } from "@/lib/i18n/messages";

const ERROR_KEYS: Record<string, MessageKey> = {
  status_changed: "store_owner_decision_err_status_changed",
  action_not_allowed_for_status: "store_owner_decision_err_status_changed",
  transition_conflict: "store_owner_decision_err_status_changed",
  order_admin_locked: "store_owner_decision_err_locked",
  refund_restore_status_unknown: "store_owner_decision_err_restore_unknown",
  cancel_restore_status_unknown: "store_owner_decision_err_restore_unknown",
  store_commission_charge_failed: "store_owner_decision_err_commission",
  store_commission_policy_missing: "store_owner_decision_err_commission",
};

/** Errors meaning the order moved under us → reload rather than retry. */
const RELOAD_ERRORS = new Set(["status_changed", "action_not_allowed_for_status", "transition_conflict"]);

export function OwnerOrderRequestDecision({
  storeId,
  orderId,
  orderStatus,
  compact = false,
  onDone,
}: {
  storeId: string;
  orderId: string;
  orderStatus: string;
  /** Smaller text for chat toolbars. */
  compact?: boolean;
  onDone: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<OwnerStoreOrderDecisionAction | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const actions = ownerStoreOrderDecisionActions(orderStatus);
  if (actions.length === 0) return null;

  const isCancel = orderStatus === "cancel_requested";
  const approveAction: OwnerStoreOrderDecisionAction = isCancel ? "cancel_request_approve" : "refund_approve";
  const rejectAction: OwnerStoreOrderDecisionAction = isCancel ? "cancel_request_reject" : "refund_reject";

  const run = async (action: OwnerStoreOrderDecisionAction, reason?: string) => {
    setBusy(action);
    setErr(null);
    const res = await postOwnerStoreOrderDecision(storeId, orderId, {
      action,
      ...(reason ? { reason } : {}),
      expected_status: orderStatus,
    });
    setBusy(null);
    if (!res.ok) {
      const key = ERROR_KEYS[res.error];
      setErr(key ? t(key) : t("store_owner_decision_err_failed", { code: res.error }));
      if (RELOAD_ERRORS.has(res.error)) await onDone();
      return false;
    }
    setRejectOpen(false);
    await onDone();
    return true;
  };

  const onApprove = async () => {
    const ok = await dibayConfirm({
      title: t(isCancel ? "store_owner_decision_approve_cancel" : "store_owner_decision_approve_refund"),
      description: t(isCancel ? "store_owner_decision_confirm_cancel" : "store_owner_decision_confirm_refund"),
      confirmTone: "destructive",
    });
    if (ok) await run(approveAction);
  };

  const text = compact ? "sam-text-xxs" : "sam-text-helper";
  return (
    <div className="flex w-full min-w-0 flex-col gap-2" data-owner-order-decision={orderStatus}>
      <p className={`rounded-ui-rect border border-sam-warning/30 bg-sam-warning-soft/80 px-2 py-2 leading-snug text-sam-fg ${text}`}>
        {t(isCancel ? "store_owner_decision_cancel_notice" : "store_owner_decision_refund_notice")}
      </p>
      {err ? <p className={`leading-snug text-sam-danger [overflow-wrap:anywhere] ${text}`}>{err}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy !== null}
          aria-busy={busy === rejectAction}
          onClick={() => setRejectOpen(true)}
          className={`min-h-11 flex-1 ${OwnerCta.danger}`}
          data-owner-decision-action={rejectAction}
        >
          {t("store_owner_decision_reject")}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          aria-busy={busy === approveAction}
          onClick={() => void onApprove()}
          className={`min-h-11 flex-[1.25] ${OwnerCta.primary}`}
          data-owner-decision-action={approveAction}
        >
          {busy === approveAction
            ? t("store_owner_decision_busy")
            : t(isCancel ? "store_owner_decision_approve_cancel" : "store_owner_decision_approve_refund")}
        </button>
      </div>
      <OwnerOrderRejectSheet
        open={rejectOpen}
        busy={busy === rejectAction}
        onClose={() => {
          if (!busy) setRejectOpen(false);
        }}
        onConfirm={(reason) => void run(rejectAction, reason)}
        title={t("store_owner_decision_reject_sheet_title")}
        description={t("store_owner_decision_reject_sheet_desc")}
        confirmLabel={t("store_owner_decision_reject")}
      />
    </div>
  );
}
