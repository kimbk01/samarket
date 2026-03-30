import type { ReactNode } from "react";

/** 거래 허브 2단 — 라우트별 본문(흰 카드 영역). 1단(`TradeHubPrimarySurface`)과 형제로 두어 모달로만 올리기 쉽게 한다. */
export function TradeHubPageBody({ children }: { children: ReactNode }) {
  return (
    <div
      data-trade-hub="page-body"
      className="trade-hub-page-body flex min-h-0 min-w-0 flex-1 flex-col"
    >
      {children}
    </div>
  );
}
