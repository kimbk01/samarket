import { TradeHubTopTabs } from "@/components/mypage/trade/TradeHubTopTabs";
import { DIBAY_CHROME_SECONDARY_HOST_CLASS } from "@/lib/ui/dibay-secondary-tabs";

/**
 * 거래 허브 PRIMARY surface — host inherits domain pale (no white chrome leak).
 */
export function TradeHubPrimarySurface() {
  return (
    <section className={`shrink-0 ${DIBAY_CHROME_SECONDARY_HOST_CLASS}`} data-trade-hub="primary">
      <TradeHubTopTabs />
    </section>
  );
}
