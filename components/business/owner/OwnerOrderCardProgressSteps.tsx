"use client";

import { isDeliveryFulfillment } from "@/lib/stores/order-status-transitions";
import {
  TIMELINE_DELIVERY_STEPS,
  TIMELINE_PICKUP_STEPS,
} from "@/lib/stores/store-order-process-criteria";
import {
  OwnerFlowStepIconMini,
  ownerFlowIconForStepIndex,
} from "@/components/stores/owner/dashboard/owner-order-flow-icons";

function activeStepIndex(status: string, deliveryLike: boolean): number {
  if (status === "pending") return 0;
  if (status === "completed") return 4;
  if (status === "accepted") return 1;
  if (status === "preparing") return 1;
  if (status === "ready_for_pickup") return deliveryLike ? 1 : 2;
  if (deliveryLike && (status === "delivering" || status === "arrived")) return 2;
  return 0;
}

function stepsFor(deliveryLike: boolean): readonly string[] {
  return deliveryLike ? TIMELINE_DELIVERY_STEPS : TIMELINE_PICKUP_STEPS;
}

export function OwnerOrderCardProgressSteps({
  orderStatus,
  fulfillmentType,
}: {
  orderStatus: string;
  fulfillmentType: string;
}) {
  const deliveryLike = isDeliveryFulfillment(fulfillmentType);
  const steps = stepsFor(deliveryLike);
  const terminal = new Set(["cancelled", "refunded", "refund_requested"]);
  if (terminal.has(orderStatus)) {
    return (
      <p className="mt-2 text-center text-[12px] text-[#8C8C8C]">
        {orderStatus === "refund_requested"
          ? "환불 요청 처리 중"
          : orderStatus === "refunded"
            ? "환불 완료"
            : "취소된 주문"}
      </p>
    );
  }

  const cur = activeStepIndex(orderStatus, deliveryLike);
  const allDone = orderStatus === "completed";

  return (
    <div className="mt-3 flex items-center justify-between px-0.5">
      {steps.map((label, i) => {
        const done = allDone || cur > i;
        const active = !allDone && cur === i;
        const { Icon, bg } = ownerFlowIconForStepIndex(i, deliveryLike);
        return (
          <div key={label} className="flex min-w-0 flex-1 items-center">
            <div className="flex min-w-0 flex-1 flex-col items-center">
              <OwnerFlowStepIconMini Icon={Icon} bg={bg} active={active} done={done} />
              <span
                className={`mt-1 line-clamp-1 w-full text-center text-[10px] font-medium leading-tight ${
                  active ? "text-[#2D7FF9]" : done ? "text-[#262626]" : "text-[#BFBFBF]"
                }`}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 ? (
              <span
                className="mx-0.5 mb-4 h-0.5 min-w-[6px] flex-1 rounded-full"
                style={{ backgroundColor: done ? "#2D7FF9" : "#E8E8E8" }}
                aria-hidden
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
