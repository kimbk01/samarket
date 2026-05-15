"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { deliveryStoreDetailPrefetch } from "@/lib/dibay/delivery-store-detail-prefetch";

const VIEWPORT_ROOT_MARGIN = "480px 0px";
const VIEWPORT_THRESHOLD = 0.01;

/**
 * 목록 카드가 뷰포트 근처에 들어오면 상세 route prefetch (1 카드 1 observer).
 */
export function useDeliveryStoreDetailViewportPrefetch(
  slug: string,
  enabled = true
): (node: HTMLElement | null) => void {
  const router = useRouter();
  const slugRef = useRef(slug);
  slugRef.current = slug;
  const observerRef = useRef<IntersectionObserver | null>(null);
  const prefetchedInViewRef = useRef(false);

  useEffect(() => {
    prefetchedInViewRef.current = false;
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
          if (!entry?.isIntersecting || prefetchedInViewRef.current) return;
          prefetchedInViewRef.current = true;
          deliveryStoreDetailPrefetch(router, s, "viewport");
        },
        { root: null, rootMargin: VIEWPORT_ROOT_MARGIN, threshold: VIEWPORT_THRESHOLD }
      );
      observerRef.current.observe(node);
    },
    [enabled, router]
  );
}
