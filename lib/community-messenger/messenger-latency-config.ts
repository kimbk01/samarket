/**
 * 메신저 체감 지연 상수 — 실서비스 기준으로 짧게 유지.
 * home-sync·방 스냅샷은 `runSingleFlight` / 단일 GET 으로 폭주를 막으므로 디바운스를 과도하게 길게 둘 필요 없음.
 *
 * 운영 튜닝: `NEXT_PUBLIC_MESSENGER_*` (ms) 로 빌드 없이 상한 조정 가능.
 *
 * 정책 표: `docs/messenger-realtime-policy.md` (코드와 동기화)
 */
import type { AppDeployTier } from "@/lib/config/deploy-surface";
import type {
  CommunityMessengerCallSessionMode,
  CommunityMessengerCallSessionStatus,
} from "@/lib/community-messenger/types";

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

/** 수신 통화: postgres_changes 연속 시 GET 합류 방지 — 너무 길면 벨 지연 체감 */
export const MESSENGER_INCOMING_CALL_REALTIME_DEBOUNCE_MS = readPublicEnvMs(
  "NEXT_PUBLIC_MESSENGER_INCOMING_RT_DEBOUNCE_MS",
  55,
  0,
  2000
);

/**
 * Realtime 이 SUBSCRIBED 여도 **HTTP 백업 폴링**을 완전히 끄면 이벤트 유실·지연 시 수신 벨이 10~20초 늦게 뜰 수 있다.
 * (음성/영상 공통 — 클라는 동일 경로)
 */
export const MESSENGER_INCOMING_CALL_POLL_WHEN_REALTIME_OK_MS = readPublicEnvMs(
  "NEXT_PUBLIC_MESSENGER_INCOMING_POLL_RT_OK_MS",
  2800,
  1200,
  20_000
);

/** 수신 측에 ringing 이 떠 있는 동안 백업 GET 주기(실시간 구독 중) — 종료·동기화 체감 개선 */
export const MESSENGER_INCOMING_CALL_POLL_DURING_RING_MS = readPublicEnvMs(
  "NEXT_PUBLIC_MESSENGER_INCOMING_POLL_RING_MS",
  900,
  400,
  5000
);

/**
 * 탭이 백그라운드(다른 탭·창 작업 중)일 때 수신 통화 목록 백업 GET.
 * 이전에는 hidden 일 때 폴링을 건너뛰어 실시간 지연 시 벨이 아예 안 뜨는 경우가 있었다.
 */
export const MESSENGER_INCOMING_CALL_POLL_WHEN_HIDDEN_MS = readPublicEnvMs(
  "NEXT_PUBLIC_MESSENGER_INCOMING_POLL_HIDDEN_MS",
  4000,
  1500,
  30_000
);

/**
 * Broadcast·푸시·Realtime INSERT 가 같은 초에 겹칠 때 GET 이 여러 번 나가지 않게 — 즉시 1회 + 이(ms) 뒤 최대 1회.
 * (카카오/텔레그램류: 힌트 채널 + 단일 스냅샷 동기화에 가깝게)
 */
export const MESSENGER_INCOMING_CALL_WAKE_TRAIL_MS = readPublicEnvMs(
  "NEXT_PUBLIC_MESSENGER_INCOMING_WAKE_TRAIL_MS",
  480,
  200,
  2500
);

/** 수신 목록 GET 레이트 (연속 Realtime·포커스) — 폴링이 force 로 우회하므로 상한만 완화 */
export const MESSENGER_INCOMING_CALL_REFRESH_COOLDOWN_MS = readPublicEnvMs(
  "NEXT_PUBLIC_MESSENGER_INCOMING_REFRESH_COOLDOWN_MS",
  450,
  200,
  10_000
);

