"use client";

import {
  useStoreOrderRowRealtimeTransport,
  type StoreOrderRowRealtimeHandlers,
} from "@/hooks/useSupabaseStoreOrderRowRealtime";

/** Customer order detail/list projection trigger only. */
export function useCustomerStoreOrderRowRealtime(
  orderId: string | null,
  handlers: StoreOrderRowRealtimeHandlers
): void {
  useStoreOrderRowRealtimeTransport("delivery-customer", orderId, handlers);
}
