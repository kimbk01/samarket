import { describe, expect, it } from "vitest";
import { resolveLSoftBrowseAssemblyMode } from "@/lib/posts/home-posts-query-server";

describe("CUT-SSOT-H L-SOFT browse M-HARD assembly mode", () => {
  it("uses mhard_location when tradeCategoryIds membership is set (Case H fix)", () => {
    expect(resolveLSoftBrowseAssemblyMode(["exchange-root"], ["exchange-root"])).toBe("mhard_location");
    expect(resolveLSoftBrowseAssemblyMode(["exchange-root"], null)).toBe("mhard_location");
  });

  it("uses nationwide when no membership and no root priority", () => {
    expect(resolveLSoftBrowseAssemblyMode(null, null)).toBe("nationwide");
    expect(resolveLSoftBrowseAssemblyMode([], null)).toBe("nationwide");
  });

  it("falls back to legacy_priority only without M-HARD but with rootArr", () => {
    expect(resolveLSoftBrowseAssemblyMode(null, ["root-a"])).toBe("legacy_priority");
  });
});
