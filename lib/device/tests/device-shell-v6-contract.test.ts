/**
 * 시안 v6 (Owner 2026-11-17 승인) 계약 — Xiaomi 실기 결함 2건 + 메뉴 통일성 + LOUNGE 최대 3열.
 * R2-3 키보드 때 세로 메뉴 자리 고정 · R2-4 회전 때 하단 탭 다시 보이기 · R2-5 하단 탭 모든 탭 창 전체 폭 · LOUNGE 최대 3열.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMMUNITY_FEED_GRID_MAX_COLUMNS,
  COMMUNITY_FEED_GRID_WRAP_CLASS,
} from "@/lib/philife/philife-flat-ui-classes";
import { BOTTOM_NAV_WIDTH_CHANGE_SETTLE_MS } from "@/lib/layout/use-bottom-nav-scroll-hide-behavior";
import { NAV_PRESENTATION_SWITCH_MS } from "@/lib/device/use-nav-presentation-switch-motion";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("v6 R2-3 — 키보드가 올라와도 세로 메뉴는 그 자리", () => {
  it("Android 키보드가 웹뷰를 줄인 동안만 세로 메뉴 높이를 키보드 열기 전 높이로 고정한다", () => {
    const shell = read("components/layout/ConditionalAppShell.tsx");
    expect(shell).toContain('isDesktopSideRail && bottomNavKeyboardState === "hidden_layout_resized"');
    expect(shell).toContain("readFormKeyboardClosedBaselineHeightPx()");
    /** 키보드 판정 신호는 세로 메뉴에서도 하나(하단 탭과 같은 probe) */
    expect(shell).toMatch(/\{showBottomNavMounted \? \(\s*<BottomNavKeyboardHideProbe/);
    /** 세로 메뉴는 키보드로 숨기지 않는다 */
    expect(shell).toContain('showBottomNavMounted && !isDesktopSideRail && bottomNavKeyboardState !== "visible"');
    const css = read("app/app-desktop-side-nav.css");
    expect(css).toMatch(
      /\.app-bottom-nav-shell--side-rail\.app-bottom-nav-shell--side-rail-keyboard-hold \{\s*bottom: auto;\s*height: var\(--app-side-rail-keyboard-hold-height\);/
    );
  });
});

describe("v6 R2-4 — 회전(창 폭 변경) 직후에는 하단 탭을 숨기지 않는다", () => {
  it("폭이 바뀌면 바로 보이고, 재배치 동안은 기준 위치만 다시 잡는다", () => {
    const src = read("lib/layout/use-bottom-nav-scroll-hide-behavior.ts");
    expect(src).toContain("if (width !== lastWidth)");
    expect(src).toContain("setHidden(false);");
    expect(src).toMatch(/const applyScrollChrome = \(y: number\) => \{\s*if \(isSettlingAfterWidthChange\(\)\)/);
    expect(src).toMatch(/const syncScrollChromeFromLayout = \(\) => \{[\s\S]{0,200}if \(isSettlingAfterWidthChange\(\)\)/);
    expect(BOTTOM_NAV_WIDTH_CHANGE_SETTLE_MS).toBeGreaterThan(NAV_PRESENTATION_SWITCH_MS);
  });
});

describe("v6 LOUNGE 카드 격자 최대 3열", () => {
  it("한 칸 최소 폭 = max(358, (줄 폭 − 간격 2개) ÷ 3) — 간격 gap-2(8px) × 2 = 16", () => {
    expect(COMMUNITY_FEED_GRID_MAX_COLUMNS).toBe(3);
    expect(COMMUNITY_FEED_GRID_WRAP_CLASS).toContain(
      "grid-cols-[repeat(auto-fill,minmax(max(min(358px,100%),calc((100%_-_16px)/3)),1fr))]"
    );
    expect(COMMUNITY_FEED_GRID_WRAP_CLASS).toContain(" gap-2 ");
  });
});
