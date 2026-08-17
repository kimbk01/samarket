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

describe("trade write entry SSOT (R4/R7)", () => {
  it("TradeCategoryWriteForm does not import Jobs/Exchange WriteModules", () => {
    const src = readFileSync(
      resolve(process.cwd(), "components/write/trade/TradeCategoryWriteForm.tsx"),
      "utf8"
    );
    expect(src).toContain("TradeWriteForm");
    expect(src).not.toMatch(/JobsWriteForm|ExchangeWriteForm|JobsExtendedWriteFields|ExchangeExtendedWriteFields/);
  });

  it("TradeWriteForm routes jobs/exchange into the shared shell", () => {
    const src = readFileSync(resolve(process.cwd(), "components/write/trade/TradeWriteForm.tsx"), "utf8");
    expect(src).toMatch(/from ["']\.\/generic\/JobsExtendedWriteFields["']/);
    expect(src).toMatch(/from ["']\.\/generic\/ExchangeExtendedWriteFields["']/);
    expect(src).not.toMatch(/from ["']\.\/JobsWriteForm["']/);
    expect(src).not.toMatch(/from ["']\.\/ExchangeWriteForm["']/);
    expect(src).not.toContain("resolveUsesJobsTradeWriteForm");
    expect(src).not.toContain("resolveUsesExchangeTradeWriteForm");
    expect(src).not.toContain('if (compositionProfileId === "jobs")');
    expect(src).not.toContain('if (compositionProfileId === "exchange")');
    expect(src).toContain('const isJobsProfile = tradeComposition.profileId === "jobs"');
    expect(src).toContain('const isExchangeProfile = tradeComposition.profileId === "exchange"');
    expect(src).toContain("<JobsExtendedWriteFields");
    expect(src).toContain("<ExchangeExtendedWriteFields");
    expect(src).toContain("registerSubmit={registerJobsSubmit}");
    expect(src).toContain("registerSubmit={registerExchangeSubmit}");
  });

  it("Jobs/Exchange extended bodies render seed library fields through GenericTradeWriteFields", () => {
    const jobs = readFileSync(
      resolve(process.cwd(), "components/write/trade/generic/JobsExtendedWriteFields.tsx"),
      "utf8"
    );
    const exchange = readFileSync(
      resolve(process.cwd(), "components/write/trade/generic/ExchangeExtendedWriteFields.tsx"),
      "utf8"
    );
    expect(jobs).toContain("GenericTradeWriteFields");
    expect(jobs).toContain('f.id === "work_category"');
    expect(jobs).toContain('f.id === "work_term"');
    expect(jobs).toContain('f.id === "pay_type"');
    expect(jobs).toContain('f.id === "pay_amount"');
    expect(exchange).toContain("GenericTradeWriteFields");
    expect(exchange).toContain('f.id === "exchange_direction"');
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
