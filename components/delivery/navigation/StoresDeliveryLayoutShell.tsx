"use client";

import type { ReactNode } from "react";
import { useRef } from "react";
import { usePathname } from "next/navigation";
import {
  getCurrentDeliveryListScrollRouteKey,
  isDeliveryListScrollRoute,
  isStoreConsumerDetailPath,
  noteDeliveryListScrollBackFromStoreDetail,
} from "@/lib/dibay/delivery-list-scroll-restore";
import { useStoresHomeTouchRelease } from "@/lib/stores/use-stores-home-touch-release";
import { DeliveryPresentationShell } from "@/components/delivery/presentation/DeliveryPresentationShell";
import { CommerceChildSlideShell } from "@/components/orders/customer-commerce/CommerceChildSlideShell";
import { DeliveryRoutableAddressGate } from "@/components/addresses/DeliveryRoutableAddressGate";

/**
 * `/stores` 레이아웃 — 목록↔상세 전환 시 popstate 전에 pending 을 세팅해
 * 자식 목록의 useLayoutEffect 복원이 pending 을 읽을 수 있게 한다.
 * ARCH B2: DeliveryPresentationShell owns browse↔store surface lifetime.
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

  const isDeliveryListRoute = isDeliveryListScrollRoute(pathname || "/stores");

  useStoresHomeTouchRelease(isDeliveryListRoute);

  return (
    <div className="sam-domain-shell delivery-ui delivery-page min-h-0 w-full min-w-0">
      <DeliveryPresentationShell>
        <CommerceChildSlideShell>
          <DeliveryRoutableAddressGate>{children}</DeliveryRoutableAddressGate>
        </CommerceChildSlideShell>
      </DeliveryPresentationShell>
    </div>
  );
}
