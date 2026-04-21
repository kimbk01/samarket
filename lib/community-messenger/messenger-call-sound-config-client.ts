import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";

export type MessengerCallSoundConfig = {
  voice_incoming_enabled: boolean;
  voice_incoming_sound_url: string | null;
  voice_outgoing_ringback_enabled: boolean;
  voice_outgoing_ringback_url: string | null;
  video_incoming_enabled: boolean;
  video_incoming_sound_url: string | null;
  video_outgoing_ringback_enabled: boolean;
  video_outgoing_ringback_url: string | null;
  missed_notification_enabled: boolean;
  missed_notification_sound_url: string | null;
  call_end_enabled: boolean;
  call_end_sound_url: string | null;
  use_custom_sounds: boolean;
  default_fallback_sound_url: string | null;
  /** 관리자 — 수신 벨 최대 길이(초), 클라 카운트다운용 */
  incoming_ring_timeout_seconds: number;
  /** 0–1 */
  incoming_ringtone_volume: number;
  busy_auto_reject_enabled: boolean;
  repeated_call_cooldown_seconds: number;
  suppress_incoming_local_notifications: boolean;
};

/** `undefined` = 아직 성공 응답 전, `null` = 행 없음/설정 없음(재시도 안 함) */
let loadedConfig: MessengerCallSoundConfig | null | undefined;
let inflight: Promise<MessengerCallSoundConfig | null> | null = null;
/** `invalidate` 또는 진행 중인 구버전 fetch 완료 시 캐시에 쓰지 않도록 함 */
let loadGeneration = 0;

export function getMessengerCallSoundConfigCache(): MessengerCallSoundConfig | null {
  return loadedConfig !== undefined ? loadedConfig : null;
}

export async function fetchMessengerCallSoundConfig(opts?: { force?: boolean }): Promise<MessengerCallSoundConfig | null> {
  if (typeof window === "undefined") return null;
  const force = opts?.force === true;

  if (inflight) {
    await inflight.catch(() => null);
  }
  if (!force && loadedConfig !== undefined) {
    return loadedConfig;
  }

  const genAtStart = loadGeneration;
  inflight = (async () => {
    try {
      const res = await fetch("/api/app/messenger-call-sound-config", { credentials: "include", cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        config?: MessengerCallSoundConfig | null;
      };
      if (res.ok && j.ok) {
        if (genAtStart !== loadGeneration) {
          return loadedConfig !== undefined ? loadedConfig : null;
        }
        loadedConfig = j.config ?? null;
        return loadedConfig;
      }
    } catch {
      /* ignore */
    }
    return null;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function invalidateMessengerCallSoundConfigCache(): void {
  loadedConfig = undefined;
  loadGeneration++;
}

/** 관리자 커스텀 URL (없거나 비활성 시 null → 합성/기본으로 폴백) */
export function resolveMessengerCallToneUrl(
  config: MessengerCallSoundConfig | null,
  mode: "incoming" | "outgoing",
  callKind: CommunityMessengerCallKind
): string | null {
  const fallback = config?.default_fallback_sound_url?.trim() || null;
  if (!config?.use_custom_sounds) return fallback;
  const isVideo = callKind === "video";
  if (mode === "incoming") {
    if (isVideo) {
      if (!config.video_incoming_enabled) return null;
      return config.video_incoming_sound_url?.trim() || config.default_fallback_sound_url?.trim() || null;
    }
    if (!config.voice_incoming_enabled) return null;
    return config.voice_incoming_sound_url?.trim() || config.default_fallback_sound_url?.trim() || null;
  }
  if (isVideo) {
    if (!config.video_outgoing_ringback_enabled) return null;
    return config.video_outgoing_ringback_url?.trim() || config.default_fallback_sound_url?.trim() || null;
  }
  if (!config.voice_outgoing_ringback_enabled) return null;
  return config.voice_outgoing_ringback_url?.trim() || config.default_fallback_sound_url?.trim() || null;
}

/** 부재 알림 원샷 — 비활성·URL 없음이면 null (호출부에서 기본 알림음으로 폴백) */
export function resolveMessengerCallMissedSoundUrl(config: MessengerCallSoundConfig | null): string | null {
  const fallback = config?.default_fallback_sound_url?.trim() || null;
  if (!config?.use_custom_sounds) return fallback;
  if (config.missed_notification_enabled === false) return null;
  return config.missed_notification_sound_url?.trim() || fallback;
}

/** 통화 종료 원샷 — 비활성·URL 없음이면 null */
export function resolveMessengerCallEndSoundUrl(config: MessengerCallSoundConfig | null): string | null {
  const fallback = config?.default_fallback_sound_url?.trim() || null;
  if (!config?.use_custom_sounds) return fallback;
  if (config.call_end_enabled === false) return null;
  return config.call_end_sound_url?.trim() || fallback;
}
