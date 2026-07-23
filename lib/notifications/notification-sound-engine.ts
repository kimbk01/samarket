/**
 * 도메인별 알림음 — SSOT resolver · 반복·타임아웃·중단(stopNotificationPlayback).
 * 브라우저 전용.
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
/** hydrate await 중 방 진입·stop 이 오면 이후 playOneShot 무효화 */
let playbackGeneration = 0;

export const NOTIFICATION_SOUND_MAX_PLAY_MS = 10_000;
const MAX_PLAY_MS = NOTIFICATION_SOUND_MAX_PLAY_MS;
export const NOTIFICATION_SOUND_MAX_PLAY_SEC = NOTIFICATION_SOUND_MAX_PLAY_MS / 1000;
const REPEAT_GAP_MS = 800;

/** Runtime Link P1 — prod WebView logcat/CDP 계측 (로직 무관) */
const RUNTIME_LINK_P1_LOG = "[runtime-link-p1]";

export function stopNotificationPlayback(): void {
  playbackGeneration += 1;
  if (maxDurationTimer) {
    clearTimeout(maxDurationTimer);
    maxDurationTimer = null;
  }
  for (const t of repeatTimers) {
    clearTimeout(t);
  }
  repeatTimers.length = 0;
}

/** 방 진입 등 — hydrate 대기 중이던 play 도 무효화 */
export function invalidatePendingNotificationSoundPlayback(): void {
  stopNotificationPlayback();
}

function playOneShot(url: string, volume: number, generation: number): void {
  if (generation !== playbackGeneration) return;
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
  const genBeforeHydrate = playbackGeneration;
  console.info(RUNTIME_LINK_P1_LOG, "playEventNotificationSound:enter", { eventKey });
  await ensureNotificationSoundSsotHydratedForClient();
  /** 방 진입·stop 이 hydrate 동안 발생하면 늦게 울리지 않음 */
  if (genBeforeHydrate !== playbackGeneration) return;
  const resolved = resolveNotificationSound(eventKey, { ...context, platform: "web" });
  console.info(RUNTIME_LINK_P1_LOG, "playEventNotificationSound:resolved", {
    eventKey: resolved.eventKey,
    fileUrl: resolved.webUrl ?? null,
  });
  if (!resolved.enabled || resolved.kind === "silent") return;
  if (!resolved.webUrl) return;

  stopNotificationPlayback();
  const myGen = playbackGeneration;

  const url = resolved.webUrl;
  const vol = resolved.volume;
  const repeats = Math.max(1, Math.min(5, resolved.repeatCount));

  console.info(RUNTIME_LINK_P1_LOG, "playEventNotificationSound:before-audio", {
    eventKey: resolved.eventKey,
    fileUrl: url,
  });
  for (let i = 0; i < repeats; i++) {
    const t = window.setTimeout(() => {
      playOneShot(url, vol, myGen);
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
