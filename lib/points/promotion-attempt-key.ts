/**
 * 재감사 S-0 (X-1 · P0): 상위노출 결제 요청 키 — **같은 결제 시도는 같은 키**.
 *
 * R2 이후 광고 중인 글에 다시 결제하면 연장이 된다. 버튼을 누를 때마다 키를 새로 만들면, 응답이 끊긴 뒤
 * (서버는 이미 결제) 다시 눌렀을 때 새 요청으로 처리되어 연장으로 **한 번 더 차감**됐다.
 * 같은 키로 다시 보내면 서버(`purchase_member_*_promotion`)가 처음 결과를 그대로 돌려주고 차감하지 않는다.
 *
 * - 같은 글·같은 상품이면 키를 유지한다(`keyFor`).
 * - 서버가 결과를 확정해 돌려준 뒤(성공·4xx 거절)에만 키를 버린다(`settleIfFinal`). 다음 결제는 새 키.
 * - 응답을 못 받음(네트워크 오류)·5xx 는 결과를 모르는 상태라 같은 키를 유지한다.
 */
export type PromotionAttemptKeyStore = {
  keyFor: (targetId: string, productId: string) => string;
  /** HTTP 상태를 받았고 결과가 확정이면 키를 버린다. `status` 가 null(응답 없음)·5xx 면 유지. */
  settleIfFinal: (status: number | null) => void;
  /** 창을 새로 열 때 등 시도를 처음부터 다시 */
  reset: () => void;
};

function newPromotionAttemptKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `promo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createPromotionAttemptKeyStore(makeKey: () => string = newPromotionAttemptKey): PromotionAttemptKeyStore {
  let scope: string | null = null;
  let key: string | null = null;
  return {
    keyFor(targetId, productId) {
      const next = `${targetId.trim()}|${productId.trim()}`;
      if (next !== scope || !key) {
        scope = next;
        key = makeKey();
      }
      return key;
    },
    settleIfFinal(status) {
      if (status == null || status >= 500) return;
      scope = null;
      key = null;
    },
    reset() {
      scope = null;
      key = null;
    },
  };
}
