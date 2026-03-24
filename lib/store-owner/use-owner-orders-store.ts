"use client";

import { useSyncExternalStore } from "react";
import { getSharedOrdersVersion, subscribeSharedOrders } from "@/lib/shared-orders/shared-order-store";

export function useOwnerOrdersVersion() {
  return useSyncExternalStore(
    subscribeSharedOrders,
    getSharedOrdersVersion,
    getSharedOrdersVersion
  );
}
