/**
 * Feed Banner session id — stable per surface within the browser tab.
 *
 * CONTRACT:
 * - DO NOT mint a new id on every component mount
 * - Same surfaceKey → same session across rerender / refetch / pagination
 * - HOME↔TOPIC changes surfaceKey → separate sequence (by design)
 * - Returning to same HOME reuses session → slot/advertiser do not thrash
 * - No new global session platform — sessionStorage only
 */

const STORAGE_PREFIX = "feed-ad-session:v1:";
const memoryFallback = new Map<string, string>();

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `fs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateFeedAdSessionId(surfaceKey: string): string {
  const key = String(surfaceKey ?? "").trim() || "unknown";
  if (typeof window === "undefined") {
    return `ssr:${key}`;
  }
  const storageKey = `${STORAGE_PREFIX}${key}`;
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing && existing.trim()) return existing.trim();
    const id = newId();
    sessionStorage.setItem(storageKey, id);
    return id;
  } catch {
    const mem = memoryFallback.get(storageKey);
    if (mem) return mem;
    const id = newId();
    memoryFallback.set(storageKey, id);
    return id;
  }
}

/** Test helper — clear memory fallback (sessionStorage cleared by test harness). */
export function resetFeedAdSessionMemoryForTests(): void {
  memoryFallback.clear();
}
