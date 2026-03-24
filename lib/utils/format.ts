/**
 * 상품 카드용 포맷 유틸
 * - currency: 어드민 기본 통화 (KRW → ₩, PHP → ₱, 미지정 시 PHP)
 */
const CURRENCY_SYMBOL: Record<string, string> = {
  KRW: "₩",
  PHP: "₱",
  USD: "$",
};

/** 어드민 통화 코드 → 가격 입력란에 쓸 단위 라벨 (peso, 원 등) */
const CURRENCY_UNIT_LABEL: Record<string, string> = {
  PHP: "peso",
  KRW: "원",
  USD: "달러",
};

function formatLocaleForCurrency(code: string): string {
  if (code === "PHP") return "en-PH";
  if (code === "KRW") return "ko-KR";
  return "en-US";
}

export function formatPrice(price: number | string, currency?: string): string {
  const raw = typeof price === "number" ? price : Number(price);
  if (Number.isNaN(raw)) return "";
  const code = (currency ?? "PHP").toUpperCase();
  const symbol = CURRENCY_SYMBOL[code] ?? `${code} `;
  const n = Math.round(raw);
  const loc = formatLocaleForCurrency(code);
  return `${symbol}${n.toLocaleString(loc)}`;
}

/** 스토어·배달 등 페소 고정 표시 */
export function formatMoneyPhp(amount: number | string): string {
  return formatPrice(amount, "PHP");
}

/** 가격 입력 필드 앞에 표시할 통화 단위 (어드민 defaultCurrency 기준) */
export function getCurrencyUnitLabel(currencyCode?: string): string {
  const code = (currencyCode ?? "PHP").toUpperCase();
  return CURRENCY_UNIT_LABEL[code] ?? code;
}

/** 숫자만 추출 후 천 단위 콤마 포맷 (입력용). 빈 문자열이면 "" 반환 */
export function formatPriceInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits === "") return "";
  const num = parseInt(digits, 10);
  if (Number.isNaN(num)) return "";
  return num.toLocaleString("en-US");
}

/** 금액/숫자 천 단위 콤마 (리스트·비슷한 매물 등 표시용) */
export function formatNumWithComma(v: string | number | null | undefined): string {
  if (v == null || v === "") return "0";
  const s = String(v).replace(/,/g, "").trim();
  const n = parseFloat(s);
  return Number.isNaN(n) ? s : n.toLocaleString();
}

/** 부동산 meta 보증금·월세 등 — 콤마 제거 후 숫자 (빈값·NaN → 0) */
export function parseMetaAmount(raw: unknown): number {
  if (raw == null) return 0;
  const s = String(raw).replace(/,/g, "").trim();
  if (s === "") return 0;
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

/** 전용면적 ㎡ → 평 (1평 ≈ 3.3058㎡) */
export function sqToPyeong(sq: number): string {
  return (sq / 3.3058).toFixed(1);
}

/** locale: 어드민 기본 로케일 (예: ko-KR, en-PH). 미지정 시 ko-KR */
export function formatTimeAgo(isoString: string, locale?: string): string {
  const loc = locale ?? "ko-KR";
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / (1000 * 60));
  const diffHour = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDay = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;
  return date.toLocaleDateString(loc, { month: "short", day: "numeric" });
}

/** 채팅 목록/방 내 시간 표시 */
export function formatChatTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / (1000 * 60));
  const diffDay = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
  }
  if (diffDay === 1) return `어제 ${date.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })}`;
  if (diffDay < 7) return date.toLocaleDateString("ko-KR", { weekday: "short" });
  return date.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}
