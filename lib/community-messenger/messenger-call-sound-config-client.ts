import { resolveClientAuthenticatedUserIdForFetch } from "@/lib/auth/resolve-client-authenticated-user-id-for-fetch";
import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
import { DEFAULT_INCOMING_RING_TIMEOUT_SECONDS } from "@/lib/community-messenger/messenger-call-ring-timeout";
import {
  normalizeMessengerCallSoundSource,
  resolveMessengerCallTonePlayback,
  resolveMessengerCallToneUrlFromPlayback,
  type MessengerCallSoundSource,
} from "@/lib/community-messenger/messenger-call-sound-source";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import { syncMessengerCallSoundConfigToNativeFireAndForget } from "@/lib/push/native/messenger-call-sound-native-sync";

export type { MessengerCallSoundSource };
export { resolveMessengerCallTonePlayback };

const AUTH_READY_WAIT_MS = 400;
const UNAUTHORIZED_BACKOFF_MS = 30_000;

export type MessengerCallSoundConfig = {
  voice_incoming_enabled: boolean;
  voice_incoming_sound_source: MessengerCallSoundSource;
  voice_incoming_sound_url: string | null;
  voice_outgoing_ringback_enabled: boolean;
  voice_outgoing_ringback_source: MessengerCallSoundSource;
  voice_outgoing_ringback_url: string | null;
  video_incoming_enabled: boolean;
  video_incoming_sound_source: MessengerCallSoundSource;
  video_incoming_sound_url: string | null;
  video_outgoing_ringback_enabled: boolean;
  video_outgoing_ringback_source: MessengerCallSoundSource;
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

/** 세션 없음·401 backoff — API 기본값과 동일한 로컬 폴백 */
export function createDefaultMessengerCallSoundConfig(): MessengerCallSoundConfig {
  return {
    voice_incoming_enabled: true,
    voice_incoming_sound_source: "device_ringtone",
    voice_incoming_sound_url: null,
    voice_outgoing_ringback_enabled: true,
    voice_outgoing_ringback_source: "device_ringtone",
    voice_outgoing_ringback_url: null,
    video_incoming_enabled: true,
    video_incoming_sound_source: "device_ringtone",
    video_incoming_sound_url: null,
    video_outgoing_ringback_enabled: true,
    video_outgoing_ringback_source: "device_ringtone",
    video_outgoing_ringback_url: null,
    missed_notification_enabled: true,
    missed_notification_sound_url: null,
    call_end_enabled: true,
    call_end_sound_url: null,
    use_custom_sounds: true,
    default_fallback_sound_url: null,
    incoming_ring_timeout_seconds: DEFAULT_INCOMING_RING_TIMEOUT_SECONDS,
    incoming_ringtone_volume: 0.72,
    busy_auto_reject_enabled: false,
    repeated_call_cooldown_seconds: 0,
    suppress_incoming_local_notifications: false,
  };
}

/** `undefined` = 아직 성공 응답 전, `null` = 행 없음/설정 없음(재시도 안 함) */
let loadedConfig: MessengerCallSoundConfig | null | undefined;
let inflight: Promise<MessengerCallSoundConfig | null> | null = null;
/** `invalidate` 또는 진행 중인 구버전 fetch 완료 시 캐시에 쓰지 않도록 함 */
let loadGeneration = 0;
/** 401·세션 없음 직후 `force` 포함 네트워크 재시도 억제 */
let unauthorizedUntil = 0;

function defaultMessengerCallSoundConfig(): MessengerCallSoundConfig {
  return createDefaultMessengerCallSoundConfig();
}

function isUnauthorizedBackoffActive(now = Date.now()): boolean {
  return unauthorizedUntil > now;
}

function markUnauthorizedBackoff(now = Date.now()): void {
  unauthorizedUntil = now + UNAUTHORIZED_BACKOFF_MS;
}

function clearUnauthorizedBackoffIfSession(userId: string | null): void {
  if (userId) unauthorizedUntil = 0;
}

function resolveLocalFallbackConfig(): MessengerCallSoundConfig {
  if (loadedConfig !== undefined && loadedConfig !== null) return loadedConfig;
  return defaultMessengerCallSoundConfig();
}

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
  clearUnauthorizedBackoffIfSession(getSyncViewerUserIdForClient() ?? null);
  if (isUnauthorizedBackoffActive()) {
    return resolveLocalFallbackConfig();
  }

  const genAtStart = loadGeneration;
  inflight = (async () => {
    try {
      const userId = await resolveClientAuthenticatedUserIdForFetch(AUTH_READY_WAIT_MS);
      clearUnauthorizedBackoffIfSession(userId);
      if (!userId) {
        const fallback = defaultMessengerCallSoundConfig();
        if (genAtStart === loadGeneration) {
          loadedConfig = fallback;
        }
        syncMessengerCallSoundConfigToNativeFireAndForget(fallback);
        return fallback;
      }
      if (isUnauthorizedBackoffActive()) {
        return resolveLocalFallbackConfig();
      }

      const res = await fetch("/api/app/messenger-call-sound-config", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 401) {
        markUnauthorizedBackoff();
        const fallback = defaultMessengerCallSoundConfig();
        if (genAtStart === loadGeneration) {
          loadedConfig = fallback;
        }
        syncMessengerCallSoundConfigToNativeFireAndForget(fallback);
        return fallback;
      }

      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        config?: MessengerCallSoundConfig | null;
      };
      if (res.ok && j.ok) {
        if (genAtStart !== loadGeneration) {
          return loadedConfig !== undefined ? loadedConfig : null;
        }
        loadedConfig = j.config ?? null;
        syncMessengerCallSoundConfigToNativeFireAndForget(loadedConfig);
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

/** vitest — 모듈 singleton 초기화 */
export function resetMessengerCallSoundConfigClientForTests(): void {
  loadedConfig = undefined;
  inflight = null;
  loadGeneration = 0;
  unauthorizedUntil = 0;
}

/** admin_url 재생일 때만 URL — device/disabled 는 null (합성·OS 벨 폴백) */
export function resolveMessengerCallToneUrl(
  config: MessengerCallSoundConfig | null,
  mode: "incoming" | "outgoing",
  callKind: CommunityMessengerCallKind
): string | null {
  return resolveMessengerCallToneUrlFromPlayback(resolveMessengerCallTonePlayback(config, mode, callKind));
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
