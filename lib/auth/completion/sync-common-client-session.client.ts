"use client";

import { syncClientSessionAfterNativeExchange } from "@/lib/auth/native/sync-client-session-after-native-exchange.client";

/**
 * Common Client Session Sync — promoted authority for all providers (incl. Apple at 2-2).
 * Implementation remains syncClientSessionAfterNativeExchange (single-flight refresh + prime).
 */
export async function syncCommonClientSessionAfterAuth(): Promise<boolean> {
  return syncClientSessionAfterNativeExchange();
}

export { syncClientSessionAfterNativeExchange };
