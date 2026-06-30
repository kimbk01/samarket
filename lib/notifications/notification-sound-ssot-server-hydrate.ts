/**
 * Server push / pipeline — hydrate admin DB SSOT into resolver snapshot.
 * Separate flight key from client P1 hydrate; shares snapshot via notification-sound-resolver.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { loadNotificationSoundSsotFromDb } from "@/lib/notifications/load-notification-sound-ssot-server";

const FLIGHT_KEY = "server:notification-sound-ssot:hydrate";
const HYDRATE_TTL_MS = 60_000;
const HYDRATE_FAILURE_BACKOFF_MS = 30_000;

let lastHydratedAt = 0;
let hydrateFailedAt = 0;

export function invalidateNotificationSoundSsotServerHydrate(): void {
  lastHydratedAt = 0;
  hydrateFailedAt = 0;
}

export function resetNotificationSoundSsotServerHydrateForTests(): void {
  lastHydratedAt = 0;
  hydrateFailedAt = 0;
}

export function getNotificationSoundSsotServerHydrateStateForTests(): {
  lastHydratedAt: number;
  hydrateFailedAt: number;
} {
  return { lastHydratedAt, hydrateFailedAt };
}

export async function ensureNotificationSoundSsotHydratedForServer(
  sb: SupabaseClient
): Promise<void> {
  const now = Date.now();
  if (lastHydratedAt > 0 && now - lastHydratedAt < HYDRATE_TTL_MS) return;
  if (hydrateFailedAt > 0 && now - hydrateFailedAt < HYDRATE_FAILURE_BACKOFF_MS) return;

  await runSingleFlight(FLIGHT_KEY, async () => {
    const again = Date.now();
    if (lastHydratedAt > 0 && again - lastHydratedAt < HYDRATE_TTL_MS) return;

    try {
      await loadNotificationSoundSsotFromDb(sb);
      lastHydratedAt = Date.now();
      hydrateFailedAt = 0;
    } catch {
      hydrateFailedAt = Date.now();
    }
  });
}
