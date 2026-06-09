import type { MessengerCallSoundConfig } from "@/lib/community-messenger/messenger-call-sound-config-client";

/** API `messenger-call-sound-config` · 관리자 기본과 맞춤 (카카오톡형 30초) */
export const DEFAULT_INCOMING_RING_TIMEOUT_SECONDS = 30;

export function clampIncomingRingTimeoutSeconds(raw: unknown): number {
  const t = Number(raw);
  if (!Number.isFinite(t)) return DEFAULT_INCOMING_RING_TIMEOUT_SECONDS;
  return Math.min(600, Math.max(10, Math.round(t)));
}

/**
 * 관리자 `incoming_ring_timeout_seconds` → 밀리초.
 * 캐시/응답이 없으면 API 기본(30s)과 동일.
 */
export function incomingRingTimeoutMsFromConfig(config: MessengerCallSoundConfig | null | undefined): number {
  return clampIncomingRingTimeoutSeconds(config?.incoming_ring_timeout_seconds) * 1000;
}
