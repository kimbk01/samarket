/**
 * 메신저 체감 지연 상수 — 실서비스 기준으로 짧게 유지.
 * home-sync·방 스냅샷은 `runSingleFlight` / 단일 GET 으로 폭주를 막으므로 디바운스를 과도하게 길게 둘 필요 없음.
 *
 * 운영 튜닝: `NEXT_PUBLIC_MESSENGER_*` (ms) 로 빌드 없이 상한 조정 가능.
 *
 * 정책 표: `docs/messenger-realtime-policy.md` (코드와 동기화)
 */
import type { AppDeployTier } from "@/lib/config/deploy-surface";

function readPublicEnvMs(key: string, fallback: number, min: number, max: number): number {
  if (typeof process === "undefined" || !process.env) return fallback;
  const raw = process.env[key];
  if (raw == null || !String(raw).trim()) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** 홈: 친구·요청·방 목록 메타 → `onRefresh` → home-sync (단일 비행) */
export const MESSENGER_HOME_META_DEBOUNCE_MS = readPublicEnvMs(
  "NEXT_PUBLIC_MESSENGER_HOME_DEBOUNCE_MS",
  240,
  80,
  3000
);

/** 방: 참가자·방 설정 메타 (메시지 INSERT 는 별도 콜백으로 즉시) */
export const MESSENGER_ROOM_META_DEBOUNCE_MS = readPublicEnvMs(
  "NEXT_PUBLIC_MESSENGER_ROOM_META_DEBOUNCE_MS",
  200,
  60,
  3000
);

/** 음성 메시지 INSERT 후 보조 스냅샷 정합 */
export const MESSENGER_VOICE_AUX_DEBOUNCE_MS = readPublicEnvMs(
  "NEXT_PUBLIC_MESSENGER_VOICE_AUX_DEBOUNCE_MS",
  280,
  100,
  4000
);

/** Realtime 페이로드 파싱 실패 시 짧은 스냅샷 재동기화 */
export const MESSENGER_MESSAGE_FALLBACK_DEBOUNCE_MS = readPublicEnvMs(
  "NEXT_PUBLIC_MESSENGER_MESSAGE_FALLBACK_DEBOUNCE_MS",
  120,
  50,
  2000
);

/** 수신 통화: postgres_changes 연속 시 GET 합류 방지 */
export const MESSENGER_INCOMING_CALL_REALTIME_DEBOUNCE_MS = readPublicEnvMs(
  "NEXT_PUBLIC_MESSENGER_INCOMING_RT_DEBOUNCE_MS",
  280,
  100,
  2000
);

/** 수신 목록 GET 레이트 (연속 Realtime·포커스) */
export const MESSENGER_INCOMING_CALL_REFRESH_COOLDOWN_MS = readPublicEnvMs(
  "NEXT_PUBLIC_MESSENGER_INCOMING_REFRESH_COOLDOWN_MS",
  1_200,
  400,
  10_000
);

export const MESSENGER_INCOMING_CALL_BURST_MIN_GAP_MS = readPublicEnvMs(
  "NEXT_PUBLIC_MESSENGER_INCOMING_BURST_GAP_MS",
  2_000,
  500,
  15_000
);

export const MESSENGER_INCOMING_CALL_VISIBILITY_RETRY_MS = readPublicEnvMs(
  "NEXT_PUBLIC_MESSENGER_VISIBILITY_RETRY_MS",
  700,
  200,
  5000
);

/** 거절된 요청을 같은 방향(동일 요청자→수신자)으로 다시 보내기 전 최소 대기. 0이면 비활성(로컬/튜닝). */
export const MESSENGER_FRIEND_REJECT_COOLDOWN_MS = readPublicEnvMs(
  "NEXT_PUBLIC_MESSENGER_FRIEND_REJECT_COOLDOWN_MS",
  86_400_000,
  0,
  7 * 24 * 60 * 60 * 1000
);

/**
 * 백업 폴링(Realtime 장애 시). production 도 메가앱 수준 지연은 피함.
 */
export function getIncomingCallPollIntervalMs(
  tier: AppDeployTier,
  hasActiveIncomingSessions: boolean
): number {
  if (tier === "production") {
    return hasActiveIncomingSessions ? 11_000 : 26_000;
  }
  return hasActiveIncomingSessions ? 5_000 : 14_000;
}
