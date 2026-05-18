"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { MemberOrder } from "@/lib/member-orders/types";

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

const STATUS_MSG_KEY: Record<string, MessageKey> = {
  pending: "member_order_status_msg_pending",
  accepted: "member_order_status_msg_accepted",
  preparing: "member_order_status_msg_preparing",
  delivering: "member_order_status_msg_delivering",
  ready_for_pickup: "member_order_status_msg_ready_for_pickup",
  arrived: "member_order_status_msg_arrived",
  completed: "member_order_status_msg_completed",
  cancelled: "member_order_status_msg_cancelled",
  cancel_requested: "member_order_status_msg_cancel_requested",
  refund_requested: "member_order_status_msg_refund_requested",
  refunded: "member_order_status_msg_refunded",
};

function stepIndex(order: MemberOrder, steps: readonly string[]): number {
  const s = order.order_status;
  if (["cancelled", "cancel_requested", "refund_requested", "refunded"].includes(s)) {
    return -1;
  }
  const i = steps.indexOf(s);
  if (i >= 0) return i;
  return 0;
}

function statusLabel(t: (key: MessageKey) => string, status: string): string {
  const key = STATUS_MSG_KEY[status];
  return key ? t(key) : status;
}

export function MemberOrderStepper({ order }: { order: MemberOrder }) {
  const { t } = useI18n();
  const steps = order.order_type === "delivery" ? DELIVERY_STEPS : PICKUP_STEPS;
  const idx = stepIndex(order, steps);
  const issue = idx < 0;

  if (issue) {
    return (
      <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
        <p className="font-semibold">{statusLabel(t, order.order_status)}</p>
        <p className="mt-1 text-xs text-amber-900">{t("member_order_stepper_hidden_during_issue")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between gap-1">
        {steps.map((key, i) => {
          const done = i <= idx;
          const current = i === idx;
          const stepKey = STATUS_MSG_KEY[key];
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
              <span className="hidden text-center sam-text-xxs font-medium text-sam-muted sm:block">
                {stepKey ? t(stepKey) : key}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-center text-sm font-semibold text-sam-fg">{statusLabel(t, order.order_status)}</p>
    </div>
  );
}
