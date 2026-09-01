/**
 * Currency display SSOT — formatting only. No balance math or conversion authority.
 * @see docs/dibay-currency-ssot-hard-lock.md § Visual Identity
 */

import { formatMoneyPhp } from "@/lib/utils/format";
import type { CurrencyVisualVariant } from "@/lib/currency/currency-ssot-hard-lock";

export type CurrencyDisplayLabels = {
  en: string;
  ko: string;
};

export const CURRENCY_DISPLAY_LABELS: Record<CurrencyVisualVariant, CurrencyDisplayLabels> = {
  point: { en: "Point", ko: "포인트" },
  coin: { en: "Coin", ko: "매장 포인트" },
  cash: { en: "Cash", ko: "비즈니스 캐시" },
};

export const CURRENCY_DISPLAY_DESCRIPTIONS: Record<CurrencyVisualVariant, CurrencyDisplayLabels> = {
  point: {
    en: "Member-only points for benefits and promotions",
    ko: "회원 혜택 · 프로모션 등에 사용하는 회원 전용 포인트",
  },
  coin: {
    en: "Store earnings from sales and gift redemptions",
    ko: "상품 판매로 적립된 매장 수익",
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
      if (input.isMinor) {
        return formatMoneyPhp(amount / 100);
      }
      return formatMoneyPhp(amount);
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
