import type { ReactNode } from "react";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { TradeHubPageBody } from "@/components/mypage/trade/TradeHubPageBody";
import { TradeHubTopTabs } from "@/components/mypage/trade/TradeHubTopTabs";
import { COMMUNITY_FONT_CLASS } from "@/lib/philife/philife-flat-ui-classes";
import { APP_MAIN_FEED_STACK_CLASS } from "@/lib/ui/app-content-layout";

/** `/philife` 피드와 동일: 커뮤니티 폰트·하단 `pb-28`·본문 가로 `px-2` */
const TRADE_HUB_PAGE_ROOT_CLASS = [
  "flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-x-hidden bg-sam-app pb-28 text-sam-fg",
  COMMUNITY_FONT_CLASS,
].join(" ");

export default function TradeHubLayout({ children }: { children: ReactNode }) {
  return (
    <div className={TRADE_HUB_PAGE_ROOT_CLASS}>
      <MySubpageHeader
        title="개인 거래 허브"
        subtitle="구매·판매·찜·후기·채팅"
        hideCtaStrip
        registerMainTier1={false}
        stickyBelow={<TradeHubTopTabs />}
      />
      <div className={`flex-1 ${APP_MAIN_FEED_STACK_CLASS} max-w-none`}>
        <TradeHubPageBody>{children}</TradeHubPageBody>
      </div>
    </div>
  );
}
