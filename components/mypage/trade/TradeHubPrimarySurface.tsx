import { TradeHubTopTabs } from "@/components/mypage/trade/TradeHubTopTabs";

/**
 * 거래 허브 1단 — 가로 탭. 부모(`ConditionalAppShell`+`trade/layout`)가 뷰포트 높이·플렉스를 잡으므로 `sticky` 없이 `shrink-0`만 쓴다.
 */
export function TradeHubPrimarySurface() {
  const surfaceRing =
    "overflow-x-hidden rounded-ui-rect border border-ig-border bg-sam-surface pb-0 pt-3 text-foreground shadow-[0_2px_16px_rgba(0,0,0,0.06)] md:pt-4";

  return (
    <section className={`shrink-0 ${surfaceRing}`} data-trade-hub="primary">
      <TradeHubTopTabs />
    </section>
  );
}
