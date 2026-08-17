/**
 * CUT B — Marketplace LIST sell-intent SSOT.
 *
 * Default LIST is sell-side. 삽니다 / 구직 / 페소 삽니다 stay reachable via explicit filter.
 * Null / missing meta counts as sell-side (do not `eq sell` — that drops legacy rows).
 *
 * DO NOT: delete 부동산/일자리/환전 topics; rank SEARCH (CUT C); client page-1 slice.
 */
import type { CompositionFilterSelection } from "@/lib/trade/category-form/composition-filter-query";

export const MARKETPLACE_SELL_INTENT_LIST_FIELD_IDS = [
  "car_trade",
  "listing_kind",
  "exchange_direction",
] as const;

export type MarketplaceSellIntentListFieldId =
  (typeof MARKETPLACE_SELL_INTENT_LIST_FIELD_IDS)[number];

type SellIntentSpec = {
  fieldId: MarketplaceSellIntentListFieldId;
  sellValue: string;
  buyValue: string;
  exclude: { column: string; value: string }[];
  matchBuy: { column: string; value: string }[];
};

const SELL_INTENT_SPECS: Record<MarketplaceSellIntentListFieldId, SellIntentSpec> = {
  car_trade: {
    fieldId: "car_trade",
    sellValue: "sell",
    buyValue: "buy",
    exclude: [{ column: "meta->>car_trade", value: "buy" }],
    matchBuy: [{ column: "meta->>car_trade", value: "buy" }],
  },
  listing_kind: {
    fieldId: "listing_kind",
    sellValue: "hire",
    buyValue: "work",
    exclude: [
      { column: "meta->>listing_kind", value: "work" },
      { column: "meta->>job_type", value: "seek" },
    ],
    matchBuy: [
      { column: "meta->>listing_kind", value: "work" },
      { column: "meta->>job_type", value: "seek" },
    ],
  },
  exchange_direction: {
    fieldId: "exchange_direction",
    sellValue: "sell",
    buyValue: "buy",
    exclude: [{ column: "meta->>exchange_direction", value: "buy" }],
    matchBuy: [{ column: "meta->>exchange_direction", value: "buy" }],
  },
};

export function isMarketplaceSellIntentListFieldId(
  fieldId: string
): fieldId is MarketplaceSellIntentListFieldId {
  return fieldId in SELL_INTENT_SPECS;
}

export function marketplaceSellIntentDefaultValue(fieldId: string): string | null {
  if (!isMarketplaceSellIntentListFieldId(fieldId)) return null;
  return SELL_INTENT_SPECS[fieldId].sellValue;
}

export function applySellIntentListDefaults(
  selection: CompositionFilterSelection,
  allowedFieldIds: readonly string[] | ReadonlySet<string>
): CompositionFilterSelection {
  const allowed = allowedFieldIds instanceof Set ? allowedFieldIds : new Set(allowedFieldIds);
  const next: CompositionFilterSelection = { ...selection };
  for (const spec of Object.values(SELL_INTENT_SPECS)) {
    if (!allowed.has(spec.fieldId)) continue;
    if (next[spec.fieldId]?.trim()) continue;
    next[spec.fieldId] = spec.sellValue;
  }
  return next;
}

export type SellIntentListClausePlan =
  | { op: "exclude_eq"; columns: string[]; values: string[] }
  | { op: "eq"; columns: string[]; values: string[] }
  | { op: "or_eq"; columns: string[]; values: string[] };

export function planSellIntentListClause(
  fieldId: string,
  value: string
): SellIntentListClausePlan | null {
  if (!isMarketplaceSellIntentListFieldId(fieldId)) return null;
  const spec = SELL_INTENT_SPECS[fieldId];
  if (value === spec.sellValue) {
    return {
      op: "exclude_eq",
      columns: spec.exclude.map((row) => row.column),
      values: spec.exclude.map((row) => row.value),
    };
  }
  if (value === spec.buyValue) {
    if (spec.matchBuy.length > 1) {
      return {
        op: "or_eq",
        columns: spec.matchBuy.map((row) => row.column),
        values: spec.matchBuy.map((row) => row.value),
      };
    }
    return {
      op: "eq",
      columns: spec.matchBuy.map((row) => row.column),
      values: spec.matchBuy.map((row) => row.value),
    };
  }
  return null;
}

/**
 * HOME / SEARCH without a trade parent: mixed discovery exclude.
 * Topic LIST (중고차·일자리·환전·부동산·렌터카) uses composition defaults instead — never both.
 */
export function shouldApplyMixedDiscoverySellIntent(input: {
  tradeMarketParent?: string | null;
  type?: string | null;
}): boolean {
  if (typeof input.tradeMarketParent === "string" && input.tradeMarketParent.trim()) {
    return false;
  }
  return input.type == null || input.type === "trade";
}

/** HOME / SEARCH-all mixed discovery: keep topics, strip buy-request / 구직 / 환전-삽니다. */
export function buildMixedDiscoverySellIntentClauses(): Array<{
  fieldId: string;
  op: "exclude_eq";
  columns: string[];
  values: string[];
}> {
  return Object.values(SELL_INTENT_SPECS).map((spec) => ({
    fieldId: spec.fieldId,
    op: "exclude_eq" as const,
    columns: spec.exclude.map((row) => row.column),
    values: spec.exclude.map((row) => row.value),
  }));
}
