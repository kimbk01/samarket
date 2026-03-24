"use client";

import type { DeliveryFulfillmentMode } from "@/lib/stores/delivery-mock/types";

const DELIVERY_FLOW = ["주문접수", "주문승인", "조리중", "조리완료", "배달중", "배달완료"];
const PICKUP_FLOW = ["주문접수", "주문승인", "조리중", "픽업대기", "픽업완료"];

export function OrderTimeline({
  mode,
  timelineIndex = 0,
}: {
  mode: DeliveryFulfillmentMode;
  timelineIndex?: number;
}) {
  const steps = mode === "delivery" ? DELIVERY_FLOW : PICKUP_FLOW;
  const idx = Math.min(Math.max(0, timelineIndex), steps.length - 1);

  return (
    <ol className="space-y-2">
      {steps.map((label, i) => {
        const done = i <= idx;
        return (
          <li
            key={label}
            className={`flex items-center gap-2 text-sm ${done ? "font-semibold text-signature" : "text-gray-400"}`}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px]">
              {done ? "✓" : i}
            </span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}
