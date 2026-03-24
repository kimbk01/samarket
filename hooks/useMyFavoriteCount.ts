"use client";

import { useCallback, useEffect, useState } from "react";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { getMyFavoriteCount } from "@/lib/favorites/getMyFavoriteCount";

/**
 * 내정보/마이페이지 — 찜(관심) 상품 개수 (API 연동)
 */
export function useMyFavoriteCount() {
  const [count, setCount] = useState<number | null>(null);

  const refresh = useCallback(() => {
    if (!getCurrentUser()?.id) {
      setCount(0);
      return;
    }
    getMyFavoriteCount().then(setCount);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onAuth = () => refresh();
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onAuth);
  }, [refresh]);

  return { count, refresh };
}
