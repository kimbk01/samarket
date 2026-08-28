/** Gift certificate presentation formatting — money + date only. */

import { formatMoneyPhp } from "@/lib/utils/format";

export function formatGiftMoney(amount: number): string {
  return formatMoneyPhp(amount);
}

/** YYYY-MM-DD or ISO → YYYY.MM.DD (date-only, no UTC shift). */
export function formatGiftDateOnly(value: string): string {
  const datePart = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;
  const [y, m, d] = datePart.split("-");
  return `${y}.${m}.${d}`;
}

export function formatGiftValidityRange(validFrom: string, validUntil: string): string {
  return `${formatGiftDateOnly(validFrom)} ~ ${formatGiftDateOnly(validUntil)}`;
}

/** Scale SVG amount font size (viewBox units) by formatted string length. */
export function giftAmountFontSizeViewUnits(formattedAmount: string): number {
  const len = formattedAmount.length;
  if (len <= 7) return 132;
  if (len <= 9) return 112;
  if (len <= 11) return 96;
  return 82;
}
