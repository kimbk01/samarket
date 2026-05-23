import { forgetSingleFlight } from "@/lib/http/run-single-flight";
import { purgeStoreSlugPublicClientCaches } from "@/lib/stores/store-delivery-api-client";
import { invalidateStoreSummaryPublicServerCache } from "@/lib/stores/store-summary-public-server-cache";

/** `window` 이벤트 — 매장 상세·장바구니가 구독해 즉시 refetch */
export const STORE_PUBLIC_CACHE_INVALIDATE_EVENT = "samarket:store-public-cache-invalidate";

/**
 * slug 공개 API·서버·클라 캐시 일괄 무효화 — 오너 `is_open`·`business_hours_json` 저장 직후.
 * CONTRACT: 영업 스케줄 저장 후 15s/45s stale 로 마감·영업 표시가 어긋나면 안 됨.
 */
export function invalidateStorePublicCachesForSlug(slug: string): void {
  const s = slug.trim();
  if (!s) return;
  const k = s.toLowerCase();
  invalidateStoreSummaryPublicServerCache(k);
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
