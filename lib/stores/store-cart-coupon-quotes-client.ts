/**
 * v4 W3 PERF-08 — 장바구니 쿠폰 best-eligible 조회 debounce + AbortController.
 * 수량 스테퍼 연타마다 `GET /api/me/store-coupons/best-eligible` 가 나가던 것을 마지막 값 1회로 줄이고,
 * 새 값이 오면 진행 중 요청을 abort 해 늦게 도착한 옛 금액 응답이 적용되지 않게 한다.
 */

export const STORE_CART_COUPON_QUOTES_DEBOUNCE_MS = 300;

export type StoreCartBestEligibleJson = {
  ok?: boolean;
  quotes?: unknown[];
  best?: { userCouponId: string; campaignId: string } | null;
};

export function buildStoreCartBestEligibleUrl(storeId: string, itemGrossPhp: number): string {
  return `/api/me/store-coupons/best-eligible?storeId=${encodeURIComponent(storeId)}&itemGrossPhp=${encodeURIComponent(String(itemGrossPhp))}`;
}

/**
 * `delayMs` 뒤 조회를 시작한다. 반환 함수 = 취소(타이머 해제 + 진행 중 요청 abort).
 * `onResult` 는 취소되지 않은 응답에만 호출된다 (`null` = 비정상 응답).
 */
export function scheduleStoreCartBestEligibleFetch(opts: {
  storeId: string;
  itemGrossPhp: number;
  delayMs: number;
  onResult: (json: StoreCartBestEligibleJson | null) => void;
  onError: () => void;
  fetchImpl?: typeof fetch;
}): () => void {
  const controller = new AbortController();
  let cancelled = false;
  const doFetch = opts.fetchImpl ?? fetch;
  const run = () => {
    if (cancelled) return;
    void doFetch(buildStoreCartBestEligibleUrl(opts.storeId, opts.itemGrossPhp), {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? (res.json() as Promise<StoreCartBestEligibleJson>) : null))
      .then((json) => {
        if (cancelled || controller.signal.aborted) return;
        opts.onResult(json);
      })
      .catch(() => {
        if (cancelled || controller.signal.aborted) return;
        opts.onError();
      });
  };
  const timer = opts.delayMs > 0 ? setTimeout(run, opts.delayMs) : null;
  if (timer == null) run();
  return () => {
    cancelled = true;
    if (timer != null) clearTimeout(timer);
    controller.abort();
  };
}
