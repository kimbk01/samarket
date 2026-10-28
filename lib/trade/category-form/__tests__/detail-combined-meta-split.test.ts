import { describe, expect, it } from "vitest";
import { splitCombinedMetaPart } from "@/lib/trade/category-form/detail-attributes";

describe("상세 제조사·모델 나누기 (2026-10-28 실기)", () => {
  const parts = ["make", "model"] as const;
  it("Toyota Vios → 제조사 Toyota · 모델 Vios", () => {
    expect(splitCombinedMetaPart("Toyota Vios", parts, "make")).toBe("Toyota");
    expect(splitCombinedMetaPart("Toyota Vios", parts, "model")).toBe("Vios");
  });
  it("모르는 브랜드는 원문 그대로", () => {
    expect(splitCombinedMetaPart("R4LDwwxm6a", parts, "make")).toBe("R4LDwwxm6a");
  });
});
