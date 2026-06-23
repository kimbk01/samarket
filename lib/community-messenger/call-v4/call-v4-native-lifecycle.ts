"use client";

import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { clearCallV4NativeIncomingSurface } from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";
import type { CallV4TerminalPhase } from "@/lib/community-messenger/call-v4/call-v4-types";
import {
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
} from "@/lib/platform/capacitor-native";
import {
  stopNativeIncomingRingtoneFireAndForget,
} from "@/lib/push/native/dibay-call-consumed-native-bridge";
import { getNativeIncomingCallPlugin } from "@/lib/push/native/push-route-native-bridge";

const consumedSyncClaimed = new Set<string>();

function useAndroidNativeBridge(): boolean {
  return isCapacitorNativePlatform() && resolveCapacitorShellPlatform() === "android";
}

function mapTerminalToNativeConsumedReason(
  reason: CallV4TerminalPhase | string,
): string {
  const normalized = String(reason).trim().toLowerCase();
  switch (normalized) {
    case "accepted":
      return "accepted";
    case "rejected":
      return "declined";
    case "declined":
      return "declined";
    case "missed":
      return "missed";
    case "ended":
      return "ended";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "failed":
      return "failed";
    case "peer_busy":
      return "ended";
    default:
      return "ended";
  }
}

/** Native OS ringtone stop — idempotent, never blocks caller. */
export function requestCallV4NativeRingStop(callId: string, reason: string): void {
  const sid = callId.trim();
  if (!sid) return;
  logCallV4("native_ring_stop_requested", { callId: sid, reason });
  if (!useAndroidNativeBridge()) return;
  stopNativeIncomingRingtoneFireAndForget(sid);
}

/** Native consumed + notification dismiss via markCallConsumed SSOT — idempotent per callId+reason burst. */
export function requestCallV4NativeConsumedSync(callId: string, reason: string): void {
  const sid = callId.trim();
  if (!sid) return;
  const nativeReason = mapTerminalToNativeConsumedReason(reason);
  logCallV4("native_consumed_sync_requested", { callId: sid, reason: nativeReason });
  if (!useAndroidNativeBridge()) return;

  const claimKey = `${sid}:${nativeReason}`;
  if (consumedSyncClaimed.has(claimKey)) return;
  consumedSyncClaimed.add(claimKey);

  void (async () => {
    try {
      const plugin = await getNativeIncomingCallPlugin();
      if (!plugin?.markCallConsumed) {
        logCallV4("native_consumed_sync_failed", {
          callId: sid,
          reason: nativeReason,
          error: "plugin_unavailable",
        });
        return;
      }
      await plugin.markCallConsumed({ sessionId: sid, reason: nativeReason });
    } catch (error) {
      logCallV4("native_consumed_sync_failed", {
        callId: sid,
        reason: nativeReason,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();
}

/** Accept path — ring stop + consumed before PATCH/Agora. */
export function syncCallV4NativeOnWebAccept(callId: string): void {
  requestCallV4NativeRingStop(callId, "accept");
  requestCallV4NativeConsumedSync(callId, "accepted");
}

/** Reject path — ring stop + consumed before PATCH. */
export function syncCallV4NativeOnWebReject(callId: string): void {
  requestCallV4NativeRingStop(callId, "reject");
  requestCallV4NativeConsumedSync(callId, "declined");
}

/** Terminal/cleanup — ring stop, consumed, native surface clear. Idempotent. */
export function syncCallV4NativeTerminalCleanup(
  callId: string,
  reason: CallV4TerminalPhase | string,
): void {
  const sid = callId.trim();
  if (!sid) return;
  const nativeReason = mapTerminalToNativeConsumedReason(reason);
  requestCallV4NativeRingStop(sid, "terminal");
  requestCallV4NativeConsumedSync(sid, nativeReason);
  clearCallV4NativeIncomingSurface(sid, "terminal_cleanup");
}

export function resetCallV4NativeLifecycleClaimsForTests(): void {
  consumedSyncClaimed.clear();
}
