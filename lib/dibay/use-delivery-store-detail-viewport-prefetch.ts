"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { deliveryStoreDetailPrefetch } from "@/lib/dibay/delivery-store-detail-prefetch";
import { deliveryStoreDetailPrewarmAll } from "@/lib/dibay/delivery-store-detail-prewarm";
import { isStoresBrowseHubPath } from "@/lib/dibay/delivery-store-detail-prewarm-lifecycle";
import { STORE_SUMMARY_PUBLIC_CACHE_TTL_MS } from "@/lib/stores/store-delivery-client-cache-ttl";

const VIEWPORT_ROOT_MARGIN = "480px 0px";
const VIEWPORT_THRESHOLD = 0.01;

/**
 * v4 W3 PERF-04 — 같은 카드 재진입 prewarm 간격 = 상세 캐시 TTL.
 * 예전에는 마운트 동안 1회만(영구) → 캐시 만료 뒤 다시 보여도 prewarm 하지 않았다.
 */
const VIEWPORT_REPREWARM_AFTER_MS = STORE_SUMMARY_PUBLIC_CACHE_TTL_MS;

/**
 * 목록 카드가 뷰포트 근처에 들어오면 상세 route prefetch (1 카드 1 observer).
 * prewarm(menus·summary·banners)은 `deliveryStoreDetailPrewarmAll` 의 ambient 동시 상한 큐를 거친다.
 */
export function useDeliveryStoreDetailViewportPrefetch(
  slug: string,
  enabled = true
): (node: HTMLElement | null) => void {
  const router = useRouter();
  const slugRef = useRef(slug);
  slugRef.current = slug;
  const observerRef = useRef<IntersectionObserver | null>(null);
  const prefetchedInViewAtRef = useRef<number | null>(null);

  useEffect(() => {
    prefetchedInViewAtRef.current = null;
  }, [slug]);

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, []);

  return useCallback(
    (node: HTMLElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!node || !enabled) return;

      const s = slugRef.current.trim();
      if (!s) return;

      observerRef.current = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry?.isIntersecting) return;
          const lastAt = prefetchedInViewAtRef.current;
          const now = Date.now();
          if (lastAt != null && now - lastAt < VIEWPORT_REPREWARM_AFTER_MS) return;
          if (typeof window !== "undefined" && !isStoresBrowseHubPath(window.location.pathname)) return;
          prefetchedInViewAtRef.current = now;
          deliveryStoreDetailPrewarmAll(s);
          deliveryStoreDetailPrefetch(router, s, "viewport");
        },
        { root: null, rootMargin: VIEWPORT_ROOT_MARGIN, threshold: VIEWPORT_THRESHOLD }
      );
      observerRef.current.observe(node);
    },
    [enabled, router]
  );
}
