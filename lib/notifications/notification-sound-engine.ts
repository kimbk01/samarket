/**
 * 도메인별 알림음 — SSOT resolver · 반복·타임아웃·중단(stopNotificationPlayback).
 * 브라우저 전용.
 *
 * CONTRACT: 수신 알림음(playEvent) 은 hydrate 중 일반 stop 으로 취소하지 않는다.
 * 방 진입(종/푸시) 만 `invalidatePendingNotificationSoundPlayback` 으로 pending 을 끊는다.
 * (dffab904e 가 stop≡invalidate 로 묶어 수신음까지 죽인 회귀 방지)
 */
import type { NotificationDomain } from "@/lib/notifications/notification-domains";
import { eventKeyForNotificationDomain } from "@/lib/notifications/notification-sound-event-map";
import {
  invalidateNotificationSoundSsotCache,
  resolveNotificationSound,
} from "@/lib/notifications/notification-sound-resolver";
import {
  ensureNotificationSoundSsotHydratedForClient,
  invalidateNotificationSoundSsotClientHydrate,
} from "@/lib/notifications/notification-sound-ssot-client-hydrate";
import { UNIFIED_IN_APP_CHAT_SOUND_MIN_GAP_MS } from "@/lib/notifications/unified-messenger-trade-alert-contract";

/** Realtime INSERT + 미읽음 배지 폴링이 같은 수신을 거의 동시에 재생할 때 1회로 줄임 */
const lastDomainPlayAt = new Map<NotificationDomain, number>();
const DOMAIN_PLAY_DEDUPE_MS = UNIFIED_IN_APP_CHAT_SOUND_MIN_GAP_MS;

/** DOM·Node 타이머 타입 차이 흡수 */
type TimerHandle = number | ReturnType<typeof globalThis.setTimeout>;
let maxDurationTimer: TimerHandle | null = null;
const repeatTimers: TimerHandle[] = [];
/**
 * 종·푸시·배너 방 진입 전용 cancel epoch.
 * 일반 stopNotificationPlayback 은 이 값을 올리지 않음 → 수신 hydrate 를 죽이지 않음.
 */
let roomEntryCancelEpoch = 0;

export const NOTIFICATION_SOUND_MAX_PLAY_MS = 10_000;
const MAX_PLAY_MS = NOTIFICATION_SOUND_MAX_PLAY_MS;
export const NOTIFICATION_SOUND_MAX_PLAY_SEC = NOTIFICATION_SOUND_MAX_PLAY_MS / 1000;
const REPEAT_GAP_MS = 800;

/** Runtime Link P1 — prod WebView logcat/CDP 계측 (로직 무관) */
const RUNTIME_LINK_P1_LOG = "[runtime-link-p1]";

/** 재생 중 타이머만 정리 — 수신 pending hydrate 는 유지 (06e392d1a 계약) */
export function stopNotificationPlayback(): void {
  if (maxDurationTimer) {
    clearTimeout(maxDurationTimer);
    maxDurationTimer = null;
  }
  for (const t of repeatTimers) {
    clearTimeout(t);
  }
  repeatTimers.length = 0;
}

/** 방 진입(종/푸시) — hydrate 대기 중이던 play 만 무효화 */
export function invalidatePendingNotificationSoundPlayback(): void {
  roomEntryCancelEpoch += 1;
  stopNotificationPlayback();
}

function playOneShot(url: string, volume: number, entryEpoch: number): void {
  if (entryEpoch !== roomEntryCancelEpoch) return;
  try {
    const a = new Audio(url);
    a.volume = Math.max(0, Math.min(1, volume));
    void a.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

/**
 * eventKey SSOT 알림음 (브라우저). domain 경로는 adapter.
 */
export async function playEventNotificationSound(
  eventKey: string,
  context?: { roomMuted?: boolean; userSoundEnabled?: boolean; userDomainEnabled?: boolean }
): Promise<void> {
  if (typeof window === "undefined") return;
  const entryEpochAtStart = roomEntryCancelEpoch;
  console.info(RUNTIME_LINK_P1_LOG, "playEventNotificationSound:enter", { eventKey });
  await ensureNotificationSoundSsotHydratedForClient();
  /** 방 진입 invalidate 만 pending 취소 — 일반 stop 은 여기 안 걸림 */
  if (entryEpochAtStart !== roomEntryCancelEpoch) return;
  const resolved = resolveNotificationSound(eventKey, { ...context, platform: "web" });
  console.info(RUNTIME_LINK_P1_LOG, "playEventNotificationSound:resolved", {
    eventKey: resolved.eventKey,
    fileUrl: resolved.webUrl ?? null,
  });
  if (!resolved.enabled || resolved.kind === "silent") return;
  if (!resolved.webUrl) return;

  stopNotificationPlayback();
  const entryEpochForShots = roomEntryCancelEpoch;

  const url = resolved.webUrl;
  const vol = resolved.volume;
  const repeats = Math.max(1, Math.min(5, resolved.repeatCount));

  console.info(RUNTIME_LINK_P1_LOG, "playEventNotificationSound:before-audio", {
    eventKey: resolved.eventKey,
    fileUrl: url,
  });
  for (let i = 0; i < repeats; i++) {
    const t = window.setTimeout(() => {
      playOneShot(url, vol, entryEpochForShots);
    }, i * REPEAT_GAP_MS);
    repeatTimers.push(t);
  }
  scheduleAutoStop();
}

/**
 * 도메인별 알림음. 반복·최대 재생 시간 후 자동 stop.
 * enabled·asset 은 SSOT resolver 단일 소스.
 */
export async function playDomainNotificationSound(domain: NotificationDomain): Promise<void> {
  if (typeof window === "undefined") return;
  const nowDedupe = Date.now();
  const prevAt = lastDomainPlayAt.get(domain) ?? 0;
  if (nowDedupe - prevAt < DOMAIN_PLAY_DEDUPE_MS) {
    return;
  }
  lastDomainPlayAt.set(domain, nowDedupe);

  const eventKey = eventKeyForNotificationDomain(domain);
  await playEventNotificationSound(eventKey);
}

function scheduleAutoStop(): void {
  maxDurationTimer = window.setTimeout(() => {
    stopNotificationPlayback();
  }, MAX_PLAY_MS);
}

/** Admin SSOT PATCH·legacy UI mutation 후 클라 resolver snapshot 무효화 */
export function invalidateNotificationSoundConfigCache(): void {
  invalidateNotificationSoundSsotCache();
  invalidateNotificationSoundSsotClientHydrate();
}
