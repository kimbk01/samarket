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

/**
 * `<script type="application/json">` 본문용 직렬화 (CRT-12).
 * URL slug 는 Next 가 디코딩해 넘기므로 `</script>` 가 그대로 들어올 수 있다 —
 * `<`·`>`·`&`·U+2028/2029 를 JSON 유니코드 이스케이프로 바꿔 태그 탈출을 막는다(JSON.parse 결과는 동일).
 */
export function serializeStoreCartPageServerPerfForScript(payload: StoreCartPageServerPerfPayload): string {
  return JSON.stringify(payload)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
