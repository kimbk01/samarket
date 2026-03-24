"use client";

import { useState } from "react";
import { allowedOrderTransitions } from "@/lib/stores/order-status-transitions";
import { labelForOwnerTransition } from "@/lib/stores/store-order-process-criteria";
import { patchOwnerOrderStatusRemote } from "@/lib/store-owner/owner-order-remote";
import type { OwnerOrder } from "@/lib/store-owner/types";
import { RejectOrderModal } from "./RejectOrderModal";

function btnClass(primary?: boolean) {
  return primary
    ? "flex-1 rounded-xl bg-gray-900 py-3 text-sm font-bold text-white shadow-sm active:scale-[0.99] disabled:opacity-50"
    : "flex-1 rounded-xl bg-white py-3 text-sm font-semibold text-gray-800 ring-1 ring-gray-200 active:bg-gray-50 disabled:opacity-50";
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
  const nextStatuses = allowedOrderTransitions(order.order_status, fulfillment);

  const s = order.order_status;

  const patch = async (order_status: string) => {
    const label = labelForOwnerTransition(s, order_status, fulfillment);
    setBusy(order_status);
    const r = await patchOwnerOrderStatusRemote(storeId, order.id, order_status);
    setBusy(null);
    if (r.ok) {
      setToast(`${label} 반영됨`);
      await onAfterAction?.();
    } else {
      setToast(r.error);
    }
    setTimeout(() => setToast(null), 2600);
  };

  const isDeliveryLike =
    fulfillment === "local_delivery" || fulfillment === "shipping";

  const wrap = layout === "detail" ? "flex flex-col gap-2 sm:flex-row sm:flex-wrap" : "flex flex-wrap gap-2";

  if (s === "refund_requested") {
    return (
      <div className="space-y-2">
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-center text-xs text-amber-950 ring-1 ring-amber-200">
          구매자가 환불을 요청했습니다. 비즈니스 콘솔 또는 관리자 처리 흐름을 이용해 주세요.
        </p>
      </div>
    );
  }

  if (s === "refunded") {
    return (
      <p className="rounded-lg bg-gray-100 px-3 py-2 text-center text-xs text-gray-600 ring-1 ring-gray-200">
        환불 처리된 주문입니다.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {toast ? (
        <p className="rounded-lg bg-gray-100 px-3 py-2 text-center text-xs text-gray-800 ring-1 ring-gray-200">
          {toast}
        </p>
      ) : null}

      {order.buyer_cancel_request ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
          <p className="font-semibold text-amber-950">고객 취소 요청</p>
          <p className="mt-1 text-xs text-amber-900">{order.buyer_cancel_request.reason}</p>
        </div>
      ) : null}

      <div className={wrap}>
        {s === "pending" && nextStatuses.includes("accepted") ? (
          <button
            type="button"
            disabled={busy !== null}
            className={btnClass(true)}
            onClick={() => void patch("accepted")}
          >
            {labelForOwnerTransition(s, "accepted", fulfillment)}
          </button>
        ) : null}

        {s === "pending" && nextStatuses.includes("cancelled") ? (
          <button type="button" disabled={busy !== null} className={btnClass()} onClick={() => setRejectOpen(true)}>
            주문 거절
          </button>
        ) : null}

        {s === "accepted" && nextStatuses.includes("preparing") ? (
          <button
            type="button"
            disabled={busy !== null}
            className={btnClass(true)}
            onClick={() => void patch("preparing")}
          >
            {labelForOwnerTransition(s, "preparing", fulfillment)}
          </button>
        ) : null}

        {s === "accepted" && nextStatuses.includes("cancelled") ? (
          <button type="button" disabled={busy !== null} className={btnClass()} onClick={() => setRejectOpen(true)}>
            주문 취소
          </button>
        ) : null}

        {s === "preparing" && nextStatuses.includes("ready_for_pickup") ? (
          <button
            type="button"
            disabled={busy !== null}
            className={btnClass(true)}
            onClick={() => void patch("ready_for_pickup")}
          >
            {labelForOwnerTransition(s, "ready_for_pickup", fulfillment)}
          </button>
        ) : null}

        {s === "preparing" && nextStatuses.includes("cancelled") ? (
          <button type="button" disabled={busy !== null} className={btnClass()} onClick={() => setRejectOpen(true)}>
            주문 취소
          </button>
        ) : null}

        {s === "ready_for_pickup" && nextStatuses.includes("delivering") && isDeliveryLike ? (
          <button
            type="button"
            disabled={busy !== null}
            className={btnClass(true)}
            onClick={() => void patch("delivering")}
          >
            {labelForOwnerTransition(s, "delivering", fulfillment)}
          </button>
        ) : null}

        {s === "ready_for_pickup" && nextStatuses.includes("completed") && !isDeliveryLike ? (
          <button
            type="button"
            disabled={busy !== null}
            className={btnClass(true)}
            onClick={() => void patch("completed")}
          >
            {labelForOwnerTransition(s, "completed", fulfillment)}
          </button>
        ) : null}

        {s === "ready_for_pickup" && nextStatuses.includes("cancelled") ? (
          <button type="button" disabled={busy !== null} className={btnClass()} onClick={() => setRejectOpen(true)}>
            주문 취소
          </button>
        ) : null}

        {s === "delivering" && nextStatuses.includes("arrived") ? (
          <button
            type="button"
            disabled={busy !== null}
            className={btnClass(true)}
            onClick={() => void patch("arrived")}
          >
            {labelForOwnerTransition(s, "arrived", fulfillment)}
          </button>
        ) : null}

        {s === "delivering" && nextStatuses.includes("cancelled") ? (
          <button type="button" disabled={busy !== null} className={btnClass()} onClick={() => setRejectOpen(true)}>
            주문 취소
          </button>
        ) : null}

        {s === "arrived" && nextStatuses.includes("completed") ? (
          <button
            type="button"
            disabled={busy !== null}
            className={btnClass(true)}
            onClick={() => void patch("completed")}
          >
            {labelForOwnerTransition(s, "completed", fulfillment)}
          </button>
        ) : null}

        {s === "arrived" && nextStatuses.includes("cancelled") ? (
          <button type="button" disabled={busy !== null} className={btnClass()} onClick={() => setRejectOpen(true)}>
            주문 취소
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
        onClose={() => setRejectOpen(false)}
        onConfirm={(reason) => {
          void reason;
          setRejectOpen(false);
          void patch("cancelled");
        }}
      />
    </div>
  );
}
