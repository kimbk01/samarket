type UnreadCountMode = "all" | "consumer" | "owner_store_commerce" | "bottom_nav";

const TTL_MS = 10_000;

const cache = new Map<string, { value: number; expiresAt: number }>();
const flights = new Map<string, Promise<number>>();

function makeKey(userId: string, mode: UnreadCountMode): string {
  return `${userId.trim()}::${mode}`;
}

function prune(now: number) {
  if (cache.size < 200) return;
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

export function invalidateNotificationUnreadCountCache(userId: string): void {
  const uid = userId.trim();
  if (!uid) return;
  for (const key of cache.keys()) {
    if (key.startsWith(`${uid}::`)) {
      cache.delete(key);
    }
  }
}

export function getCachedNotificationUnreadCount(
  userId: string,
  mode: UnreadCountMode,
  factory: () => Promise<number>
): Promise<number> {
  const uid = userId.trim();
  if (!uid) return factory();

  const key = makeKey(uid, mode);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return Promise.resolve(cached.value);
  }

  const existingFlight = flights.get(key);
  if (existingFlight) {
    return existingFlight;
  }

  prune(now);

  const flight = factory()
    .then((value) => {
      const next = Math.max(0, Math.floor(Number(value) || 0));
      cache.set(key, { value: next, expiresAt: Date.now() + TTL_MS });
      return next;
    })
    .finally(() => {
      if (flights.get(key) === flight) {
        flights.delete(key);
      }
    });

  flights.set(key, flight);
  return flight;
}

export type { UnreadCountMode };
