import {
  dbStoreProductToBusinessProduct,
  type StoreProductRow,
  type StoreRow,
} from "@/lib/stores/db-store-mapper";
import type { BusinessProduct } from "@/lib/types/business";
import { runSingleFlight } from "@/lib/http/run-single-flight";

/**
 * 허브 첫 페인트 — `loadRemote` 전체(매장 목록 재조회) 없이 승인 매장 상품만 무음 로드.
 */
export function fetchOwnerStoreProductsForHub(storeId: string): Promise<BusinessProduct[]> {
  const sid = storeId.trim();
  return runSingleFlight(`me:store:${sid}:products:hub`, async () => {
    const pr = await fetch(`/api/me/stores/${encodeURIComponent(sid)}/products`, {
      credentials: "include",
    });
    const pj = (await pr.json().catch(() => ({}))) as {
      ok?: boolean;
      products?: StoreProductRow[];
    };
    if (!pj?.ok || !Array.isArray(pj.products)) return [];
    return pj.products.map((p) => dbStoreProductToBusinessProduct(p, sid));
  });
}

export function mergeOwnerHubProductCount(
  profile: import("@/lib/types/business").BusinessProfile,
  products: BusinessProduct[]
): import("@/lib/types/business").BusinessProfile {
  return { ...profile, productCount: products.length };
}

export type { StoreRow };
