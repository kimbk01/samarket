/**
 * 환전 글쓰기 폼 옵션 (페소↔한화만, 달러 제외)
 */

export const EXCHANGE_CURRENCIES = ["PHP", "KRW"] as const;
export type ExchangeCurrency = (typeof EXCHANGE_CURRENCIES)[number];

export const CURRENCY_LABELS: Record<string, string> = {
  PHP: "필리핀 페소",
  KRW: "한국 원",
  USD: "미국 달러",
};

export const CURRENCY_SYMBOLS: Record<string, string> = {
  PHP: "₱",
  KRW: "₩",
  USD: "$",
};

/** 기준 통화 1단위당 상대 환율 (예: PHP 1 = KRW 24.99). 실시간은 API 연동 시 교체 */
export const DEFAULT_RATES_PHP_BASE: Record<string, number> = {
  PHP: 1,
  KRW: 24.99,
  JPY: 2.67,
  CNY: 0.12,
  USD: 0.017,
};

/** 팝니다 / 삽니다 */
export const EXCHANGE_DIRECTION_OPTIONS = [
  { value: "sell", label: "팝니다" },
  { value: "buy", label: "삽니다" },
] as const;

/** 판매자/구매자 준비물 옵션 (본인 확인 필요 제외) */
export const PREP_OPTIONS = [
  { value: "id", label: "신분증" },
  { value: "bankbook", label: "본인 명의 통장" },
  { value: "identity_not_required", label: "본인 확인 불필요" },
] as const;

export const PREP_LABELS: Record<string, string> = {
  id: "신분증",
  bankbook: "본인 명의 통장",
  identity_not_required: "본인 확인 불필요",
  /** 구버전 글 호환 — 목록/상세에서 노출 제외 */
  identity_confirm: "본인 확인 필요",
};

const PREP_DISPLAY_ORDER = ["id", "bankbook", "identity_not_required"] as const;

/** 목록·상세용: 구버전 identity_confirm 제외 후 라벨 나열 */
export function formatPrepKeysForDisplay(raw: unknown): string {
  const arr = Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === "string" && x !== "identity_confirm")
    : [];
  if (arr.length === 0) return "";
  const seenKey = new Set<string>();
  const out: string[] = [];
  for (const key of PREP_DISPLAY_ORDER) {
    if (arr.includes(key)) {
      seenKey.add(key);
      out.push(PREP_LABELS[key]);
    }
  }
  for (const k of arr) {
    if (!seenKey.has(k)) {
      seenKey.add(k);
      out.push(PREP_LABELS[k] ?? k);
    }
  }
  return out.join(", ");
}
