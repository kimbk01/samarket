/**
 * Product Intro last-known-good cache — never blocks cold entry.
 */

import {
  BUNDLED_PRODUCT_INTRO_CONFIG,
  STARTUP_PRODUCT_INTRO_LOCAL_STORAGE_KEY,
  STARTUP_PRODUCT_INTRO_MEDIA_CACHE_KEY,
  isProductIntroDisplayEligible,
  normalizeProductIntroConfig,
  type ProductIntroConfig,
} from "@/lib/startup/product-intro";
import { syncProductIntroToNative } from "@/lib/startup/product-intro-native-sync";

function storageGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* quota */
  }
}

function storageRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function readProductIntroCache(): ProductIntroConfig {
  const raw = storageGet(STARTUP_PRODUCT_INTRO_LOCAL_STORAGE_KEY);
  if (!raw) return { ...BUNDLED_PRODUCT_INTRO_CONFIG };
  try {
    return normalizeProductIntroConfig(JSON.parse(raw) as unknown);
  } catch {
    return { ...BUNDLED_PRODUCT_INTRO_CONFIG };
  }
}

export function writeProductIntroCache(config: ProductIntroConfig): void {
  const next = normalizeProductIntroConfig(config);
  storageSet(STARTUP_PRODUCT_INTRO_LOCAL_STORAGE_KEY, JSON.stringify(next));
}

export function clearProductIntroCache(): void {
  storageRemove(STARTUP_PRODUCT_INTRO_LOCAL_STORAGE_KEY);
  storageRemove(STARTUP_PRODUCT_INTRO_MEDIA_CACHE_KEY);
}

/** Media URL marked ready after successful Image decode / prefetch. */
export function readProductIntroMediaReadyUrl(): string | null {
  const raw = storageGet(STARTUP_PRODUCT_INTRO_MEDIA_CACHE_KEY);
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { url?: string };
    return typeof o.url === "string" && o.url.trim() ? o.url.trim() : null;
  } catch {
    return null;
  }
}

export function writeProductIntroMediaReadyUrl(url: string | null): void {
  if (!url) {
    storageRemove(STARTUP_PRODUCT_INTRO_MEDIA_CACHE_KEY);
    return;
  }
  storageSet(
    STARTUP_PRODUCT_INTRO_MEDIA_CACHE_KEY,
    JSON.stringify({ url, at: new Date().toISOString() })
  );
}

/**
 * Local eligibility for immediate show: config eligible AND media URL matches
 * last successful prefetch (or same-origin path that we treat as ready when cached config matches).
 */
export function canShowProductIntroFromCache(
  config: ProductIntroConfig = readProductIntroCache(),
  nowMs: number = Date.now()
): { show: true; config: ProductIntroConfig; mediaUrl: string } | { show: false } {
  if (!isProductIntroDisplayEligible(config, nowMs)) return { show: false };
  const mediaUrl = config.media.mobileUrl;
  if (!mediaUrl) return { show: false };
  const ready = readProductIntroMediaReadyUrl();
  // First install / never prefetched: do not wait — skip this entry.
  if (!ready || ready !== mediaUrl) return { show: false };
  return { show: true, config, mediaUrl };
}

/**
 * Prefetch image decode. Only `markReady` (default true) updates the LKG media-ready
 * marker — required mobile URL owns readiness; tablet warm-cache must not overwrite it.
 */
export function prefetchProductIntroMedia(
  url: string,
  opts?: { markReady?: boolean }
): Promise<boolean> {
  if (typeof window === "undefined" || !url) return Promise.resolve(false);
  const markReady = opts?.markReady !== false;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (markReady) writeProductIntroMediaReadyUrl(url);
      resolve(true);
    };
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

let refreshStarted = false;

/** Background refresh after shellReady — never blocks entry. */
export function scheduleProductIntroCacheRefresh(): void {
  if (typeof window === "undefined") return;
  if (refreshStarted) return;
  refreshStarted = true;

  const run = () => {
    void (async () => {
      try {
        const res = await fetch("/api/app/startup-product-intro", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as { ok?: boolean; config?: unknown };
        if (!json?.ok) return;
        const next = normalizeProductIntroConfig(json.config);
        writeProductIntroCache(next);
        syncProductIntroToNative(next);
        if (!isProductIntroDisplayEligible(next)) {
          writeProductIntroMediaReadyUrl(null);
          return;
        }
        const url = next.media.mobileUrl;
        if (url) {
          const ok = await prefetchProductIntroMedia(url, { markReady: true });
          if (!ok) writeProductIntroMediaReadyUrl(null);
          // Re-sync after media ready so Native can download same asset for next cold.
          if (ok) syncProductIntroToNative(next);
          const tablet = next.media.tabletUrl;
          // Warm tablet decode only — never replace mobile ready marker.
          if (tablet && tablet !== url) {
            void prefetchProductIntroMedia(tablet, { markReady: false });
          }
        } else {
          writeProductIntroMediaReadyUrl(null);
        }
      } catch {
        /* keep LKG */
      }
    })();
  };

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => run(), { timeout: 5000 });
  } else {
    window.setTimeout(run, 1500);
  }
}
