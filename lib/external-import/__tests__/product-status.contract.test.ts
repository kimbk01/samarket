import { describe, expect, it } from "vitest";
import { resolveExternalSiteProductStatus } from "../product-status";

describe("external-import product status (engine ≠ eligibility)", () => {
  it("marks proven cheerio adapters USABLE", () => {
    expect(resolveExternalSiteProductStatus({ adapterKey: "philsamo", isActive: true })).toBe("USABLE");
    expect(resolveExternalSiteProductStatus({ adapterKey: "hellocebuph", isActive: true })).toBe("USABLE");
  });

  it("marks philgo BLOCKED regardless of playwright engine", () => {
    expect(resolveExternalSiteProductStatus({ adapterKey: "philgo", isActive: true })).toBe("BLOCKED");
  });

  it("does not use engine string for status", () => {
    // Inactive always blocked
    expect(resolveExternalSiteProductStatus({ adapterKey: "philsamo", isActive: false })).toBe("BLOCKED");
    expect(resolveExternalSiteProductStatus({ adapterKey: "unknown_site", isActive: true })).toBe("NOT_PROVEN");
  });
});
