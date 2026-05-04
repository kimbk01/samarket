/**
 * 거래 목록 썸네일 URL — SPA 뒤로가기·행 재마운트 시 네트워크 전에 동일 paint 에 표시.
 * (메모리 LRU; 탭 세션 동안 유지)
 */

const MAX_ENTRIES = 220;

const store = new Map<string, string>();

export function readTradePostThumbnailCache(postId: string): string | null {
  const k = postId.trim();
  if (!k) return null;
  const u = store.get(k);
  if (!u) return null;
  store.delete(k);
  store.set(k, u);
  return u;
}

export function writeTradePostThumbnailCache(postId: string, url: string): void {
  const k = postId.trim();
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

/** 탭/목록 진입 전에 캐시 워밍 — 포인터다운 등에서 호출 */
export function prefetchTradePostThumbnailIfNeeded(postId: string | null | undefined): void {
  const k = typeof postId === "string" ? postId.trim() : "";
  if (!k || readTradePostThumbnailCache(k)) return;

  void (async () => {
    try {
      const res = await fetch(`/api/community-messenger/trade-post-thumbnail?postId=${encodeURIComponent(k)}`, {
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string | null };
      if (!res.ok || !j.ok) return;
      const u = typeof j.url === "string" && j.url.trim() ? j.url.trim() : null;
      if (u) writeTradePostThumbnailCache(k, u);
    } catch {
      /* ignore */
    }
  })();
}
