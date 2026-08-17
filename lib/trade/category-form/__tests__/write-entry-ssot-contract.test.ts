import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveUsesExchangeTradeWriteForm,
  resolveUsesJobsTradeWriteForm,
} from "@/lib/trade/category-form/write-form-profile";
import type { CategoryWithSettings } from "@/lib/categories/types";

function stubCategory(partial: Partial<CategoryWithSettings> & { icon_key: string; slug: string }): CategoryWithSettings {
  return {
    id: "c1",
    name: "t",
    type: "trade",
    parent_id: null,
    sort_order: 0,
    is_active: true,
    settings: null,
    ...partial,
  } as CategoryWithSettings;
}

describe("trade write entry SSOT (R4)", () => {
  it("TradeCategoryWriteForm does not import Jobs/Exchange WriteModules", () => {
    const src = readFileSync(
      resolve(process.cwd(), "components/write/trade/TradeCategoryWriteForm.tsx"),
      "utf8"
    );
    expect(src).toContain("TradeWriteForm");
    expect(src).not.toMatch(/from ["']@\/components\/write\/trade\/JobsWriteForm["']/);
    expect(src).not.toMatch(/from ["']@\/components\/write\/trade\/ExchangeWriteForm["']/);
    expect(src).not.toMatch(/<JobsWriteForm\b/);
    expect(src).not.toMatch(/<ExchangeWriteForm\b/);
  });

  it("TradeWriteForm owns Jobs/Exchange layout mounts", () => {
    const src = readFileSync(resolve(process.cwd(), "components/write/trade/TradeWriteForm.tsx"), "utf8");
    expect(src).toMatch(/from ["']\.\/JobsWriteForm["']/);
    expect(src).toMatch(/from ["']\.\/ExchangeWriteForm["']/);
    expect(src).toContain("resolveUsesJobsTradeWriteForm");
    expect(src).toContain("resolveUsesExchangeTradeWriteForm");
  });

  it("profile helpers map icon_key/slug to jobs/exchange", () => {
    expect(resolveUsesJobsTradeWriteForm(stubCategory({ icon_key: "jobs", slug: "jobs" }))).toBe(true);
    expect(resolveUsesJobsTradeWriteForm(stubCategory({ icon_key: "job", slug: "x" }))).toBe(true);
    expect(resolveUsesExchangeTradeWriteForm(stubCategory({ icon_key: "exchange", slug: "x" }))).toBe(
      true
    );
    expect(resolveUsesExchangeTradeWriteForm(stubCategory({ icon_key: "general", slug: "current" }))).toBe(
      true
    );
    expect(resolveUsesJobsTradeWriteForm(stubCategory({ icon_key: "used-car", slug: "car" }))).toBe(false);
  });
});
