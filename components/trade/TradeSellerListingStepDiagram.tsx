"use client";

import { Fragment, useId } from "react";
import type { SellerListingState } from "@/lib/products/seller-listing-state";
import {
  TRADE_LISTING_CHAT_STEPS,
  canSellerListingTransition,
  nextSellerListingTradeStepForward,
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

const NODE_BOX =
  "relative flex h-6 w-6 shrink-0 items-center justify-center overflow-visible rounded-full border-2 text-[10px] font-bold leading-none transition";

const STEP_COL_W = "w-[3.25rem] shrink-0 sm:w-14";

const STEP_ROW_LABELS = ["판매중", "문의중", "예약중", "판매완료"] as const;

function safeSvgId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "");
}

function ConnectorNextFlowSvg({ baseId }: { baseId: string }) {
  const strokeId = `${baseId}-stroke`;
  const headId = `${baseId}-head`;
  return (
    <svg
      viewBox="0 0 100 6"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      aria-hidden
    >
      <defs>
        <linearGradient id={strokeId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#7360f2" stopOpacity="0.2" />
          <stop offset="42%" stopColor="#dcd4ff" stopOpacity="1" />
          <stop offset="100%" stopColor="#7360f2" stopOpacity="0.95" />
        </linearGradient>
        <radialGradient id={headId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
          <stop offset="40%" stopColor="#c4b5fd" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#7360f2" stopOpacity="0.25" />
        </radialGradient>
      </defs>
      <line
        x1="0"
        y1="3"
        x2="100"
        y2="3"
        stroke={`url(#${strokeId})`}
        strokeWidth="3"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray="22 78"
        strokeDashoffset={0}
        className="sam-trade-connector-flow-line"
      />
      <circle cx="100" cy="3" r="4" fill={`url(#${headId})`} className="sam-trade-connector-flow-head" />
    </svg>
  );
}

export interface TradeSellerListingStepDiagramProps {
  listing: SellerListingState;
  interactive: boolean;
  disabled?: boolean;
  onPickListing: (next: SellerListingState) => void;
  onCompleteTrade?: () => void;
}

export function TradeSellerListingStepDiagram({
  listing,
  interactive,
  disabled = false,
  onPickListing,
  onCompleteTrade,
}: TradeSellerListingStepDiagramProps) {
  const flowUid = safeSvgId(useId());
  const currentIdx = listingStepIndex(listing);
  const busy = disabled;
  const showPulse = listing !== "completed";

  const forward = nextSellerListingTradeStepForward(listing);
  const nextIdx = forward
    ? TRADE_LISTING_CHAT_STEPS.findIndex((s) => s.state === forward.state)
    : -1;

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

  const stepLabels = STEP_ROW_LABELS.join(", ");

  return (
    <div
      className="flex w-full min-w-0 flex-col gap-0 border-b border-sam-border/55 pb-1"
      role="group"
      aria-label={
        interactive
          ? `거래 진행 단계 (${stepLabels}). 판매자는 다른 단계의 원을 탭하면 물품 상태를 변경할 수 있습니다.`
          : `거래 진행 단계 (${stepLabels})`
      }
    >
      <div className="flex h-7 min-h-7 w-full min-w-0 items-center">
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

          let nodeClass = NODE_BOX;
          if (isPast) {
            nodeClass += " border-signature bg-signature text-white shadow-sm";
          } else if (isCurrent) {
            if (listing === "completed") {
              nodeClass +=
                " border-signature bg-gradient-to-b from-[#a89cf0] to-[#6b5ac6] text-white shadow-[0_0_8px_rgba(107,90,198,0.32)]";
            } else {
              nodeClass +=
                " border-signature bg-gradient-to-b from-[#b8adf7] to-[#7c6ad0] text-white shadow-[0_0_10px_rgba(107,90,198,0.28)] sam-trade-step-pulse";
            }
          } else {
            nodeClass += " border-sam-border bg-sam-surface text-sam-meta";
          }

          const z = isCurrent ? 30 : isPast ? 22 + i : 12 + i;
          const segmentComplete = i > 0 && currentIdx >= i;
          /** 다음 정책 단계로 이어지는 구간 — 구매자도 진행 힌트로 표시(탭은 interactive 일 때만) */
          const segmentNextFlow =
            i > 0 && !busy && forward != null && nextIdx === i && currentIdx < i;

          const isFlowDestination =
            interactive && !busy && forward != null && nextIdx === i && currentIdx < i;

          return (
            <Fragment key={step.state}>
              {i > 0 ? (
                <div className="flex h-7 min-w-[4px] flex-1 items-center" role="presentation" aria-hidden>
                  <div
                    className="relative h-1 min-h-1 w-full rounded-full"
                    style={{ backgroundColor: "var(--sam-border-soft, #e4e4e7)" }}
                  >
                    {segmentComplete ? (
                      <div className="absolute inset-0 rounded-full bg-[color:var(--sam-primary)]" />
                    ) : null}
                    {segmentNextFlow ? (
                      <>
                        <div
                          className="absolute inset-0 rounded-full opacity-90"
                          style={{
                            backgroundColor: "color-mix(in srgb, var(--sam-primary) 42%, transparent)",
                          }}
                          aria-hidden
                        />
                        <ConnectorNextFlowSvg baseId={`${flowUid}-s${i}`} />
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className={`${STEP_COL_W} flex h-7 items-center justify-center`}>
                <div className="relative flex items-center justify-center" style={{ zIndex: z }}>
                  {isCurrent && showPulse ? (
                    <>
                      <span className="sam-trade-step-ripple-ring pointer-events-none absolute" aria-hidden />
                      <span
                        className="sam-trade-step-ripple-ring sam-trade-step-ripple-ring--delay pointer-events-none absolute"
                        aria-hidden
                      />
                    </>
                  ) : null}

                  {canClick ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onNodeActivate(step.state, i)}
                      className={`${nodeClass} z-[1] outline-none transition active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-[color:var(--sam-primary)]/40 disabled:opacity-50 ${
                        isFlowDestination ? "sam-trade-step-flow-dest" : ""
                      }`}
                      aria-label={`${STEP_ROW_LABELS[i]} 단계로 변경`}
                    >
                      {i + 1}
                    </button>
                  ) : (
                    <div
                      className={`${nodeClass} z-[1] ${isFlowDestination ? "sam-trade-step-flow-dest" : ""}`}
                      aria-hidden
                    >
                      {i + 1}
                    </div>
                  )}
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>

      <div className="flex w-full min-w-0 items-start pt-0.5">
        {TRADE_LISTING_CHAT_STEPS.map((step, i) => {
          const isCurrent = i === currentIdx;
          const labelClass =
            isCurrent
              ? "font-semibold text-[color:var(--sam-primary)]"
              : i === TRADE_LISTING_CHAT_STEPS.length - 1
                ? "font-medium text-sam-muted"
                : "font-medium text-sam-fg";

          return (
            <Fragment key={`lbl-${step.state}`}>
              {i > 0 ? <div className="min-w-[4px] flex-1 shrink-0" aria-hidden /> : null}
              <div className={`${STEP_COL_W} flex justify-center`}>
                <p className={`w-full text-center text-[10px] leading-tight ${labelClass}`}>{STEP_ROW_LABELS[i]}</p>
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
