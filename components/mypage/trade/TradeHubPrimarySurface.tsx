import { TradeHubTopTabs } from "@/components/mypage/trade/TradeHubTopTabs";
import { DIBAY_CHROME_SECONDARY_HOST_CLASS } from "@/lib/ui/dibay-secondary-tabs";

/**
 * 거래 허브 secondary host — domain pale continuity under MyPage chrome.
 */
export function TradeHubPrimarySurface() {
  return (
    <section className={`shrink-0 ${DIBAY_CHROME_SECONDARY_HOST_CLASS}`} data-trade-hub="primary">
      <TradeHubTopTabs />
    </section>
  );
}
