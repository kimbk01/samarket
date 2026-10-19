/**
 * DEF-64 — 매장 공개 읽기 경로의 **인스턴스 로컬** server memory 캐시 전체 제거.
 *
 * 인스턴스 공통 무효화는 `store-public-shared-cache-generation.ts` 가 담당한다:
 * 관리자 쓰기 → Next cache tag 세대 갱신 → 각 인스턴스가 다음 읽기에서 세대 변경을 감지하면
 * 이 함수를 호출한다. DB 스냅샷(browse/menus counter row·discovery projection)은 이미 공용이라
 * 여기서 다루지 않는다.
 *
 * next/cache 를 import 하지 않는 순수 모듈 — 단위 테스트·다른 server 모듈에서 재사용.
 */
import { clearStoreHomeFeedServerCache } from "@/lib/stores/store-home-feed-server-cache";
import { invalidateStoresBrowseMemoryCache } from "@/lib/stores/stores-browse-response-cache";
import { clearStoreSummaryPublicServerCache } from "@/lib/stores/store-summary-public-server-cache";
import { clearStoreMenusPublicServerCache } from "@/lib/stores/store-menus-public-server-cache";
import { clearApprovedStoreSlugCache } from "@/lib/stores/get-approved-store-by-slug";
import { invalidateMeStoresListServerCache } from "@/lib/me/load-me-stores-for-user";
import { clearBrowseTaxonomySliceCache } from "@/lib/stores/stores-browse-taxonomy-cache";

/** 홈 피드 20s · browse 45s · summary 45s · slug 30s · menus 15/60s · 사장님 매장 목록 20s · browse 업종 slice 10min */
export function purgeAllStorePublicServerMemoryCaches(): void {
  clearStoreHomeFeedServerCache();
  invalidateStoresBrowseMemoryCache();
  clearStoreSummaryPublicServerCache();
  clearStoreMenusPublicServerCache();
  clearApprovedStoreSlugCache();
  invalidateMeStoresListServerCache();
  clearBrowseTaxonomySliceCache();
}
