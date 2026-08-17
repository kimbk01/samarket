import { describe, expect, it } from "vitest";
import { resolveTradeComposition } from "@/lib/trade/category-form/resolve-composition";
import {
  applyCompositionFilterClausesToPostgrest,
  buildCompositionFilterClauses,
  resolveCompositionAttributeFilterFields,
  withSellIntentListDefaults,
} from "@/lib/trade/category-form/composition-filter-query";
import {
  applySellIntentListDefaults,
  buildMixedDiscoverySellIntentClauses,
  marketplaceSellIntentDefaultValue,
  planSellIntentListClause,
  shouldApplyMixedDiscoverySellIntent,
} from "@/lib/trade/marketplace/sell-intent-list-ssot";

describe("CUT B sell-intent LIST SSOT", () => {
  it("defaults used-car / jobs / exchange when the field is on the composition", () => {
    const usedCar = resolveTradeComposition({ icon_key: "used-car" });
    const jobs = resolveTradeComposition({ icon_key: "jobs" });
    const exchange = resolveTradeComposition({ icon_key: "exchange" });
    const realty = resolveTradeComposition({ icon_key: "real-estate" });
    const rent = resolveTradeComposition({ icon_key: "rent-car" });

    const usedIds = resolveCompositionAttributeFilterFields(usedCar).map((f) => f.id);
    const jobIds = resolveCompositionAttributeFilterFields(jobs).map((f) => f.id);
    const exchangeIds = resolveCompositionAttributeFilterFields(exchange).map((f) => f.id);
    const realtyIds = resolveCompositionAttributeFilterFields(realty).map((f) => f.id);
    const rentIds = resolveCompositionAttributeFilterFields(rent).map((f) => f.id);

    expect(usedIds).toContain("car_trade");
    expect(jobIds).toContain("listing_kind");
    expect(exchangeIds).toContain("exchange_direction");
    expect(realtyIds).not.toContain("car_trade");
    expect(rentIds).not.toContain("car_trade");

    expect(withSellIntentListDefaults({}, usedCar)).toEqual({ car_trade: "sell" });
    expect(withSellIntentListDefaults({}, jobs)).toEqual({ listing_kind: "hire" });
    expect(withSellIntentListDefaults({}, exchange)).toEqual({ exchange_direction: "sell" });
    expect(withSellIntentListDefaults({}, realty)).toEqual({});
    expect(withSellIntentListDefaults({}, rent)).toEqual({});
  });

  it("keeps explicit 삽니다 / 구직 / 환전 삽니다", () => {
    expect(applySellIntentListDefaults({ car_trade: "buy" }, ["car_trade"])).toEqual({
      car_trade: "buy",
    });
    expect(applySellIntentListDefaults({ listing_kind: "work" }, ["listing_kind"])).toEqual({
      listing_kind: "work",
    });
    expect(applySellIntentListDefaults({ exchange_direction: "buy" }, ["exchange_direction"])).toEqual({
      exchange_direction: "buy",
    });
    expect(marketplaceSellIntentDefaultValue("car_trade")).toBe("sell");
    expect(marketplaceSellIntentDefaultValue("make")).toBeNull();
  });

  it("default sell excludes buy and keeps null meta as sell-side", () => {
    const usedCar = resolveTradeComposition({ icon_key: "used-car" });
    const clauses = buildCompositionFilterClauses(withSellIntentListDefaults({}, usedCar), usedCar);
    expect(clauses).toEqual(
      expect.arrayContaining([
        {
          fieldId: "car_trade",
          op: "exclude_eq",
          columns: ["meta->>car_trade"],
          values: ["buy"],
        },
      ])
    );
    const calls: string[] = [];
    applyCompositionFilterClausesToPostgrest(
      {
        eq() {
          return this;
        },
        ilike() {
          return this;
        },
        or(filters: string) {
          calls.push(`or:${filters}`);
          return this;
        },
      },
      clauses.filter((c) => c.fieldId === "car_trade")
    );
    expect(calls).toEqual(["or:meta->>car_trade.is.null,meta->>car_trade.neq.buy"]);
  });

  it("explicit 삽니다 / 구직 query match-buy including jobs legacy job_type", () => {
    expect(planSellIntentListClause("car_trade", "buy")).toEqual({
      op: "eq",
      columns: ["meta->>car_trade"],
      values: ["buy"],
    });
    expect(planSellIntentListClause("listing_kind", "work")).toEqual({
      op: "or_eq",
      columns: ["meta->>listing_kind", "meta->>job_type"],
      values: ["work", "seek"],
    });
    const jobs = resolveTradeComposition({ icon_key: "jobs" });
    const clauses = buildCompositionFilterClauses({ listing_kind: "work" }, jobs);
    const calls: string[] = [];
    applyCompositionFilterClausesToPostgrest(
      {
        eq() {
          return this;
        },
        ilike() {
          return this;
        },
        or(filters: string) {
          calls.push(`or:${filters}`);
          return this;
        },
      },
      clauses.filter((c) => c.fieldId === "listing_kind")
    );
    expect(calls).toEqual(["or:meta->>listing_kind.eq.work,meta->>job_type.eq.seek"]);
  });

  it("HOME mixed discovery excludes buy-car / 구직 / exchange-buy without dropping topics", () => {
    const mixed = buildMixedDiscoverySellIntentClauses();
    expect(mixed.map((c) => c.fieldId).sort()).toEqual(
      ["car_trade", "exchange_direction", "listing_kind"].sort()
    );
    expect(mixed.every((c) => c.op === "exclude_eq")).toBe(true);
  });

  it("PRE-COMMIT 1: default vs explicit — opposite filter never stacks default sell-only", () => {
    const usedCar = resolveTradeComposition({ icon_key: "used-car" });
    const jobs = resolveTradeComposition({ icon_key: "jobs" });
    const exchange = resolveTradeComposition({ icon_key: "exchange" });

    const usedDefault = buildCompositionFilterClauses(withSellIntentListDefaults({}, usedCar), usedCar);
    const usedSell = buildCompositionFilterClauses({ car_trade: "sell" }, usedCar);
    const usedBuy = buildCompositionFilterClauses({ car_trade: "buy" }, usedCar);
    expect(opsFor(usedDefault, "car_trade")).toEqual(["exclude_eq"]);
    expect(valuesFor(usedDefault, "car_trade")).toEqual(["buy"]);
    expect(opsFor(usedSell, "car_trade")).toEqual(["exclude_eq"]);
    expect(valuesFor(usedSell, "car_trade")).toEqual(["buy"]);
    expect(opsFor(usedBuy, "car_trade")).toEqual(["eq"]);
    expect(valuesFor(usedBuy, "car_trade")).toEqual(["buy"]);
    expect(hasContradictorySellIntent(usedDefault)).toBe(false);
    expect(hasContradictorySellIntent(usedSell)).toBe(false);
    expect(hasContradictorySellIntent(usedBuy)).toBe(false);
    expect(hasContradictorySellIntent([...usedBuy, ...usedDefault])).toBe(true);

    const jobsDefault = buildCompositionFilterClauses(withSellIntentListDefaults({}, jobs), jobs);
    const jobsHire = buildCompositionFilterClauses({ listing_kind: "hire" }, jobs);
    const jobsWork = buildCompositionFilterClauses({ listing_kind: "work" }, jobs);
    expect(opsFor(jobsDefault, "listing_kind")).toEqual(["exclude_eq"]);
    expect(valuesFor(jobsDefault, "listing_kind")).toEqual(["work", "seek"]);
    expect(opsFor(jobsHire, "listing_kind")).toEqual(["exclude_eq"]);
    expect(opsFor(jobsWork, "listing_kind")).toEqual(["or_eq"]);
    expect(valuesFor(jobsWork, "listing_kind")).toEqual(["work", "seek"]);
    expect(hasContradictorySellIntent(jobsWork)).toBe(false);
    expect(hasContradictorySellIntent([...jobsWork, ...jobsDefault])).toBe(true);

    const exDefault = buildCompositionFilterClauses(withSellIntentListDefaults({}, exchange), exchange);
    const exSell = buildCompositionFilterClauses({ exchange_direction: "sell" }, exchange);
    const exBuy = buildCompositionFilterClauses({ exchange_direction: "buy" }, exchange);
    expect(opsFor(exDefault, "exchange_direction")).toEqual(["exclude_eq"]);
    expect(valuesFor(exDefault, "exchange_direction")).toEqual(["buy"]);
    expect(opsFor(exSell, "exchange_direction")).toEqual(["exclude_eq"]);
    expect(opsFor(exBuy, "exchange_direction")).toEqual(["eq"]);
    expect(hasContradictorySellIntent(exBuy)).toBe(false);
    expect(hasContradictorySellIntent([...exBuy, ...exDefault])).toBe(true);
  });

  it("PRE-COMMIT 2: intent SSOT stays on HOME mixed / own topic — no leak to realty or rent-car", () => {
    const usedCar = resolveTradeComposition({ icon_key: "used-car" });
    const jobs = resolveTradeComposition({ icon_key: "jobs" });
    const exchange = resolveTradeComposition({ icon_key: "exchange" });
    const realty = resolveTradeComposition({ icon_key: "real-estate" });
    const rent = resolveTradeComposition({ icon_key: "rent-car" });
    const general = resolveTradeComposition({ icon_key: "general" });

    expect(sellIntentFieldIds(buildCompositionFilterClauses(withSellIntentListDefaults({}, usedCar), usedCar))).toEqual([
      "car_trade",
    ]);
    expect(sellIntentFieldIds(buildCompositionFilterClauses(withSellIntentListDefaults({}, jobs), jobs))).toEqual([
      "listing_kind",
    ]);
    expect(
      sellIntentFieldIds(buildCompositionFilterClauses(withSellIntentListDefaults({}, exchange), exchange))
    ).toEqual(["exchange_direction"]);
    expect(sellIntentFieldIds(buildCompositionFilterClauses(withSellIntentListDefaults({}, realty), realty))).toEqual(
      []
    );
    expect(sellIntentFieldIds(buildCompositionFilterClauses(withSellIntentListDefaults({}, rent), rent))).toEqual([]);
    expect(sellIntentFieldIds(buildCompositionFilterClauses(withSellIntentListDefaults({}, general), general))).toEqual(
      []
    );

    expect(shouldApplyMixedDiscoverySellIntent({ tradeMarketParent: null, type: null })).toBe(true);
    expect(shouldApplyMixedDiscoverySellIntent({ tradeMarketParent: null, type: "trade" })).toBe(true);
    expect(shouldApplyMixedDiscoverySellIntent({ tradeMarketParent: "used-car-root", type: "trade" })).toBe(false);
    expect(shouldApplyMixedDiscoverySellIntent({ tradeMarketParent: "realty-root", type: "trade" })).toBe(false);
    expect(shouldApplyMixedDiscoverySellIntent({ tradeMarketParent: "rent-root", type: "trade" })).toBe(false);
    expect(shouldApplyMixedDiscoverySellIntent({ tradeMarketParent: null, type: "community" })).toBe(false);
  });
});

function opsFor(
  clauses: { fieldId: string; op: string }[],
  fieldId: string
): string[] {
  return clauses.filter((c) => c.fieldId === fieldId).map((c) => c.op);
}

function valuesFor(
  clauses: { fieldId: string; values: string[] }[],
  fieldId: string
): string[] {
  return clauses.filter((c) => c.fieldId === fieldId).flatMap((c) => c.values);
}

function sellIntentFieldIds(clauses: { fieldId: string }[]): string[] {
  return clauses
    .map((c) => c.fieldId)
    .filter((id) => id === "car_trade" || id === "listing_kind" || id === "exchange_direction");
}

function hasContradictorySellIntent(clauses: { fieldId: string; op: string }[]): boolean {
  const byField = new Map<string, Set<string>>();
  for (const clause of clauses) {
    const ops = byField.get(clause.fieldId) ?? new Set<string>();
    ops.add(clause.op);
    byField.set(clause.fieldId, ops);
  }
  for (const ops of byField.values()) {
    if (ops.has("exclude_eq") && (ops.has("eq") || ops.has("or_eq"))) return true;
  }
  return false;
}
