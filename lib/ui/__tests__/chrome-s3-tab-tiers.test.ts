import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Sam } from "@/lib/ui/sam-component-classes";

/**
 * 크롬 S3 (2026-11-02 · Owner 「S3, 칩 4px」) — 2단 = 밑줄 · 3단 = 칩 4px, opt-in `data-dibay-tab-tier`.
 * 배달 계약: 표시 없는 행(배달 browse 헤더·사장님 알림)과 리터럴 `sam-tab`(매장 메뉴 탭)은 그대로.
 * docs/audit/dibay-chrome-header-tab-bottomnav-audit-2026-11-02.md §2-3 · §7-3
 */
const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const chromeCss = read("app/dibay-chrome-ssot.css");
const componentsCss = read("app/samarket-components.css");

function ruleBody(css: string, selectorStart: string): string {
  const idx = css.indexOf(selectorStart);
  expect(idx, `missing rule ${selectorStart}`).toBeGreaterThan(-1);
  const start = css.indexOf("{", idx);
  return css.slice(start + 1, css.indexOf("}", start));
}

describe("chrome S3 — tab tiers", () => {
  it("3단 filter chip: 32px · 4px corner · 13px both states · selected = brand green", () => {
    const chip = ruleBody(chromeCss, ':is([data-dibay-tab-tier="filter"], [data-dibay-tab-tier="section"]) .dibay-secondary-tab {');
    expect(chip).toContain("height: 32px;");
    expect(chip).toContain("border-radius: var(--sam-radius-sm, 4px);");
    expect(chip).toContain("font-size: 13px;");
    const selected = ruleBody(
      chromeCss,
      ':is([data-dibay-tab-tier="filter"], [data-dibay-tab-tier="section"])\n  .dibay-secondary-tab:is([aria-selected="true"], .dibay-secondary-tab--active) {'
    );
    expect(selected).toContain("font-size: 13px;");
    expect(selected).toContain("background: var(--sam-primary);");
  });

  it("2단 section underline: 15px both states · selected text + 2px bar = brand green", () => {
    const tab = ruleBody(chromeCss, '[data-dibay-tab-tier="section"] .dibay-secondary-tabs .dibay-secondary-tab {');
    /** 값은 2단 토큰(--dibay-tab2-*) 1곳 — 15px · 밑줄 2px · 브랜드 그린 */
    expect(chromeCss).toContain("--dibay-tab2-font-size: 15px;");
    expect(chromeCss).toContain("--dibay-tab2-bar-h: 2px;");
    expect(chromeCss).toContain("--dibay-tab2-active-color: var(--sam-primary);");
    expect(tab).toContain("font-size: var(--dibay-tab2-font-size);");
    expect(tab).toContain("border-radius: 0;");
    const bar = ruleBody(chromeCss, '[data-dibay-tab-tier="section"] .dibay-secondary-tabs .dibay-secondary-tab::after {');
    expect(bar).toContain("height: var(--dibay-tab2-bar-h);");
    expect(bar).toContain("background: var(--dibay-tab2-active-color);");
    expect(chromeCss).toContain(':is([data-dibay-tab-tier="filter"], [data-dibay-tab-tier="section"]) .dibay-secondary-tab:focus-visible');
  });

  it("★ Owner 고정: 2단 탭은 이름을 자르지 않고 넘치면 가로 스와이프 (메뉴가 늘어도 잘림 0)", () => {
    const tab = ruleBody(chromeCss, '[data-dibay-tab-tier="section"] .dibay-secondary-tabs .dibay-secondary-tab {');
    expect(tab).toContain("min-width: max-content;");
    expect(tab).toContain("max-width: none;");
    expect(tab).toContain("text-overflow: clip;");
    expect(tab).toContain("flex: 0 0 auto;");
    const inner = ruleBody(chromeCss, '[data-dibay-tab-tier="section"] .dibay-secondary-tabs .dibay-secondary-tab * {');
    expect(inner).toContain("max-width: none;");
    expect(inner).toContain("text-overflow: clip;");
    /** 4개 이하 균등 채움도 줄어들지 않음(flex-shrink 0) */
    expect(chromeCss).not.toMatch(/data-dibay-tab-tier="section"[^{]*nth-child\(5\)[^{]*\{[^}]*flex: 1 1 0/);
    const samSection = ruleBody(componentsCss, ".sam-tab.sam-tab--section,\n  .sam-tabs--scroll .sam-tab.sam-tab--section {");
    expect(samSection).toContain("min-width: max-content;");
    expect(samSection).toContain("max-width: none;");
    expect(samSection).toContain("text-overflow: clip;");
    /** 2단 줄은 가로 스크롤 가능해야 함 */
    expect(ruleBody(chromeCss, "\n.dibay-secondary-tabs {")).toContain("overflow-x: auto;");
    expect(componentsCss).toMatch(/\.sam-tabs \{\s*@apply[^;]*overflow-x-auto/);
  });

  it("T-09: 헤더 크롬 안 탭 줄은 고정 해제·헤더 색 그대로 (흰 띠 제거), 본문 탭 줄 sticky 는 유지", () => {
    const inHeader = ruleBody(componentsCss, "[data-app-sticky-header] .sam-tabs,\n  .sector-header-shell .sam-tabs {");
    expect(inHeader).toContain("position: static;");
    expect(inHeader).toContain("background-color: transparent;");
    expect(componentsCss).toMatch(/\.sam-tabs \{\s*@apply sticky top-0/);
  });

  it("legacy pill rule is untouched for rows without a tier (delivery contract)", () => {
    const legacy = ruleBody(chromeCss, "\n.dibay-secondary-tab {");
    expect(legacy).toContain("border-radius: var(--dibay-secondary-tab-radius);");
    expect(chromeCss).toContain("--dibay-secondary-tab-radius: 18px;");
    for (const rel of ["components/stores/browse/StoresBrowseHeaderPrimaryTabs.tsx", "components/stores/owner/OwnerNotificationList.tsx"]) {
      expect(read(rel), rel).not.toContain("data-dibay-tab-tier");
    }
  });

  it("Sam.tabs adds the section modifier; literal delivery `sam-tab` stays unmodified", () => {
    expect(Sam.tabs.tab).toBe("sam-tab sam-tab--section");
    expect(Sam.tabs.tabActive).toBe("sam-tab sam-tab--section sam-tab--active");
    const section = ruleBody(componentsCss, ".sam-tab.sam-tab--section,\n  .sam-tabs--scroll .sam-tab.sam-tab--section {");
    expect(section).toContain("font-size: var(--dibay-tab2-font-size);");
    expect(read("components/stores/StoreMenuCategoryChips.tsx")).not.toContain("sam-tab--section");
  });

  it("shared row sets the tier and scrolls the selected tab into view", () => {
    const row = read("components/ui/DibaySecondaryTabRow.tsx");
    expect(row).toContain("data-dibay-tab-tier={resolvedTier}");
    expect(row).toContain("useScrollSelectedTabIntoView(");
    expect(read("components/mypage/ds/MyTabs.tsx")).toContain("useScrollSelectedTabIntoView(");
    /** T-08 누락 4곳 (원장 2026-11-03) */
    for (const rel of [
      "components/member-orders/MemberOrderTabs.tsx",
      "components/notifications/NotificationInboxTabBar.tsx",
      "components/mypage/trade/TradeHubTopTabs.tsx",
      "components/meetings/PhilifeMeetingHubClient.tsx",
    ]) {
      expect(read(rel), rel).toContain("useScrollSelectedTabIntoView(");
    }
    /** 2단 탭 이름 잘림 0 — 주문 탭 글자 칸 말줄임 없음 */
    expect(read("components/member-orders/MemberOrderTabs.tsx")).not.toContain("block truncate");
  });

  it("classified rows: community topics / trade hub / notifications = section; trade topics / status / reports = filter", () => {
    expect(read("components/community/CommunityFeed.tsx")).toMatch(/navRole="category"\s+tier="section"/);
    /** 거래 상단 탭 — Owner 「S3 밑줄형」 2026-11-02 (운영 확인 FAIL 수정: 전용 알약 클래스 → 공용 2단 탭 클래스) */
    const trade = read("components/trade/TradePrimaryTabs.tsx");
    expect(trade).toContain("return dibaySecondaryTabClass(active);");
    expect(trade).not.toContain("rounded-full px-2.5 text-[14px]");
    expect(trade).not.toContain("primary)_16%");
    expect(read("components/mypage/trade/TradeHubTopTabs.tsx")).toContain('data-dibay-tab-tier="section"');
    expect(read("components/notifications/NotificationInboxTabBar.tsx")).toContain('data-dibay-tab-tier="section"');
    expect(read("components/market/MarketCategoryFeed.tsx")).toContain('data-dibay-tab-tier="filter"');
    expect(read("components/mypage/TradeManagementTabBar.tsx")).toContain('data-dibay-tab-tier="filter" role="tablist"');
    expect(read("components/mypage/reports/MyReportsListClient.tsx")).toContain('data-dibay-tab-tier="filter"');
    expect(read("components/mypage/cs/CustomerCenterBoardListClient.tsx")).toContain('data-dibay-tab-tier="filter"');
  });

  it("no double indicator / black pill tabs in converted screens", () => {
    expect(read("components/community-messenger/group/CommunityMessengerGroupMemberPicker.tsx")).not.toContain("border-b-2 border-sam-primary");
    expect(read("components/meetings/PhilifeMeetingHubClient.tsx")).not.toContain("bg-sam-ink text-white");
  });

  it("2단 밑줄 값은 토큰 1곳 — dibay section·sam-tab--section 이 같이 씀 (중복 정리 2026-11-03)", () => {
    expect(chromeCss).toContain("--dibay-tab2-font-size: 15px;");
    for (const v of ["--dibay-tab2-font-size", "--dibay-tab2-bar-h", "--dibay-tab2-bar-inset", "--dibay-tab2-active-color"]) {
      expect(chromeCss, v).toContain(`var(${v})`);
      expect(componentsCss, v).toContain(`var(${v})`);
    }
    /**
     * 커뮤니티 주제 줄은 공용 자동 스크롤 유지 — 운영 실측(94294ce7c, 2026-11-03): 공용 스크롤을 끄자 「유머」·「동네」 선택 시
     * 줄이 움직이지 않아 선택 탭이 화면 밖에 남음(자체 로직은 탭 선택 때 이동 0) → 끄기 되돌림
     */
    expect(read("components/community/CommunityFeed.tsx")).not.toContain("autoScrollSelected={false}");
    expect(read("components/ui/DibaySecondaryTabRow.tsx")).toContain("useScrollSelectedTabIntoView(localTrackRef, autoScrollSelected)");
  });

  it("dead tab components removed", () => {
    for (const rel of [
      "components/app-shell/AppSegmentTabs.tsx",
      "components/app-shell/AppFilterBar.tsx",
      "components/app-shell/AppPill.tsx",
      "components/home/SortTabs.tsx",
      "components/categories/CategoryListByType.tsx",
      "lib/ui/app-top-menu.ts",
      "lib/ui/mypage-oval-tabs.ts",
    ]) {
      expect(existsSync(join(ROOT, rel)), rel).toBe(false);
    }
  });
});
