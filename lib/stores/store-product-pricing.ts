/** 판매가·할인율(0-100)로 할인가(내림) 계산. 0% 또는 무효면 null */
export function discountPriceFromPercent(price: number, percent: number): number | null {
  const p = Math.floor(Number(price));
  const pct = Math.floor(Number(percent));
  if (!Number.isFinite(p) || p < 0) return null;
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return null;
  const sale = Math.floor((p * (100 - pct)) / 100);
  if (!Number.isFinite(sale) || sale < 0) return null;
  if (sale >= p) return null;
  return sale;
}

/** 기존 가격·할인가로 대략 할인율 역산(표시용, 반올림) */
export function approximateDiscountPercent(price: number, discountPrice: number): number {
  const p = Math.floor(Number(price));
  const d = Math.floor(Number(discountPrice));
  if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(d) || d < 0 || d >= p) return 0;
  return Math.round(((p - d) / p) * 100);
}

/**
 * 장바구니 줄의 정가 단가(취소선용). `listUnitPricePhp`가 없고 예전 담기만 있는 경우
 * `discountPercent`로 역산한다.
 */
export function resolveCartLineListUnitPhp(line: {
  unitPricePhp: number;
  listUnitPricePhp?: number | null;
  discountPercent?: number | null;
}): number | null {
  const sale = Math.floor(Number(line.unitPricePhp));
  if (!Number.isFinite(sale) || sale < 0) return null;
  const stored = line.listUnitPricePhp;
  if (stored != null && Number.isFinite(stored) && Math.floor(stored) > sale) {
    return Math.floor(stored);
  }
  const pct = line.discountPercent;
  if (pct != null && Number.isFinite(pct) && pct > 0 && pct < 100) {
    const inferred = sale / (1 - pct / 100);
    const list = Math.round(inferred);
    if (list > sale) return list;
  }
  return null;
}

/**
 * 판매가 입력 정규화 SSOT — 숫자·0 이상만, 소수는 내림 (오너 상품 등록·수정과 같은 규칙).
 * 3-C A-08: 관리자 가격 정정(`admin-store-product-ops` correct_price)도 이 함수를 쓴다 (반올림 금지).
 * 무효 입력이면 null.
 */
export function normalizeStoreProductPriceInput(raw: unknown): number | null {
  const price = Number(raw);
  if (!Number.isFinite(price) || price < 0) return null;
  return Math.floor(price);
}
