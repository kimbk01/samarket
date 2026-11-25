import { describe, expect, it } from "vitest";
import { parseSafeInternalReturnTo } from "@/lib/addresses/mypage-addresses-return-to";

/** 전체 감사 B6 — 주소 흐름 returnTo 외부 이동 차단, 가입 주소 단계는 통과 */
describe("parseSafeInternalReturnTo", () => {
  it.each([
    ["/\\evil.example", ""],
    ["/%5Cevil.example", "/%5Cevil.example"],
    ["//evil.example", ""],
    ["https://evil.example", ""],
    ["/\t/evil.example", ""],
    ["/x\ny", ""],
    ["", ""],
  ])("%s → %s", (input, expected) => {
    expect(parseSafeInternalReturnTo(input)).toBe(expected);
  });
  it("가입 주소 단계·일반 내부 경로는 그대로", () => {
    expect(parseSafeInternalReturnTo("/auth/onboarding/address?next=%2Fmarket")).toBe("/auth/onboarding/address?next=%2Fmarket");
    expect(parseSafeInternalReturnTo("/stores/x/checkout")).toBe("/stores/x/checkout");
  });
});
