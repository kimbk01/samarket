import { describe, expect, it } from "vitest";
import {
  STORES_HOME_FIRST_RAIL_CARD_PRIORITY_COUNT,
  STORES_HOME_FIRST_RAIL_FEATURED_EAGER,
  STORES_HOME_FEATURED_VIEWPORT_ROOT_MARGIN,
  isStoresHomeLcpPath,
} from "@/lib/stores/stores-home-lcp-policy";

describe("stores-home-lcp-policy", () => {
  it("keeps feed images off LCP eager path", () => {
    expect(STORES_HOME_FIRST_RAIL_CARD_PRIORITY_COUNT).toBe(0);
  });

  it("limits featured eager batch to one store", () => {
    expect(STORES_HOME_FIRST_RAIL_FEATURED_EAGER).toBe(1);
  });

  it("tightens featured IO margin", () => {
    expect(STORES_HOME_FEATURED_VIEWPORT_ROOT_MARGIN).toBe("48px 0px");
  });

  it("matches stores home path only", () => {
    expect(isStoresHomeLcpPath("/stores")).toBe(true);
    expect(isStoresHomeLcpPath("/stores/")).toBe(true);
    expect(isStoresHomeLcpPath("/stores/search")).toBe(false);
  });
});
