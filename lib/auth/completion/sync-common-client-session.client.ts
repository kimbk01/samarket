"use client";

import { syncClientSessionAfterNativeExchange } from "@/lib/auth/native/sync-client-session-after-native-exchange.client";

/**
 * Common Client Session Sync — Production Authority for all providers.
 * Implementation remains syncClientSessionAfterNativeExchange (single-flight refresh + prime).
 *
 * Slice 6-6: Do not re-export the implementation symbol. Production Auth entry must import
 * syncCommonClientSessionAfterAuth only — never syncClientSessionAfterNativeExchange.
 */
export async function syncCommonClientSessionAfterAuth(): Promise<boolean> {
  return syncClientSessionAfterNativeExchange();
}
