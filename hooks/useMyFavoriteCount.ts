"use client";

import { useCallback, useEffect, useState } from "react";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import {
  getMyFavoriteCounts,
  invalidateFavoriteCountClientCache,
  type MyFavoriteCounts,
} from "@/lib/favorites/getMyFavoriteCount";
import { POST_FAVORITE_CHANGED_EVENT } from "@/lib/favorites/post-favorite-events";
import { STORE_FAVORITE_CHANGED_EVENT } from "@/lib/stores/store-favorite-events";

export type UseMyFavoriteCountOptions = {
  initialTotal?: number | null;
  initialTrade?: number | null;
  initialStore?: number | null;
};

/**
 * 내정보/마이페이지 — 거래+스토어 찜 개수 (API·쿠키 세션)
 */
export function useMyFavoriteCount(options: UseMyFavoriteCountOptions = {}) {
  const seedTotal =
    typeof options.initialTotal === "number"
      ? options.initialTotal
      : typeof options.initialTrade === "number" || typeof options.initialStore === "number"
        ? Math.max(0, (options.initialTrade ?? 0) + (options.initialStore ?? 0))
        : null;

  const [counts, setCounts] = useState<MyFavoriteCounts | null>(() =>
    seedTotal != null
      ? {
          total: seedTotal,
          trade: options.initialTrade ?? seedTotal,
          store: options.initialStore ?? 0,
        }
      : null
  );

  const refresh = useCallback(() => {
    void getMyFavoriteCounts().then(setCounts);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onChange = () => {
      invalidateFavoriteCountClientCache();
      refresh();
    };
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onChange);
    window.addEventListener(POST_FAVORITE_CHANGED_EVENT, onChange);
    window.addEventListener(STORE_FAVORITE_CHANGED_EVENT, onChange);
    return () => {
      window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onChange);
      window.removeEventListener(POST_FAVORITE_CHANGED_EVENT, onChange);
      window.removeEventListener(STORE_FAVORITE_CHANGED_EVENT, onChange);
    };
  }, [refresh]);

  return {
    count: counts?.total ?? null,
    tradeCount: counts?.trade ?? null,
    storeCount: counts?.store ?? null,
    refresh,
  };
}
