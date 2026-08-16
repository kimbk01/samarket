"use client";

import { usePathname } from "next/navigation";
import { useStoresBrowsePullRefresh } from "@/lib/stores/use-stores-browse-pull-refresh";

function isStoresBrowsePath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0] ?? "";
  return p.startsWith("/stores/browse/");
}

/** `/stores/browse/*` PTR touch 리스너 — `AppStickyHeader` 에서 마운트 */
export function StoresBrowsePullRefreshHost() {
  const pathname = usePathname();
  useStoresBrowsePullRefresh(isStoresBrowsePath(pathname));
  return null;
}
