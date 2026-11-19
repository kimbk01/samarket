import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
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
    const block = css.slice(css.indexOf(".dibay-hub-title {"), css.indexOf(".dibay-hub-title [data-tier1-title-area]"));
    expect(block).toContain("--sector-header-title-size: 20px;");
    expect(block).toContain("font-size: 20px;");
    expect(block).toContain("font-weight: 800;");
    expect(block).toContain("letter-spacing: -0.03em;");
    expect(block).toContain("color: #0b421a;");
    expect(css).toMatch(/\.dibay-hub-title \[data-tier1-title-area\] \{\s*letter-spacing: -0\.02em;/);
  });

  it("telRING = tel 초록 + RING 노랑 #E0A800 (dibaY 의 Y 와 같은 색)", () => {
    expect(tier1).toContain("<TelringHubTitle label={t(hubTitleKey(hub))} />");
    expect(tier1).toContain('<span className="dibay-hub-title-accent">{m[2]}</span>');
    expect(css).toMatch(/\.dibay-hub-title \.dibay-hub-title-accent \{\s*color: #e0a800;/);
  });
});

describe("시안 2 — telRING 대화·친구·통화 버튼 묶음", () => {
  const css = read("app/dibay-chrome-ssot.css");
  const tabs = read("components/community-messenger/MessengerHomeSectionTabs.tsx");

  it("이 줄만 버튼 묶음 — 채팅 검색·거래/주문 채팅 목록 탭은 밑줄 규칙에 그대로", () => {
    expect(css).not.toContain(":is([data-cm-messenger-section-tabs], [data-cm-messenger-search-tabs]");
    expect(css).toContain(":is([data-cm-messenger-search-tabs], [data-cm-messenger-pillar-tabs])");
  });

  it("줄 54 · 묶음 38 흰 바탕 테두리 #CFDCEF 모서리 4 안쪽 3 간격 3 · 좌우 16", () => {
    expect(css).toMatch(/\[data-cm-messenger-section-tabs\] \{\s*--dibay-secondary-tab-row-h: 54px;/);
    const seg = css.slice(css.indexOf("[data-cm-messenger-section-tabs] .dibay-secondary-tabs {"));
    expect(seg).toContain("height: 38px;");
    expect(seg).toContain("margin: 6px 8px 10px 6px;");
    expect(seg).toContain("padding: 3px;");
    expect(seg).toContain("gap: 3px;");
    expect(seg).toContain("background: #ffffff;");
    expect(seg).toContain("border: 1px solid #cfdcef;");
    expect(seg).toContain("border-radius: 4px;");
  });

  it("선택 = #296044 바탕 흰 글자 700 · 미선택 = #4A5560 500 · 세 칸 같은 폭 · 밑줄 없음", () => {
    const item = css.slice(css.indexOf("[data-cm-messenger-section-tabs][data-cm-primary-nav][data-dibay-nav] .dibay-secondary-tabs > .dibay-secondary-tab.dibay-secondary-tab {"));
    expect(item).toContain("flex: 1 1 0;");
    expect(item).toContain("min-width: 0;");
    expect(item).toContain("color: #4a5560;");
    expect(item).toContain("font-weight: 500;");
    expect(item).toMatch(/font-weight: 700;\s*color: #ffffff;\s*background: #296044;\s*box-shadow: 0 1px 2px rgba\(0, 0, 0, 0\.15\);/);
    expect(css).toMatch(/\.dibay-secondary-tab\.dibay-secondary-tab::after \{\s*content: none;/);
  });

  it("숫자 배지 = 18px · 11px/700 · #E5484D", () => {
    expect(tabs).toContain(
      'className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-[#E5484D] px-[5px] text-[11px] font-bold leading-none text-white"'
    );
  });
});
