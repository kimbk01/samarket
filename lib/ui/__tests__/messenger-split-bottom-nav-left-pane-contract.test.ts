import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  APP_BOTTOM_NAV_MESSENGER_SPLIT_LIST_CLASS,
  MESSENGER_HOME_SPLIT_LIST_SHEET_CLASS,
  MESSENGER_SPLIT_LIST_PANE_WIDTH_CSS,
} from "@/lib/ui/messenger-split-pane-layout";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("messenger split left-pane contract (APK/iOS/Windows/tablet viewport SSOT)", () => {
  it("exposes shared list-pane width + shell classes", () => {
    expect(MESSENGER_SPLIT_LIST_PANE_WIDTH_CSS).toBe("clamp(360px, 35vw, 470px)");
    expect(APP_BOTTOM_NAV_MESSENGER_SPLIT_LIST_CLASS).toBe("app-bottom-nav-shell--messenger-split-list");
    expect(MESSENGER_HOME_SPLIT_LIST_SHEET_CLASS).toBe("messenger-home-bottom-sheet-panel--split-list");
  });

  it("CSS constrains messenger-split BottomNav to list pane width at ≥768 only", () => {
    const css = read("app/app-bottom-nav.css");
    expect(css).toContain(".app-bottom-nav-shell--messenger-split-list");
    expect(css).toContain("@media (min-width: 768px)");
    expect(css).toContain("clamp(360px, 35vw, 470px)");
    expect(css).toContain("right: auto");
    expect(css).toContain("min-width: 360px");
  });

  it("messenger-split BottomNav left tracks APP_MAIN_COLUMN mx-auto max-w chain", () => {
    const css = read("app/app-bottom-nav.css");
    const layout = read("lib/ui/app-content-layout.ts");
    expect(layout).toContain("max-w-[52rem]");
    expect(layout).toContain("lg:max-w-[60rem]");
    expect(layout).toContain("xl:max-w-[66rem]");
    expect(css).toContain("calc((100vw - min(100vw, 52rem)) / 2)");
    expect(css).toContain("calc((100vw - min(100vw, 60rem)) / 2)");
    expect(css).toContain("calc((100vw - min(100vw, 66rem)) / 2)");
    expect(css).toContain("APP_MAIN_COLUMN_MAX_WIDTH_CLASS");
  });

  it("ConditionalAppShell applies messenger-split BottomNav class on messenger path (SSR-safe)", () => {
    const src = read("components/layout/ConditionalAppShell.tsx");
    expect(src).toContain("APP_BOTTOM_NAV_MESSENGER_SPLIT_LIST_CLASS");
    expect(src).toContain('pathname === "/community-messenger"');
    expect(src).toContain("Avoids SSR false");
    expect(src).not.toMatch(
      /isMessengerSplitViewport\s*&&\s*\n?\s*\(pathname === "\/community-messenger"/
    );
    expect(src).not.toMatch(/Capacitor|isTablet|platform\.os/i);
  });

  it("home sheet shell keeps inset-x-0; width shrink is CSS ≥768 only", () => {
    const sheet = read("components/community-messenger/MessengerSheetUi.tsx");
    const css = read("app/messenger-home-bottom-sheet.css");
    expect(sheet).toContain("absolute inset-x-0 w-full");
    expect(sheet).not.toContain('panelPositionClass = center');
    expect(sheet).not.toMatch(/splitListSheet\s*\?\s*["']absolute bottom-0/);
    expect(css).toContain(".messenger-home-bottom-sheet-panel--split-list");
    expect(css).toContain("left: max(0px, calc((100vw - min(100vw, 52rem)) / 2)) !important");
    expect(css).toContain("right: auto !important");
    expect(css).toContain("width: var(--cm-split-list-pane-width) !important");
  });

  it("group create / settings / archive outer sheets share split-list class", () => {
    const home = read("components/community-messenger/CommunityMessengerHome.tsx");
    const settings = read("components/community-messenger/MessengerSettingsSheet.tsx");
    const archive = read("components/community-messenger/MessengerArchiveScreen.tsx");
    expect(home).toContain("MESSENGER_HOME_SPLIT_LIST_SHEET_CLASS");
    expect(home).toContain('data-cm-group-create-outer-chrome=""');
    expect(settings).toContain("MESSENGER_HOME_SPLIT_LIST_SHEET_CLASS");
    expect(archive).toContain("MESSENGER_HOME_SPLIT_LIST_SHEET_CLASS");
  });

  it("wide room header safe-top override lives after fixed 48px lock (presentation)", () => {
    const css = read("app/messenger-presentation.css");
    const lockIdx = css.indexOf("max-height: 48px !important");
    const wideIdx = css.indexOf("min-height: calc(48px + var(--safe-top, 0px))");
    expect(lockIdx).toBeGreaterThan(-1);
    expect(wideIdx).toBeGreaterThan(lockIdx);
    expect(css).toContain("padding-right: max(12px, var(--safe-right, 0px))");
  });

  it("trade/delivery pillar registers SplitTopBar chrome", () => {
    const segment = read("components/community-messenger/MessengerPillarChatsSegment.tsx");
    expect(segment).toContain("MessengerPillarSplitChrome");
    const chrome = read("components/community-messenger/MessengerPillarSplitChrome.tsx");
    expect(chrome).toContain("useRegisterMessengerSplitChrome");
    expect(chrome).toContain("nav_trade_chat_label");
    expect(chrome).toContain("nav_chat_order_compact");
  });
});
