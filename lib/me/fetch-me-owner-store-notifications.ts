import { pruneByExpiresAtAndMaxSize } from "@/lib/http/memory-map-prune";
import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";

export type MeOwnerStoreNotificationsResult = {
  status: number;
  json: unknown;
};

const TTL_MS = 15_000;
const ME_OWNER_STORE_NOTIF_CACHE_MAX_KEYS = 60;
const cache = new Map<string, { expiresAt: number; value: MeOwnerStoreNotificationsResult }>();

export function invalidateMeOwnerStoreNotificationsCache(storeId: string): void {
  const k = storeId.trim();
  if (k) cache.delete(k);
  forgetSingleFlight(`me:notifications:owner_store:${k}`);
}

export function fetchMeOwnerStoreNotificationsDeduped(
  storeId: string,
  opts?: { force?: boolean }
): Promise<MeOwnerStoreNotificationsResult> {
  const sid = storeId.trim();
  const force = opts?.force === true;
  const flightKey = `me:notifications:owner_store:${sid}` as const;
  const now = Date.now();
  if (!force) {
    const c = cache.get(sid);
    if (c && c.expiresAt > now) {
      return Promise.resolve(c.value);
    }
  } else {
    cache.delete(sid);
    forgetSingleFlight(flightKey);
  }

  return runSingleFlight(flightKey, async (): Promise<MeOwnerStoreNotificationsResult> => {
    const qs = new URLSearchParams({ owner_store_id: sid });
    const res = await fetch(`/api/me/notifications?${qs.toString()}`, {
      credentials: "include",
      cache: "no-store",
    });
    const json: unknown = await res.json().catch(() => ({}));
    const result = { status: res.status, json };
    if (res.ok || res.status === 401 || res.status === 503) {
      cache.set(sid, { value: result, expiresAt: Date.now() + TTL_MS });
      pruneByExpiresAtAndMaxSize(cache, Date.now(), ME_OWNER_STORE_NOTIF_CACHE_MAX_KEYS);
    }
    return result;
  });
}
