import { describe, expect, it } from "vitest";
import { normalizePhMobileDb } from "@/lib/utils/ph-mobile";

/**
 * stores.email persistence rule (Owner + Admin set_store_contact):
 * field is GCash mobile, not free-text email.
 */
describe("stores.email GCash normalize parity", () => {
  it("normalizes complete PH mobile", () => {
    expect(normalizePhMobileDb("09171234567")).toBe("09171234567");
  });

  it("rejects incomplete digits as null (Owner stores null)", () => {
    expect(normalizePhMobileDb("0917")).toBeNull();
  });

  it("does not treat plain email strings as valid GCash", () => {
    expect(normalizePhMobileDb("owner@example.com")).toBeNull();
  });
});
