import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** B-8 (후속 감사 2026-11-08) — PC 진행중 거래 탭 줄이 헤더 제목과 같은 본문 열에 오는지 */
describe("MyProductFilter — desktop main column", () => {
  const src = readFileSync(join(process.cwd(), "components/mypage/products/MyProductFilter.tsx"), "utf8");

  it("full-width underline outside, tabs inside APP_MAIN_COLUMN_CLASS (same as TradeHubTopTabs)", () => {
    expect(src).toContain('<div className="w-full border-b border-sam-border" data-my-product-filter-row>');
    expect(src).toContain("<div className={APP_MAIN_COLUMN_CLASS}>");
    expect(src.indexOf("<div className={APP_MAIN_COLUMN_CLASS}>")).toBeLessThan(src.indexOf("<MyTabs"));
  });

  it("tab bar keeps its original horizontal padding (phone unchanged) and drops only its own underline", () => {
    expect(src).toContain('className="border-b-0 px-1"');
  });
});
