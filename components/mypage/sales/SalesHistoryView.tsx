"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { getAppSettings } from "@/lib/app-settings";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import {
  SELLER_MANAGE_TABS,
  countSellerManageTabs,
  getSellerManageTabId,
  type SellerManageTabId,
} from "@/lib/mypage/seller-manage-tabs";
import { TradeManagementTabBar } from "@/components/mypage/TradeManagementTabBar";
import { APP_TOP_MENU_ROW1_BASE_RADIUS_4 } from "@/lib/ui/app-top-menu";
import { SalesHistoryCard, type SalesHistoryRow } from "./SalesHistoryCard";
import {
  fetchTradeHistorySalesBySession,
  invalidateTradeHistoryCache,
} from "@/lib/mypage/trade-history-client";

export function SalesHistoryView({ initialTab }: { initialTab?: SellerManageTabId } = {}) {
  const currency = getAppSettings().defaultCurrency ?? "KRW";
  const [items, setItems] = useState<SalesHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerId, setViewerId] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<SellerManageTabId>(initialTab ?? "selling");
  const isSameSalesRows = (prev: SalesHistoryRow[], next: SalesHistoryRow[]): boolean => {
    if (prev.length !== next.length) return false;
    for (let i = 0; i < prev.length; i += 1) {
      const a = prev[i];
      const b = next[i];
      if (
        a.postId !== b.postId ||
        a.chatId !== b.chatId ||
        a.status !== b.status ||
        a.title !== b.title ||
        a.price !== b.price ||
        a.updatedAt !== b.updatedAt
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
          setLoadError((prev) => (prev === "판매 내역을 불러오지 못했어요." ? prev : "판매 내역을 불러오지 못했어요."));
        }
      })
      .finally(() => {
        if (!silent) setLoading((prev) => (prev ? false : prev));
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
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
  }, [load]);

  useRefetchOnPageShowRestore(() => void load({ silent: true }));

  useEffect(() => {
    if (initialTab) setTab((prev) => (prev === initialTab ? prev : initialTab));
  }, [initialTab]);

  const counts = useMemo(() => countSellerManageTabs(items), [items]);

  const filtered = useMemo(
    () => items.filter((row) => getSellerManageTabId(row) === tab),
    [items, tab]
  );

  if (loading) {
    return <p className="py-12 text-center sam-text-body text-sam-muted">불러오는 중...</p>;
  }

  if (loadError) {
    return <p className="py-12 px-4 text-center sam-text-body text-red-600">{loadError}</p>;
  }

  if (items.length === 0) {
    return (
      <p className="py-12 text-center sam-text-body text-sam-muted">
        판매 중인 내 상품이 없어요. 상품을 올리면 여기에 표시돼요.
      </p>
    );
  }

  const emptyTabMsg: Record<SellerManageTabId, string> = {
    selling: "해당 상태의 판매가 없어요.",
    reserved: "예약 중인 거래가 없어요.",
    completed: "판매완료된 내역이 없어요.",
    cancelled: "취소된 판매가 없어요.",
    review_wait: "구매자 후기를 기다리는 거래가 없어요.",
  };

  return (
    <div>
      <TradeManagementTabBar
        tabs={SELLER_MANAGE_TABS}
        active={tab}
        counts={counts}
        onChange={setTab}
        tabBaseClassName={APP_TOP_MENU_ROW1_BASE_RADIUS_4}
      />
      {filtered.length === 0 ? (
        <p className="py-10 text-center sam-text-body text-sam-muted">{emptyTabMsg[tab]}</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((row) => (
            <SalesHistoryCard
              key={row.chatId ? row.chatId : `post-${row.postId}`}
              row={row}
              currency={currency}
              viewerId={viewerId}
              onReload={reload}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
