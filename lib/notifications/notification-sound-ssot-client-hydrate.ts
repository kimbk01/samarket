/**
 * Foreground in-app sound — hydrate admin DB SSOT into client resolver snapshot.
 * Failure keeps the current snapshot: last-good admin data if hydrated before, otherwise registry
 * (W1 / A1: the client never reverts from admin data to the static registry on age or failure).
 * HYDRATE_TTL_MS only throttles refetches; it does not expire the snapshot.
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  getNotificationSoundSsotSnapshotOrigin,
  hydrateNotificationSoundSnapshotFromRows,
  isNotificationSoundSsotClientRefreshRequested,
} from "@/lib/notifications/notification-sound-resolver";
import type {
  NotificationSoundAssetRow,
  NotificationSoundEventRow,
  NotificationSoundMappingRow,
} from "@/lib/notifications/notification-sound-types";

const FLIGHT_KEY = "app:notification-sound-ssot:hydrate";
const HYDRATE_TTL_MS = 60_000;
const HYDRATE_FAILURE_BACKOFF_MS = 30_000;

let lastHydratedAt = 0;
let hydrateFailedAt = 0;
/** W1-b — receive sounds waiting (bounded) for the first admin SSOT apply. Notified on success only. */
const readyWaiters = new Set<() => void>();

function notifyNotificationSoundSsotReady(): void {
  for (const w of [...readyWaiters]) w();
}

/**
 * W4 — Android 이벤트 음원 채널 동기화(fire-and-forget). 동적 import 로 웹·테스트 번들 영향 없음.
 * 재생 경로와 독립: 실패해도 hydrate 결과·인앱 재생에 영향 없음.
 */
function scheduleNativeNotificationSoundChannelSync(): void {
  if (typeof window === "undefined") return;
  void import("@/lib/notifications/native-notification-sound-channel-sync")
    .then((m) => m.syncNativeNotificationSoundChannelsBestEffort())
    .catch(() => {});
}

export function invalidateNotificationSoundSsotClientHydrate(): void {
  lastHydratedAt = 0;
  hydrateFailedAt = 0;
}

export function getNotificationSoundSsotClientHydrateStateForTests(): {
  lastHydratedAt: number;
  hydrateFailedAt: number;
} {
  return { lastHydratedAt, hydrateFailedAt };
}

export function resetNotificationSoundSsotClientHydrateForTests(): void {
  lastHydratedAt = 0;
  hydrateFailedAt = 0;
  readyWaiters.clear();
  firstLoadArm += 1;
  clearFirstLoadRetry();
}

/** @internal test hook */
export async function hydrateNotificationSoundSsotFromApiResponse(body: {
  ok?: boolean;
  assets?: NotificationSoundAssetRow[];
  events?: NotificationSoundEventRow[];
  mappings?: NotificationSoundMappingRow[];
}): Promise<boolean> {
  if (!body?.ok) return false;
  await hydrateNotificationSoundSnapshotFromRows({
    assets: body.assets ?? [],
    events: body.events ?? [],
    mappings: body.mappings ?? [],
  });
  lastHydratedAt = Date.now();
  hydrateFailedAt = 0;
  notifyNotificationSoundSsotReady();
  scheduleNativeNotificationSoundChannelSync();
  return true;
}

export async function ensureNotificationSoundSsotHydratedForClient(): Promise<void> {
  if (typeof window === "undefined") return;

  const now = Date.now();
  const refreshRequested = isNotificationSoundSsotClientRefreshRequested();
  if (!refreshRequested && lastHydratedAt > 0 && now - lastHydratedAt < HYDRATE_TTL_MS) return;
  if (hydrateFailedAt > 0 && now - hydrateFailedAt < HYDRATE_FAILURE_BACKOFF_MS) return;

  await runSingleFlight(FLIGHT_KEY, async () => {
    const again = Date.now();
    if (
      !isNotificationSoundSsotClientRefreshRequested() &&
      lastHydratedAt > 0 &&
      again - lastHydratedAt < HYDRATE_TTL_MS
    ) {
      return;
    }

    try {
      const res = await fetch("/api/app/notification-sound-ssot", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        hydrateFailedAt = Date.now();
        return;
      }
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        assets?: NotificationSoundAssetRow[];
        events?: NotificationSoundEventRow[];
        mappings?: NotificationSoundMappingRow[];
      };
      const ok = await hydrateNotificationSoundSsotFromApiResponse(j);
      if (!ok) hydrateFailedAt = Date.now();
    } catch {
      hydrateFailedAt = Date.now();
    }
  });
}

