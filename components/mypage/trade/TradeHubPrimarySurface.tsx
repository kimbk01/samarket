import { TradeHubTopTabs } from "@/components/mypage/trade/TradeHubTopTabs";

/**
 * 거래 허브 1단 — `TradeHubTopTabs` 만 담당(필라이프와 동일 `bg-sam-surface` 스트립은 탭 컴포넌트 내부).
 */
export function TradeHubPrimarySurface() {
  return (
    <section className="shrink-0 overflow-x-hidden bg-sam-surface" data-trade-hub="primary">
      <TradeHubTopTabs />
    </section>
  );
}
