"use client";

import { useSyncExternalStore } from "react";
import { getSharedOrdersVersion, subscribeSharedOrders } from "@/lib/shared-orders/shared-order-store";

export function useMemberOrdersVersion() {
  return useSyncExternalStore(
    subscribeSharedOrders,
    getSharedOrdersVersion,
    getSharedOrdersVersion
  );
}
