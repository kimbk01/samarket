/**
 * CUT R7 — Historical charged amount helpers.
 * NEVER fall back to current catalog / R6 live price.
 */

export function formatHistoricalPointAmount(pointCost: unknown): {
  label: string | null;
  proven: boolean;
} {
  if (pointCost == null || pointCost === "") {
    return { label: null, proven: false };
  }
  const n = Number(pointCost);
  if (!Number.isFinite(n) || n < 0) {
    return { label: null, proven: false };
  }
  return { label: `${Math.floor(n)} Point`, proven: true };
}

export function formatHistoricalBusinessCashMinor(amountMinor: unknown, currency?: string | null): {
  label: string | null;
  proven: boolean;
} {
  if (amountMinor == null || amountMinor === "") {
    return { label: null, proven: false };
  }
  const n = Number(amountMinor);
  if (!Number.isFinite(n) || n < 0) {
    return { label: null, proven: false };
  }
  const cur = (currency ?? "PHP").trim().toUpperCase() || "PHP";
  const major = (n / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return { label: `${major} ${cur}`, proven: true };
}

/** Guard: catalog/current price must never appear as historical amount authority. */
export const ADS_HISTORY_FORBIDDEN_PRICE_FALLBACKS = [
  "promotion-products",
  "feed_ad_products.point_cost",
  "delivery_ad_packages.price_amount_minor",
  "platform_popup_ad_packages.price_minor",
] as const;
