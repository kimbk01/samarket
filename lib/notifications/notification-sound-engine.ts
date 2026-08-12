/**
 * 도메인별 알림음 — SSOT resolver · 반복·타임아웃·중단(stopNotificationPlayback).
 * 브라우저 전용.
 *
 * CONTRACT: 수신 알림음(playEvent) 은 일반 stop 으로 취소하지 않는다.
 * SOUND HOT PATH HTTP = 0 — SSOT hydrate 를 play 직전에 await 하지 않는다.
 * 채팅 상세 진입은 `invalidateChatRoomEntryInAppSound` → `invalidatePendingNotificationSoundPlayback`
 * 으로 pending 을 끊는다.
 */
import type { NotificationDomain } from "@/lib/notifications/notification-domains";
import { eventKeyForNotificationDomain } from "@/lib/notifications/notification-sound-event-map";
import {
  invalidateNotificationSoundSsotCache,
  resolveNotificationSound,
} from "@/lib/notifications/notification-sound-resolver";
import { invalidateNotificationSoundSsotClientHydrate } from "@/lib/notifications/notification-sound-ssot-client-hydrate";
import { logBadgeFdProbe } from "@/lib/notifications/badge-fd-probe-log";
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
 * 일반 stopNotificationPlayback 은 이 값을 올리지 않음 → 수신 pending 을 죽이지 않음.
 * Logout / authEpoch wipe 도 이 epoch 를 올려 delayed Audio.play 를 끊는다.
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

/** 방 진입(종/푸시) — 대기 중이던 play 만 무효화 */
export function invalidatePendingNotificationSoundPlayback(): void {
  roomEntryCancelEpoch += 1;
  stopNotificationPlayback();
}

/** Logout / account switch — pending one-shots + domain play clock. */
export function resetNotificationSoundEngineForAuthEpoch(): void {
  lastDomainPlayAt.clear();
  invalidatePendingNotificationSoundPlayback();
}

function playOneShot(url: string, volume: number, entryEpoch: number): void {
  if (entryEpoch !== roomEntryCancelEpoch) {
    logBadgeFdProbe("playOneShot.skip", { reason: "room_entry_cancel", url });
    return;
  }
  try {
    const a = new Audio(url);
    a.volume = Math.max(0, Math.min(1, volume));
    logBadgeFdProbe("playOneShot.play", {
      url,
      volume: a.volume,
      muted: a.muted,
      currentTime: a.currentTime,
    });
    void a.play().then(
      () => {
        logBadgeFdProbe("playOneShot.result", { url, ok: true });
      },
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        logBadgeFdProbe("playOneShot.result", { url, ok: false, error: message });
        console.warn("[notification-sound] playOneShot_failed", message);
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logBadgeFdProbe("playOneShot.result", { url, ok: false, error: message });
    console.warn("[notification-sound] playOneShot_throw", message);
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
  console.info(
    `${RUNTIME_LINK_P1_LOG} ${JSON.stringify({ stage: "playEventNotificationSound:enter", eventKey })}`
  );
  /** 방 진입 / auth wipe invalidate 만 pending 취소 — 일반 stop 은 여기 안 걸림 */
  if (entryEpochAtStart !== roomEntryCancelEpoch) {
    logBadgeFdProbe("playEventNotificationSound.skip", {
      eventKey,
      reason: "room_entry_cancel",
    });
    return;
  }
  const resolved = resolveNotificationSound(eventKey, { ...context, platform: "web" });
  console.info(
    `${RUNTIME_LINK_P1_LOG} ${JSON.stringify({
      stage: "playEventNotificationSound:resolved",
      eventKey: resolved.eventKey,
      fileUrl: resolved.webUrl ?? null,
      enabled: resolved.enabled,
      kind: resolved.kind,
      volume: resolved.volume,
    })}`
  );
  if (!resolved.enabled || resolved.kind === "silent") {
    logBadgeFdProbe("playEventNotificationSound.skip", {
      eventKey: resolved.eventKey,
      reason: resolved.kind === "silent" ? "silent" : "disabled",
    });
    return;
  }
  if (!resolved.webUrl) {
    logBadgeFdProbe("playEventNotificationSound.skip", {
      eventKey: resolved.eventKey,
      reason: "missing_webUrl",
    });
    return;
  }

  stopNotificationPlayback();
  const entryEpochForShots = roomEntryCancelEpoch;

  const url = resolved.webUrl;
  const vol = resolved.volume;
  const repeats = Math.max(1, Math.min(5, resolved.repeatCount));

  console.info(
    `${RUNTIME_LINK_P1_LOG} ${JSON.stringify({
      stage: "playEventNotificationSound:before-audio",
      eventKey: resolved.eventKey,
      fileUrl: url,
      volume: vol,
      repeats,
    })}`
  );
  /**
   * 첫 샷은 repeatTimers 밖에 둔다. 일반 `stopNotificationPlayback` 이
   * 수신 pending 을 죽이면 안 된다. `invalidatePending` 만 epoch 로 취소.
   */
  queueMicrotask(() => {
    playOneShot(url, vol, entryEpochForShots);
  });
  for (let i = 1; i < repeats; i++) {
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
    logBadgeFdProbe("playDomainNotificationSound.skip", {
      domain,
      reason: "domain_dedupe",
      gapMs: nowDedupe - prevAt,
    });
    return;
  }
  lastDomainPlayAt.set(domain, nowDedupe);

  const eventKey = eventKeyForNotificationDomain(domain);
  logBadgeFdProbe("playDomainNotificationSound.enter", { domain, eventKey });
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
