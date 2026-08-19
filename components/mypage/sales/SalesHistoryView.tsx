"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { getAppSettings } from "@/lib/app-settings";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import {
  SELLER_MANAGE_TABS,
  countSellerManageTabs,
  getSellerManageTabId,
  parseSellerManageTabId,
  type SellerManageTabId,
} from "@/lib/mypage/seller-manage-tabs";
import { TradeManagementTabBar } from "@/components/mypage/TradeManagementTabBar";
import { SalesHistoryCard, type SalesHistoryRow } from "./SalesHistoryCard";
import {
  fetchTradeHistorySalesBySession,
  invalidateTradeHistoryCache,
} from "@/lib/mypage/trade-history-client";
import { useTradeChatListClientPagination } from "@/lib/community-messenger/trade-chat-list/use-trade-chat-list-client-pagination";
import { TradeListLoadMoreFooter } from "@/components/trade/TradeListLoadMoreFooter";
import { tradeListPaginationResetKey } from "@/lib/trade/trade-list-pagination-reset-key";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  SellerHubEmptyActionLink,
  SellerHubEmptyState,
} from "@/components/mypage/seller/SellerHubEmptyState";

export function SalesHistoryView({ initialTab }: { initialTab?: string } = {}) {
  const { t, safeT } = useI18n();
  const currency = getAppSettings().defaultCurrency ?? "KRW";
  const [items, setItems] = useState<SalesHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerId, setViewerId] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<SellerManageTabId>(() => parseSellerManageTabId(initialTab));
  const isSameSalesRows = (prev: SalesHistoryRow[], next: SalesHistoryRow[]): boolean => {
    if (prev.length !== next.length) return false;
    const rowStamp = (r: SalesHistoryRow) => r.postUpdatedAt ?? r.updatedAt ?? null;
    for (let i = 0; i < prev.length; i += 1) {
      const a = prev[i];
      const b = next[i];
      if (
        a.postId !== b.postId ||
        a.chatId !== b.chatId ||
        a.status !== b.status ||
        a.title !== b.title ||
        a.price !== b.price ||
        a.lastMessageAt !== b.lastMessageAt ||
        a.sellerCompletedAt !== b.sellerCompletedAt ||
        a.buyerConfirmedAt !== b.buyerConfirmedAt ||
        rowStamp(a) !== rowStamp(b) ||
        a.tradeFlowStatus !== b.tradeFlowStatus ||
        a.hasBuyerReview !== b.hasBuyerReview ||
        a.sellerListingState !== b.sellerListingState ||
        a.noActiveChat !== b.noActiveChat
      ) {
        return false;
      }
    }
    return true;
  };

  const load = useCallback((opts?: { silent?: boolean; force?: boolean }) => {
    const silent = !!opts?.silent;
    const nextViewerId = getCurrentUser()?.id?.trim() ?? "";
    setViewerId((prev) => (prev === nextViewerId ? prev : nextViewerId));
    if (!silent) setLoadError((prev) => (prev === null ? prev : null));
    if (!silent) setLoading((prev) => (prev ? prev : true));
    fetchTradeHistorySalesBySession({ force: !!opts?.force })
      .then((items) => {
        setLoadError((prev) => (prev === null ? prev : null));
        setItems((prev) => (isSameSalesRows(prev, items) ? prev : items));
      })
      .catch(() => {
        if (!silent) {
          setItems((prev) => (prev.length === 0 ? prev : []));
          setLoadError((prev) => (prev === t("mypage_comp_sales_load_failed") ? prev : t("mypage_comp_sales_load_failed")));
        }
      })
      .finally(() => {
        if (!silent) setLoading((prev) => (prev ? false : prev));
      });
  }, [t]);

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
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
  }, [load]);

  useRefetchOnPageShowRestore(() => void load({ silent: true }));

  useEffect(() => {
    if (initialTab) {
      const next = parseSellerManageTabId(initialTab);
      setTab((prev) => (prev === next ? prev : next));
    }
  }, [initialTab]);

  const counts = useMemo(() => countSellerManageTabs(items), [items]);

  const filtered = useMemo(
    () => items.filter((row) => getSellerManageTabId(row) === tab),
    [items, tab]
  );

  const listPagination = useTradeChatListClientPagination({
    items: filtered,
    resetKey: tradeListPaginationResetKey(
      tab,
      filtered.map((row) => ({ id: row.chatId || row.postId }))
    ),
  });
  const visibleRows = listPagination.visibleItems;

  if (loading) {
    return <p className="py-12 text-center sam-text-body text-sam-muted">{t("mypage_comp_loading")}</p>;
  }

  if (loadError) {
    return <p className="py-12 px-4 text-center sam-text-body text-red-600">{loadError}</p>;
  }

  if (items.length === 0) {
    return (
      <SellerHubEmptyState
        message={safeT("marketplace_seller_empty_trades_all", {
          fallbackKo: "진행 중인 거래가 없어요",
          fallbackEn: "No trades yet",
        })}
        actions={
          <SellerHubEmptyActionLink href="/mypage/products">
            {safeT("marketplace_seller_cta_view_listings", {
              fallbackKo: "등록한 매물 보기",
              fallbackEn: "View your listings",
            })}
          </SellerHubEmptyActionLink>
        }
      />
    );
  }

  const emptyTabMsg: Record<SellerManageTabId, string> = {
    selling: safeT("marketplace_seller_empty_trades_selling", {
      fallbackKo: "진행 중인 거래가 없어요",
      fallbackEn: "No trades in progress",
    }),
    completed: safeT("marketplace_seller_empty_trades_completed", {
      fallbackKo: "완료된 거래가 없어요",
      fallbackEn: "No completed trades",
    }),
    cancelled: safeT("marketplace_seller_empty_trades_cancelled", {
      fallbackKo: "취소된 거래가 없어요",
      fallbackEn: "No cancelled trades",
    }),
  };

  const emptyTabActions: Record<SellerManageTabId, ReactNode> = {
    selling: (
      <SellerHubEmptyActionLink href="/mypage/products">
        {safeT("marketplace_seller_cta_view_listings", {
          fallbackKo: "등록한 매물 보기",
          fallbackEn: "View your listings",
        })}
      </SellerHubEmptyActionLink>
    ),
    completed: (
      <SellerHubEmptyActionLink href="/mypage/products" variant="secondary">
        {safeT("marketplace_seller_cta_view_listings", {
          fallbackKo: "등록한 매물 보기",
          fallbackEn: "View your listings",
        })}
      </SellerHubEmptyActionLink>
    ),
    cancelled: (
      <SellerHubEmptyActionLink href="/mypage/products" variant="secondary">
        {safeT("marketplace_seller_cta_view_listings", {
          fallbackKo: "등록한 매물 보기",
          fallbackEn: "View your listings",
        })}
      </SellerHubEmptyActionLink>
    ),
  };

  return (
    <div>
      <TradeManagementTabBar
        tabs={SELLER_MANAGE_TABS}
        active={tab}
        counts={counts}
        onChange={setTab}
      />
      {filtered.length === 0 ? (
        <SellerHubEmptyState message={emptyTabMsg[tab]} actions={emptyTabActions[tab]} />
      ) : (
        <>
          <ul className="space-y-2">
            {visibleRows.map((row) => (
              <SalesHistoryCard
                key={row.chatId ? row.chatId : `post-${row.postId}`}
                row={row}
                currency={currency}
                viewerId={viewerId}
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
