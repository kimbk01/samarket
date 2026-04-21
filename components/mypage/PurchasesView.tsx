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
import { APP_TOP_MENU_ROW1_BASE_RADIUS_4 } from "@/lib/ui/app-top-menu";
import {
  fetchTradeHistoryPurchasesBySession,
  invalidateTradeHistoryCache,
} from "@/lib/mypage/trade-history-client";

export function PurchasesView({ initialTab }: { initialTab?: BuyerManageTabId } = {}) {
  const currency = getAppSettings().defaultCurrency ?? "KRW";
  const [items, setItems] = useState<PurchaseHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<BuyerManageTabId>(initialTab ?? "trading");

  const load = useCallback((opts?: { silent?: boolean; force?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setLoading(true);
    /** 서버 세션 쿠키 기준 — `getCurrentUser()` 지연으로 첫 페인트가 막히지 않게 */
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

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  if (loading) {
    return <p className="py-12 text-center sam-text-body text-sam-muted">불러오는 중...</p>;
  }

  if (items.length === 0) {
    return (
      <p className="py-12 text-center sam-text-body text-sam-muted">
        구매·문의한 채팅이 없어요. 상품에서 채팅하기로 문의해 보세요.
      </p>
    );
  }

  const emptyTabMsg: Record<BuyerManageTabId, string> = {
    trading: "진행 중인 구매가 없어요.",
    completed: "구매완료·후기까지 끝난 내역이 없어요.",
    cancelled: "취소된 구매가 없어요.",
    review_wait: "후기를 작성할 수 있는 단계인 거래가 없어요.",
  };

  return (
    <div>
      <div className="mt-2">
      <TradeManagementTabBar
        tabs={BUYER_MANAGE_TABS}
        active={tab}
        counts={counts}
        onChange={setTab}
        tabBaseClassName={APP_TOP_MENU_ROW1_BASE_RADIUS_4}
      />
      </div>
      {filtered.length === 0 ? (
        <p className="py-10 text-center sam-text-body text-sam-muted">{emptyTabMsg[tab]}</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((row) => (
            <PurchaseHistoryCard
              key={row.chatId}
              row={row}
              viewerId={viewerId}
              currency={currency}
              onReload={reload}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
