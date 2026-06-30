/**
 * Native message notification channel bridge — LOCK call paths untouched.
 */
import {
  ensureNotificationChannel,
  SSOT_DEFAULT_MESSAGE_ANDROID_CHANNEL_ID,
} from "@/lib/push/native/ensure-notification-channel";

export { SSOT_DEFAULT_MESSAGE_ANDROID_CHANNEL_ID };

/** Fire-and-forget — ensures SSOT message channel on Android WebView shell. */
export function ensureMessageNotificationChannelBestEffort(channelId?: string | null): void {
  const id = channelId?.trim() || SSOT_DEFAULT_MESSAGE_ANDROID_CHANNEL_ID;
  void ensureNotificationChannel(id);
}
