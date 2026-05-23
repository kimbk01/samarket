"use client";

import { useEffect } from "react";
import { STORE_PUBLIC_CACHE_INVALIDATE_EVENT } from "@/lib/stores/store-public-cache-invalidate";

/** 오너 저장·영업 토글 후 열려 있는 매장 상세·장바구니가 summary 를 다시 받도록 */
export function useStorePublicSlugCacheInvalidation(
  slug: string | null | undefined,
  onInvalidate: () => void
): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const expected = (slug ?? "").trim().toLowerCase();
    if (!expected) return;

    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<{ slug?: string }>).detail;
      const hit = (detail?.slug ?? "").trim().toLowerCase();
      if (hit === expected) onInvalidate();
    };

    window.addEventListener(STORE_PUBLIC_CACHE_INVALIDATE_EVENT, handler);
    return () => window.removeEventListener(STORE_PUBLIC_CACHE_INVALIDATE_EVENT, handler);
  }, [slug, onInvalidate]);
}
