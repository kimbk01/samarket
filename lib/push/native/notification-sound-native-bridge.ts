/**
 * Native notification sound bridge — LOCK files untouched.
 * Android ring URI resolve stub; Web no-op.
 */
import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
import { resolveNotificationSound } from "@/lib/notifications/notification-sound-resolver";

export type NativeRingtoneResolveResult = {
  eventKey: string;
  uri: string | null;
  assetId: string;
  useDeviceDefault: boolean;
};

export function resolveIncomingRingtoneUri(eventKey: string): NativeRingtoneResolveResult {
  const resolved = resolveNotificationSound(eventKey, { platform: "android" });
  return {
    eventKey,
    uri: resolved.kind === "device_default" ? null : resolved.webUrl,
    assetId: resolved.assetId,
    useDeviceDefault: resolved.kind === "device_default" || resolved.resolvedFrom === "device_default",
  };
}

/** Fire-and-forget — native plugin optional (PR-6 stub) */
export function applyNativeIncomingRingtoneUriBestEffort(eventKey: string): void {
  if (!isCapacitorNativePlatform() || resolveCapacitorShellPlatform() !== "android") return;
  const payload = resolveIncomingRingtoneUri(eventKey);
  const w = window as Window & {
    DibayNotificationSoundBridge?: { setPendingRingtoneUri?: (uri: string | null) => void };
  };
  w.DibayNotificationSoundBridge?.setPendingRingtoneUri?.(payload.uri);
}
