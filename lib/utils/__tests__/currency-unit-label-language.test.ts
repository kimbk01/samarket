import { describe, expect, it } from "vitest";
import { getCurrencyUnitLabel } from "@/lib/utils/format";

const HANGUL = /[가-힣]/;

describe("getCurrencyUnitLabel — 언어별 통화 단위 (재감사 2026-11-27)", () => {
  it("ko 는 기존 표기 「원」「달러」 그대로, 페소는 ₱", () => {
    expect(getCurrencyUnitLabel("KRW", "ko")).toBe("원");
    expect(getCurrencyUnitLabel("USD", "ko")).toBe("달러");
    expect(getCurrencyUnitLabel("PHP", "ko")).toBe("₱");
    expect(getCurrencyUnitLabel(undefined, "ko")).toBe("₱");
  });

  it("en 은 한글 없이 KRW·USD, 페소는 ₱", () => {
    for (const code of ["KRW", "USD", "PHP", "JPY"]) {
      expect(HANGUL.test(getCurrencyUnitLabel(code, "en"))).toBe(false);
    }
    expect(getCurrencyUnitLabel("KRW", "en")).toBe("KRW");
    expect(getCurrencyUnitLabel("USD", "en")).toBe("USD");
    expect(getCurrencyUnitLabel("PHP", "en")).toBe("₱");
  });

  it("모르는 통화는 코드 그대로", () => {
    expect(getCurrencyUnitLabel("jpy", "ko")).toBe("JPY");
  });
});
