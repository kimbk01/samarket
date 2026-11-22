/**
 * 감사 G2 (2026-11-22): 거래 글 가격 서버 검사 — 글 만들기·수정이 같은 규칙을 쓴다.
 * - 나눔이면 가격을 저장하지 않는다(null).
 * - 가격이 있으면 0 이상의 유한한 숫자만 받는다(NaN·음수·무한대 거절 — NaN 은 DB 오류 500 이었다).
 * - 「가격 필수」 여부는 주제마다 달라(부동산 임대·일자리 협의 등) 여기서 정하지 않는다.
 */
export const TRADE_PRICE_MAX = 1_000_000_000_000;

export type TradePriceCheck = { ok: true; price: number | null } | { ok: false; code: "price_invalid" };

export function normalizeTradePriceForSave(raw: unknown, isFreeShare: boolean): TradePriceCheck {
  if (isFreeShare) return { ok: true, price: null };
  if (raw === null || raw === undefined || raw === "") return { ok: true, price: null };
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > TRADE_PRICE_MAX) return { ok: false, code: "price_invalid" };
  return { ok: true, price: n };
}
