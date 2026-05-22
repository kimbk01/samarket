import { describe, expect, it } from "vitest";
import { resolveOwnerAdminBackFallbackHref } from "@/lib/business/owner-admin-back-navigation";

describe("owner-admin-back-navigation", () => {
  it("resolveOwnerAdminBackFallbackHref uses hub or owner root", () => {
    expect(resolveOwnerAdminBackFallbackHref("abc-123")).toBe("/stores/owner?storeId=abc-123");
    expect(resolveOwnerAdminBackFallbackHref("")).toBe("/stores/owner");
    expect(resolveOwnerAdminBackFallbackHref(null)).toBe("/stores/owner");
  });
});
