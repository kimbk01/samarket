/**
 * 재감사(2026-11-10) — 판매 허브 숫자 칸: 비회원 = 빈 칸(스켈레톤·0 없음), 로딩 = 스켈레톤, 실패 = 「—」.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SellHubOverviewValue } from "@/components/trade/MarketplaceSellHubPage";

describe("SellHubOverviewValue", () => {
  it("비회원(empty)은 로딩 중이어도 아무것도 그리지 않는다", () => {
    expect(renderToStaticMarkup(<SellHubOverviewValue loading empty value={null} />)).toBe("");
  });
  it("로딩 = 스켈레톤", () => {
    expect(renderToStaticMarkup(<SellHubOverviewValue loading value={null} />)).toContain("data-sell-hub-value-loading");
  });
  it("실패(null) = —, 값 = 숫자(0 포함)", () => {
    expect(renderToStaticMarkup(<SellHubOverviewValue loading={false} value={null} />)).toBe("—");
    expect(renderToStaticMarkup(<SellHubOverviewValue loading={false} value={0} />)).toBe("0");
  });
});
