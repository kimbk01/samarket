"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DeliveryBottomNav } from "@/components/delivery/navigation/DeliveryBottomNav";
import type { DeliveryBottomNavItem } from "@/lib/delivery/load-delivery-bottom-nav-items-server";
import { shouldHideStoresDeliveryBottomNav } from "@/lib/delivery/should-hide-stores-delivery-bottom-nav";

export function StoresDeliveryLayoutShell({
  children,
  initialItems,
}: {
  children: ReactNode;
  initialItems: DeliveryBottomNavItem[];
}) {
  const pathname = usePathname() ?? "";
  const hideBottomNav = shouldHideStoresDeliveryBottomNav(pathname);

  return (
    <div
      className={
        hideBottomNav
          ? "sam-domain-shell pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]"
          : "sam-domain-shell pb-[calc(56px+env(safe-area-inset-bottom,0px))]"
      }
    >
      {children}
      {!hideBottomNav ? <DeliveryBottomNav initialItems={initialItems} /> : null}
    </div>
  );
}
