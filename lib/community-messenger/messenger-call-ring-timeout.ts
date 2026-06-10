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

/** 수신 UI(배너·전체 화면)에 표시할 남은 링 초 — 0 이하이면 null */
export function computeIncomingRingRemainingSeconds(
  startedAt: string | null | undefined,
  timeoutSeconds: number | null | undefined,
  nowMs: number = Date.now()
): number | null {
  if (!startedAt || timeoutSeconds == null || timeoutSeconds <= 0) return null;
  const startMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startMs)) return null;
  const remain = Math.max(0, Math.ceil((startMs + timeoutSeconds * 1000 - nowMs) / 1000));
  return remain > 0 ? remain : null;
}
