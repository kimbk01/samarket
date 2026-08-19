import { describe, expect, it } from "vitest";
import { computeMarketFilterIds } from "@/lib/market/compute-market-filter-ids";
import {
  resolveFeedParityMembershipIds,
  resolveHardMembershipCategoryIds,
  shouldAllowSearchExpansionTail,
} from "@/lib/trade/marketplace/resolve-marketplace-membership";

describe("CUT-SSOT-1 marketplace membership", () => {
  const children = [
    { id: "child-suv", slug: "suv" },
    { id: "child-sedan", slug: "sedan" },
  ];

  it("feed parity helper matches computeMarketFilterIds", () => {
    expect(
      resolveFeedParityMembershipIds({
        parentCategoryId: "root",
        activeChildren: children,
        topicParam: "suv",
      })
    ).toEqual(
      computeMarketFilterIds({
        parentCategoryId: "root",
        activeChildren: children,
        topicParam: "suv",
      })
    );
    expect(resolveFeedParityMembershipIds({
      parentCategoryId: "root",
      activeChildren: children,
      topicParam: "",
    })).toEqual(["root", "child-suv", "child-sedan"]);
  });

  it("M-HARD: topic expanded ids win over root union", () => {
    expect(
      resolveHardMembershipCategoryIds({
        rootExpandedIds: ["root", "child-a", "child-b"],
        topicExpandedIds: ["topic-suv"],
      })
    ).toEqual(["topic-suv"]);
  });

  it("M-HARD: root union when no topic", () => {
    expect(
      resolveHardMembershipCategoryIds({
        rootExpandedIds: ["root", "child-a"],
        topicExpandedIds: null,
      })
    ).toEqual(["root", "child-a"]);
  });

  it("M-HARD: null when no root/topic selection", () => {
    expect(
      resolveHardMembershipCategoryIds({
        rootExpandedIds: null,
        topicExpandedIds: [],
      })
    ).toBeNull();
  });

  it("T5-B: tail disallowed without membership scope", () => {
    expect(shouldAllowSearchExpansionTail(null)).toBe(false);
    expect(shouldAllowSearchExpansionTail([])).toBe(false);
    expect(shouldAllowSearchExpansionTail(["root-id"])).toBe(true);
  });
});
