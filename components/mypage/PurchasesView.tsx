"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { getAppSettings } from "@/lib/app-settings";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import {
  countPurchasesByTab,
  getPurchaseListTabId,
  type PurchaseListTabId,
} from "@/lib/mypage/purchase-list-tabs";
import {
  PurchaseHistoryCard,
  type PurchaseHistoryRow,
} from "@/components/mypage/purchases/PurchaseHistoryCard";
import { PurchaseListTabBar } from "@/components/mypage/purchases/PurchaseListTabBar";

export function PurchasesView() {
  const currency = getAppSettings().defaultCurrency ?? "KRW";
  const [items, setItems] = useState<PurchaseHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<PurchaseListTabId>("all");

  const load = useCallback((opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    const user = getCurrentUser();
    const uid = user?.id?.trim();
    if (!uid) {
      setItems([]);
      if (!silent) setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    fetch("/api/my/purchases", { cache: "no-store" })
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as { items?: PurchaseHistoryRow[] };
        if (!r.ok) {
          if (!silent) setItems([]);
          return;
        }
        const list = Array.isArray(d.items) ? d.items : [];
        setItems(
          list.map((x) => ({
            ...x,
            hasBuyerReview: !!x.hasBuyerReview,
          }))
        );
      })
      .catch(() => {
        if (!silent) setItems([]);
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onAuth = () => load();
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
    return () => {
      window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
    };
  }, [load]);

  useRefetchOnPageShowRestore(() => void load({ silent: true }));

  const viewerId = getCurrentUser()?.id?.trim() ?? "";

  const counts = useMemo(
    () => countPurchasesByTab(items, viewerId),
    [items, viewerId]
  );

  const filtered = useMemo(() => {
    if (tab === "all") return items;
    return items.filter((row) => getPurchaseListTabId(row, viewerId) === tab);
  }, [items, tab, viewerId]);

  if (loading) {
    return <p className="py-12 text-center text-[14px] text-gray-500">불러오는 중...</p>;
  }

  if (items.length === 0) {
    return (
      <p className="py-12 text-center text-[14px] text-gray-500">
        구매·문의한 채팅이 없어요. 상품에서 채팅하기로 문의해 보세요.
      </p>
    );
  }

  const emptyTabMsg: Record<Exclude<PurchaseListTabId, "all">, string> = {
    completed: "거래완료된 내역이 없어요.",
    inquiry: "문의 중인 채팅이 없어요.",
    trading: "진행 중인 거래가 없어요.",
  };

  return (
    <div>
      <PurchaseListTabBar active={tab} counts={counts} onChange={setTab} />
      {filtered.length === 0 ? (
        <p className="py-10 text-center text-[14px] text-gray-500">
          {tab === "all" ? null : emptyTabMsg[tab]}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((row) => (
            <PurchaseHistoryCard
              key={row.chatId}
              row={row}
              viewerId={viewerId}
              currency={currency}
              onReload={load}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
