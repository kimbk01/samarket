"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FavoriteProductsView } from "@/components/favorites/FavoriteProductsView";
import { SalesHistoryView } from "@/components/mypage/sales/SalesHistoryView";
import { TradeHubSectionShell } from "@/components/mypage/trade/TradeHubSectionShell";
import { APP_MAIN_GUTTER_NEG_X_CLASS } from "@/lib/ui/app-content-layout";

type TradeHistorySheetTab = "sales" | "favorites";

/**
 * 홈 플로팅 「거래내역」시트 — CUT E: sales default (buyer history → Messenger).
 */
export function HomeTradeHistorySheetContent() {
  const { tt } = useI18n();
  const [tab, setTab] = useState<TradeHistorySheetTab>("sales");

  const tabs: { id: TradeHistorySheetTab; label: string }[] = [
    { id: "sales", label: tt("판매 내역") },
    { id: "favorites", label: tt("찜 목록") },
  ];

  /** 팝업 SSOT T3 — 시트 안 탭: 높이 48 · 16/600 · 팝업 토큰 · 눌림 = 배경만 */
  const TAB_ACTIVE_CLASS =
    "relative flex min-h-[48px] w-full items-center justify-center bg-[color:var(--overlay-surface)] px-1 py-2 text-center text-[length:var(--overlay-body-1-size)] font-semibold leading-tight text-[color:var(--overlay-primary)] transition-colors active:bg-[color:var(--overlay-secondary)] after:pointer-events-none after:absolute after:bottom-0 after:left-[10%] after:right-[10%] after:z-[1] after:h-[3px] after:rounded-full after:bg-[color:var(--overlay-primary)]";

  const TAB_INACTIVE_CLASS =
    "flex min-h-[48px] w-full items-center justify-center px-1 py-2 text-center text-[length:var(--overlay-body-1-size)] font-medium leading-tight text-[color:var(--overlay-text-secondary)] transition-colors active:bg-[color:var(--overlay-secondary)]";

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        className={`shrink-0 overflow-x-hidden border-b border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] ${APP_MAIN_GUTTER_NEG_X_CLASS}`}
      >
        <nav aria-label={tt("거래 허브 메뉴")} className="w-full">
          <ul className="flex w-full">
            {tabs.map((item) => (
              <li key={item.id} className="flex min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={tab === item.id ? TAB_ACTIVE_CLASS : TAB_INACTIVE_CLASS}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-3">
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
      </div>
    </div>
  );
}
