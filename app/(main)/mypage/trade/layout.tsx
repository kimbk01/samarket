import type { ReactNode } from "react";
import { TradeHubScreen } from "@/components/mypage/trade/TradeHubScreen";
import { TradeHubPageBody } from "@/components/mypage/trade/TradeHubPageBody";
import { COMMUNITY_FONT_CLASS } from "@/lib/philife/philife-flat-ui-classes";

/**
 * 하단 탭 clearance — 탭이 실제로 있을 때만(`app-shell.css` `.trade-hub-nav-clearance`, UX-01).
 * compose 처럼 탭을 숨긴 하위 라우트에 탭 높이 빈 띠가 생기지 않게 한다. 셸 `pb-0` 와 쌍.
 */
const TRADE_HUB_PAGE_ROOT_CLASS = [
  "trade-hub-nav-clearance flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-x-hidden bg-sam-app text-sam-fg",
  COMMUNITY_FONT_CLASS,
].join(" ");

export default function TradeHubLayout({ children }: { children: ReactNode }) {
  return (
    <div className={TRADE_HUB_PAGE_ROOT_CLASS}>
      <TradeHubScreen>
        <TradeHubPageBody>{children}</TradeHubPageBody>
      </TradeHubScreen>
    </div>
  );
}
