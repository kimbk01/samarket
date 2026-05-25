"use client";

import { isDeliveryFulfillment } from "@/lib/stores/order-status-transitions";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  buyerOrderTimelineDeliveryStepLabels,
  buyerOrderTimelinePickupStepLabels,
} from "@/lib/stores/buyer-order-status-labels";
import {
  ownerOrderCardStepColumnLabel,
  ownerOrderCardStepperModel,
} from "@/lib/business/owner-order-stepper-transition";
import {
  OwnerFlowStepIconMini,
  ownerFlowIconForStepIndex,
} from "@/components/stores/owner/dashboard/owner-order-flow-icons";

/** `OwnerFlowStepIconMini` h-7 - connector vertical center */
const OWNER_ORDER_STEP_ICON_CENTER_Y = "0.875rem";

/** Next process column only - tap press feedback */
const STEP_NEXT_PRESSABLE_CLASS =
  "relative z-[1] flex w-full min-w-0 flex-col items-center gap-1.5 rounded-md border-0 bg-transparent p-1 touch-manipulation select-none outline-none [-webkit-tap-highlight-color:transparent] transition-[transform,background-color,opacity] duration-150 ease-out hover:bg-[var(--biz-tan-soft)] active:scale-[0.96] active:bg-[var(--biz-primary-soft)] active:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--biz-primary)]/40 disabled:pointer-events-none disabled:opacity-60 sm:gap-2";

/** Done / waiting columns - no press */
const STEP_STATIC_CLASS =
  "relative z-[1] flex w-full flex-col items-center gap-1.5 p-1 pointer-events-none cursor-default select-none sm:gap-2";

export function OwnerOrderCardProgressSteps({
  orderStatus,
  fulfillmentType,
  interactive = false,
  stepBusy = false,
  onStepClick,
}: {
  orderStatus: string;
  fulfillmentType: string;
  interactive?: boolean;
  stepBusy?: boolean;
  onStepClick?: (stepIndex: number) => void;
}) {
  const { t, language } = useI18n();
  const deliveryLike = isDeliveryFulfillment(fulfillmentType);
  const steps = deliveryLike
    ? buyerOrderTimelineDeliveryStepLabels(language)
    : buyerOrderTimelinePickupStepLabels(language);
  const terminal = new Set(["cancelled", "refunded", "refund_requested"]);
  if (terminal.has(orderStatus)) {
    return (
      <p className="mt-2 text-center text-[12px] text-[#8C8C8C]">
        {orderStatus === "refund_requested"
          ? t("store_owner_timeline_refund_pending")
          : orderStatus === "refunded"
            ? t("store_owner_timeline_refund_done")
            : t("store_owner_timeline_cancelled")}
      </p>
    );
  }

  const { visual, actionableIndex } = ownerOrderCardStepperModel(fulfillmentType, orderStatus);
  const actionableClickable = interactive ? actionableIndex : null;
  const allDone = orderStatus === "completed";

  return (
    <ol
      className="owner-order-card-stepper mt-3 grid list-none grid-cols-4 gap-x-1 gap-y-0 overflow-visible px-0.5 pb-1 sm:gap-x-1.5 md:gap-x-2"
      aria-label={t("store_owner_stepper_aria")}
    >
      {steps.map((defaultLabel, i) => {
        const state = visual[i] ?? "upcoming";
        const done = allDone || state === "done";
        const active = !allDone && state === "current";
        const isNextAction = actionableClickable === i && onStepClick != null;
        const displayLabel = ownerOrderCardStepColumnLabel(
          i,
          orderStatus,
          fulfillmentType,
          actionableClickable,
          language
        );
        const { Icon, bg } = ownerFlowIconForStepIndex(i, deliveryLike);
        const segmentDone = allDone || (i > 0 && visual[i - 1] === "done");

        const labelClass = `text-[10px] font-medium sm:text-[11px] ${
          active ? "font-semibold" : done ? "text-[#262626]" : "text-[#BFBFBF]"
        }`;

        return (
          <li key={`${defaultLabel}-${i}`} className="relative flex min-w-0 flex-col items-center">
            {i > 0 ? (
              <span
                className="pointer-events-none absolute z-0 h-0.5 -translate-y-1/2 rounded-full"
                style={{
                  top: OWNER_ORDER_STEP_ICON_CENTER_Y,
                  left: "-50%",
                  width: "100%",
                  backgroundColor: segmentDone ? "var(--biz-primary)" : "#E8E8E8",
                }}
                aria-hidden
              />
            ) : null}

            {isNextAction ? (
              <button
                type="button"
                disabled={stepBusy}
                onClick={() => onStepClick(i)}
                className={STEP_NEXT_PRESSABLE_CLASS}
                aria-label={t("store_owner_step_tap_aria", { label: displayLabel })}
              >
                <OwnerFlowStepIconMini Icon={Icon} bg={bg} active={active} done={false} />
                <span
                  className={`block w-full min-h-[2.6em] px-0.5 text-center leading-[1.35] break-keep sm:min-h-[2.4em] md:text-[11px] ${labelClass}`}
                  style={active ? { color: bg } : undefined}
                >
                  {displayLabel}
                </span>
              </button>
            ) : (
              <div className={STEP_STATIC_CLASS}>
                <OwnerFlowStepIconMini Icon={Icon} bg={bg} active={false} done={done} />
                <span
                  className={`block w-full min-h-[2.6em] px-0.5 text-center leading-[1.35] break-keep sm:min-h-[2.4em] md:text-[11px] ${labelClass}`}
                >
                  {displayLabel}
                </span>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
