import type { ReactNode } from "react";
import { TradeHubLayoutHeader } from "@/components/mypage/trade/TradeHubLayoutHeader";
import { TradeHubPageBody } from "@/components/mypage/trade/TradeHubPageBody";
import { COMMUNITY_FONT_CLASS } from "@/lib/philife/philife-flat-ui-classes";
import { MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS } from "@/lib/layout/main-bottom-nav-hub-clearance";
import { APP_MAIN_FEED_STACK_CLASS } from "@/lib/ui/app-content-layout";

/** `/philife` 피드와 동일 clearance — 셸 `pb-0` 와 쌍 */
const TRADE_HUB_PAGE_ROOT_CLASS = [
  "flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-x-hidden bg-sam-app text-sam-fg",
  MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS,
  COMMUNITY_FONT_CLASS,
].join(" ");

export default function TradeHubLayout({ children }: { children: ReactNode }) {
  return (
    <div className={TRADE_HUB_PAGE_ROOT_CLASS}>
      <TradeHubLayoutHeader />
      <div className={`flex-1 ${APP_MAIN_FEED_STACK_CLASS} max-w-none`}>
        <TradeHubPageBody>{children}</TradeHubPageBody>
      </div>
    </div>
  );
}
