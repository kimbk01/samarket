"use client";

import type { CallConsumedReason } from "@/lib/community-messenger/incoming-call-state";
import { getNativeIncomingCallPlugin } from "@/lib/push/native/push-route-native-bridge";

/** Web consumed/terminal → Android native ring + late FCM guard */
export function syncDibayCallConsumedToNative(
  sessionId: string,
  reason: CallConsumedReason | string = "consumed"
): void {
  const sid = sessionId.trim();
  if (!sid) return;
  void (async () => {
    const plugin = await getNativeIncomingCallPlugin();
    if (!plugin?.markCallConsumed) return;
    try {
      await plugin.markCallConsumed({ sessionId: sid, reason });
    } catch {
      /* best-effort */
    }
  })();
}
