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
  const { language } = useI18n();
  const buyerLabel =
    typeof buyerPublicLabel === "string" && buyerPublicLabel.trim()
      ? buyerPublicLabel.trim()
      : BUYER_PUBLIC_LABEL_FALLBACK;

  const [busy, setBusy] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [confirm, setConfirm] = useState<Extract<OwnerStepperClickAction, { kind: "confirm" }> | null>(
    null
  );

  const runPatch = useCallback(
    async (nextStatus: string, estimatedPrepMinutes?: number) => {
      setBusy(true);
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
          if (!res.ok) return false;
        } else {
          const res = await patchOwnerStoreOrderStatus(storeId, orderId, body);
          if (!res.ok) return false;
        }
        dispatchOwnerHubBadgeRefresh({
          source: "owner-order-card-stepper",
          key: `${storeId}:${orderId}:${nextStatus}`,
        });
        onOrderStatusPatched?.(orderId);
        await onReconcileOrder?.(orderId);
        await onUpdated();
        return true;
      } finally {
        setBusy(false);
      }
    },
    [language, onOrderStatusPatched, onPatchOrderRow, onReconcileOrder, onUpdated, orderId, storeId]
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
    void runPatch(confirm.nextStatus).then((ok) => {
      if (ok) setConfirm(null);
    });
  }, [confirm, runPatch]);

  const onConfirmAccept = useCallback(
    (minutes: number) => {
      void runPatch("accepted", minutes).then((ok) => {
        if (ok) setAcceptOpen(false);
      });
    },
    [runPatch]
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
        onCancel={() => {
          if (!busy) setConfirm(null);
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
