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
    // 탭 바 자체 padding-left(safe-left) 만큼 폭을 더해 목록 칸과 오른쪽 끝을 맞춘다
    expect(css).toContain("width: calc(var(--cm-split-list-pane-width) + var(--safe-left, 0px));");
  });

  it("messenger-split BottomNav starts at shell left 0 — 본문 열 최대 폭 없음 (가로 폭 감사 B1 2026-11-16)", () => {
    const css = read("app/app-bottom-nav.css");
    const layout = read("lib/ui/app-content-layout.ts");
    expect(layout).toContain('APP_MAIN_COLUMN_MAX_WIDTH_CLASS = "max-w-none"');
    expect(css).toMatch(/\.app-bottom-nav-shell\.app-bottom-nav-shell--messenger-split-list \{[^}]*left: 0;/);
    expect(css).not.toMatch(/\d+rem\)\) \/ 2\)/);
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
    expect(css).toContain("left: var(--safe-left, 0px) !important");
    expect(css).toContain("right: auto !important");
    expect(css).toContain("width: var(--cm-split-list-pane-width) !important");
  });

  it("group create outer sheet shares split-list class (보관함·채팅 설정은 시트가 아니라 하위 화면 — 채팅 시안 4판 「4」「7」)", () => {
    const home = read("components/community-messenger/CommunityMessengerHome.tsx");
    const settings = read("components/community-messenger/MessengerSettingsScreen.tsx");
    const archive = read("components/community-messenger/MessengerArchiveScreen.tsx");
    expect(home).toContain("MESSENGER_HOME_SPLIT_LIST_SHEET_CLASS");
    expect(home).toContain('data-cm-group-create-outer-chrome=""');
    expect(settings).not.toContain("MessengerHomeBottomSheetShell");
    expect(archive).not.toContain("MessengerHomeBottomSheetShell");
  });

  it("wide room header safe-top override lives after fixed header-height lock (presentation, 헤더 SSOT 52)", () => {
    const css = read("app/messenger-presentation.css");
    const lockIdx = css.indexOf("max-height: var(--sector-header-h) !important");
    const wideIdx = css.indexOf("min-height: calc(var(--sector-header-h) + var(--safe-top, 0px))");
    expect(lockIdx).toBeGreaterThan(-1);
    expect(wideIdx).toBeGreaterThan(lockIdx);
    expect(css).toContain("padding-right: var(--sector-header-edge-pad-right) !important;");
  });

  it("trade/delivery pillar registers SplitTopBar chrome", () => {
    /** 채팅 시안 4판: 머리글(분할 제목·뒤로 + 「모두 읽음」)은 안 읽은 방을 가진 목록 gate 가 등록 */
    for (const gate of [
      "components/community-messenger/domain-shell-canary/DomainTradeListCanaryGate.tsx",
      "components/community-messenger/domain-shell-canary/DomainStoreOrderCustomerListCanaryGate.tsx",
    ]) {
      expect(read(gate)).toContain("useMessengerPillarHeaderChrome(");
    }
    const chrome = read("components/community-messenger/MessengerPillarSplitChrome.tsx");
    expect(chrome).toContain("useRegisterMessengerSplitChrome");
    expect(chrome).toContain("nav_trade_chat_label");
    /** 「주문 채팅」(띄어 씀) — 모바일 1단 제목과 같은 키 */
    expect(chrome).toContain("community_messenger_order_chats");
    expect(chrome).not.toContain("nav_chat_order_compact");
  });
});
