"use client";

import type { MemberOrder } from "@/lib/member-orders/types";
import { MEMBER_STATUS_USER_MESSAGE } from "@/lib/member-orders/member-order-labels";

const DELIVERY_STEPS = [
  "pending",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "delivering",
  "arrived",
  "completed",
] as const;
const PICKUP_STEPS = ["pending", "accepted", "preparing", "ready_for_pickup", "completed"] as const;

function stepIndex(
  order: MemberOrder,
  steps: readonly string[]
): number {
  const s = order.order_status;
  if (["cancelled", "cancel_requested", "refund_requested", "refunded"].includes(s)) {
    return -1;
  }
  const i = steps.indexOf(s);
  if (i >= 0) return i;
  return 0;
}

export function MemberOrderStepper({ order }: { order: MemberOrder }) {
  const steps = order.order_type === "delivery" ? DELIVERY_STEPS : PICKUP_STEPS;
  const idx = stepIndex(order, steps);
  const issue = idx < 0;

  if (issue) {
    return (
      <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
        <p className="font-semibold">{MEMBER_STATUS_USER_MESSAGE[order.order_status]}</p>
        <p className="mt-1 text-xs text-amber-900">진행 단계는 취소·환불 처리 중에는 표시되지 않아요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between gap-1">
        {steps.map((key, i) => {
          const done = i <= idx;
          const current = i === idx;
          return (
            <div key={key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                  done
                    ? current
                      ? "bg-sam-ink text-white ring-2 ring-sam-border ring-offset-2"
                      : "bg-sam-ink text-white"
                    : "bg-sam-surface-muted text-sam-meta"
                }`}
              >
                {i + 1}
              </div>
              <span className="hidden text-center text-[9px] font-medium text-sam-muted sm:block">
                {MEMBER_STATUS_USER_MESSAGE[key as keyof typeof MEMBER_STATUS_USER_MESSAGE]}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-center text-sm font-semibold text-sam-fg">
        {MEMBER_STATUS_USER_MESSAGE[order.order_status]}
      </p>
    </div>
  );
}
