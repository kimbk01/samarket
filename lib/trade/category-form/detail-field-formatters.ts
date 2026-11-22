/**
 * Product detail field formatters — presentation only.
 * Used by TradeCompositionDetailSection; not category MetaBlock authority.
 */
import { CURRENCY_SYMBOLS, formatPrepKeysForDisplay } from "@/lib/exchange/form-options";
import { formatExchangeRatePlus } from "@/lib/exchange/exchange-feed-lines";
import type { MessageKey } from "@/lib/i18n/messages";
import { labelForUsedCarBodyTypeKey } from "@/lib/trade/used-car-form-catalog";

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function formatMoveInDateForDetail(value: string, lang: "ko" | "en"): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value;
  const [y, m, d] = value.trim().split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(lang === "en" ? "en-US" : "ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatUsedCarCompositionDetailField(
  fieldId: string,
  rawValue: string,
  meta: Record<string, unknown>,
  t: Translate
): string | null {
  if (fieldId === "body_type") {
    return labelForUsedCarBodyTypeKey(rawValue, t) || rawValue;
  }
  if (fieldId === "year" && meta.car_trade === "buy") {
    return t("ui_meta_year_suffix", { year: rawValue });
  }
  if (fieldId === "has_accident") {
    const yes = rawValue === "true" || rawValue === "1" || meta.has_accident === true;
    const no = rawValue === "false" || rawValue === "0" || meta.has_accident === false;
    if (yes) return t("ui_car_accident_yes");
    if (no) return t("ui_car_accident_no");
  }
  if (fieldId === "car_trade") {
    if (rawValue === "buy") return t("trade_071");
    if (rawValue === "sell") return t("trade_126");
  }
  return rawValue;
}

export function formatExchangeCompositionDetailField(
  fieldId: string,
  rawValue: string,
  meta: Record<string, unknown>,
  opts: {
    t: Translate;
    amount?: number | null;
  }
): string | null {
  const { t, amount } = opts;
  const rateBaseRaw = meta.exchange_rate_base != null ? Number(meta.exchange_rate_base) : null;
  const ratePlus = meta.exchange_rate_plus != null ? Number(meta.exchange_rate_plus) : null;
  const rateSum = meta.exchange_rate != null ? Number(meta.exchange_rate) : null;
  const rateBase =
    rateBaseRaw != null && !Number.isNaN(rateBaseRaw) && rateBaseRaw > 0
      ? rateBaseRaw
      : rateSum != null && !Number.isNaN(rateSum) && rateSum > 0
        ? rateSum
        : null;

  if (fieldId === "exchange_direction") {
    return (meta.exchange_direction as string) === "buy" ? t("trade_071") : t("trade_126");
  }
  if (fieldId === "from_currency") return `PHP ${CURRENCY_SYMBOLS.PHP ?? ""}`;
  if (fieldId === "to_currency") return `KRW ${CURRENCY_SYMBOLS.KRW ?? ""}`;
  if (fieldId === "exchange_rate" || fieldId === "exchange_rate_base") {
    if (rateBase == null || rateBase <= 0) return null;
    /**
     * 감사 X5 (2026-11-22): 「기준 환율」 줄은 합산 환율(exchange_rate) 줄이 없을 때만 —
     * 이전: 가산 0 이면 두 줄에 같은 문구가 나왔다.
     */
    if (fieldId === "exchange_rate_base") {
      const sumPresent = meta.exchange_rate != null && String(meta.exchange_rate).trim() !== "";
      if (sumPresent) return null;
    }
    if (
      fieldId === "exchange_rate" &&
      rateBaseRaw != null &&
      rateBaseRaw > 0 &&
      ratePlus != null &&
      !Number.isNaN(ratePlus) &&
      ratePlus !== 0
    ) {
      return `1 PHP = ${rateBase.toLocaleString(undefined, { maximumFractionDigits: 2 })} KRW ${formatExchangeRatePlus(ratePlus)}`;
    }
    return `1 PHP = ${rateBase.toLocaleString(undefined, { maximumFractionDigits: 2 })} KRW`;
  }
  if (fieldId === "exchange_rate_plus") return null;
  if (fieldId === "amount") {
    const amountVal = amount ?? (meta.amount != null ? Number(meta.amount) : null);
    if (amountVal == null || Number.isNaN(amountVal)) return null;
    return `${CURRENCY_SYMBOLS.PHP ?? ""} ${amountVal.toLocaleString()}`;
  }
  if (fieldId === "converted_amount") {
    const converted = meta.converted_amount != null ? Number(meta.converted_amount) : null;
    if (converted == null || Number.isNaN(converted)) return null;
    /** 감사 X2: 원화는 소수 없이 */
    return `${CURRENCY_SYMBOLS.KRW ?? ""} ${Math.round(converted).toLocaleString()}`;
  }
  if (fieldId === "seller_prep" || fieldId === "buyer_prep") {
    /** 감사 X3: 보는 사람 언어로 */
    const prep = formatPrepKeysForDisplay(meta[fieldId], (key) => t(key));
    return prep || "—";
  }
  if (fieldId === "rate_criteria_at") {
    return rawValue ? t("ui_exchange_criteria_rate", { date: rawValue }) : null;
  }
  return rawValue;
}

export function formatCompositionDetailField(
  profileId: string,
  fieldId: string,
  rawValue: string,
  meta: Record<string, unknown>,
  opts: {
    t: Translate;
    lang: "ko" | "en";
    amount?: number | null;
  }
): string | null {
  if (profileId === "used-car") {
    return formatUsedCarCompositionDetailField(fieldId, rawValue, meta, opts.t);
  }
  if (profileId === "exchange") {
    return formatExchangeCompositionDetailField(fieldId, rawValue, meta, {
      t: opts.t,
      amount: opts.amount,
    });
  }
  if (profileId === "real-estate" && fieldId === "move_in_date") {
    return formatMoveInDateForDetail(rawValue, opts.lang);
  }
  return rawValue;
}
