/**
 * Currency display SSOT — formatting only. No balance math or conversion authority.
 * @see docs/dibay-currency-ssot-hard-lock.md § Visual Identity
 */

import type { CurrencyVisualVariant } from "@/lib/currency/currency-ssot-hard-lock";

export type CurrencyDisplayLabels = {
  en: string;
  ko: string;
};

export const CURRENCY_DISPLAY_LABELS: Record<CurrencyVisualVariant, CurrencyDisplayLabels> = {
  point: { en: "Point", ko: "포인트" },
  coin: { en: "Coin", ko: "Coin" },
  cash: { en: "Cash", ko: "캐시" },
};

export const CURRENCY_DISPLAY_DESCRIPTIONS: Record<CurrencyVisualVariant, CurrencyDisplayLabels> = {
  point: {
    en: "Member-only points for benefits and promotions",
    ko: "회원 혜택 · 프로모션 등에 사용하는 회원 전용 포인트",
  },
  // 계약 §2 COIN Inflows: DIBAY 부담 쿠폰 지원금만 적립 (실기 FAIL 2026-11-03: 「상품 판매로 적립된 매장 수익」 표시)
  coin: {
    en: "Store Coin from DIBAY-funded coupon support",
    ko: "DIBAY 부담 쿠폰 지원금으로 적립된 매장 Coin",
  },
  cash: {
    en: "Operating funds for ads, Partner, and store promotion",
    ko: "광고 · Partner · 매장 운영에 사용하는 자금",
  },
};

export type FormatCurrencyAmountInput = {
  currency: CurrencyVisualVariant;
  /** Integer units: Point/Coin count, or Cash minor (centavos) when isMinor=true */
  amount: number;
  /** When true, amount is PHP centavos (Cash only). */
  isMinor?: boolean;
  locale?: string;
  /** point only: use compact "P" suffix instead of " Point" */
  compactPoint?: boolean;
};

/**
 * Display-only formatter. Never mutates or derives balances.
 */
export function formatCurrencyAmount(input: FormatCurrencyAmountInput): string {
  const amount = Math.trunc(Number(input.amount) || 0);
  const locale = input.locale ?? "en-US";

  switch (input.currency) {
    case "point": {
      const n = amount.toLocaleString(locale);
      return input.compactPoint ? `${n}P` : `${n} Point`;
    }
    case "coin": {
      return `${amount.toLocaleString(locale)} Coin`;
    }
    case "cash": {
      // 계약 §3: CASH = 「₱8,400.00」 (소수점 2자리). 실기 FAIL 2026-11-03: 「₱0」 처럼 소수점 없이 보였음.
      return formatCashPhp2(input.isMinor ? amount / 100 : amount);
    }
    default:
      return String(amount);
  }
}

export type CurrencyActionId =
  | "recharge"
  | "history"
  | "convert_to_cash"
  | "withdraw"
  | "top_up"
  | "convert_from_coin";

/** Allowed primary actions per currency — enforced by CurrencyActionGroup. */
export const CURRENCY_ALLOWED_ACTIONS: Record<CurrencyVisualVariant, readonly CurrencyActionId[]> = {
  point: ["recharge", "history"],
  coin: ["convert_to_cash", "withdraw", "history"],
  cash: ["top_up", "convert_from_coin", "history"],
};

export function isCurrencyActionAllowed(
  currency: CurrencyVisualVariant,
  action: CurrencyActionId
): boolean {
  return (CURRENCY_ALLOWED_ACTIONS[currency] as readonly string[]).includes(action);
}

/** Coin must never use P suffix in canonical product surfaces. */
export function coinMustNotUsePSuffix(display: string): boolean {
  return !/\d\s*P\b|\dP\b/.test(display) || display.includes("Coin");
}

/**
 * P0-1 — API 잔액 값 읽기. 숫자가 아니면(null·누락·조회 실패) null → 화면은 「—」.
 * 조회 실패를 0 으로 바꾸지 않는다 (실제 잔액 0 과 구분).
 */
export function readBalanceOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;
}

/** CASH 표시 전용 — 천 단위 구분 + 소수점 2자리 (₱8,400.00). 음수는 호출 쪽 부호 규칙을 따른다(여기서는 절댓값 표시 안 함). */
export function formatCashPhp2(major: number): string {
  const n = Number(major) || 0;
  const abs = Math.abs(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? "-" : ""}₱${abs}`;
}
