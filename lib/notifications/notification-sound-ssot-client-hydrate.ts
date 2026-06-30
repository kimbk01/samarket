/**
 * Foreground in-app sound — hydrate admin DB SSOT into client resolver snapshot.
 * Failure leaves registry fallback intact.
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { hydrateNotificationSoundSnapshotFromRows } from "@/lib/notifications/notification-sound-resolver";
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
  return true;
}

export async function ensureNotificationSoundSsotHydratedForClient(): Promise<void> {
  if (typeof window === "undefined") return;

  const now = Date.now();
  if (lastHydratedAt > 0 && now - lastHydratedAt < HYDRATE_TTL_MS) return;
  if (hydrateFailedAt > 0 && now - hydrateFailedAt < HYDRATE_FAILURE_BACKOFF_MS) return;

  await runSingleFlight(FLIGHT_KEY, async () => {
    const again = Date.now();
    if (lastHydratedAt > 0 && again - lastHydratedAt < HYDRATE_TTL_MS) return;

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
