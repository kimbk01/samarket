"use client";

import type { SellerListingState } from "@/lib/products/seller-listing-state";
import { sellerListingStateMessageKey } from "@/lib/products/seller-listing-state";
import type { MessageKey } from "@/lib/i18n/messages";

/** 상태별 칩 톤 — 예약중은 주의(황토), 판매완료는 중립, 판매중·문의중은 브랜드 연녹 */
const CHIP_TONE: Record<SellerListingState, string> = {
  reserved: "bg-sam-warning-soft text-sam-warning",
  completed: "bg-sam-surface-muted text-sam-fg",
  inquiry: "bg-sam-primary-soft text-sam-primary",
  negotiating: "bg-sam-primary-soft text-sam-primary",
};

/**
 * 거래 판매 단계 변경 시스템 행 (SYS-01, 2026-10-27).
 * 1행: 「상품 상태 변경 [예약중]」 — 상태를 굵은 칩으로 강조. 2행: 시각(`created_at`, 기기 시간대).
 * 날짜는 위 날짜 구분선이 이미 보여 주므로 시각만 둔다.
 */
export function MessengerTradeListingChangeSystemRow({
  state,
  timeLabel,
  t,
}: {
  state: SellerListingState;
  timeLabel: string;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}) {
  const stateLabel = t(sellerListingStateMessageKey(state));
  return (
    <div className="flex w-full justify-center px-3" data-cm-system-row="trade-listing-change">
      <div className="flex max-w-[min(100%,22rem)] min-w-0 flex-col items-center gap-0.5 rounded-ui-rect border border-sam-border-soft bg-sam-surface px-3 py-2 text-center">
        <p className="flex flex-wrap items-center justify-center gap-1.5 sam-text-helper leading-5 text-sam-fg">
          <span>{t("trade_listing_change_system_title")}</span>
          <span className={`rounded-ui-rect px-1.5 py-px font-bold ${CHIP_TONE[state]}`}>{stateLabel}</span>
        </p>
        {timeLabel ? <p className="sam-text-xxs tabular-nums text-sam-muted">{timeLabel}</p> : null}
      </div>
    </div>
  );
}
