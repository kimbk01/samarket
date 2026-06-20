import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import type { MessengerCallSoundConfig } from "@/lib/community-messenger/messenger-call-sound-config-client";

export const MESSENGER_CALL_SOUND_SOURCES = ["device_ringtone", "admin_custom"] as const;
export type MessengerCallSoundSource = (typeof MESSENGER_CALL_SOUND_SOURCES)[number];

export type ResolvedMessengerCallTonePlayback =
  | { kind: "disabled" }
  | { kind: "device_ringtone" }
  | { kind: "admin_url"; url: string };

export function normalizeMessengerCallSoundSource(value: unknown): MessengerCallSoundSource {
  return value === "admin_custom" ? "admin_custom" : "device_ringtone";
}

function readSourceField(
  config: MessengerCallSoundConfig,
  mode: "incoming" | "outgoing",
  callKind: CommunityMessengerCallKind
): MessengerCallSoundSource {
  const isVideo = callKind === "video";
  if (mode === "incoming") {
    return isVideo
      ? normalizeMessengerCallSoundSource(config.video_incoming_sound_source)
      : normalizeMessengerCallSoundSource(config.voice_incoming_sound_source);
  }
  return isVideo
    ? normalizeMessengerCallSoundSource(config.video_outgoing_ringback_source)
    : normalizeMessengerCallSoundSource(config.voice_outgoing_ringback_source);
}

function readEnabledField(
  config: MessengerCallSoundConfig,
  mode: "incoming" | "outgoing",
  callKind: CommunityMessengerCallKind
): boolean {
  const isVideo = callKind === "video";
  if (mode === "incoming") {
    return isVideo ? config.video_incoming_enabled !== false : config.voice_incoming_enabled !== false;
  }
  return isVideo
    ? config.video_outgoing_ringback_enabled !== false
    : config.voice_outgoing_ringback_enabled !== false;
}

function readUrlField(
  config: MessengerCallSoundConfig,
  mode: "incoming" | "outgoing",
  callKind: CommunityMessengerCallKind
): string | null {
  const isVideo = callKind === "video";
  if (mode === "incoming") {
    const raw = isVideo ? config.video_incoming_sound_url : config.voice_incoming_sound_url;
    return raw?.trim() || config.default_fallback_sound_url?.trim() || null;
  }
  const raw = isVideo ? config.video_outgoing_ringback_url : config.voice_outgoing_ringback_url;
  return raw?.trim() || config.default_fallback_sound_url?.trim() || null;
}

/** 수·발신 4종 재생 계획 — admin_custom + URL 없음 → device_ringtone 폴백 */
export function resolveMessengerCallTonePlayback(
  config: MessengerCallSoundConfig | null,
  mode: "incoming" | "outgoing",
  callKind: CommunityMessengerCallKind
): ResolvedMessengerCallTonePlayback {
  if (!config?.use_custom_sounds) {
    const fallback = config?.default_fallback_sound_url?.trim() || null;
    if (fallback) return { kind: "admin_url", url: fallback };
    return { kind: "device_ringtone" };
  }
  if (!readEnabledField(config, mode, callKind)) {
    return { kind: "disabled" };
  }
  const source = readSourceField(config, mode, callKind);
  if (source === "device_ringtone") {
    return { kind: "device_ringtone" };
  }
  const url = readUrlField(config, mode, callKind);
  if (url) return { kind: "admin_url", url };
  return { kind: "device_ringtone" };
}

/** URL 문자열만 필요할 때 — device/disabled 는 null */
export function resolveMessengerCallToneUrlFromPlayback(
  playback: ResolvedMessengerCallTonePlayback
): string | null {
  return playback.kind === "admin_url" ? playback.url : null;
}
