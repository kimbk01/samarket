"use client";

import { isDeliveryFulfillment } from "@/lib/stores/order-status-transitions";
import { Biz } from "@/lib/ui/biz-component-classes";

type Step = { label: string };

function activeStepIndex(status: string, deliveryLike: boolean): number {
  if (status === "pending") return -1;
  if (status === "completed") {
    return deliveryLike ? 5 : 4;
  }
  if (status === "accepted") return 0;
  if (status === "preparing") return 1;
  if (status === "ready_for_pickup") return 2;
  if (deliveryLike) {
    if (status === "delivering" || status === "arrived") return 3;
    return 0;
  }
  return 0;
}

function stepsFor(deliveryLike: boolean): Step[] {
  if (deliveryLike) {
    return [
      { label: "주문접수" },
      { label: "조리중" },
      { label: "배달준비" },
      { label: "배달중" },
      { label: "완료" },
    ];
  }
  return [{ label: "주문접수" }, { label: "조리중" }, { label: "포장준비" }, { label: "완료" }];
}

export function OwnerOrderStatusTimeline({
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
      <div className="mt-2 rounded-ui-rect border border-[var(--biz-card-border)] bg-[var(--biz-primary-soft)] px-3 py-2">
        <p className={Biz.textMuted}>
          {orderStatus === "refund_requested"
            ? "환불 요청 처리 중입니다."
            : orderStatus === "refunded"
              ? "환불 완료된 주문입니다."
              : "취소된 주문입니다."}
        </p>
      </div>
    );
  }

  const cur = activeStepIndex(orderStatus, deliveryLike);
  const allDone = orderStatus === "completed";

  return (
    <ol className="mt-2 flex w-full min-w-0 list-none flex-nowrap gap-1 overflow-x-auto pb-1">
      {steps.map((step, i) => {
        const done = allDone || cur > i;
        const active = !allDone && cur === i;
        return (
          <li
            key={`${step.label}-${i}`}
            className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center"
            title={step.label}
          >
            <span
              className={[
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold",
                active
                  ? "border-[var(--biz-primary)] bg-[var(--biz-primary)] text-white"
                  : done
                    ? "border-emerald-500/80 bg-emerald-50 text-emerald-800"
                    : "border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] text-[var(--biz-text-muted)]",
              ].join(" ")}
            >
              {done ? "✓" : i + 1}
            </span>
            <span
              className={[
                "line-clamp-2 w-full px-0.5 text-[11px] font-medium leading-tight",
                active ? "text-[var(--biz-primary)]" : done ? "text-sam-fg" : "text-[var(--biz-text-muted)]",
              ].join(" ")}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
