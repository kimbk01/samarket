/**
 * 거래 글 가격 통화 — 한국 주소 지원 3단계 (Owner 2026-11-10 「거래의 가격 통화 부분은 글쓰기 입력 부분에 통화를 지정」).
 *
 * - 저장: 글 `meta.currency` = "PHP" | "KRW" (DB 새 칸 없음 — 이미 있는 jsonb meta)
 * - 기본값: 글쓴이 대표 주소 나라(한국 → KRW, 그 밖 → PHP). 글쓰기에서 바꿀 수 있다.
 * - 표시: 글에 저장된 통화 → 없으면(예전 글) 앱 기본 통화. 화면은 이 함수만 쓴다.
 */
export const TRADE_PRICE_CURRENCIES = ["PHP", "KRW"] as const;
export type TradePriceCurrency = (typeof TRADE_PRICE_CURRENCIES)[number];

export function normalizeTradePriceCurrency(raw: unknown): TradePriceCurrency | null {
  const v = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return (TRADE_PRICE_CURRENCIES as readonly string[]).includes(v) ? (v as TradePriceCurrency) : null;
}

/** 대표 주소 나라 → 기본 통화 */
export function defaultTradePriceCurrencyForCountry(countryCode: string | null | undefined): TradePriceCurrency {
  return (countryCode ?? "").trim().toUpperCase() === "KR" ? "KRW" : "PHP";
}

/** 글 meta → 표시 통화 (저장값 우선, 없으면 앱 기본) */
export function resolveTradePostCurrency(meta: unknown, fallback: string | null | undefined): string {
  const m = meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : null;
  return normalizeTradePriceCurrency(m?.currency) ?? ((fallback ?? "").trim().toUpperCase() || "PHP");
}

/** 서버 저장 전 — meta.currency 는 PHP·KRW 만 남긴다(그 밖 값은 지움 → 표시는 앱 기본) */
export function sanitizeTradeMetaCurrency(meta: Record<string, unknown>): Record<string, unknown> {
  if (!("currency" in meta)) return meta;
  const c = normalizeTradePriceCurrency(meta.currency);
  const next = { ...meta };
  if (c) next.currency = c;
  else delete next.currency;
  return next;
}
