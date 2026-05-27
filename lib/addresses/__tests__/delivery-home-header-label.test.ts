import { describe, expect, it } from "vitest";
import { resolveDeliveryHomeHeaderButtonLabel } from "@/lib/addresses/delivery-home-header-label";

describe("resolveDeliveryHomeHeaderButtonLabel", () => {
  it("returns display line when present", () => {
    expect(
      resolveDeliveryHomeHeaderButtonLabel(
        { status: "ready", line: "1003 - COD", hasLinkedAddress: true, displayLine: "1003 - COD" },
        "ko"
      )
    ).toBe("1003 - COD");
  });

  it("never returns address-manage link copy for empty state", () => {
    const label = resolveDeliveryHomeHeaderButtonLabel(
      { status: "ready", line: null, hasLinkedAddress: false, displayLine: null },
      "ko"
    );
    expect(label).not.toBe("주소 관리");
    expect(label).toContain("주소");
  });

  it("uses not-set copy when linked but line still empty", () => {
    const label = resolveDeliveryHomeHeaderButtonLabel(
      { status: "ready", line: null, hasLinkedAddress: true, displayLine: null },
      "ko"
    );
    expect(label).toContain("미설정");
  });

  it("uses loading copy while fetching", () => {
    const label = resolveDeliveryHomeHeaderButtonLabel(
      { status: "loading", displayLine: null },
      "ko"
    );
    expect(label).toContain("확인");
  });
});
