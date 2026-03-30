import type { ReactNode } from "react";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { TradeHubPageBody } from "@/components/mypage/trade/TradeHubPageBody";
import { TradeHubTopTabs } from "@/components/mypage/trade/TradeHubTopTabs";

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
      <div className="mx-auto flex min-h-0 min-w-0 w-full max-w-lg flex-1 flex-col gap-2 px-4 py-3">
        <TradeHubPageBody>{children}</TradeHubPageBody>
      </div>
    </div>
  );
}