import { describe, expect, it } from "vitest";
import {
  formatGiftInstanceExpirationDisplay,
  formatGiftProductExpirationDisplay,
} from "@/lib/gift-certificate/format-gift-certificate-expiration";

describe("format gift certificate expiration", () => {
  it("instance null valid_until → noExpiryLabel (NO_EXPIRY invariant)", () => {
    expect(
      formatGiftInstanceExpirationDisplay({
        validUntil: null,
        noExpiryLabel: "만료 없음",
      })
    ).toBe("만료 없음");
  });

  it("instance date → YYYY.MM.DD까지", () => {
    expect(
      formatGiftInstanceExpirationDisplay({
        validUntil: "2027-08-29",
        noExpiryLabel: "만료 없음",
      })
    ).toBe("2027.08.29까지");
  });

  it("product policy NO_EXPIRY / FIXED_DATE / FIXED_DAYS", () => {
    expect(
      formatGiftProductExpirationDisplay({
        expiryPolicy: "NO_EXPIRY",
        validityDays: null,
        fixedValidUntil: null,
        noExpiryLabel: "만료 없음",
        daysAfterIssueLabel: (d) => `발급 후 ${d}일`,
      })
    ).toBe("만료 없음");

    expect(
      formatGiftProductExpirationDisplay({
        expiryPolicy: "FIXED_DATE",
        validityDays: null,
        fixedValidUntil: "2027-08-29",
        noExpiryLabel: "만료 없음",
        daysAfterIssueLabel: (d) => `발급 후 ${d}일`,
      })
    ).toBe("2027.08.29까지");

    expect(
      formatGiftProductExpirationDisplay({
        expiryPolicy: "FIXED_DAYS",
        validityDays: 90,
        fixedValidUntil: null,
        noExpiryLabel: "만료 없음",
        daysAfterIssueLabel: (d) => `발급 후 ${d}일`,
      })
    ).toBe("발급 후 90일");
  });
});
