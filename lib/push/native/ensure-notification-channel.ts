/**
 * Versioned Android notification channel ids — message/general only (non-LOCK).
 */
import { registerPlugin } from "@capacitor/core";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

const ensured = new Set<string>();

export const SSOT_DEFAULT_MESSAGE_ANDROID_CHANNEL_ID = "dibay_chat_messages_v1";

type NotificationSoundBridgePlugin = {
  ensureChannel(options: { channelId: string }): Promise<{ ok: boolean; channelId: string }>;
};

const NotificationSoundBridge = registerPlugin<NotificationSoundBridgePlugin>("NotificationSoundBridge");

export function markNotificationChannelEnsured(channelId: string): void {
  ensured.add(channelId);
}

export function isNotificationChannelEnsured(channelId: string): boolean {
  return ensured.has(channelId);
}

/** Message/general Android channel ensure — no call ringtone. */
export async function ensureNotificationChannel(channelId: string): Promise<void> {
  const id = channelId.trim() || SSOT_DEFAULT_MESSAGE_ANDROID_CHANNEL_ID;
  if (!id) return;
  if (typeof window === "undefined") return;
  if (!isCapacitorNativePlatform()) {
    markNotificationChannelEnsured(id);
    return;
  }
  try {
    const result = await NotificationSoundBridge.ensureChannel({ channelId: id });
    markNotificationChannelEnsured(result.channelId || id);
  } catch {
    markNotificationChannelEnsured(id);
  }
}
