"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { Fragment } from "react";
import type { AppLanguageCode } from "@/lib/i18n/config";
import {
  buyerDetailSixStepStates,
  buyerOrderStatusLabel,
  buyerOrderTimelineDeliveryStepLabels,
  buyerOrderTimelinePickupStepLabels,
  storeOrderTimelineCurrentStep,
  type BuyerDetailStepState,
} from "@/lib/stores/store-order-process-criteria";
import { isDeliveryFulfillment } from "@/lib/stores/order-status-transitions";

type TimelineVariant = "default" | "buyer_detail";

/** 취소·환불 등 터미널일 때 스테퍼 맨 뒤에 붙이는 단계 */
function terminalStepperSuffix(orderStatus: string, lang: AppLanguageCode): {
  label: string;
  lineClass: string;
  circleClass: string;
  labelClass: string;
} | null {
  switch (orderStatus) {
    case "cancelled":
    case "cancel_requested":
    case "refund_requested":
    case "refunded":
      return {
        label: buyerOrderStatusLabel(orderStatus, lang),
        lineClass:
          orderStatus === "cancelled" || orderStatus === "cancel_requested"
            ? orderStatus === "cancelled"
              ? "bg-rose-300"
              : "bg-rose-200"
            : "bg-amber-200",
        circleClass:
          orderStatus === "refunded"
            ? "border-amber-600 bg-amber-600 text-white"
            : orderStatus === "refund_requested"
              ? "border-amber-500 bg-amber-500 text-white"
              : "border-rose-500 bg-rose-500 text-white",
        labelClass:
          orderStatus === "refund_requested" || orderStatus === "refunded"
            ? "font-semibold text-amber-800"
            : "font-semibold text-rose-600",
      };
    default:
      return null;
  }
}

/** buyer_detail: i번째 스텝 뒤 연결선 스타일 */
function connectorKindBuyerDetail(states: BuyerDetailStepState[], i: number): "filled" | "empty" | "muted" {
  const a = states[i];
  const b = states[i + 1];
  if (b === undefined) return "empty";
  if (a === "done") return "filled";
  if (a === "na" && b === "na") return "muted";
  if (a === "na" && (b === "current" || b === "done")) return "filled";
  return "empty";
}

function connectorClass(kind: "filled" | "empty" | "muted", terminal: boolean): string {
  if (terminal) return "bg-sam-border-soft";
  if (kind === "filled") return "bg-signature";
  if (kind === "muted") return "bg-sam-border-soft/55";
  return "bg-sam-border-soft";
}

