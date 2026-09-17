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
  /** Identity / epoch only — must NOT fingerprint item ids (append would reset). */
  resetKey?: string;
  /**
   * Trade list presentation restore: seed once, then skip the next auto-reset
   * caused by restored `items` commit (load-more continuity across detail remount).
   */
  restoredVisibleCount?: number | null;
};

export function useTradeChatListClientPagination<T>({
  items,
  pageSize = TRADE_CHAT_LIST_PAGE_SIZE,
  resetKey = "",
  restoredVisibleCount = null,
}: Args<T>) {
  const [visibleCount, setVisibleCount] = useState(() =>
    typeof restoredVisibleCount === "number" && restoredVisibleCount > 0
      ? restoredVisibleCount
      : pageSize
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextAutoResetRef = useRef(
    typeof restoredVisibleCount === "number" && restoredVisibleCount > 0
  );

  // Reset only when list identity/epoch changes — never on append length growth.
  // While a restore seed is active (skipNext), ignore resetKey churn from remount flicker.
  useEffect(() => {
    if (skipNextAutoResetRef.current) {
      skipNextAutoResetRef.current = false;
      return;
    }
    setVisibleCount(pageSize);
    setLoadingMore(false);
    if (loadMoreTimerRef.current != null) {
      clearTimeout(loadMoreTimerRef.current);
      loadMoreTimerRef.current = null;
    }
  }, [pageSize, resetKey]);

  // Re-arm skip when restoreVisibleCount is called so a subsequent resetKey
  // paint in the same remount cannot collapse the restored window.

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

  const restoreVisibleCount = useCallback(
    (count: number) => {
      const next = Math.max(pageSize, Math.floor(count));
      skipNextAutoResetRef.current = true;
      setVisibleCount(next);
      setLoadingMore(false);
    },
    [pageSize]
  );

  return {
    visibleItems,
    hasMore,
    loadingMore,
    loadMore,
    visibleCount,
    totalCount: items.length,
    restoreVisibleCount,
  };
}
