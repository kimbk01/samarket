"use client";

import { useCallback, useState } from "react";
import { OwnerOrderAcceptSheet } from "@/components/business/owner/OwnerOrderAcceptSheet";
import { OwnerOrderCardProgressSteps } from "@/components/business/owner/OwnerOrderCardProgressSteps";
import { OwnerOrderStepConfirmDialog } from "@/components/business/owner/OwnerOrderStepConfirmDialog";
import { patchOwnerStoreOrderStatus } from "@/lib/business/patch-owner-store-order-status";
import { runOwnerStoreOrderPatch } from "@/lib/business/owner-store-order-mutation";
import type { OwnerStoreOrderListRow } from "@/lib/business/owner-store-order-list-row-bridge";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  resolveOwnerStepperClickAction,
  type OwnerStepperClickAction,
} from "@/lib/business/owner-order-stepper-transition";
import { dispatchOwnerHubBadgeRefresh } from "@/lib/chats/chat-channel-events";
import { BUYER_PUBLIC_LABEL_FALLBACK } from "@/lib/stores/buyer-public-label";
import {
  formatOwnerOrderPatchErr,
  formatOwnerOrderPatchErrAfterReconcile,
} from "@/lib/business/owner-order-patch-errors";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import { useOwnerToast } from "@/components/business/owner/OwnerToastHost";

/** IA-23 — 409 계열(상태가 이미 바뀜): 목록 재조회 후 「최신 상태로 갱신」 문구 */
const OWNER_STEPPER_STALE_CODES = new Set(["invalid_transition", "transition_conflict"]);

export function OwnerStoreOrderCardStepperWithActions({
  storeId,
  orderId,
  orderStatus,
  fulfillmentType,
  buyerPublicLabel,
  onUpdated,
  onOrderStatusPatched,
  onPatchOrderRow,
  onReconcileOrder,
}: {
  storeId: string;
  orderId: string;
  orderStatus: string;
  fulfillmentType: string;
  buyerPublicLabel?: string | null;
  onUpdated: () => void | Promise<void>;
  onOrderStatusPatched?: (orderId: string) => void;
  onPatchOrderRow?: (orderId: string, patch: Partial<OwnerStoreOrderListRow>) => void;
  onReconcileOrder?: (orderId: string) => void | Promise<void>;
}) {
  const { language, t } = useI18n();
  const toast = useOwnerToast();
  const buyerLabel =
    typeof buyerPublicLabel === "string" && buyerPublicLabel.trim()
      ? buyerPublicLabel.trim()
      : BUYER_PUBLIC_LABEL_FALLBACK;

  const [busy, setBusy] = useState(false);
  /** IA-23 — 확인 다이얼로그 내부 오류 띠 */
  const [patchError, setPatchError] = useState<string | null>(null);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [confirm, setConfirm] = useState<Extract<OwnerStepperClickAction, { kind: "confirm" }> | null>(
    null
  );

  const runPatch = useCallback(
    async (nextStatus: string, estimatedPrepMinutes?: number): Promise<{ ok: boolean; message?: string }> => {
      setBusy(true);
      setPatchError(null);
      try {
        const body: { order_status: string; estimated_prep_minutes?: number } = {
          order_status: nextStatus,
        };
        if (estimatedPrepMinutes != null) {
          body.estimated_prep_minutes = estimatedPrepMinutes;
        }
        if (onPatchOrderRow) {
          const res = await runOwnerStoreOrderPatch(storeId, orderId, body, language, {
            onPatchOrderRow,
            onReconcileOrder,
          });
          if (!res.ok) return { ok: false, message: res.displayMessage };
        } else {
          const res = await patchOwnerStoreOrderStatus(storeId, orderId, body);
          if (!res.ok) {
            if (OWNER_STEPPER_STALE_CODES.has(res.error)) {
              await onUpdated();
              return { ok: false, message: formatOwnerOrderPatchErrAfterReconcile(language) };
            }
            const mapped = formatOwnerOrderPatchErr(res.error, language);
            return {
              ok: false,
              message: mapped === res.error ? resolveOwnerApiErrorMessage(res.error, t) : mapped,
            };
          }
        }
        dispatchOwnerHubBadgeRefresh({
          source: "owner-order-card-stepper",
          key: `${storeId}:${orderId}:${nextStatus}`,
        });
        onOrderStatusPatched?.(orderId);
        await onReconcileOrder?.(orderId);
        await onUpdated();
        return { ok: true };
      } finally {
        setBusy(false);
      }
    },
    [language, onOrderStatusPatched, onPatchOrderRow, onReconcileOrder, onUpdated, orderId, storeId, t]
  );

  const onStepClick = useCallback(
    (clickedStepIndex: number) => {
      if (busy) return;
      const action = resolveOwnerStepperClickAction(
        orderStatus,
        fulfillmentType,
        clickedStepIndex,
        buyerLabel
      );
      if (!action) return;
      setPatchError(null);
      if (action.kind === "accept_sheet") {
        setAcceptOpen(true);
        return;
      }
      setConfirm(action);
    },
    [busy, buyerLabel, fulfillmentType, orderStatus]
  );

  const onConfirmTransition = useCallback(() => {
    if (!confirm) return;
    void runPatch(confirm.nextStatus).then((r) => {
      if (r.ok) setConfirm(null);
      else setPatchError(r.message ?? t("common_error"));
    });
  }, [confirm, runPatch, t]);

  const onConfirmAccept = useCallback(
    (minutes: number) => {
      void runPatch("accepted", minutes).then((r) => {
        if (r.ok) setAcceptOpen(false);
        else toast.error(r.message ?? t("common_error"));
      });
    },
    [runPatch, t, toast]
  );

  return (
    <>
      <OwnerOrderCardProgressSteps
        orderStatus={orderStatus}
        fulfillmentType={fulfillmentType}
        interactive
        stepBusy={busy}
        onStepClick={onStepClick}
      />
      <OwnerOrderStepConfirmDialog
        open={confirm != null}
        busy={busy}
        message={confirm?.message ?? ""}
        errorMessage={patchError}
        onCancel={() => {
          if (busy) return;
          setConfirm(null);
          setPatchError(null);
        }}
        onConfirm={onConfirmTransition}
      />
      <OwnerOrderAcceptSheet
        open={acceptOpen}
        busy={busy}
        onClose={() => {
          if (!busy) setAcceptOpen(false);
        }}
        onConfirm={onConfirmAccept}
        overlayClassName="z-[95]"
      />
    </>
  );
}
