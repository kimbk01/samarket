import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_MAIN_COLUMN_MAX_WIDTH_CLASS } from "@/lib/ui/app-content-layout";
import { BOTTOM_NAV_SIDE_RAIL_CLASS, SIDE_RAIL_FIXED_INSET_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { MAIN_DESKTOP_SIDE_NAV_WIDTH_PX } from "@/lib/layout/main-desktop-side-nav-layout";

/**
 * 데스크톱 세로 레일 D1·D2 계약 — docs/audit/windows-desktop-shell-rail-design-2026-11-07.md
 */
const src = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const css = src("app/app-desktop-side-nav.css");

describe("D1 desktop side rail", () => {
  it("셸은 리졸버 판정만으로 같은 BottomNav 를 세로 레일로 그린다 (두 번째 내비 컴포넌트 없음)", () => {
    const shell = src("components/layout/ConditionalAppShell.tsx");
    expect(shell).toContain('appShell.navigationPresentation === "DESKTOP_SIDE_RAIL"');
    expect(shell).toContain('presentation={isDesktopSideRail ? "side-rail" : "bottom"}');
    expect(shell).not.toContain("MainDesktopSideNav");
    expect(shell.match(/<BottomNav\b/g)?.length).toBe(1);
  });

  it("레일에는 스크롤·키보드 숨김과 메신저 목록 칸 폭을 쓰지 않는다", () => {
    const shell = src("components/layout/ConditionalAppShell.tsx");
    expect(shell).toMatch(/showBottomNavMounted &&\s*!isDesktopSideRail &&\s*resolveBottomNavScrollHideEnabled/);
    expect(shell).toContain("showBottomNavMounted && !isDesktopSideRail ? (\n        <BottomNavKeyboardHideProbe");
    expect(shell).toMatch(/!isDesktopSideRail &&\s*\(pathname === "\/community-messenger"/);
  });

  it("BottomNav 는 side-rail 일 때 레일 클래스만 더한다", () => {
    const nav = src("components/layout/BottomNav.tsx");
    expect(nav).toContain('presentation === "side-rail" ? BOTTOM_NAV_SIDE_RAIL_CLASS : ""');
    expect(BOTTOM_NAV_SIDE_RAIL_CLASS).toBe("app-bottom-nav-shell--side-rail");
  });

  it("레일 폭은 기존 상수 72px 이고, 레일이 있으면 하단 탭 높이·돌출 변수를 0 으로 둔다", () => {
    expect(MAIN_DESKTOP_SIDE_NAV_WIDTH_PX).toBe(72);
    expect(css).toContain(`--app-side-rail-width: ${MAIN_DESKTOP_SIDE_NAV_WIDTH_PX}px;`);
    for (const v of [
      "--app-bottom-nav-height",
      "--main-scroll-nav-overhang",
      "--delivery-home-above-nav",
      "--delivery-home-overhang",
    ]) {
      expect(css).toContain(`${v}: 0px !important;`);
    }
    expect(css).toMatch(/html:has\(\.app-bottom-nav-shell--side-rail\) \.app-shell \{\s*padding-left:/);
  });

  it("화면 고정 플로팅(거래 플로팅 바·FAB 섹터)은 레일 폭만큼 비킨다", () => {
    expect(SIDE_RAIL_FIXED_INSET_CLASS).toBe("app-side-rail-fixed-inset");
    expect(css).toMatch(/html:has\(\.app-bottom-nav-shell--side-rail\) \.app-side-rail-fixed-inset \{\s*left:/);
    expect(src("components/layout/MainBottomNavFabSector.tsx")).toContain("${SIDE_RAIL_FIXED_INSET_CLASS}");
    expect(src("components/home/HomeTradeHubFloatingBar.tsx")).toContain("${SIDE_RAIL_FIXED_INSET_CLASS}");
  });
});

describe("D2 desktop header alignment", () => {
  it("헤더 폭 체인은 본문 열 SSOT(APP_MAIN_COLUMN_MAX_WIDTH_CLASS)와 같다", () => {
    const chain = [...APP_MAIN_COLUMN_MAX_WIDTH_CLASS.matchAll(/max-w-\[([\d.]+rem)\]/g)].map((m) => m[1]);
    expect(chain).toEqual(["42rem", "46rem", "52rem", "60rem", "66rem"]);
    const cssChain = [...css.matchAll(/sector-header-shell--embedded \{\s*(?:width: 100%;\s*)?max-width: ([\d.]+rem);/g)].map(
      (m) => m[1],
    );
    expect(cssChain).toEqual(chain);
  });

  it("DESKTOP 계열에서만 적용한다 (휴대폰·태블릿 헤더 무변화)", () => {
    const rules = ((css.split("D2 —")[1] ?? "").split("메신저 PC 전체 폭 M3")[0] ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = rules
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.endsWith("{") && !l.startsWith("@"))
      .map((l) => l.slice(0, -1).trim());
    expect(selectors.length).toBe(5);
    for (const sel of selectors) {
      expect(sel.startsWith('.app-shell[data-dibay-shell-family="DESKTOP"]')).toBe(true);
    }
  });
});

describe("메신저 PC 전체 폭 M1·M3 (docs/audit/messenger-desktop-wide-design-2026-11-07.md)", () => {
  it("M1 — PC 세로 레일 + 메신저 화면에서만 본문 열 제한을 푼다", () => {
    const shell = src("components/layout/ConditionalAppShell.tsx");
    expect(shell).toContain(
      'f.isMypageAddressFlowPage || (isDesktopSideRail && f.isCommunityMessengerSurface)\n          ? "w-full min-w-0"\n          : APP_MAIN_COLUMN_CLASS',
    );
  });

  it("M2 — 목록 칸 폭·768 분할 기준은 그대로", () => {
    const pane = src("lib/ui/messenger-split-pane-layout.ts");
    expect(pane).toContain('MESSENGER_SPLIT_LIST_PANE_WIDTH_CSS = "clamp(360px, 35vw, 470px)"');
    expect(src("hooks/use-is-messenger-split-viewport.ts")).toContain("APP_MESSENGER_SPLIT_MIN_PX");
  });

  it("M3 — 메신저 하단 시트는 레일 셸에서만 목록 칸(레일 오른쪽)에 맞춘다, 768 이상에서만", () => {
    const m3 = css.split("메신저 PC 전체 폭 M3")[1] ?? "";
    expect(m3).toContain("@media (min-width: 768px)");
    expect(m3).toMatch(
      /html:has\(\.app-shell\[data-dibay-nav-presentation="DESKTOP_SIDE_RAIL"\]\)\s*:is\(\.messenger-home-bottom-sheet-panel, \.messenger-home-bottom-sheet-panel--device-bottom\)\.messenger-home-bottom-sheet-panel--split-list \{\s*left: var\(--safe-left, 0px\) !important;/,
    );
    expect(m3).toMatch(
      /html:has\(\.app-shell\[data-dibay-nav-presentation="DESKTOP_SIDE_RAIL"\]\):has\(\.app-bottom-nav-shell--side-rail\)\s*:is\([^)]*\)\.messenger-home-bottom-sheet-panel--split-list \{\s*left: calc\(var\(--app-side-rail-width, 72px\) \+ var\(--safe-left, 0px\)\) !important;/,
    );
    // 휴대폰·태블릿용 기존 식은 그대로 (레일 없는 셸)
    const sheetCss = src("app/messenger-home-bottom-sheet.css");
    expect(sheetCss).toContain("left: max(0px, calc((100vw - min(100vw, 66rem)) / 2)) !important;");
  });
});
