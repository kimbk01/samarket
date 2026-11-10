"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { tapHaptic } from "@/lib/ui/tap-haptic";
import type { TradePriceCurrency } from "@/lib/trade/trade-price-currency";

/** 가격 통화 국기 라디오 (시안 TradeCurrency) — 🇵🇭 페소 ₱ / 🇰🇷 원 ₩ */
export function TradePriceCurrencyRadio({
  value,
  onChange,
  disabled,
}: {
  value: TradePriceCurrency;
  onChange: (c: TradePriceCurrency) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const options: ReadonlyArray<{ id: TradePriceCurrency; flag: string; key: "trade_write_price_currency_php" | "trade_write_price_currency_krw" }> = [
    { id: "PHP", flag: "🇵🇭", key: "trade_write_price_currency_php" },
    { id: "KRW", flag: "🇰🇷", key: "trade_write_price_currency_krw" },
  ];
  return (
    <div role="radiogroup" aria-label={t("trade_write_price_currency_aria")} className="mb-2 grid grid-cols-2 gap-2">
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            data-trade-price-currency={o.id}
            onClick={() => {
              if (on) return;
              tapHaptic("select");
              onChange(o.id);
            }}
            className={`sam-press flex h-12 items-center justify-center gap-2 rounded-ui-rect border sam-text-body font-semibold ${
              on ? "border-2 border-sam-primary bg-sam-primary-soft text-sam-primary" : "border-sam-border bg-sam-surface text-sam-muted"
            }`}
          >
            <span aria-hidden="true" className="text-[18px]">{o.flag}</span>
            <span>{t(o.key)}</span>
          </button>
        );
      })}
    </div>
  );
}
