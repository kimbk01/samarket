"use client";

import { useLayoutEffect } from "react";
import { registerStoresHomePullRefreshHandler } from "@/lib/stores/stores-home-pull-refresh-store";

/** `/stores` 허브 — PTR 콜백 등록(피드·taxonomy 등) */
export function StoresHomePullRefreshRegister({
  onRefresh,
}: {
  onRefresh: () => void | Promise<void>;
}) {
  useLayoutEffect(() => {
    registerStoresHomePullRefreshHandler(onRefresh);
    return () => registerStoresHomePullRefreshHandler(null);
  }, [onRefresh]);

  return null;
}
