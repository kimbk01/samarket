/**
 * PRD-07 — 오너 상품 편집 폼은 **바뀐 필드만** PATCH 한다.
 * 폼이 전체 payload(재고·상태 포함)를 보내면, 편집 중 주문이 재고를 감산하거나 관리자가 품절·숨김한 값을
 * 오래된 폼 값으로 덮어쓴다. 로드 시점 payload(baseline)와 저장 시점 payload 를 비교해 차이만 보낸다.
 *
 * 묶음 규칙
 * - 대표 이미지·상세 이미지는 함께 검증되므로 하나라도 바뀌면 thumbnail_url·images_json(+치수)을 같이 보낸다.
 * - 판매가가 바뀌면 할인율도 같이 보낸다 (서버가 새 가격 기준으로 할인가 재계산).
 * - 재고 관리 on/off 가 바뀌면 재고 수량도 같이 보낸다.
 * - baseline 에 값이 있었는데 새 값이 undefined(빈 입력)면 null 로 지운다.
 */
const IMAGE_KEYS = ["thumbnail_url", "images_json", "thumbnail_width", "thumbnail_height"] as const;

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function diffOwnerProductPatch(
  baseline: Record<string, unknown>,
  next: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(baseline), ...Object.keys(next)]);
  for (const k of keys) {
    if ((IMAGE_KEYS as readonly string[]).includes(k)) continue;
    if (!(k in next) && !(k in baseline)) continue;
    const nv = next[k];
    if (same(baseline[k], nv)) continue;
    out[k] = nv === undefined ? null : nv;
  }

  const imagesChanged =
    !same(baseline.thumbnail_url, next.thumbnail_url) ||
    !same(baseline.images_json, next.images_json) ||
    next.thumbnail_width !== undefined ||
    next.thumbnail_height !== undefined;
  if (imagesChanged) {
    for (const k of IMAGE_KEYS) {
      if (next[k] !== undefined) out[k] = next[k];
    }
  }

  if ("price" in out && "discount_percent" in next) out.discount_percent = next.discount_percent;
  if ("track_inventory" in out && "stock_qty" in next) out.stock_qty = next.stock_qty;
  return out;
}
