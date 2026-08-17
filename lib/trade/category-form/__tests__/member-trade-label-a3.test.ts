import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { uiPhaseFinishMessages } from "@/lib/i18n/catalog/ui-phase-finish";
import { tradeMessages } from "@/lib/i18n/catalog/trade";
import { communityUiMessages } from "@/lib/i18n/catalog/community-ui";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("CUT A3 member trade labels", () => {
  it("1행 is 주제, 2행 and write-child are 카테고리 (ko/en)", () => {
    expect(tradeMessages.ko.trade_138).toBe("주제");
    expect(tradeMessages.en.trade_138).toBe("Topics");
    expect(uiPhaseFinishMessages.ko.ui_market_topic_filter_aria).toBe("카테고리 필터");
    expect(uiPhaseFinishMessages.en.ui_market_topic_filter_aria).toBe("Category filter");
    expect(uiPhaseFinishMessages.ko.ui_write_topic_label).toBe("카테고리");
    expect(uiPhaseFinishMessages.en.ui_write_topic_label).toBe("Category");
    expect(uiPhaseFinishMessages.ko.ui_write_launcher_no_topics).toBe("노출할 주제가 없습니다.");
    expect(uiPhaseFinishMessages.en.ui_write_launcher_no_topics).toBe("No topics to show.");
  });

  it("community topic copy is unchanged", () => {
    expect(communityUiMessages.ko.community_write_topic_label).toBe("주제");
    expect(communityUiMessages.en.community_write_topic_label).toBe("Topic");
  });

  it("member screens keep URL ?topic= and the same i18n keys", () => {
    const chips = read("components/home/TradeTopicChipsRow.tsx");
    expect(chips).toContain('params.set("topic", raw)');

    const feed = read("components/market/MarketCategoryFeed.tsx");
    expect(feed).toContain('aria-label={t("ui_market_topic_filter_aria")}');

    const write = read("components/write/shared/WriteTradeTopicSection.tsx");
    expect(write).toContain('t("ui_write_topic_label")');
    expect(write).toContain("resolveTradeWriteCategoryId");

    const tabs = read("components/trade/TradePrimaryTabs.tsx");
    expect(tabs).toContain('trackAriaLabel={t("trade_138")}');
  });

  it("does not retarget SearchFilterBar or A1/A2 resolvers", () => {
    const search = read("components/search/SearchFilterBar.tsx");
    expect(search).not.toContain("ui_write_topic_label");
    expect(search).not.toContain("ui_market_topic_filter_aria");

    const resolveSrc = read("lib/trade/category-form/resolve-for-category.ts");
    expect(resolveSrc).toContain("resolveTradeCompositionRootRow");
  });
});