export function StoreCommerceOrderTimeline({
  fulfillmentType,
  orderStatus,
  variant = "default",
}: {
  fulfillmentType: string;
  orderStatus: string;
  /** 주문 상세: 배달 6단계 · 픽업 4단계 */
  variant?: TimelineVariant;
}) {
  const { t, language } = useI18n();
  const deliveryLike = isDeliveryFulfillment(fulfillmentType);
  const terminal = ["cancelled", "refund_requested", "refunded", "cancel_requested"].includes(orderStatus);
  const allDone = orderStatus === "completed";
  const terminalSuffix = terminal ? terminalStepperSuffix(orderStatus, language) : null;

  if (variant === "buyer_detail") {
    const steps = deliveryLike
      ? [...buyerOrderTimelineDeliveryStepLabels(language)]
      : [...buyerOrderTimelinePickupStepLabels(language)];
    const rowStates: BuyerDetailStepState[] = deliveryLike
      ? buyerDetailSixStepStates(fulfillmentType, orderStatus)
      : (() => {
          const cur = storeOrderTimelineCurrentStep(fulfillmentType, orderStatus);
          return steps.map((_, i) => {
            if (allDone || i < cur) return "done";
            if (i === cur) return "current";
            return "upcoming";
          });
        })();

    return (
      <nav
        aria-label={t("store_order_timeline_aria")}
        className="overflow-x-auto py-2 [-webkit-overflow-scrolling:touch]"
      >
        <div className="flex w-full min-w-max items-start px-0.5">
          {steps.map((label, i) => {
            const rs = rowStates[i] ?? "upcoming";
            const isNaRow = rs === "na";
            const done = !terminal && !isNaRow && (rs === "done" || allDone);
            const on = !terminal && !isNaRow && rs === "current";
            const segKind = connectorKindBuyerDetail(rowStates, i);
            const segCls = connectorClass(segKind, terminal);

            const circleBase =
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border sam-text-xxs transition-colors";
            let circleCls = circleBase;
            if (terminal) {
              circleCls += " border-sam-border bg-sam-app text-sam-meta";
            } else if (isNaRow) {
              circleCls += " border-dashed border-sam-border bg-sam-app text-sam-meta";
            } else if (done) {
              circleCls += " border-signature bg-signature text-white";
            } else if (on) {
              circleCls += " border-signature bg-sam-surface text-signature store-order-stepper-current-circle";
            } else {
              circleCls += " border-sam-border bg-sam-surface text-sam-meta";
            }

            return (
              <Fragment key={`${i}-${label}`}>
                {i > 0 ? (
                  <div
                    className={`mx-0.5 mt-[13px] h-0.5 min-w-2 flex-1 self-start ${segCls}`}
                    aria-hidden
                  />
                ) : null}
                <div className="flex w-[3.35rem] shrink-0 flex-col items-center sm:w-[3.65rem]">
                  <span className={circleCls}>
                    {terminal ? "—" : isNaRow ? "—" : done ? "✓" : i + 1}
                  </span>
                  <span
                    className={`mt-1.5 block max-w-full text-center sam-text-xxs font-medium leading-tight break-keep sm:sam-text-xxs ${
                      terminal || isNaRow
                        ? isNaRow && !terminal
                          ? "text-sam-meta"
                          : "text-sam-meta"
                        : done || on
                          ? "text-signature"
                          : "text-sam-meta"
                    }`}
                  >
                    {label}
                  </span>
                </div>
              </Fragment>
            );
          })}
          {terminalSuffix ? (
            <Fragment key="__terminal_suffix">
              <div
                className={`mx-0.5 mt-[13px] h-0.5 min-w-2 flex-1 self-start ${terminalSuffix.lineClass}`}
                aria-hidden
              />
              <div className="flex w-[3.35rem] shrink-0 flex-col items-center sm:w-[3.65rem]">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border sam-text-xxs ${terminalSuffix.circleClass}`}
                >
                  ✓
                </span>
                <span
                  className={`mt-1.5 block max-w-full text-center sam-text-xxs leading-tight break-keep sm:sam-text-xxs ${terminalSuffix.labelClass}`}
                >
                  {terminalSuffix.label}
                </span>
              </div>
            </Fragment>
          ) : null}
        </div>
      </nav>
    );
  }

  const steps = deliveryLike
    ? [...buyerOrderTimelineDeliveryStepLabels(language)]
    : [...buyerOrderTimelinePickupStepLabels(language)];
  const cur = storeOrderTimelineCurrentStep(fulfillmentType, orderStatus);

  return (
    <nav
      aria-label={t("store_order_timeline_aria")}
      className="overflow-x-auto py-2 [-webkit-overflow-scrolling:touch]"
    >
      <div className="flex w-full min-w-max items-start px-0.5">
        {steps.map((label, i) => {
          const stepDone = !terminal && (allDone || i < cur);
          const on = !terminal && !allDone && i === cur;
          const connectorBeforeFilled = !terminal && i > 0 && (allDone || i - 1 < cur);

          const circleBase =
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border sam-text-xxs transition-colors";
          let circleCls = circleBase;
          if (terminal) {
            circleCls += " border-sam-border bg-sam-app text-sam-meta";
          } else if (stepDone) {
            circleCls += " border-signature bg-signature text-white";
          } else if (on) {
            circleCls += " border-signature bg-sam-surface text-signature store-order-stepper-current-circle";
          } else {
            circleCls += " border-sam-border bg-sam-surface text-sam-meta";
          }

          return (
            <Fragment key={`step-${i}`}>
              {i > 0 ? (
                <div
                  className={`mx-0.5 mt-[13px] h-0.5 min-w-2 flex-1 self-start ${connectorBeforeFilled ? "bg-signature" : "bg-sam-border-soft"}`}
                  aria-hidden
                />
              ) : null}
              <div className="flex w-[3.35rem] shrink-0 flex-col items-center sm:w-[3.65rem]">
                <span className={circleCls}>{terminal ? "—" : stepDone ? "✓" : i + 1}</span>
                <span
                  className={`mt-1.5 block max-w-full text-center sam-text-xxs font-medium leading-tight break-keep sm:sam-text-xxs ${
                    terminal ? "text-sam-meta" : stepDone || on ? "text-signature" : "text-sam-meta"
                  }`}
                >
                  {label}
                </span>
              </div>
            </Fragment>
          );
        })}
        {terminalSuffix ? (
          <Fragment key="__terminal_suffix">
            <div
              className={`mx-0.5 mt-[13px] h-0.5 min-w-2 flex-1 self-start ${terminalSuffix.lineClass}`}
              aria-hidden
            />
            <div className="flex w-[3.35rem] shrink-0 flex-col items-center sm:w-[3.65rem]">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border sam-text-xxs ${terminalSuffix.circleClass}`}
              >
                ✓
              </span>
              <span
                className={`mt-1.5 block max-w-full text-center sam-text-xxs leading-tight break-keep sm:sam-text-xxs ${terminalSuffix.labelClass}`}
              >
                {terminalSuffix.label}
              </span>
            </div>
          </Fragment>
        ) : null}
      </div>
    </nav>
  );
}
