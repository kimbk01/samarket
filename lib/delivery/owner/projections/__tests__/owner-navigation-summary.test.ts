import { describe, expect, it } from "vitest";
import {
  EMPTY_OWNER_NAVIGATION_SUMMARY,
  ownerNavigationSummaryFromPreferredStore,
} from "@/lib/delivery/owner/projections/owner-navigation-summary";

describe("ownerNavigationSummaryFromPreferredStore", () => {
  it("projects preferred store identity without exposing ownerStores", () => {
    const first = ownerNavigationSummaryFromPreferredStore({
      loading: false,
      store: { id: "s1", slug: "demo", store_name: "Demo" },
    });
    expect(first).toEqual({
      storeId: "s1",
      storeSlug: "demo",
      storeName: "Demo",
      hasPreferredStore: true,
      loading: false,
    });
    const same = ownerNavigationSummaryFromPreferredStore({
      loading: false,
      store: { id: "s1", slug: "demo", store_name: "Demo" },
    });
    expect(same).toEqual(first);
  });

  it("keeps empty summary stable when no preferred store", () => {
    expect(
      ownerNavigationSummaryFromPreferredStore({ loading: true, store: null })
    ).toEqual(EMPTY_OWNER_NAVIGATION_SUMMARY);
  });
});
