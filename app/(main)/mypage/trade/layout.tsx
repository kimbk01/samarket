import type { ReactNode } from "react";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { TradeHubPageBody } from "@/components/mypage/trade/TradeHubPageBody";
import { TradeHubTopTabs } from "@/components/mypage/trade/TradeHubTopTabs";
import { APP_MYPAGE_SUBPAGE_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function TradeHubLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background pb-24">
      <MySubpageHeader
        title="개인 거래 허브"
        subtitle="구매·판매·찜·후기·채팅"
        hideCtaStrip
        stickyBelow={
          <div className="min-w-0 max-w-full overflow-x-hidden border-b border-ig-border bg-[var(--sub-bg)]">
            <TradeHubTopTabs />
          </div>
        }
      />
      <div className={`${APP_MYPAGE_SUBPAGE_BODY_CLASS} flex min-h-0 flex-1 flex-col gap-2 py-3`}>
        <TradeHubPageBody>{children}</TradeHubPageBody>
      </div>
    </div>
  );
}