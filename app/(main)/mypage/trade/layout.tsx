import type { ReactNode } from "react";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { TradeHubPageBody } from "@/components/mypage/trade/TradeHubPageBody";
import { TradeHubTopTabs } from "@/components/mypage/trade/TradeHubTopTabs";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";

export default function TradeHubLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-sam-app pb-24">
      <MySubpageHeader
        title="개인 거래 허브"
        subtitle="구매·판매·찜·후기·채팅"
        hideCtaStrip
        stickyBelow={<TradeHubTopTabs />}
      />
      {/*
        본문은 이미 `ConditionalAppShell` 의 `APP_MAIN_COLUMN_CLASS` 안 — 여기서 또 max-w 를 주면
        태블릿·데스크톱에서 거래·채팅이 2xl(672px)에서 멈춤. 거터만 맞추고 가로는 메인 컬럼에 맡김.
      */}
      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col gap-2 py-3 ${APP_MAIN_GUTTER_X_CLASS} w-full max-w-none`}
      >
        <TradeHubPageBody>{children}</TradeHubPageBody>
      </div>
    </div>
  );
}