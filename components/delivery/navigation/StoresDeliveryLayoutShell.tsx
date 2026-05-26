"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { hideStoreDetailTransitionShell } from "@/lib/dibay/store-detail-transition-shell-store";

const StoreDetailTransitionShellPortal = dynamic(
  () =>
    import("@/components/stores/detail/StoreDetailTransitionShell").then(
      (m) => m.StoreDetailTransitionShellPortal
    ),
  { ssr: false }
);
import {
  getCurrentDeliveryListScrollRouteKey,
  isDeliveryListScrollRoute,
  isStoreConsumerDetailPath,
  noteDeliveryListScrollBackFromStoreDetail,
} from "@/lib/dibay/delivery-list-scroll-restore";

/**
 * `/stores` 레이아웃 — 목록↔상세 전환 시 popstate 전에 pending 을 세팅해
 * 자식 목록의 useLayoutEffect 복원이 pending 을 읽을 수 있게 한다.
 */
export function StoresDeliveryLayoutShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const prevPathRef = useRef(pathname);

  const prevPath = prevPathRef.current;
  if (prevPath !== pathname) {
    const prevBase = prevPath.split("?")[0] ?? "";
    const nowKey = getCurrentDeliveryListScrollRouteKey();
    if (isStoreConsumerDetailPath(prevBase) && isDeliveryListScrollRoute(nowKey)) {
      noteDeliveryListScrollBackFromStoreDetail(nowKey);
    }
    prevPathRef.current = pathname;
  }

  useEffect(() => {
    const path = (pathname ?? "").split("?")[0] ?? "";
    if (!isStoreConsumerDetailPath(path)) {
      hideStoreDetailTransitionShell();
    }
  }, [pathname]);

  const pathBase = pathname.split("?")[0] ?? "";
  const isStoresHubRoot = pathBase === "/stores" || pathBase === "/stores/";

  return (
    <div className="sam-domain-shell delivery-ui delivery-page min-h-0 w-full min-w-0">
      {children}
      {isStoresHubRoot ? null : <StoreDetailTransitionShellPortal />}
    </div>
  );
}
