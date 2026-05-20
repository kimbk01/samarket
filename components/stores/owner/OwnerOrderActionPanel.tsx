"use client";

import { useState } from "react";
import { resolveOwnerNextOrderAction } from "@/lib/business/owner-order-stepper-transition";
import { labelForOwnerTransition } from "@/lib/stores/store-order-process-criteria";
import { patchOwnerOrderStatusRemote } from "@/lib/store-owner/owner-order-remote";
import type { OwnerOrder } from "@/lib/store-owner/types";
import { RejectOrderModal } from "./RejectOrderModal";
import { dibayPerfBridgeOwnerStatusChange } from "@/lib/dibay/delivery-flow-perf";

function btnClass(primary?: boolean) {
  return primary
    ? "flex-1 rounded-ui-rect bg-sam-ink py-3 text-sm font-bold text-white shadow-sm active:scale-[0.99] disabled:opacity-50"
    : "flex-1 rounded-ui-rect bg-sam-surface py-3 text-sm font-semibold text-sam-fg ring-1 ring-sam-border active:bg-sam-app disabled:opacity-50";
}

export function OwnerOrderActionPanel({
  storeId,
  order,
  layout = "default",
  onAfterAction,
}: {
  storeId: string;
  order: OwnerOrder;
  layout?: "default" | "detail";
  onAfterAction?: () => void | Promise<void>;
}) {
  const [toast, setToast] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const fulfillment =
    order.fulfillment_type ?? (order.order_type === "delivery" ? "local_delivery" : "pickup");
  const nextAction = resolveOwnerNextOrderAction(order.order_status, fulfillment);

  const s = order.order_status;

  const patch = async (order_status: string) => {
    const label = labelForOwnerTransition(s, order_status, fulfillment);
    dibayPerfBridgeOwnerStatusChange(order.id);
    setBusy(order_status);
    const r = await patchOwnerOrderStatusRemote(storeId, order.id, order_status);
    setBusy((prev) => (prev === null ? prev : null));
    if (r.ok) {
      setToast(`${label} 반영됨`);
      await onAfterAction?.();
    } else {
      setToast(r.error);
    }
    setTimeout(() => setToast((prev) => (prev === null ? prev : null)), 2600);
  };

  const wrap = layout === "detail" ? "flex flex-col gap-2 sm:flex-row sm:flex-wrap" : "flex flex-wrap gap-2";

  if (s === "refund_requested") {
    return (
      <div className="space-y-2">
        <p className="rounded-ui-rect bg-amber-50 px-3 py-2 text-center text-xs text-amber-950 ring-1 ring-amber-200">
          구매자가 환불을 요청했습니다. 비즈니스 콘솔 또는 관리자 처리 흐름을 이용해 주세요.
        </p>
      </div>
    );
  }

  if (s === "refunded") {
    return (
      <p className="rounded-ui-rect bg-sam-surface-muted px-3 py-2 text-center text-xs text-sam-muted ring-1 ring-sam-border">
        환불 처리된 주문입니다.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {toast ? (
        <p className="rounded-ui-rect bg-sam-surface-muted px-3 py-2 text-center text-xs text-sam-fg ring-1 ring-sam-border">
          {toast}
        </p>
      ) : null}

      {order.buyer_cancel_request ? (
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
          <p className="font-semibold text-amber-950">고객 취소 요청</p>
          <p className="mt-1 text-xs text-amber-900">{order.buyer_cancel_request.reason}</p>
        </div>
      ) : null}

      <div className={wrap}>
        {s === "pending" ? (
          <button
            type="button"
            disabled={busy !== null}
            className={btnClass()}
            onClick={() => setRejectOpen((prev) => (prev ? prev : true))}
          >
            주문 거절
          </button>
        ) : null}

        {nextAction ? (
          <button
            type="button"
            disabled={busy !== null}
            className={btnClass(true)}
            onClick={() => void patch(nextAction.status)}
          >
            {nextAction.label}
          </button>
        ) : null}
      </div>

      <RejectOrderModal
        open={rejectOpen}
        warnAccepted={
          s === "accepted" ||
          s === "preparing" ||
          s === "delivering" ||
          s === "ready_for_pickup" ||
          s === "arrived"
        }
        onClose={() => setRejectOpen((prev) => (prev ? false : prev))}
        onConfirm={(reason) => {
          void reason;
          setRejectOpen((prev) => (prev ? false : prev));
          void patch("cancelled");
        }}
      />
    </div>
  );
}
