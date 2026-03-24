"use client";

import { useSyncExternalStore } from "react";
import { getDeliveryMockVersion, subscribeDeliveryMock } from "./mock-store";

export function useDeliveryMockVersion(): number {
  return useSyncExternalStore(subscribeDeliveryMock, getDeliveryMockVersion, getDeliveryMockVersion);
}
