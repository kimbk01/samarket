import { describe, expect, it } from "vitest";
import {
  formatGiftInstanceExpirationDisplay,
  formatGiftProductExpirationDisplay,
  formatGiftValidUntilLabel,
} from "@/lib/gift-certificate/format-gift-certificate-expiration";

const koUntil = (d: string) => formatGiftValidUntilLabel(d, "ko");

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
        validUntilLabel: koUntil,
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
        validUntilLabel: koUntil,
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

  it("gift_valid_until — en 에 한글 0, ko 는 「까지」", () => {
    const en = formatGiftValidUntilLabel("2027-08-29", "en");
    expect(en).toBe("Valid until 2027.08.29");
    expect(/[가-힣]/.test(en)).toBe(false);
    expect(formatGiftValidUntilLabel("2027-08-29", "ko")).toBe("2027.08.29까지");
    expect(
      formatGiftInstanceExpirationDisplay({
        validUntil: "2027-08-29",
        noExpiryLabel: "No expiry",
        validUntilLabel: (d) => formatGiftValidUntilLabel(d.replace(/\./g, "-"), "en"),
      })
    ).toBe("Valid until 2027.08.29");
  });
});
