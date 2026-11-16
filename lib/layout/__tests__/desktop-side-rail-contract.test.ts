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

  it("레일에는 스크롤·키보드 숨김을 쓰지 않는다 (키보드 때는 자리 고정만 — v6 R2-3)", () => {
    const shell = src("components/layout/ConditionalAppShell.tsx");
    expect(shell).toMatch(/showBottomNavMounted &&\s*!isDesktopSideRail &&\s*resolveBottomNavScrollHideEnabled/);
    expect(shell).toContain('showBottomNavMounted && !isDesktopSideRail && bottomNavKeyboardState !== "visible"');
    expect(shell).toContain('isDesktopSideRail && bottomNavKeyboardState === "hidden_layout_resized"');
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
    /** D1 F1 (2026-11-11): `html:has(…)` → `<html>` 셸 속성 (lib/layout/html-shell-flags.ts) */
    expect(css).toMatch(/html\[data-shell-bottom-nav-side-rail\] \.app-shell \{\s*padding-left:/);
  });

  it("화면 고정 플로팅(거래 플로팅 바·FAB 섹터)은 레일 폭만큼 비킨다", () => {
    expect(SIDE_RAIL_FIXED_INSET_CLASS).toBe("app-side-rail-fixed-inset");
    expect(css).toMatch(/html\[data-shell-bottom-nav-side-rail\] \.app-side-rail-fixed-inset \{\s*left:/);
    expect(src("components/layout/MainBottomNavFabSector.tsx")).toContain("${SIDE_RAIL_FIXED_INSET_CLASS}");
    expect(src("components/home/HomeTradeHubFloatingBar.tsx")).toContain("${SIDE_RAIL_FIXED_INSET_CLASS}");
  });
});

describe("D2 desktop header alignment (폐지 — 가로 폭 감사 B1 2026-11-16)", () => {
  it("본문 열 최대 폭이 없다 → 헤더를 열에 맞추는 단계 규칙도 없다", () => {
    expect(APP_MAIN_COLUMN_MAX_WIDTH_CLASS).toBe("max-w-none");
    expect(css).not.toMatch(/sector-header-shell--embedded \{\s*(?:width: 100%;\s*)?max-width: [\d.]+rem;/);
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
      /html\[data-shell-desktop-side-rail\]\[data-shell-desktop-side-rail\]\s*:is\(\.messenger-home-bottom-sheet-panel, \.messenger-home-bottom-sheet-panel--device-bottom\)\.messenger-home-bottom-sheet-panel--split-list \{\s*left: var\(--safe-left, 0px\) !important;/,
    );
    expect(m3).toMatch(
      /html\[data-shell-desktop-side-rail\]\[data-shell-desktop-side-rail\]\[data-shell-bottom-nav-side-rail\]\s*:is\([^)]*\)\.messenger-home-bottom-sheet-panel--split-list \{\s*left: calc\(var\(--app-side-rail-width, 72px\) \+ var\(--safe-left, 0px\)\) !important;/,
    );
    // 레일 없는 셸(휴대폰·태블릿·Mac 앱) — 본문 열 최대 폭이 없어 목록 칸은 셸 왼쪽 safe-left 에서 시작 (B1 2026-11-16)
    const sheetCss = src("app/messenger-home-bottom-sheet.css");
    expect(sheetCss).toContain("left: var(--safe-left, 0px) !important;");
    expect(sheetCss).not.toMatch(/\d+rem\)\) \/ 2\)/);
  });
});

describe("PC 대화방 말풍선 영역 T1~T3 (docs/audit/messenger-room-desktop-timeline-width-design-2026-11-07.md)", () => {
  it("T1 — 분할 화면(≥768)이면 기기와 상관없이 말풍선 시트 최대 폭을 푼다 (B1 2026-11-16)", () => {
    const t1 = css.split("PC 대화방 말풍선 영역 T1")[1] ?? "";
    const selectors = t1
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.endsWith("{"));
    expect(selectors).toEqual(["@media (min-width: 768px) {", "[data-cm-room] .chat-timeline-sheet {"]);
    expect(t1).toMatch(/\[data-cm-room\] \.chat-timeline-sheet \{\s*max-width: none;\s*\}/);
  });

  it("T2·T3 — 방 컴포넌트의 760 기본값·말풍선 520·높이 계약 CSS 는 그대로 (휴대폰·태블릿 무변화)", () => {
    const timeline = src("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline.tsx");
    expect(timeline).toContain('className="chat-timeline-sheet mx-auto w-full max-w-[760px]"');
    expect(src("app/chat-viewport-shell.css")).not.toMatch(/chat-timeline-sheet[^{]*\{[^}]*max-width/);
    const rows = src("components/community-messenger/room/phase2/MessengerTimelineVirtualRow.tsx");
    expect(rows).toContain("max-w-[min(76vw,520px)]");
  });
});
