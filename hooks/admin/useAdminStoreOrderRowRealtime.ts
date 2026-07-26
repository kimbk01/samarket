"use client";

import {
  useStoreOrderRowRealtimeTransport,
  type StoreOrderRowRealtimeHandlers,
} from "@/hooks/useSupabaseStoreOrderRowRealtime";

/** Platform Admin order audit projection trigger; never writes Customer/Owner surface state. */
export function useAdminStoreOrderRowRealtime(
  orderId: string | null,
  handlers: StoreOrderRowRealtimeHandlers
): void {
  useStoreOrderRowRealtimeTransport("platform-admin", orderId, handlers);
}
