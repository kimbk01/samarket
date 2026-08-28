import { describe, expect, it } from "vitest";
import {
  formatGiftAdminValidity,
  formatGiftAdminValidityLabel,
} from "@/lib/gift-certificate/format-gift-admin-validity";

describe("formatGiftAdminValidity", () => {
  it("does not treat valid_from alone as expiry end", () => {
    expect(formatGiftAdminValidity("2026-01-01", null)).toBe("—");
    expect(formatGiftAdminValidityLabel({
      validFrom: "2026-01-01",
      validUntil: null,
      noExpiryLabel: "만료 없음",
    })).toBe("만료 없음");
  });

  it("formats range and until-only", () => {
    expect(formatGiftAdminValidity("2026-01-01", "2026-12-31")).toBe("2026-01-01 → 2026-12-31");
    expect(formatGiftAdminValidity(null, "2026-12-31")).toBe("→ 2026-12-31");
  });
});
