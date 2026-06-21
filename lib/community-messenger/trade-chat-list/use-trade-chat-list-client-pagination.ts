"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  nextTradeChatListVisibleCount,
  sliceTradeChatListPage,
  TRADE_CHAT_LIST_LOAD_MORE_MIN_MS,
  TRADE_CHAT_LIST_PAGE_SIZE,
  tradeChatListHasMorePages,
} from "@/lib/community-messenger/trade-chat-list/trade-chat-list-pagination";

type Args<T> = {
  items: readonly T[];
  pageSize?: number;
  /** 필터 등 목록 기준 변경 시 visibleCount 리셋 */
  resetKey?: string;
};

export function useTradeChatListClientPagination<T>({
  items,
  pageSize = TRADE_CHAT_LIST_PAGE_SIZE,
  resetKey = "",
}: Args<T>) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setVisibleCount(pageSize);
    setLoadingMore(false);
    if (loadMoreTimerRef.current != null) {
      clearTimeout(loadMoreTimerRef.current);
      loadMoreTimerRef.current = null;
    }
  }, [items.length, pageSize, resetKey]);

  useEffect(() => {
    return () => {
      if (loadMoreTimerRef.current != null) clearTimeout(loadMoreTimerRef.current);
    };
  }, []);

  const visibleItems = useMemo(
    () => sliceTradeChatListPage(items, visibleCount),
    [items, visibleCount]
  );
  const hasMore = tradeChatListHasMorePages(items.length, visibleCount);

  const loadMore = useCallback(() => {
    if (loadingMore || !tradeChatListHasMorePages(items.length, visibleCount)) return;
    setLoadingMore(true);
    loadMoreTimerRef.current = setTimeout(() => {
      setVisibleCount((prev) => nextTradeChatListVisibleCount(prev, items.length, pageSize));
      setLoadingMore(false);
      loadMoreTimerRef.current = null;
    }, TRADE_CHAT_LIST_LOAD_MORE_MIN_MS);
  }, [items.length, loadingMore, pageSize, visibleCount]);

  return {
    visibleItems,
    hasMore,
    loadingMore,
    loadMore,
    visibleCount,
    totalCount: items.length,
  };
}