/**
 * W1-b — admin SSOT has been applied to this client at least once (last-good may be older than TTL).
 * Before that, the resolver snapshot is the static registry and must not be played as the admin sound.
 */
export function isNotificationSoundSsotClientReady(): boolean {
  if (typeof window === "undefined") return false;
  return getNotificationSoundSsotSnapshotOrigin() === "hydrated";
}

/**
 * W1-b — pre-first-load state only. Resolves `true` as soon as any hydrate (boot, boot retry, Prime,
 * gesture — including one that starts after this call, e.g. right after login) applies admin data,
 * or with the current readiness after `timeoutMs`. Never starts a request itself (SOUND HOT PATH HTTP = 0).
 */
export function waitForNotificationSoundSsotClientReady(timeoutMs: number): Promise<boolean> {
  if (isNotificationSoundSsotClientReady()) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      readyWaiters.delete(onReady);
      if (timer) clearTimeout(timer);
      resolve(value);
    };
    const onReady = () => finish(true);
    readyWaiters.add(onReady);
    timer = setTimeout(() => finish(isNotificationSoundSsotClientReady()), Math.max(0, timeoutMs));
  });
}

/**
 * W1-b — route-independent first load. Called once per authenticated App Boot completion
 * (`scheduleAppBootBackgroundHydration`), i.e. cold start, login and account switch, on every route
 * including `/` and `/philife` where `NotificationSoundPrime` is not mounted.
 *
 * A failure backoff recorded before this session was authenticated (anonymous 401) is stale here,
 * so it is cleared only while nothing has been hydrated yet. Same single-flight key as Prime —
 * concurrent mounts join one request; inside TTL a hydrated client does not refetch.
 */
export function primeNotificationSoundSsotForAuthenticatedBoot(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!isNotificationSoundSsotClientReady()) {
    hydrateFailedAt = 0;
  }
  return ensureNotificationSoundSsotHydratedForClient();
}

/**
 * W1-b — bounded retry of the first load (3 retries, then stop; ~65 s total), so a transient
 * failure at start does not leave a home-only session silent. Only while nothing has been applied.
 */
export const NOTIFICATION_SOUND_SSOT_FIRST_LOAD_RETRY_DELAYS_MS = [5_000, 15_000, 45_000] as const;

let firstLoadArm = 0;
let firstLoadRetryTimer: ReturnType<typeof setTimeout> | null = null;

function clearFirstLoadRetry(): void {
  if (firstLoadRetryTimer) {
    clearTimeout(firstLoadRetryTimer);
    firstLoadRetryTimer = null;
  }
}

function runFirstLoad(arm: number, attempt: number): void {
  void primeNotificationSoundSsotForAuthenticatedBoot().then(() => {
    if (arm !== firstLoadArm) return;
    if (isNotificationSoundSsotClientReady()) return;
    const delay = NOTIFICATION_SOUND_SSOT_FIRST_LOAD_RETRY_DELAYS_MS[attempt];
    if (delay == null) return;
    clearFirstLoadRetry();
    firstLoadRetryTimer = setTimeout(() => {
      firstLoadRetryTimer = null;
      if (arm !== firstLoadArm) return;
      runFirstLoad(arm, attempt + 1);
    }, delay);
  });
}

/**
 * W1-b — single owner of the authenticated first load. Callers (authenticated only):
 * App Boot completion with a profile, and the session phase becoming `authenticated` (login that
 * does not re-run App Boot). Re-arming supersedes the previous chain (one retry chain at a time);
 * requests still go through single-flight + TTL, so concurrent triggers send one request.
 */
export function armNotificationSoundSsotFirstLoad(_source: "app_boot" | "session_authenticated"): void {
  if (typeof window === "undefined") return;
  clearFirstLoadRetry();
  const arm = ++firstLoadArm;
  runFirstLoad(arm, 0);
}

/** W1-b — auth epoch reset (logout / account switch wipe): stop the previous account's retry chain. */
export function cancelNotificationSoundSsotFirstLoad(): void {
  firstLoadArm += 1;
  clearFirstLoadRetry();
}
