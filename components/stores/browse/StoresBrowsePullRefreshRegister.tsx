"use client";

import type { DibayPtrHandler } from "@/lib/ui/ptr/dibay-ptr-ssot";
import { useLayoutEffect } from "react";
import { addStoresBrowsePullRefreshHandler } from "@/lib/stores/stores-browse-pull-refresh-store";

/** `/stores/browse/*` — PTR 시 목록·캐시 갱신 콜백 등록 */
export function StoresBrowsePullRefreshRegister({
  onRefresh,
}: {
  onRefresh: DibayPtrHandler;
}) {
  useLayoutEffect(() => {
    return addStoresBrowsePullRefreshHandler(onRefresh);
  }, [onRefresh]);

  return null;
}
