import type { ReactNode } from "react";
import { TradeHubLayoutHeader } from "@/components/mypage/trade/TradeHubLayoutHeader";
import { TradeHubPageBody } from "@/components/mypage/trade/TradeHubPageBody";
import { COMMUNITY_FONT_CLASS } from "@/lib/philife/philife-flat-ui-classes";
import { MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS } from "@/lib/layout/main-bottom-nav-hub-clearance";
import { MYPAGE_BODY_COLUMN_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";

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
      {/** 내정보 본문 1열 — 폰 16px · 768+ 20px · 최대 640px (v3 §2, 앱 피드 거터 10/8 대신) */}
      <div className={`${MYPAGE_BODY_COLUMN_CLASS} flex flex-1 flex-col gap-1 pt-1`}>
        <TradeHubPageBody>{children}</TradeHubPageBody>
      </div>
    </div>
  );
}
