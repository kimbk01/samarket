/**
 * 주문 채팅 목록 — 매장 프로필 URL 캐시(탭 세션·행 재마운트).
 */

const MAX_ENTRIES = 220;

const store = new Map<string, string>();

export function readStoreProfileThumbnailCache(storeId: string): string | null {
  const k = storeId.trim();
  if (!k) return null;
  const u = store.get(k);
  if (!u) return null;
  store.delete(k);
  store.set(k, u);
  return u;
}

export function writeStoreProfileThumbnailCache(storeId: string, url: string): void {
  const k = storeId.trim();
  const u = url.trim();
  if (!k || !u) return;
  if (store.has(k)) store.delete(k);
  store.set(k, u);
  while (store.size > MAX_ENTRIES) {
    const first = store.keys().next().value as string | undefined;
    if (first) store.delete(first);
    else break;
  }
}

export function prefetchStoreProfileThumbnailIfNeeded(storeId: string | null | undefined): void {
  const k = typeof storeId === "string" ? storeId.trim() : "";
  if (!k || readStoreProfileThumbnailCache(k)) return;

  void (async () => {
    try {
      const res = await fetch(
        `/api/community-messenger/store-profile-thumbnail?storeId=${encodeURIComponent(k)}`,
        { credentials: "include" }
      );
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string | null };
      if (!res.ok || !j.ok) return;
      const u = typeof j.url === "string" && j.url.trim() ? j.url.trim() : null;
      if (u) writeStoreProfileThumbnailCache(k, u);
    } catch {
      /* ignore */
    }
  })();
}
