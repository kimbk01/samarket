"use client";

import { useCallback, useEffect, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { getAppSettings } from "@/lib/app-settings";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { SalesHistoryCard, type SalesHistoryRow } from "./SalesHistoryCard";

export function SalesHistoryView() {
  const currency = getAppSettings().defaultCurrency ?? "KRW";
  const [items, setItems] = useState<SalesHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerId, setViewerId] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback((opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    const u = getCurrentUser()?.id?.trim();
    setViewerId(u ?? "");
    if (!silent) setLoadError(null);
    if (!u) {
      setItems([]);
      if (!silent) setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    fetch("/api/my/sales", { credentials: "same-origin", cache: "no-store" })
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as {
          items?: SalesHistoryRow[];
          error?: string;
        };
        if (!r.ok) {
          if (!silent) {
            setItems([]);
            setLoadError(
              d.error ||
                (r.status === 401
                  ? "서버에서 로그인을 인식하지 못했어요. 테스트 로그인을 다시 하거나 페이지를 새로고침해 보세요."
                  : "목록을 불러오지 못했어요.")
            );
          }
          return;
        }
        setLoadError(null);
        setItems(Array.isArray(d.items) ? d.items : []);
      })
      .catch(() => {
        if (!silent) {
          setItems([]);
          setLoadError("네트워크 오류로 목록을 불러오지 못했어요.");
        }
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
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
  }, [load]);

  useRefetchOnPageShowRestore(() => void load({ silent: true }));

  if (loading) {
    return <p className="py-12 text-center text-[14px] text-gray-500">불러오는 중...</p>;
  }

  if (loadError) {
    return <p className="py-12 px-4 text-center text-[14px] text-red-600">{loadError}</p>;
  }

  if (items.length === 0) {
    return (
      <p className="py-12 text-center text-[14px] text-gray-500">
        판매 중인 내 상품이 없어요. 상품을 올리면 여기에 표시돼요.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((row) => (
        <SalesHistoryCard
          key={row.chatId ? row.chatId : `post-${row.postId}`}
          row={row}
          currency={currency}
          viewerId={viewerId}
          onReload={load}
        />
      ))}
    </ul>
  );
}
