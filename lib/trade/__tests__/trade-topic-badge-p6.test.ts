import { describe, expect, it } from "vitest";
import { buildTradeTopicBadgeMap } from "@/lib/trade/topic-badge-store";
import { normalizeBadgeColor } from "@/lib/categories/to-category-with-settings";
import type { CategoryWithSettings } from "@/lib/categories/types";

const row = (p: Partial<CategoryWithSettings>): CategoryWithSettings =>
  ({ id: "", name: "", slug: "", icon_key: "general", type: "trade", parent_id: null, ...p }) as CategoryWithSettings;

describe("P-6 trade topic badge (name + color, no icon)", () => {
  it("child categories resolve to the ROOT topic name/color", () => {
    const m = buildTradeTopicBadgeMap([
      row({ id: "r", name: "중고차", name_en: "Cars", badge_color: "#2A5D8F" }),
      row({ id: "c", name: "SUV", parent_id: "r" }),
    ]);
    expect(m.get("c")).toEqual({ label: "중고차", labelEn: "Cars", color: "#2A5D8F" });
  });

  it("missing color → null (neutral)", () => {
    const m = buildTradeTopicBadgeMap([row({ id: "r", name: "렌터카" })]);
    expect(m.get("r")?.color).toBeNull();
  });

  it("only #RRGGBB is accepted", () => {
    expect(normalizeBadgeColor("#2f6f4e")).toBe("#2F6F4E");
    expect(normalizeBadgeColor("red")).toBeNull();
    expect(normalizeBadgeColor("#fff")).toBeNull();
    expect(normalizeBadgeColor(null)).toBeNull();
  });
});
