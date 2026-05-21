import { describe, expect, it } from "vitest";
import { resolveTier1BarLabel } from "@/lib/layout/resolve-tier1-bar-label";
import type { MessageKey } from "@/lib/i18n/messages";

describe("resolveTier1BarLabel", () => {
  const t = (key: MessageKey) => (key === "tier1_order" ? "주문" : key);
  const tt = (text: string) => `tt:${text}`;

  it("카탈로그 키는 t()로 번역", () => {
    expect(resolveTier1BarLabel(t, tt, "tier1_order")).toBe("주문");
    expect(resolveTier1BarLabel(t, tt, "tier1_back")).toBe("tier1_back");
  });

  it("한글 리터럴은 tt() 경로", () => {
    expect(resolveTier1BarLabel(t, tt, "배달")).toBe("tt:배달");
  });
});
