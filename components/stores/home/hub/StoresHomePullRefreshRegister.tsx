"use client";

import { useLayoutEffect } from "react";
import { addStoresHomePullRefreshHandler } from "@/lib/stores/stores-home-pull-refresh-store";

/** `/stores` 허브 — PTR 콜백 등록(피드·taxonomy·주문 허브 등) */
export function StoresHomePullRefreshRegister({
  onRefresh,
}: {
  onRefresh: () => void | Promise<void>;
}) {
  useLayoutEffect(() => {
    return addStoresHomePullRefreshHandler(onRefresh);
  }, [onRefresh]);

  return null;
}
