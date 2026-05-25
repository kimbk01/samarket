import { forgetSingleFlight } from "@/lib/http/run-single-flight";
import { purgeStoreSlugPublicClientCaches } from "@/lib/stores/store-delivery-api-client";

/** `window` 이벤트 — 매장 상세·장바구니가 구독해 즉시 refetch */
export const STORE_PUBLIC_CACHE_INVALIDATE_EVENT = "samarket:store-public-cache-invalidate";

/**
 * slug 공개 API·클라 캐시 무효화 — 오너 저장 직후 (브라우저).
 * 서버 snapshot·route memory purge는 `store-public-cache-invalidate-server.ts` (API route).
 */
export function invalidateStorePublicCachesForSlug(slug: string): void {
  const s = slug.trim();
  if (!s) return;
  const k = s.toLowerCase();
  forgetSingleFlight(`store-summary-api:slug:${k}`);
  purgeStoreSlugPublicClientCaches(s);
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(
        new CustomEvent(STORE_PUBLIC_CACHE_INVALIDATE_EVENT, { detail: { slug: s } })
      );
    } catch {
      /* noop */
    }
  }
}
