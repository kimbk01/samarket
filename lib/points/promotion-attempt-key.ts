/**
 * 재감사 S-0 (X-1 · P0): 상위노출 결제 요청 키 — **같은 결제 시도는 같은 키**.
 *
 * R2 이후 광고 중인 글에 다시 결제하면 연장이 된다. 버튼을 누를 때마다 키를 새로 만들면, 응답이 끊긴 뒤
 * (서버는 이미 결제) 다시 눌렀을 때 새 요청으로 처리되어 연장으로 **한 번 더 차감**됐다.
 * 같은 키로 다시 보내면 서버(`purchase_member_*_promotion`)가 처음 결과를 그대로 돌려주고 차감하지 않는다.
 *
 * - 같은 글·같은 상품이면 키를 유지한다(`keyFor`).
 * - 재감사 R-01·R-02 (2026-11-04 · P0): 키를 한 번 보낸 뒤 결과를 모르는 동안에는 **상품이 바뀌어도 같은 키**를 쓴다.
 *   응답이 끊긴 뒤 창이 다시 불러오면서 선택이 바뀌면(첫 상품·살 수 있는 상품) 새 키 → 연장으로 두 번째 차감이 됐다.
 *   같은 키면 서버가 처음 결과를 돌려준다. 그 상품은 `pendingProductFor` 로 화면이 다시 고른다.
 * - 서버가 결과를 확정해 돌려준 뒤(성공·4xx 거절)에만 키를 버린다(`settleIfFinal`). 다음 결제는 새 키.
 * - 응답을 못 받음(네트워크 오류)·5xx 는 결과를 모르는 상태라 같은 키를 유지한다.
 */
export type PromotionAttemptKeyStore = {
  keyFor: (targetId: string, productId: string) => string;
  /** HTTP 상태를 받았고 결과가 확정이면 키를 버린다. `status` 가 null(응답 없음)·5xx 면 유지. */
  settleIfFinal: (status: number | null) => void;
  /** 창을 새로 열 때 등 시도를 처음부터 다시 */
  reset: () => void;
  /** 결과를 모르는 시도가 있으면 그 상품 id (같은 글일 때만) — 다시 불러온 뒤 선택을 그 상품으로 둔다 */
  pendingProductFor: (targetId: string) => string | null;
};

function newPromotionAttemptKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `promo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createPromotionAttemptKeyStore(makeKey: () => string = newPromotionAttemptKey): PromotionAttemptKeyStore {
  let target: string | null = null;
  let product: string | null = null;
  let key: string | null = null;
  return {
    keyFor(targetId, productId) {
      const t = targetId.trim();
      // 보낸 키가 아직 확정되지 않았으면(키가 남아 있으면) 같은 글에서는 상품과 상관없이 그 키를 쓴다.
      if (key && target === t) return key;
      target = t;
      product = productId.trim();
      key = makeKey();
      return key;
    },
    settleIfFinal(status) {
      if (status == null || status >= 500) return;
      target = null;
      product = null;
      key = null;
    },
    reset() {
      target = null;
      product = null;
      key = null;
    },
    pendingProductFor(targetId) {
      return key && target === targetId.trim() ? product : null;
    },
  };
}
