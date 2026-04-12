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
    <div className="border-b border-sam-border-soft bg-sam-surface px-2 py-2">
      <p className="mb-1.5 text-center text-[10px] font-medium text-sam-meta">주문 진행</p>
      <ol className="mx-auto flex max-w-md items-start justify-between gap-0.5">
        {labels.map((label, i) => {
          const done = !isTerminal && (allDone || i < cur);
          const on = !isTerminal && !allDone && i === cur;
          return (
            <li key={label} className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  isTerminal
                    ? "bg-sam-surface-muted text-sam-meta"
                    : on
                      ? "bg-signature text-white ring-2 ring-sam-border"
                      : done
                        ? "bg-signature/10 text-sam-fg"
                        : "bg-sam-surface-muted text-sam-meta"
                }`}
              >
                {isTerminal ? "—" : done ? "✓" : i + 1}
              </span>
              <span
                className={`text-center text-[9px] font-medium leading-tight sm:text-[10px] ${
                  isTerminal ? "text-sam-meta" : on ? "text-sam-fg" : done ? "text-sam-fg" : "text-sam-meta"
                }`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
      {isTerminal ? (
        <p className="mt-1 text-center text-[10px] text-sam-muted">취소·환불 등 처리 단계입니다.</p>
      ) : null}
    </div>
  );
}
