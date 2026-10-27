import type { ReactNode } from "react";
import { TradeHubLayoutHeader } from "@/components/mypage/trade/TradeHubLayoutHeader";
import { TradeHubPageBody } from "@/components/mypage/trade/TradeHubPageBody";
import { COMMUNITY_FONT_CLASS } from "@/lib/philife/philife-flat-ui-classes";
import { MYPAGE_BODY_COLUMN_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";

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
      <TradeHubLayoutHeader />
      {/** 내정보 본문 1열 — 폰 16px · 768+ 20px · 최대 640px (v3 §2, 앱 피드 거터 10/8 대신) */}
      <div className={`${MYPAGE_BODY_COLUMN_CLASS} flex flex-1 flex-col gap-1 pt-1`}>
        <TradeHubPageBody>{children}</TradeHubPageBody>
      </div>
    </div>
  );
}
