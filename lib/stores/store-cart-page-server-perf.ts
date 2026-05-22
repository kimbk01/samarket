/** Cart HTML route — RSC 구간만 서버에 기록 (측정·스크립트 파싱용, UI 아님). */

export type StoreCartPageServerPerfPayload = {
  slug: string;
  rsc_ms: number;
};

export function buildStoreCartPageServerPerfPayload(
  slug: string,
  rscMs: number
): StoreCartPageServerPerfPayload {
  return {
    slug: slug.trim(),
    rsc_ms: Math.max(0, Math.round(rscMs)),
  };
}

export const STORE_CART_PAGE_PERF_SCRIPT_ID = "samarket-cart-page-perf";
