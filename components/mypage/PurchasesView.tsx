"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { getAppSettings } from "@/lib/app-settings";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import {
  BUYER_MANAGE_TABS,
  countBuyerManageTabs,
  getBuyerManageTabId,
  type BuyerManageTabId,
} from "@/lib/mypage/buyer-manage-tabs";
import {
  PurchaseHistoryCard,
  type PurchaseHistoryRow,
} from "@/components/mypage/purchases/PurchaseHistoryCard";
import { TradeManagementTabBar } from "@/components/mypage/TradeManagementTabBar";
import {
  fetchTradeHistoryPurchasesBySession,
  invalidateTradeHistoryCache,
} from "@/lib/mypage/trade-history-client";
import { useTradeChatListClientPagination } from "@/lib/community-messenger/trade-chat-list/use-trade-chat-list-client-pagination";
import { TradeListLoadMoreFooter } from "@/components/trade/TradeListLoadMoreFooter";
import { tradeListPaginationResetKey } from "@/lib/trade/trade-list-pagination-reset-key";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  MypageActivityListEmpty,
  MypageActivityListLoading,
} from "@/components/mypage/activity/MypageActivityListState";

export function PurchasesView({ initialTab }: { initialTab?: BuyerManageTabId } = {}) {
  const { safeT } = useI18n();
  const currency = getAppSettings().defaultCurrency ?? "KRW";
  const [items, setItems] = useState<PurchaseHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<BuyerManageTabId>(initialTab ?? "trading");

  const load = useCallback((opts?: { silent?: boolean; force?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setLoading(true);
    fetchTradeHistoryPurchasesBySession({ force: !!opts?.force })
      .then((list) => {
        setItems(list);
      })
      .catch(() => {
        if (!silent) setItems([]);
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  }, []);

  const reload = useCallback(() => {
    void load({ force: true });
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onAuth = () => {
      invalidateTradeHistoryCache();
      void load({ force: true });
    };
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
    return () => {
      window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
    };
  }, [load]);

  useRefetchOnPageShowRestore(() => void load({ silent: true }));

  const viewerId = getCurrentUser()?.id?.trim() ?? "";

  const counts = useMemo(
    () => countBuyerManageTabs(items, viewerId),
    [items, viewerId]
  );

  const filtered = useMemo(() => {
    if (!viewerId) return [];
    return items.filter((row) => getBuyerManageTabId(row, viewerId) === tab);
  }, [items, tab, viewerId]);

  const listPagination = useTradeChatListClientPagination({
    items: filtered,
    resetKey: tradeListPaginationResetKey(tab, filtered.map((row) => ({ id: row.chatId }))),
  });
  const visibleRows = listPagination.visibleItems;

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  if (loading) {
    return <MypageActivityListLoading />;
  }

  if (items.length === 0) {
    return (
      <MypageActivityListEmpty>
        {safeT("mypage_activity_purchases_empty", {
          fallbackKo: "구매·문의한 채팅이 없어요. 상품에서 채팅하기로 문의해 보세요.",
          fallbackEn: "No purchase chats yet. Message a seller from a product page.",
        })}
      </MypageActivityListEmpty>
    );
  }

  const emptyTabMsg: Record<BuyerManageTabId, string> = {
    trading: safeT("mypage_activity_purchases_empty_trading", {
      fallbackKo: "진행 중인 구매가 없어요.",
      fallbackEn: "No purchases in progress.",
    }),
    completed: safeT("mypage_activity_purchases_empty_completed", {
      fallbackKo: "구매완료·후기까지 끝난 내역이 없어요.",
      fallbackEn: "No completed purchases yet.",
    }),
    cancelled: safeT("mypage_activity_purchases_empty_cancelled", {
      fallbackKo: "취소된 구매가 없어요.",
      fallbackEn: "No cancelled purchases.",
    }),
    review_wait: safeT("mypage_activity_purchases_empty_review_wait", {
      fallbackKo: "후기를 작성할 수 있는 단계인 거래가 없어요.",
      fallbackEn: "No purchases waiting for a review.",
    }),
  };

  return (
    <div>
      <div className="mt-2">
        <TradeManagementTabBar
          tabs={BUYER_MANAGE_TABS}
          active={tab}
          counts={counts}
          onChange={setTab}
        />
      </div>
      {filtered.length === 0 ? (
        <MypageActivityListEmpty>{emptyTabMsg[tab]}</MypageActivityListEmpty>
      ) : (
        <>
          <ul className="space-y-2">
            {visibleRows.map((row) => (
              <PurchaseHistoryCard
                key={row.chatId}
                row={row}
                viewerId={viewerId}
                currency={currency}
                onReload={reload}
              />
            ))}
          </ul>
          <TradeListLoadMoreFooter
            hasMore={listPagination.hasMore}
            loadingMore={listPagination.loadingMore}
            onLoadMore={listPagination.loadMore}
            visibleCount={listPagination.visibleCount}
            totalCount={listPagination.totalCount}
          />
        </>
      )}
    </div>
  );
}