export const MESSENGER_INCOMING_CALL_BURST_MIN_GAP_MS = readPublicEnvMs(
  "NEXT_PUBLIC_MESSENGER_INCOMING_BURST_GAP_MS",
  900,
  300,
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
    /* Realtime 폴백: 과거 11~26s 는 수신 벨 체감 지연이 커서 상한을 낮춤 */
    return hasActiveIncomingSessions ? 2_500 : 3_500;
  }
  return hasActiveIncomingSessions ? 2_000 : 3_000;
}

/** `/calls/:sessionId` 클라: 세션 row `postgres_changes` 묶음 — 연속 이벤트당 GET 1회 */
export const MESSENGER_CALL_SESSION_REALTIME_DEBOUNCE_MS = readPublicEnvMs(
  "NEXT_PUBLIC_MESSENGER_CALL_SESSION_RT_DEBOUNCE_MS",
  95,
  40,
  2000
);

/**
 * 방 번들: `call_sessions`·`call_session_participants`·`call_logs`·call_stub 가 같은 버스트로 올 때
 * 동일 디바운스로 `onRefresh` 1회만 스케줄 — 테이블별 이중 타이머로 GET 이 연속 발생하던 경로 제거.
 */
export const MESSENGER_ROOM_CALL_REALTIME_BUNDLE_DEBOUNCE_MS = readPublicEnvMs(
  "NEXT_PUBLIC_MESSENGER_ROOM_CALL_SESSION_RT_DEBOUNCE_MS",
  50,
  0,
  500
);

/** silent 세션 GET 최소 간격(폴링 트리거) — rate limit(120/min)·렌더 경합 완화 */
export const MESSENGER_CALL_SESSION_SILENT_GAP_POLL_MS = readPublicEnvMs(
  "NEXT_PUBLIC_MESSENGER_CALL_SESSION_POLL_GAP_MS",
  1400,
  400,
  15_000
);

export const MESSENGER_CALL_SESSION_SILENT_GAP_REALTIME_MS = readPublicEnvMs(
  "NEXT_PUBLIC_MESSENGER_CALL_SESSION_RT_GAP_MS",
  350,
  100,
  5000
);

export const MESSENGER_CALL_SESSION_SILENT_GAP_UI_MS = readPublicEnvMs(
  "NEXT_PUBLIC_MESSENGER_CALL_SESSION_UI_GAP_MS",
  220,
  50,
  3000
);

/**
 * 통화 화면 백업 폴링 주기.
 * - Realtime `SUBSCRIBED` 이면 postgres_changes 가 1차; HTTP 는 끊김·유실 대비만.
 * - `null` 이면 타이머 없음(양측 연결·Realtime 정상 구간).
 */
export function getCallSessionClientPollIntervalMs(
  tier: AppDeployTier,
  args: {
    sessionMode: CommunityMessengerCallSessionMode | null | undefined;
    status: CommunityMessengerCallSessionStatus | null | undefined;
    joined: boolean;
    remoteJoined: boolean;
    realtimeSubscribed: boolean;
  }
): number | null {
  const mode = args.sessionMode;
  const status = args.status;
  if (!status) return tier === "production" ? 2200 : 2000;

  if (!mode || mode !== "direct") {
    return tier === "production" ? 2500 : 2200;
  }

  const { joined, remoteJoined, realtimeSubscribed } = args;

  if (realtimeSubscribed) {
    if (status === "active" && joined && remoteJoined) return null;
    if (status === "ringing") return tier === "production" ? 14_000 : 12_000;
    if (status === "active") return tier === "production" ? 10_000 : 8500;
    return tier === "production" ? 12_000 : 10_000;
  }

  if (status === "ringing") return tier === "production" ? 1600 : 1400;
  if (status === "active" && joined && remoteJoined) return tier === "production" ? 5000 : 4000;
  if (status === "active" && joined) return tier === "production" ? 1400 : 1200;
  if (status === "active") return tier === "production" ? 1500 : 1300;
  return tier === "production" ? 2200 : 2000;
}
