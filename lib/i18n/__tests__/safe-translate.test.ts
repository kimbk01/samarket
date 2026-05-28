import { describe, expect, it } from "vitest";
import { safeTranslate } from "@/lib/i18n/safe-translate";

describe("safeTranslate", () => {
  it("returns catalog string for known key", () => {
    expect(safeTranslate("ko", "common_confirm")).toBe("확인");
    expect(safeTranslate("en", "common_confirm")).toBe("Confirm");
  });

  it("never returns raw key slug on screen", () => {
    const key = "store_delivery_fee_courier_colon" as const;
    const ko = safeTranslate("ko", key, { vars: { label: "Lalamove" }, fallbackKo: "배달비" });
    expect(ko).not.toBe(key);
    expect(ko).not.toMatch(/^store_/);
  });

  it("uses language-specific fallback when translation missing", () => {
    const fake = "zzz_nonexistent_key_for_safe_translate_test" as never;
    expect(safeTranslate("ko", fake, { fallbackKo: "한국어", fallbackEn: "English" })).toBe("한국어");
    expect(safeTranslate("en", fake, { fallbackKo: "한국어", fallbackEn: "English" })).toBe("English");
  });

  it("uses user-facing default when no fallback", () => {
    const fake = "zzz_nonexistent_key_for_safe_translate_test" as never;
    expect(safeTranslate("ko", fake)).toBe("내용을 불러올 수 없습니다.");
    expect(safeTranslate("en", fake)).toBe("Unable to load this content.");
    expect(safeTranslate("en", fake)).not.toMatch(/^zzz_/);
  });
});
