import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

/**
 * 정보교환·거래 머리글 3판 (Owner 「3판대로 구현」 2026-11-12, 설계 `docs/design/community-header-4items-design-2026-11-12.md`)
 * — 1단 「제목 · 동네 ⌄」(N3) · 떠 있는 글쓰기(W3) · 정보교환 2단 간격 · 선택 진동.
 */
describe("정보교환·거래 머리글 3판 계약", () => {
  const tier1 = read("components/layout/RegionBarMainHubTier1.tsx");
  const feed = read("components/community/CommunityFeed.tsx");

  it("1단: 정보교환·거래 제목 뒤 「· 동네 ⌄」, 왼쪽 빈칸 없음", () => {
    expect(tier1).toContain("<Tier1TitleWithArea");
    expect(tier1).toContain("<CommunityTier1AreaButton />");
    expect(tier1).toContain('<TradeHeaderLocationPinButton placement="title" />');
    expect(tier1).toContain('noLeftSlot={areaHub || hub === "moim"}');
    expect(read("app/sector-header.css")).toMatch(
      /\.sector-header--no-left-slot \.sector-header-bar--left-title \{\s*grid-template-columns: minmax\(0, 1fr\) auto;/
    );
  });

  it("1단 정보교환 오른쪽 = 검색·알림만 (지도 버튼·초록 글쓰기 사각 없음)", () => {
    expect(tier1).not.toContain("PhilifeHeaderAddressMenuButton");
    expect(tier1).not.toContain("PhilifeHeaderComposeButton");
    expect(read("components/philife/PhilifeHeaderComposeButton.tsx")).not.toContain("--cm-primary");
  });

  it("동네 상태·시트는 피드 하나가 가진다 — 1단은 값만 읽고 열기 신호만 보낸다", () => {
    expect(feed).toContain("publishCommunityAreaTitle(filterLabel, navSelection.kind === \"local\")");
    expect(feed).toContain("COMMUNITY_AREA_SHEET_OPEN_EVENT");
    expect(feed).toContain("<CommunityAreaSheet");
    expect(tier1).toContain("onClick={requestOpenCommunityAreaSheet}");
    expect(tier1).not.toContain("useCommunityLocalFilter");
  });

  it("2단: 「동네」 탭·본문 위 「보는 동네」 줄 없음, 간격 0·최대 10px", () => {
    expect(feed).not.toContain("trailingNavItems");
    expect(feed).not.toContain('safeT("community_local_filter_active")');
    expect(feed).toContain('hostClassName="[--dibay-secondary-tab-pad-x:0px]"');
    expect(feed).toContain("{ maxPadPx: 10, barInsetPx: 6 }");
  });

  it("선택이 실제로 바뀔 때만 진동 — 하단 탭과 같은 부품", () => {
    const apply = feed.slice(feed.indexOf("const applyNavSelection = useCallback("), feed.indexOf("const prefetchNavItemByIntent"));
    expect(apply).toContain('triggerInteractionFeedback("light")');
    expect(apply.indexOf("isSameCommunityNavSelection")).toBeLessThan(apply.indexOf("triggerInteractionFeedback"));
  });

  it("글쓰기 = 목록 오른쪽 아래 떠 있는 버튼 + 마지막 글 가림 방지 여백", () => {
    expect(feed).toContain("<PhilifeComposeFab />");
    expect(feed).toContain("data-philife-compose-fab-clearance");
    const fab = read("components/philife/PhilifeHeaderComposeButton.tsx");
    expect(fab).toContain("MAIN_BOTTOM_NAV_FAB_BOTTOM_CLASS");
    expect(fab).toContain("guardBeforeNavigate()");
  });

  it("주소 관리 입구는 「보는 동네」 시트 맨 아래로 — 같은 주소록 경로", () => {
    expect(read("components/community/CommunityAreaSheet.tsx")).toContain("usePhilifeAddressManageMenuItem");
    expect(read("components/philife/PhilifeAddressManageMenuItem.tsx")).toContain("buildMypageAddressesHrefFromPath");
  });
});

describe("모임 3단 (Owner 「3판대로 구현」 2026-11-12, 설계 §2-3)", () => {
  it("전환 줄 = 정보교환 · 거래 · 모임, 모임 → /moim", () => {
    const sw = read("components/layout/CommunityTradeTitleSwitch.tsx");
    expect(sw).toContain('key: "moim" as const');
    expect(sw).toContain('href: () => "/moim"');
  });

  it("정보교환 2단에 「모임」 탭 없음", () => {
    expect(read("components/community/CommunityFeed.tsx")).not.toContain('data-community-tab="moim"');
  });

  it("/moim = 허브 머리글(1단 모임·검색·알림) + 2단 카테고리 + 3단 모임 선택", () => {
    const tier1 = read("components/layout/RegionBarMainHubTier1.tsx");
    expect(tier1).toContain('if (pathNoQuery === "/moim") return "moim";');
    expect(tier1).toContain("<MoimHeaderRightActions />");
    expect(read("components/layout/RegionBar.tsx")).toContain('pathNoQuery === "/moim"');
    const home = read("components/moim/MoimTabHome.tsx");
    expect(home).toContain("data-moim-category-tabs");
    expect(home).toContain('<CommunityTradeSwitchRow active="moim" />');
    expect(home).not.toContain("moimRoutes.search");
    expect(read("components/layout/AppStickyHeader.tsx")).toContain(
      '(communityTradeSwitchHub === "community" || communityTradeSwitchHub === "moim" ? ('
    );
  });
});
