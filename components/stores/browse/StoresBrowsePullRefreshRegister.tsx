"use client";

import { useLayoutEffect } from "react";
import { addStoresBrowsePullRefreshHandler } from "@/lib/stores/stores-browse-pull-refresh-store";

/** `/stores/browse/*` — PTR 시 목록·캐시 갱신 콜백 등록 */
export function StoresBrowsePullRefreshRegister({
  onRefresh,
}: {
  onRefresh: () => void | Promise<void>;
}) {
  useLayoutEffect(() => {
    return addStoresBrowsePullRefreshHandler(onRefresh);
  }, [onRefresh]);

  return null;
}
