/**
 * 탭 push handoff·리스트 remount 후에도 동일 URL 썸네일 pulse 를 생략.
 * 브라우저 HTTP 캐시와 별도 — React `loaded` state 초기화만 완화.
 */
const loadedUrls = new Set<string>();

export function markThumbnailUrlLoaded(url: string | null | undefined): void {
  const key = url?.trim();
  if (key) loadedUrls.add(key);
}

export function isThumbnailUrlLoaded(url: string | null | undefined): boolean {
  const key = url?.trim();
  return Boolean(key && loadedUrls.has(key));
}

/** 동기 complete probe — 브라우저 캐시 히트 시 remount 직후 pulse 방지 */
export function probeBrowserCachedImageComplete(url: string | null | undefined): boolean {
  if (typeof window === "undefined") return false;
  const key = url?.trim();
  if (!key) return false;
  if (loadedUrls.has(key)) return true;
  try {
    const img = new window.Image();
    img.src = key;
    if (img.complete && img.naturalWidth > 0) {
      loadedUrls.add(key);
      return true;
    }
  } catch {
    /* noop */
  }
  return false;
}
