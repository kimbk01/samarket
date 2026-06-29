/**
 * Versioned Android notification channel ids — non-LOCK helper (Capacitor/Web).
 */
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

const ensured = new Set<string>();

export function markNotificationChannelEnsured(channelId: string): void {
  ensured.add(channelId);
}

export function isNotificationChannelEnsured(channelId: string): boolean {
  return ensured.has(channelId);
}

/** Stub — native plugin can create channels; Web no-op */
export async function ensureNotificationChannel(channelId: string): Promise<void> {
  if (!channelId.trim()) return;
  if (typeof window === "undefined") return;
  if (!isCapacitorNativePlatform()) {
    markNotificationChannelEnsured(channelId);
    return;
  }
  const plugin = (
    window as Window & {
      Capacitor?: { Plugins?: { NotificationSoundBridge?: { ensureChannel?: (o: { channelId: string }) => Promise<void> } } };
    }
  ).Capacitor?.Plugins?.NotificationSoundBridge;
  if (plugin?.ensureChannel) {
    await plugin.ensureChannel({ channelId }).catch(() => {});
  }
  markNotificationChannelEnsured(channelId);
}
