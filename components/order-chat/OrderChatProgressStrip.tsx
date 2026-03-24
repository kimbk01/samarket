"use client";

import type { SharedOrderStatus } from "@/lib/shared-orders/types";
import type { OrderChatFlow } from "@/lib/shared-order-chat/chat-message-builder";
import {
  TIMELINE_DELIVERY_STEPS,
  TIMELINE_PICKUP_STEPS,
  storeOrderTimelineCurrentStep,
} from "@/lib/stores/store-order-process-criteria";

export function OrderChatProgressStrip({
  orderStatus,
  orderFlow,
}: {
  orderStatus: SharedOrderStatus;
  orderFlow: OrderChatFlow;
}) {
  const terminal: SharedOrderStatus[] = [
    "cancel_requested",
    "cancelled",
    "refund_requested",
    "refunded",
  ];
  const isTerminal = terminal.includes(orderStatus);

  const labels =
    orderFlow === "delivery" ? ([...TIMELINE_DELIVERY_STEPS] as const) : ([...TIMELINE_PICKUP_STEPS] as const);
  const ft = orderFlow === "delivery" ? "local_delivery" : "pickup";
  const cur = storeOrderTimelineCurrentStep(ft, orderStatus);
  const allDone = orderStatus === "completed";

  return (
    <div className="border-b border-gray-100 bg-white px-2 py-2">
      <p className="mb-1.5 text-center text-[10px] font-medium text-gray-400">주문 진행</p>
      <ol className="mx-auto flex max-w-md items-start justify-between gap-0.5">
        {labels.map((label, i) => {
          const done = !isTerminal && (allDone || i < cur);
          const on = !isTerminal && !allDone && i === cur;
          return (
            <li key={label} className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  isTerminal
                    ? "bg-gray-100 text-gray-300"
                    : on
                      ? "bg-violet-600 text-white ring-2 ring-violet-200"
                      : done
                        ? "bg-violet-100 text-violet-800"
                        : "bg-gray-100 text-gray-400"
                }`}
              >
                {isTerminal ? "—" : done ? "✓" : i + 1}
              </span>
              <span
                className={`text-center text-[9px] font-medium leading-tight sm:text-[10px] ${
                  isTerminal ? "text-gray-300" : on ? "text-violet-800" : done ? "text-gray-700" : "text-gray-400"
                }`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
      {isTerminal ? (
        <p className="mt-1 text-center text-[10px] text-gray-500">취소·환불 등 처리 단계입니다.</p>
      ) : null}
    </div>
  );
}
