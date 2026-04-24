"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { PurchasesView } from "@/components/mypage/PurchasesView";
import { SalesHistoryView } from "@/components/mypage/sales/SalesHistoryView";
import { FavoriteProductsView } from "@/components/favorites/FavoriteProductsView";
import { TradeReviewsManagementView } from "@/components/mypage/reviews/TradeReviewsManagementView";
import { TradeHubSectionShell } from "@/components/mypage/trade/TradeHubSectionShell";
import { useTradeHeaderTradeHistoryStack } from "@/contexts/TradeHeaderTradeHistoryStackContext";
import { TRADE_CHAT_SURFACE } from "@/lib/chats/surfaces/trade-chat-surface";
import { prefetchTradeHubHistorySnapshots } from "@/lib/mypage/trade-history-client";
import { COMMUNITY_FONT_CLASS, PHILIFE_FB_CARD_CLASS, PHILIFE_FEED_INSET_X_CLASS } from "@/lib/philife/philife-flat-ui-classes";
import { APP_MAIN_HEADER_INNER_CLASS } from "@/lib/ui/app-content-layout";
import { Sam } from "@/lib/ui/sam-component-classes";

type StackTab = "purchases" | "sales" | "favorites" | "reviews" | "chat";

const TAB_ORDER: StackTab[] = ["purchases", "sales", "favorites", "reviews", "chat"];

const PANEL_ROOT_CLASS = ["flex min-h-0 min-w-0 flex-1 flex-col bg-sam-app text-sam-fg", COMMUNITY_FONT_CLASS].join(
  " "
);

/**
 * 헤더 스택 안 거래 허브 — 필라이프 피드와 동일한 탭 스트립·가로 인셋(`px-2`).
 */
export function TradeHistoryStackPanel() {
  const { t } = useI18n();
  const { requestClose } = useTradeHeaderTradeHistoryStack();
  const [tab, setTab] = useState<StackTab>("purchases");

  useEffect(() => {
    prefetchTradeHubHistorySnapshots();
  }, []);

  const labels = useMemo(
    () => ({
      purchases: t("nav_trade_hub_purchases"),
      sales: t("nav_trade_hub_sales"),
      favorites: t("nav_trade_hub_favorites"),
      reviews: t("nav_trade_hub_reviews"),
      chat: t("nav_trade_hub_chat"),
    }),
    [t]
  );

  return (
    <div className={PANEL_ROOT_CLASS}>
      <header className="shrink-0 border-b border-sam-border bg-sam-surface pt-[max(0.5rem,env(safe-area-inset-top,0px))]">
        <div className={`${APP_MAIN_HEADER_INNER_CLASS} flex items-center gap-2 pb-2`}>
          <button
            type="button"
            onClick={() => requestClose()}
            className="sam-header-action inline-flex h-10 min-w-[2.5rem] shrink-0 items-center justify-center rounded-sam-sm text-sam-fg"
            aria-label={t("tier1_back")}
          >
            <ChevronBackIcon />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-center text-[16px] font-bold leading-tight text-sam-fg">
            {t("nav_trade_history")}
          </h1>
          <span className="w-10 shrink-0" aria-hidden />
        </div>
        <div className="min-w-0 w-full max-w-full overflow-x-hidden border-t border-sam-border/60 bg-sam-surface">
          <div className={APP_MAIN_HEADER_INNER_CLASS}>
            <div
              className={`${Sam.tabs.barScroll} flex w-full min-w-0 max-w-full border-b border-sam-border`}
              role="tablist"
              aria-label={t("nav_trade_hub_menu")}
            >
              {TAB_ORDER.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={tab === id ? Sam.tabs.tabActive : Sam.tabs.tab}
                >
                  <span className="block min-w-0 max-w-[min(10rem,40vw)] truncate px-0.5">{labels[id]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-2 ${PHILIFE_FEED_INSET_X_CLASS}`}
      >
        {tab === "purchases" ? (
          <TradeHubSectionShell title="구매 내역">
            <PurchasesView />
          </TradeHubSectionShell>
        ) : null}
        {tab === "sales" ? (
          <TradeHubSectionShell title="판매 내역">
            <SalesHistoryView />
          </TradeHubSectionShell>
        ) : null}
        {tab === "favorites" ? (
          <TradeHubSectionShell title="찜 목록">
            <FavoriteProductsView embedded />
          </TradeHubSectionShell>
        ) : null}
        {tab === "reviews" ? (
          <TradeHubSectionShell title="거래 후기">
            <TradeReviewsManagementView />
          </TradeHubSectionShell>
        ) : null}
        {tab === "chat" ? (
          <div className={`${PHILIFE_FB_CARD_CLASS} px-3 py-8 text-center sm:px-4`}>
            <p className="sam-text-body text-sam-muted">{t("nav_trade_hub_chat")}</p>
            <Link
              href={TRADE_CHAT_SURFACE.messengerListHref}
              className="mt-4 inline-flex rounded-sam-md bg-sam-primary px-4 py-2.5 sam-text-body font-semibold text-white"
            >
              {t("nav_trade_hub_chat")}
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ChevronBackIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 18l-6-6 6-6" />
    </svg>
  );
}
