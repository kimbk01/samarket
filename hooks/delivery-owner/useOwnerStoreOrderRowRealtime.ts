"use client";

import {
  useStoreOrderRowRealtimeTransport,
  type StoreOrderRowRealtimeHandlers,
} from "@/hooks/useSupabaseStoreOrderRowRealtime";

/** Owner order detail projection trigger only. Requires explicit store identity. */
export function useOwnerStoreOrderRowRealtime(
  input: { storeId: string | null; orderId: string | null },
  handlers: StoreOrderRowRealtimeHandlers
): void {
  const storeId = input.storeId?.trim() ?? "";
  const orderId = input.orderId?.trim() ?? "";
  useStoreOrderRowRealtimeTransport(
    "delivery-owner",
    storeId && orderId ? orderId : null,
    handlers,
    { storeId }
  );
}
