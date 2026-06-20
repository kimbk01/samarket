"use client";

import type { MessengerCallSoundConfig } from "@/lib/community-messenger/messenger-call-sound-config-client";
import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
import { getNativeIncomingCallPlugin } from "@/lib/push/native/push-route-native-bridge";

function shouldSyncNativeCallSoundConfig(): boolean {
  return isCapacitorNativePlatform() && resolveCapacitorShellPlatform() === "android";
}

/** APK 수신 벨 — Web 설정 fetch 후 native SharedPreferences 동기화 */
export function syncMessengerCallSoundConfigToNativeFireAndForget(
  config: MessengerCallSoundConfig | null
): void {
  if (!shouldSyncNativeCallSoundConfig() || !config) return;
  void (async () => {
    const plugin = await getNativeIncomingCallPlugin();
    if (!plugin?.syncCallSoundConfig) return;
    try {
      await plugin.syncCallSoundConfig({
        voiceIncomingEnabled: config.voice_incoming_enabled !== false,
        voiceIncomingSource: config.voice_incoming_sound_source,
        voiceIncomingUrl: config.voice_incoming_sound_url,
        videoIncomingEnabled: config.video_incoming_enabled !== false,
        videoIncomingSource: config.video_incoming_sound_source,
        videoIncomingUrl: config.video_incoming_sound_url,
      });
    } catch {
      /* best-effort */
    }
  })();
}
