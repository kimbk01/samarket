"use client";

import { Fragment } from "react";
import type { SellerListingState } from "@/lib/products/seller-listing-state";
import {
  TRADE_LISTING_CHAT_STEPS,
  canSellerListingTransition,
} from "@/lib/trade/seller-listing-chat-transitions";

function listingStepIndex(listing: SellerListingState): number {
  switch (listing) {
    case "inquiry":
      return 0;
    case "negotiating":
      return 1;
    case "reserved":
      return 2;
    case "completed":
      return 3;
    default:
      return 0;
  }
}

/** 기존 h-8/w-8·sm:h-9/w-9 대비 지름 90% (10% 축소) */
const CIRCLE_SIZE =
  "h-[1.8rem] w-[1.8rem] sm:h-[2.025rem] sm:w-[2.025rem] text-[10px] sm:text-[11px]";

export interface TradeSellerListingStepDiagramProps {
  listing: SellerListingState;
  /** 판매자이고 채팅 진행 중 등 — 클릭 허용 */
  interactive: boolean;
  disabled?: boolean;
  /** 판매중·문의중·예약중 전환 — API 는 부모에서 호출 */
  onPickListing: (next: SellerListingState) => void;
  /** 예약 → 거래완료(기존 seller-complete API) */
  onCompleteTrade?: () => void;
}

export function TradeSellerListingStepDiagram({
  listing,
  interactive,
  disabled = false,
  onPickListing,
  onCompleteTrade,
}: TradeSellerListingStepDiagramProps) {
  const currentIdx = listingStepIndex(listing);
  const busy = disabled;

  const onNodeActivate = (state: SellerListingState, stepIdx: number) => {
    if (!interactive || busy) return;
    if (stepIdx === currentIdx) return;
    if (state === "completed") {
      if (listing === "reserved" && onCompleteTrade) {
        onCompleteTrade();
      }
      return;
    }
    if (canSellerListingTransition(listing, state)) {
      onPickListing(state);
    }
  };

  return (
    <div className="w-full min-w-0" role="list" aria-label="거래 진행 단계">
      <div className="flex w-full justify-center px-1">
        <div className="inline-flex max-w-full items-start justify-center gap-0.5 sm:gap-1">
          {TRADE_LISTING_CHAT_STEPS.map((step, i) => {
            const isPast = i < currentIdx;
            const isCurrent = i === currentIdx;
            const isCompleteStep = step.state === "completed";
            const canClick =
              interactive &&
              !busy &&
              (isCompleteStep
                ? listing === "reserved" && Boolean(onCompleteTrade)
                : canSellerListingTransition(listing, step.state));

            const circleBase = `relative z-[1] ${CIRCLE_SIZE} flex shrink-0 items-center justify-center rounded-full border-2 font-bold leading-none transition`;
            let circleClass = `${circleBase} border-sam-border bg-sam-surface-muted text-sam-meta`;
            if (isPast) {
              circleClass = `${circleBase} border-signature bg-signature text-white shadow-sm`;
            } else if (isCurrent) {
              if (listing === "completed") {
                circleClass = `${circleBase} border-signature bg-gradient-to-b from-[#a89cf0] to-[#6b5ac6] text-white shadow-[0_0_14px_rgba(107,90,198,0.35)]`;
              } else {
                circleClass = `${circleBase} border-signature bg-gradient-to-b from-[#b8adf7] to-[#7c6ad0] text-white shadow-[0_0_16px_rgba(107,90,198,0.42)] sam-trade-step-pulse`;
              }
            }

            const showRipple = isCurrent && listing !== "completed";

            const labelClass = [
              "mt-0.5 max-w-[4.25rem] truncate text-center sam-text-xxs font-semibold leading-tight sm:max-w-[5rem] sm:text-[11px]",
              isCurrent && listing !== "completed"
                ? "text-signature"
                : isPast
                  ? "text-sam-fg"
                  : "text-sam-meta",
            ]
              .filter(Boolean)
              .join(" ");

            const nodeCircle = (
              <span className="relative inline-flex items-center justify-center">
                {showRipple ? (
                  <>
                    <span className="sam-trade-step-ripple-ring" aria-hidden />
                    <span
                      className="sam-trade-step-ripple-ring sam-trade-step-ripple-ring--delay"
                      aria-hidden
                    />
                  </>
                ) : null}
                <span className={circleClass} aria-hidden>
                  {i + 1}
                </span>
              </span>
            );

            const wrapClass = "flex flex-col items-center";

            return (
              <Fragment key={step.state}>
                {i > 0 ? (
                  <div
                    className={`mt-[calc(0.9rem-1.5px)] h-[3px] w-7 shrink-0 rounded-full sm:mt-[calc(1.0125rem-1.5px)] sm:w-9 ${
                      i <= currentIdx ? "bg-signature" : "bg-sam-border/80"
                    }`}
                    aria-hidden
                  />
                ) : null}
                <div role="listitem" className={wrapClass} aria-current={isCurrent ? "step" : undefined}>
                  {canClick ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onNodeActivate(step.state, i)}
                      className="group flex flex-col items-center rounded-lg px-0.5 py-0.5 outline-none transition active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-signature/40 disabled:opacity-50"
                      aria-label={`${step.label} 단계로 변경`}
                    >
                      {nodeCircle}
                      <span className={labelClass}>{step.label}</span>
                    </button>
                  ) : (
                    <div className="flex flex-col items-center px-0.5 py-0.5">
                      {nodeCircle}
                      <span className={labelClass}>{step.label}</span>
                    </div>
                  )}
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
