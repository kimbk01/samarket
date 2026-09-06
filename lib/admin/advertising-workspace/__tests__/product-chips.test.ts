import { describe, expect, it } from "vitest";
import {
  ADVERTISING_WORKSPACE_PRODUCTS_BY_DOMAIN,
  rowMatchesWorkspaceFilter,
} from "@/lib/admin/advertising-workspace/product-chips";

describe("advertising workspace product chips", () => {
  it("delivery chips are launch-only (no FUTURE inline/category/search)", () => {
    const ids = ADVERTISING_WORKSPACE_PRODUCTS_BY_DOMAIN.delivery.map((c) => c.id);
    expect(ids).toContain("banner_hero");
    expect(ids).toContain("popup");
    expect(ids).toContain("sponsored");
    expect(ids).not.toContain("banner_inline");
    expect(ids).not.toContain("banner_category_top");
    expect(ids).not.toContain("banner_search_top");
  });

  it("filters community HOLD boost into community tab", () => {
    expect(
      rowMatchesWorkspaceFilter({
        domain: "community_promote",
        product: "community_promote_3",
        placementHint: "커뮤니티 상위 노출",
        workspaceDomain: "community",
        productId: "boost",
      })
    ).toBe(true);
  });
});
