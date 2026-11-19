import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

/** 선택자 문자열로 시작하는 규칙 한 개의 `{ … }` 본문만 — 다른 규칙 값이 섞여 통과하지 않게 */
function ruleBody(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`rule not found: ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

/**
 * Owner 2026-11-19 「시안대로 정확히」 — 시안 `docs/audit/header-title-tabs-2026-11-19/design.html`
 * 1. 대표 헤더 제목(정보 공유·마켓·모임·telRING) 강조 · 2. telRING 대화·친구·통화 버튼 묶음.
 */
describe("시안 1 — 대표 헤더 제목 강조", () => {
  const tier1 = read("components/layout/RegionBarMainHubTier1.tsx");
  const css = read("app/sector-header.css");

  it("정보 공유·마켓·모임·telRING 만 강조, MY 는 그대로", () => {
    expect(tier1).toContain('new Set<MainHubTier1Id>(["community", "trade", "moim", "chat"])');
    expect(tier1).toContain('<span className="dibay-hub-title" data-dibay-hub-title={hub}>');
  });

  it("20px · 800 · 자간 −0.03em · #0B421A, 동네 버튼도 20px(같은 크기 규칙) · 자간 −0.02em", () => {
    const block = ruleBody(css, ".dibay-hub-title");
    expect(block).toContain("--sector-header-title-size: 20px;");
    expect(block).toContain("font-size: 20px;");
    expect(block).toContain("font-weight: 800;");
    expect(block).toContain("letter-spacing: -0.03em;");
    expect(block).toContain("color: #0b421a;");
    expect(ruleBody(css, ".dibay-hub-title [data-tier1-title-area]")).toContain("letter-spacing: -0.02em;");
  });

  it("telRING = tel 초록 + RING 노랑 #E0A800 (dibaY 의 Y 와 같은 색)", () => {
    expect(tier1).toContain("<TelringHubTitle label={t(hubTitleKey(hub))} />");
    expect(tier1).toContain('<span className="dibay-hub-title-accent">{m[2]}</span>');
    expect(ruleBody(css, ".dibay-hub-title .dibay-hub-title-accent")).toContain("color: #e0a800;");
  });
});

describe("시안 2 — telRING 대화·친구·통화 버튼 묶음", () => {
  const css = read("app/dibay-chrome-ssot.css");
  const tabs = read("components/community-messenger/MessengerHomeSectionTabs.tsx");
  const ITEM =
    '[data-dibay-tab-tier="section"][data-cm-messenger-section-tabs][data-cm-primary-nav][data-dibay-nav] .dibay-secondary-tabs > .dibay-secondary-tab.dibay-secondary-tab';

  it("이 줄만 버튼 묶음 — 채팅 검색·거래/주문 채팅 목록 탭은 밑줄 규칙에 그대로", () => {
    expect(css).not.toContain(":is([data-cm-messenger-section-tabs], [data-cm-messenger-search-tabs]");
    expect(css).toContain(":is([data-cm-messenger-search-tabs], [data-cm-messenger-pillar-tabs])");
  });

  it("줄 54 · 묶음 38 흰 바탕 테두리 #CFDCEF 모서리 4 안쪽 3 간격 3 · 좌우 16", () => {
    expect(ruleBody(css, '[data-dibay-tab-tier="section"][data-cm-messenger-section-tabs]')).toContain(
      "--dibay-secondary-tab-row-h: 54px;"
    );
    const seg = ruleBody(css, '[data-dibay-tab-tier="section"][data-cm-messenger-section-tabs] .dibay-secondary-tabs');
    for (const v of [
      "height: 38px;",
      "margin: 6px 8px 10px 6px;",
      "padding: 3px;",
      "gap: 3px;",
      "background: #ffffff;",
      "border: 1px solid #cfdcef;",
      "border-radius: 4px;",
    ]) {
      expect(seg).toContain(v);
    }
  });

  it("미선택 = #4A5560 15/500 · 바탕 없음 · 안쪽 여백 없음 · 세 칸 같은 폭", () => {
    const item = ruleBody(css, ITEM);
    for (const v of [
      "flex: 1 1 0;",
      "min-width: 0;",
      "height: 30px;",
      "padding: 0;",
      "border-radius: 4px;",
      "font-size: 15px;",
      "font-weight: 500;",
      "color: #4a5560;",
      "background: transparent;",
    ]) {
      expect(item).toContain(v);
    }
  });

  it("선택 = #296044 바탕 · 흰 15/700 · 그림자 0 1px 2px · 밑줄 없음", () => {
    const sel = ruleBody(css, `${ITEM}:is([aria-selected="true"], .dibay-secondary-tab--active)`);
    for (const v of [
      "font-size: 15px;",
      "font-weight: 700;",
      "color: #ffffff;",
      "background: #296044;",
      "box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);",
    ]) {
      expect(sel).toContain(v);
    }
    expect(ruleBody(css, `${ITEM}::after`)).toContain("content: none;");
  });

  it("「대화」 숫자 = 하단 telRING 탭 배지와 같은 훅·같은 값 (시안 「대화 3」)", () => {
    expect(tabs).toContain('useBottomNavChatBadgeWithLastRunSeed("chat", useOwnerHubBadgeTabUnreadCount("chat"))');
    expect(tabs).toContain('section === "chats" && chatsUnread > 0');
    const nav = read("components/layout/BottomNav.tsx");
    expect(nav).toContain("useOwnerHubBadgeTabUnreadCount(tab.icon)");
    expect(nav).toContain("useBottomNavChatBadgeWithLastRunSeed(tab.icon, liveTabBadgeCount)");
  });

  it("「대화」 배지 = 시안 값(18px · 11px/700 · #E5484D · 글자와 6px), 「친구」 배지는 시안에 없어 원래 모양", () => {
    expect(tabs).toContain(
      '"ml-1.5 inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-[#E5484D] px-[5px] text-[11px] font-bold leading-none text-white"'
    );
    expect(tabs).toContain(
      '"ml-1 inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[color:var(--sm-color-danger)] px-1 text-[10.5px] font-bold leading-none text-white"'
    );
  });
});
