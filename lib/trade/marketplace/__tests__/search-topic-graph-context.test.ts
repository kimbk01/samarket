import { describe, expect, it } from "vitest";
import {
  listingMatchesTopicGraphExact,
  listingMatchesTopicGraphSibling,
  resolveSearchTopicGraphContext,
} from "@/lib/trade/marketplace/search-topic-graph-context";
import {
  classifySearchExpansionTier,
  resolveSearchExpansionHints,
} from "@/lib/trade/marketplace/search-candidate-expansion";

const ROOT = "root-used";
const TOPIC_EV = "topic-ev";
const TOPIC_SUV = "topic-suv";

const nodes = [
  {
    id: TOPIC_EV,
    parent_id: ROOT,
    name: "전기차",
    name_en: "Electric",
    slug: "electric",
  },
  {
    id: TOPIC_SUV,
    parent_id: ROOT,
    name: "SUV",
    name_en: "SUV",
    slug: "suv",
  },
];

describe("CUT-SSOT-2 search topic graph", () => {
  it("binds query to matched topic id and sibling ids", () => {
    const ctx = resolveSearchTopicGraphContext("전기차", nodes, [ROOT]);
    expect(ctx?.matchedTopicCategoryIds).toEqual([TOPIC_EV]);
    expect(ctx?.siblingTopicCategoryIds).toEqual([TOPIC_SUV]);
  });

  it("classifies listing by category_id graph (not title keyword)", () => {
    const ctx = resolveSearchTopicGraphContext("전기차", nodes, [ROOT]);
    const hints = resolveSearchExpansionHints("전기차")!;
    expect(
      classifySearchExpansionTier(
        {
          title: "Tesla Model Y 2025",
          category_id: TOPIC_EV,
          meta: {},
          trade_lgu_id: "1381200000",
        },
        hints,
        "1381200000",
        [],
        ctx
      )
    ).toBe(2);
  });

  it("sibling topic lands in T4 (TOPIC graph — not composition T3)", () => {
    const ctx = resolveSearchTopicGraphContext("전기차", nodes, [ROOT]);
    const hints = resolveSearchExpansionHints("전기차")!;
    expect(listingMatchesTopicGraphSibling(TOPIC_SUV, ctx)).toBe(true);
    expect(
      classifySearchExpansionTier(
        {
          title: "Montero",
          category_id: TOPIC_SUV,
          meta: {},
          trade_lgu_id: "1381200000",
        },
        hints,
        "1381200000",
        [],
        ctx
      )
    ).toBe(4);
  });

  it("exact topic match helper", () => {
    const ctx = resolveSearchTopicGraphContext("electric", nodes, [ROOT]);
    expect(listingMatchesTopicGraphExact(TOPIC_EV, ctx)).toBe(true);
    expect(listingMatchesTopicGraphExact(TOPIC_SUV, ctx)).toBe(false);
  });
});
