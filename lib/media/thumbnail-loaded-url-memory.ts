import { addBounded } from "@/lib/collections/bounded-collections";

/**
 * 탭 push handoff·리스트 remount 후에도 동일 URL 썸네일 pulse 를 생략.
 * 브라우저 HTTP 캐시와 별도 — React `loaded` state 초기화만 완화.
 */
/** 최근 본 썸네일 URL 상한 — 목록 몇 화면 분량. 넘으면 오래된 것부터 잊고, 잊은 URL 은 pulse 1회만 다시 보인다(기능 영향 없음). */
const LOADED_URLS_MAX = 1_000;
const loadedUrls = new Set<string>();

export function markThumbnailUrlLoaded(url: string | null | undefined): void {
  const key = url?.trim();
  if (key) addBounded(loadedUrls, key, LOADED_URLS_MAX);
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
      addBounded(loadedUrls, key, LOADED_URLS_MAX);
      return true;
    }
  } catch {
    /* noop */
  }
  return false;
}
