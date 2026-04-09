"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FavoriteProductsView } from "@/components/favorites/FavoriteProductsView";
import { PurchasesView } from "@/components/mypage/PurchasesView";
import { SalesHistoryView } from "@/components/mypage/sales/SalesHistoryView";
import { TradeReviewsManagementView } from "@/components/mypage/reviews/TradeReviewsManagementView";
import { TradeHubSectionShell } from "@/components/mypage/trade/TradeHubSectionShell";
import { APP_MAIN_GUTTER_NEG_X_CLASS } from "@/lib/ui/app-content-layout";

type TradeHistorySheetTab = "purchases" | "sales" | "favorites" | "reviews";

const TABS: { id: TradeHistorySheetTab; label: string }[] = [
  { id: "purchases", label: "구매 내역" },
  { id: "sales", label: "판매 내역" },
  { id: "favorites", label: "찜 목록" },
  { id: "reviews", label: "후기" },
];

const TAB_ACTIVE_CLASS =
  "relative flex min-h-[52px] w-full items-center justify-center bg-[var(--sub-bg)] px-1 py-2 text-center text-[13px] font-bold leading-tight text-signature transition-colors after:pointer-events-none after:absolute after:bottom-0 after:left-[10%] after:right-[10%] after:z-[1] after:h-[3px] after:rounded-ui-rect after:bg-signature sm:min-h-[50px] sm:text-[15px] md:text-[16px]";

const TAB_INACTIVE_CLASS =
  "flex min-h-[52px] w-full items-center justify-center px-1 py-2 text-center text-[13px] font-semibold leading-tight text-muted transition-colors hover:text-foreground sm:min-h-[50px] sm:text-[15px] md:text-[16px]";

/**
 * 홈 플로팅 「거래내역」시트 — `/mypage/trade` 구매·판매·찜·후기 탭과 동일 구성(채팅 탭 제외).
 */
export function HomeTradeHistorySheetContent() {
  const { tt } = useI18n();
  const [tab, setTab] = useState<TradeHistorySheetTab>("purchases");

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        className={`shrink-0 overflow-x-hidden border-b border-ig-border bg-[var(--sub-bg)] ${APP_MAIN_GUTTER_NEG_X_CLASS}`}
      >
        <nav aria-label={tt("거래 허브 메뉴")} className="w-full">
          <ul className="flex w-full">
            {TABS.map((item) => (
              <li key={item.id} className="flex min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={tab === item.id ? TAB_ACTIVE_CLASS : TAB_INACTIVE_CLASS}
                >
                  {tt(item.label)}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-3">
        {tab === "purchases" ? (
          <TradeHubSectionShell title={tt("구매 내역")}>
            <PurchasesView />
          </TradeHubSectionShell>
        ) : null}
        {tab === "sales" ? (
          <TradeHubSectionShell title={tt("판매 내역")}>
            <SalesHistoryView />
          </TradeHubSectionShell>
        ) : null}
        {tab === "favorites" ? (
          <TradeHubSectionShell title={tt("찜 목록")}>
            <FavoriteProductsView embedded />
          </TradeHubSectionShell>
        ) : null}
        {tab === "reviews" ? (
          <TradeHubSectionShell title={tt("거래 후기")}>
            <TradeReviewsManagementView />
          </TradeHubSectionShell>
        ) : null}
      </div>
    </div>
  );
}
